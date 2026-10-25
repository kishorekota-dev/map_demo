const BankingChatWorkflow = require('../workflows/bankingChatWorkflow');
const { WorkflowExecution, HumanFeedback } = require('../models');
const logger = require('../utils/logger');
const slmDataExtractor = require('./poc-slm-data-extractor');
const intentMapper = require('./intentMapper');
const PolicyEngine = require('./policyEngine');
const { ControlPlaneRuntime, normalizeChannel, resolvePublishedRoute, validateSnapshot } = require('./controlPlaneRuntime');
const KeyedMutex = require('../utils/keyedMutex');
const { RuntimePersistence } = require('./runtimePersistence');
const { randomUUID } = require('crypto');
const RuntimeIntegrations = require('./runtimeIntegrations');
const { isLlmError, modelUnavailable } = require('../llm/errors');
const { graphThreadId } = require('../utils/checkpointer');
const { issueProof, toolArguments } = require('./mutationProof');
const { confirmationContext, matchesConfirmation } = require('./actionConfirmation');

/**
 * Workflow Service
 * Orchestrates workflow execution and manages state
 * Now uses Enhanced MCP Client with hybrid protocol support
 */
class WorkflowService {
  constructor(mcpClient, sessionManager) {
    this.persistence = new RuntimePersistence();
    this.integrations = new RuntimeIntegrations();
    this.mcpClient = new Proxy(mcpClient, { get: (target, property) => {
      if (['executeTool', 'executeToolWithRetry'].includes(property)) return async (tool, parameters, sessionId) => {
        const { interactionId, tenantId, runtimeContext, ...toolParameters } = parameters;
        const started = Date.now();
        let callId;
        try {
          await this.integrations.event({ sessionId, interactionId, ...runtimeContext, stage: 'authorization', outcome: runtimeContext?.confirmationRequired ? (runtimeContext.confirmationVerified ? 'confirmed' : 'confirmation_missing') : 'confirmation_not_required',
            metadata: { tool, confirmationRequired: runtimeContext?.confirmationRequired === true, confirmationVerified: runtimeContext?.confirmationVerified === true } }, toolParameters.authToken);
          const result = await this.persistence.execute({ tenantId: tenantId || process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise',
            interactionId, sessionId, tool, parameters: toolParameters, runtimeContext }, async operation => {
            callId = randomUUID();
            if (!operation) return target.executeTool(tool, toolParameters, sessionId);
            const tenant = tenantId || process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise';
            const confirmationProof = issueProof({ scope: 'banking_tool', principalId: String(toolParameters.userId || ''), tenantId: tenant,
              key: operation.idempotencyKey, method: 'CALL', path: tool, body: toolArguments(toolParameters) });
            return target.executeTool(tool, { ...toolParameters, tenantId: tenant, idempotencyKey: operation.idempotencyKey, confirmationProof }, sessionId);
          });
          const evidence = await this.integrations.event({ sessionId, interactionId, ...runtimeContext, stage: 'tool', outcome: 'succeeded', operationId: result.operationId, durationMs: Date.now() - started }, toolParameters.authToken);
          return { ...result, ...(evidence.id ? { evidenceId: evidence.id } : {}), ...(evidence.telemetryUnavailable ? { telemetryUnavailable: true } : {}) };
        } catch (error) {
          await this.integrations.event({ sessionId, interactionId, ...runtimeContext, stage: 'tool', outcome: error.code === 'RECONCILIATION_REQUIRED' ? 'reconciliation_required' : 'failed', operationId: error.operationId, durationMs: Date.now() - started }, toolParameters.authToken);
          throw error;
        } finally {
          // Record usage after durable acknowledgement; telemetry must not
          // widen the interval between an external effect and ledger commit.
          if (callId) await this.integrations.usage({ eventId: `${callId}:calls`, sessionId, interactionId, version: runtimeContext?.version,
            channel: runtimeContext?.channel, provider: 'mcp', service: 'tool_execution', metric: 'calls', units: 1 }, toolParameters.authToken);
        }
      };
      return typeof target[property] === 'function' ? target[property].bind(target) : target[property];
    } });
    this.sessionManager = sessionManager;
    this.policyEngine = new PolicyEngine();
    this.workflow = new BankingChatWorkflow(this.mcpClient, sessionManager, this.policyEngine);
    this.workflow.genericHandler = state => this.executeGeneric(state);
    this.controlPlane = new ControlPlaneRuntime();
    this.requestMutex = new KeyedMutex();
    
    logger.info('Workflow Service initialized with Enhanced MCP Client and Policy Engine');
  }

  /**
   * Process a message through the workflow
   */
  async processMessage(input) {
    const tenant = input.metadata?.tenantId || process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise';
    const enriched = { ...input, metadata: { ...input.metadata, tenantId: tenant, interactionId: input.metadata?.interactionId || randomUUID() } };
    return this.requestMutex.runExclusive(input.sessionId, () => this.persistence.runSession(tenant, input.sessionId, async () => {
      // Recheck inside coordination: two callers may both have passed HTTP
      // ownership checks before either created the same caller-chosen ID.
      const current = await this.sessionManager.getSession(input.sessionId);
      if (current && (String(current.userId) !== String(input.userId) || (current.metadata?.tenantId && current.metadata.tenantId !== tenant))) {
        throw Object.assign(new Error('Session access denied'), { status: 403 });
      }
      if (input.expectedChannel && current?.metadata?.channel && input.expectedChannel !== current.metadata.channel) throw Object.assign(new Error('Conversation channel has changed'), { status: 409, code: 'CHANNEL_CHANGED' });
      if (current?.metadata?.graphRun?.status === 'running') return this.controlPlaneBlock('workflow_recovery_required', { version: current.metadata.controlPlane?.version, recoveryRequired: true });
      return this.withEvidence(enriched, () => this.processMessageInSession(enriched));
    }));
  }

  async processMessageInSession(input) {
    if (!this.controlPlane.isEnabled()) return this.processConfiguredMessage(input);
    let snapshot;
    let channel;
    let session;
    try {
      session = await this.sessionManager.getSession(input.sessionId);
      if (session && (String(session.userId) !== String(input.userId)
        || (session.metadata?.tenantId && session.metadata.tenantId !== (input.metadata?.tenantId || process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise')))) {
        throw Object.assign(new Error('Session access denied'), { status: 403 });
      }
      if (session?.status === 'waiting_human_input' && !input.resumePublished) {
        return this.controlPlaneBlock('pending_workflow', {
          version: session.metadata?.controlPlane?.version,
          channel: session.metadata?.channel,
          intent: session.intent
        });
      }
      channel = normalizeChannel(session?.metadata?.channel || input.metadata?.channel || 'digital');
      snapshot = input.resumePublished
        ? validateSnapshot(session?.metadata?.controlPlane)
        : await this.controlPlane.getPublishedConfig(input.authToken);
    } catch (error) {
      if (error.status === 403) throw error;
      logger.warn('Control-plane configuration unavailable; execution blocked', { error: error.message, sessionId: input.sessionId });
      return this.controlPlaneBlock('configuration_unavailable');
    }

    if (!snapshot.config.channels.find(entry => entry.id === channel)?.enabled) {
      return this.controlPlaneBlock('channel_disabled', { version: snapshot.version, channel }, snapshot.config.prompts.unavailableText);
    }
    let recognition;
    try {
      recognition = input.resumePublished ? session.metadata?.recognition || { intent: session.intent, confidence: 1, source: 'pinned' }
        : await this.controlPlane.recognize(snapshot.config, input.question, this.usageRecorder(input, snapshot, channel));
    } catch (error) {
      if (!isLlmError(error)) throw error;
      return { ...modelUnavailable(error), metadata: { version: snapshot.version, environment: snapshot.environment, cohort: snapshot.cohort, channel } };
    }
    const intent = input.resumePublished ? session.intent : recognition.intent;
    const recognitionEvidence = await this.integrations.event({ sessionId: input.sessionId, interactionId: input.metadata?.interactionId || session?.metadata?.interactionId,
      version: snapshot.version, environment: snapshot.environment, cohort: snapshot.cohort, channel, intent: intent || 'unclassified', stage: 'recognition', outcome: intent ? 'recognized' : recognition.reason,
      metadata: { confidence: recognition.confidence, recognitionSource: recognition.source } }, input.authToken);
    if (!intent) {
      const route = { version: snapshot.version, environment: snapshot.environment, cohort: snapshot.cohort, channel, intent: 'general_inquiry', queue: snapshot.config.channels.find(entry => entry.id === channel)?.queue, recognition };
      if (snapshot.config.recognition?.ambiguityAction === 'human') return this.routeToHuman({ ...input, metadata: { ...input.metadata, controlPlane: snapshot, channel } }, route, 'recognition_uncertain', snapshot.config.prompts.handoffText);
      return { type: 'clarification_required', needsHumanInput: false, response: snapshot.config.prompts.clarificationText || 'Could you clarify which service you need?', metadata: route,
        evidenceIds: recognitionEvidence.id ? [recognitionEvidence.id] : [],
        candidates: recognition.candidates.slice(0, 3).map(candidate => ({ id: candidate.intent, name: snapshot.config.intents.find(entry => entry.id === candidate.intent)?.name })) };
    }
    const metadata = {
      ...(session?.metadata || {}),
      ...(input.metadata || {}),
      channel,
      recognition,
      controlPlane: snapshot
    };
    // Persist the exact release before any tools execute. Confirmation and data
    // collection use this durable snapshot even after publish/rollback/restart.
    if (!session) {
      await this.sessionManager.createSession(input.userId, input.sessionId, intent, metadata);
    } else {
      await this.sessionManager.updateSession(input.sessionId, { metadata });
    }
    const route = { ...resolvePublishedRoute(snapshot, channel, intent), environment: snapshot.environment, cohort: snapshot.cohort };
    metadata.runtimeContext = route;
    await this.sessionManager.updateSession(input.sessionId, { metadata, intent });
    if (route.action === 'disabled') return this.controlPlaneBlock(route.reason, route, snapshot.config.prompts.unavailableText);
    if (route.action === 'human') return this.routeToHuman(input, { ...route, recognition }, route.reason, snapshot.config.prompts.handoffText);
    return intentMapper.withPublishedIntents(snapshot.config.intents, async () => {
      const result = await this.processConfiguredMessage({ ...input, intent, metadata: { ...metadata, runtimeContext: route } });
      return { ...result, intent, evidenceIds: [...(result.evidenceIds || []), ...(recognitionEvidence.id ? [recognitionEvidence.id] : [])], metadata: { ...(result.metadata || {}), ...route, recognition } };
    }, snapshot.config.prompts, { recordUsage: this.usageRecorder(input, snapshot, channel) }, snapshot.config.llm);
  }

  usageRecorder(input, snapshot, channel) {
    return usage => this.integrations.usage({ ...usage, sessionId: input.sessionId, interactionId: input.metadata?.interactionId,
      version: snapshot.version, channel }, input.authToken);
  }

  controlPlaneBlock(reason, metadata = {}, wording = null) {
    return {
      type: 'policy_blocked', code: reason, stage: 'control_plane', currentStep: 'control_plane_routing',
      message: reason === 'workflow_recovery_required'
        ? 'Resume the interrupted request before starting another action.'
        : reason === 'configuration_unavailable'
        ? 'Servicing configuration is temporarily unavailable. Please try again later.'
        : reason === 'pending_workflow'
          ? 'Please finish or cancel your pending request before starting another.'
        : wording ? `Service unavailable. ${wording}` : 'This service is currently unavailable for this channel. Please contact support.',
      needsHumanInput: false, metadata
    };
  }

  async withEvidence(input, callback) {
    const started = Date.now();
    let result;
    try { result = await callback(); }
    catch (error) {
      if (error.code !== 'RECONCILIATION_REQUIRED') throw error;
      result = { type: 'reconciliation_required', operationId: error.operationId, message: error.message, needsHumanInput: false };
    }
    let session;
    let telemetryUnavailable = false;
    try { session = await this.sessionManager.getSession(input.sessionId); }
    catch (_error) { telemetryUnavailable = true; }
    const outcome = result.type === 'complete' ? 'succeeded'
      : ['human_input_required', 'confirmation_required', 'clarification_required'].includes(result.type) ? 'awaiting_input'
        : result.type === 'human_escalation' ? 'handoff'
          : result.type === 'policy_blocked' ? (['configuration_unavailable', 'case_creation_unavailable', 'model_unavailable'].includes(result.code) ? 'failed' : 'policy_denied')
            : result.type === 'error' ? 'failed' : result.type || 'unknown';
    const event = await this.integrations.event({ sessionId: input.sessionId, interactionId: session?.metadata?.interactionId || input.metadata?.interactionId,
      version: result.metadata?.version || session?.metadata?.controlPlane?.version, channel: result.metadata?.channel || session?.metadata?.channel || 'digital',
      environment: result.metadata?.environment || session?.metadata?.controlPlane?.environment, cohort: result.metadata?.cohort || session?.metadata?.controlPlane?.cohort,
      intent: result.intent || session?.intent || 'general_inquiry', stage: 'conversation', outcome, durationMs: Date.now() - started,
      metadata: { workflowStatus: result.type || 'unknown' } }, input.authToken);
    const evidenceIds = [...(result.evidenceIds || []), ...(event.id ? [event.id] : [])];
    if (session && (evidenceIds.length || result.caseId)) {
      try { await this.sessionManager.updateSession(input.sessionId,
        { metadata: { ...session.metadata, evidenceIds: [...(session.metadata?.evidenceIds || []), ...evidenceIds].slice(-100), caseId: result.caseId || session.metadata?.caseId } }); }
      catch (_error) { telemetryUnavailable = true; }
    }
    return { ...result, evidenceIds, telemetryUnavailable: telemetryUnavailable || result.telemetryUnavailable === true || event.telemetryUnavailable === true };
  }

  async routeToHuman(input, route, reason, wording = null) {
    try {
      let session = await this.sessionManager.getSession(input.sessionId);
      if (!session) session = await this.sessionManager.createSession(input.userId, input.sessionId, route.intent, { ...input.metadata, runtimeContext: route });
      const metadata = { ...session.metadata, ...input.metadata, runtimeContext: route };
      await this.sessionManager.updateSession(input.sessionId, { metadata, intent: route.intent });
      const state = { sessionId: input.sessionId, userId: session.userId, intent: route.intent, collectedData: session.collectedData,
        channel: metadata.channel || route.channel, tenantId: metadata.tenantId, interactionId: metadata.interactionId, runtimeContext: route };
      const details = { confirmation: confirmationContext(state, [], 'handoff'), handoff: { reason, wording } };
      const question = 'Would you like me to create a support request for a specialist? Please confirm to continue.';
      const executionId = randomUUID();
      await WorkflowExecution.create({ sessionId: input.sessionId, executionId, intent: route.intent, input: { type: 'handoff_confirmation', version: route.version },
        output: { type: 'confirmation_required', question, details }, status: 'completed', currentNode: 'request_confirmation', completedAt: new Date() });
      await HumanFeedback.create({ sessionId: input.sessionId, executionId, feedbackType: 'confirmation', question, context: details, status: 'pending', expiresAt: new Date(Date.now() + 300000) });
      await this.sessionManager.updateSession(input.sessionId, { status: 'waiting_human_input', currentStep: 'request_confirmation' });
      return { type: 'confirmation_required', question, action: 'human_handoff', details, intent: route.intent, needsHumanInput: true, metadata: route };
    } catch (_error) {
      return { type: 'policy_blocked', code: 'case_creation_unavailable', message: 'We could not prepare the support request confirmation. Please try again or contact support.', needsHumanInput: false, metadata: route };
    }
  }

  async executeGeneric(state) {
    if (intentMapper.getBaseIntent(state.intent) === 'knowledge_search') return this.integrations.knowledge(state);
    let servicingCase;
    try { servicingCase = await this.integrations.createCase(state); }
    catch (error) {
      if (error.code === 'RECONCILIATION_REQUIRED') return { type: 'reconciliation_required', operationId: error.operationId, reconcilePath: error.reconcilePath,
        response: 'The support request outcome is unconfirmed. Contact a support operator to reconcile it before trying again.', intent: state.intent };
      throw error;
    }
    return { type: 'complete', response: `Your service request has been created. Reference: ${servicingCase.id}.`, caseId: servicingCase.id, generationSource: 'servicing-case', intent: state.intent };
  }

  async processConfiguredMessage({ sessionId, intent, question, userId, authToken = null, metadata = {} }) {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('Processing message through workflow', {
      sessionId,
      executionId,
      intent,
      userId
    });

    try {
      // Get or create session
      let session = await this.sessionManager.getSession(sessionId);
      
      if (!session) {
        session = await this.sessionManager.createSession(
          userId,
          sessionId,
          intent,
          metadata
        );
      }
      if (String(session.userId) !== String(userId) || (session.metadata?.tenantId && session.metadata.tenantId !== (metadata.tenantId || process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise'))) {
        throw Object.assign(new Error('Session access denied'), { status: 403 });
      }

      await this.sessionManager.updateSession(sessionId, { intent, metadata: { ...session.metadata, ...metadata } });

      // Add user message to conversation history
      await this.sessionManager.addMessage(sessionId, 'user', question);

      // Refresh session so we include the latest history and collected data
      session = await this.sessionManager.getSession(sessionId);

      // Create workflow execution record
      const execution = await WorkflowExecution.create({
        sessionId,
        executionId,
        intent,
        input: { question, userId, metadata },
        status: 'running',
        startedAt: new Date()
      });

      const ingressPolicy = this.policyEngine.evaluateIngress({
        sessionId,
        userId,
        intent,
        question,
        metadata
      });
      await this.integrations.event({ sessionId, interactionId: metadata.interactionId || session.metadata?.interactionId,
        ...metadata.runtimeContext, intent, stage: 'policy', outcome: ingressPolicy.action,
        metadata: { reason: ingressPolicy.code || 'allowed' } }, authToken);

      await this.sessionManager.updateWorkflowState(sessionId, 'policy_ingress', {
        policy: ingressPolicy.audit
      });

      if (ingressPolicy.action === 'block') {
        const finalResponse = this.buildPolicyResponse(ingressPolicy);

        await this.sessionManager.updateSession(sessionId, {
          currentStep: 'policy_ingress',
          status: 'active'
        });

        await execution.update({
          status: 'cancelled',
          output: finalResponse,
          currentNode: 'policy_ingress',
          executionPath: ['policy_ingress'],
          completedAt: new Date()
        });

        return {
          executionId,
          ...finalResponse,
          needsHumanInput: false,
          currentStep: 'policy_ingress'
        };
      }

      // Build workflow input with authenticated user context.
      // authToken is propagated into tool execution (Authorization: Bearer ...).
      const workflowInput = {
        sessionId,
        userId,
        authToken,
        interactionId: session.metadata?.interactionId || metadata.interactionId,
        tenantId: session.metadata?.tenantId || metadata.tenantId || process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise',
        runtimeContext: metadata.runtimeContext || session.metadata?.runtimeContext,
        channel: session.metadata?.channel || metadata.channel,
        intent,
        question,
        conversationHistory: session.conversationHistory,
        collectedData: session.collectedData,
        requiredData: session.requiredData || [],
        policyTrace: ingressPolicy.audit ? [ingressPolicy.audit] : [],
        confirmationGranted: false
      };

      const threadId = graphThreadId({ tenantId: workflowInput.tenantId || process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise', userId, sessionId, runId: executionId });
      const { authToken: _credential, ...initialInput } = workflowInput;
      await this.sessionManager.updateSession(sessionId, { metadata: { ...session.metadata, graphRun: {
        id: executionId, threadId, interactionId: workflowInput.interactionId, status: 'running', initialInput
      } } });
      const result = await this.workflow.execute(workflowInput, { threadId });
      return this.finalizeWorkflowResult(sessionId, executionId, result, execution);
    } catch (error) {
      await WorkflowExecution.update({ status: 'failed', error: { message: error.message }, completedAt: new Date() }, { where: { executionId } }).catch(() => {});
      throw error;
    }
  }

  async finalizeWorkflowResult(sessionId, executionId, result, execution) {
      if (result.recoveryRequired) return { executionId, ...result.finalResponse, needsHumanInput: false, recoveryRequired: true };


      // Update execution record
      const executionStatus = result.error
        ? 'failed'
        : result.finalResponse?.type === 'policy_blocked'
          ? 'cancelled'
          : 'completed';

      let telemetryUnavailable = result.finalResponse?.telemetryUnavailable === true;
      let terminalSaved = true;
      try { await execution.update({
        status: executionStatus,
        output: result.finalResponse,
        currentNode: result.currentStep,
        executionPath: this.extractExecutionPath(result),
        error: result.error ? { message: result.error } : null,
        completedAt: new Date()
      }); } catch (error) {
        if (result.needsHumanInput) throw error;
        telemetryUnavailable = true; terminalSaved = false;
      }

      // Handle human input required
      if (result.needsHumanInput) {
        const feedback = await HumanFeedback.findOne({ where: { sessionId, executionId, status: 'pending' } }) || await HumanFeedback.create({
          sessionId,
          executionId,
          feedbackType: result.finalResponse.type === 'confirmation_required' 
            ? 'confirmation' 
            : 'data_collection',
          question: result.finalResponse.question || result.humanInputQuestion,
          requiredFields: result.finalResponse.requiredFields || result.requiredData,
          context: result.finalResponse.details || {},
          status: 'pending',
          expiresAt: new Date(Date.now() + 300000) // 5 minutes
        });

        logger.info('Human input required', {
          sessionId,
          executionId,
          feedbackId: feedback.id,
          type: feedback.feedbackType
        });
      } else {
        try { await this.sessionManager.updateSession(sessionId, { status: 'active', requiredData: [], currentStep: result.currentStep }); }
        catch (_error) { telemetryUnavailable = true; terminalSaved = false; }
      }

      try {
        const current = await this.sessionManager.getSession(sessionId);
        if (terminalSaved && current.metadata?.graphRun?.id === executionId) {
          const { initialInput: _input, ...run } = current.metadata.graphRun;
          await this.sessionManager.updateSession(sessionId, { metadata: { ...current.metadata, graphRun: { ...run, status: 'completed' } } });
        }
      } catch (error) { if (result.needsHumanInput) throw error; telemetryUnavailable = true; }

      logger.info('Workflow execution completed', {
        sessionId,
        executionId,
        status: result.error ? 'failed' : 'completed',
        needsHumanInput: result.needsHumanInput
      });

      return {
        executionId,
        ...result.finalResponse,
        telemetryUnavailable,
        needsHumanInput: result.needsHumanInput,
        currentStep: result.currentStep
      };

  }

  async recoverMessage({ sessionId, userId, tenantId, authToken }) {
    return this.requestMutex.runExclusive(sessionId, () => this.persistence.runSession(tenantId, sessionId, async () => {
      const session = await this.sessionManager.getSession(sessionId, { includeExpired: true });
      if (!session) throw Object.assign(new Error('No original workflow session was found'), { status: 404, code: 'WORKFLOW_SESSION_NOT_FOUND' });
      if (String(session.userId) !== userId || (session.metadata?.tenantId || process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise') !== tenantId) {
        throw Object.assign(new Error('Session access denied'), { status: 403 });
      }
      const run = session.metadata?.graphRun;
      if (!['running', 'completed'].includes(run?.status)) throw Object.assign(new Error('No recoverable graph is available'), { status: 409 });
      if (['expired', 'completed'].includes(session.status) || (session.expiresAt && new Date(session.expiresAt) <= new Date())) throw Object.assign(new Error('Session expired; operator reconciliation may be required'), { status: 409 });
      const expectedThread = graphThreadId({ tenantId, userId, sessionId, runId: run.id });
      if (run.threadId !== expectedThread || run.interactionId !== session.metadata.interactionId) throw Object.assign(new Error('Graph execution binding is invalid'), { status: 409 });
      const execution = await WorkflowExecution.findOne({ where: { executionId: run.id, sessionId } });
      if (!execution) throw Object.assign(new Error('Original workflow execution is unavailable'), { status: 409 });
      // A response lost between AI and chat may be delivered again without
      // invoking the graph, replacing a release, or executing any tool.
      if (run.status === 'completed') {
        if (!execution.output?.type) throw Object.assign(new Error('Completed workflow response is unavailable'), { status: 409 });
        const needsHumanInput = ['human_input_required', 'confirmation_required'].includes(execution.output.type);
        if (needsHumanInput) {
          const pending = await HumanFeedback.findOne({ where: { sessionId, executionId: run.id, status: 'pending' } });
          if (!pending || (pending.expiresAt && new Date(pending.expiresAt) <= new Date())) {
            throw Object.assign(new Error('This request has advanced or expired; its old prompt cannot be replayed'), { status: 409 });
          }
        }
        return { executionId: run.id, ...execution.output, intent: session.intent, currentStep: execution.currentNode,
          needsHumanInput, recovered: true };
      }
      if (!run.initialInput) throw Object.assign(new Error('Original workflow input is unavailable'), { status: 409 });
      const snapshot = session.metadata.controlPlane ? validateSnapshot(session.metadata.controlPlane) : null;
      if (this.controlPlane.isEnabled() && !snapshot) return this.controlPlaneBlock('configuration_unavailable');
      const route = snapshot ? { ...resolvePublishedRoute(snapshot, normalizeChannel(session.metadata.channel), session.intent), environment: snapshot.environment, cohort: snapshot.cohort } : run.initialInput.runtimeContext;
      if (route && route.action !== 'automated') return this.controlPlaneBlock(route.reason || 'recovery_route_changed', route);
      const initialInput = { ...run.initialInput, userId, tenantId, sessionId, authToken, runtimeContext: route };
      if (initialInput.intent !== session.intent || initialInput.interactionId !== run.interactionId
        || initialInput.runtimeContext?.version !== run.initialInput.runtimeContext?.version
        || initialInput.runtimeContext?.channel !== run.initialInput.runtimeContext?.channel) throw Object.assign(new Error('Pinned release does not match graph execution'), { status: 409 });
      const recover = () => this.withEvidence({ sessionId, userId, authToken, metadata: session.metadata }, async () => {
        const result = await this.workflow.recover(initialInput, run.threadId);
        return this.finalizeWorkflowResult(sessionId, run.id, result, execution);
      });
      return snapshot ? intentMapper.withPublishedIntents(snapshot.config.intents, recover, snapshot.config.prompts,
        { recordUsage: this.usageRecorder({ sessionId, metadata: session.metadata, authToken }, snapshot, route.channel) }, snapshot.config.llm) : recover();
    }));
  }

  /**
   * Process human feedback
   */
  async processHumanFeedback(input) {
    return this.requestMutex.runExclusive(input.sessionId, () => this.persistence.runSession(process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise', input.sessionId, async () => {
      const current = await this.sessionManager.getSession(input.sessionId);
      if (input.expectedChannel && current?.metadata?.channel && input.expectedChannel !== current.metadata.channel) throw Object.assign(new Error('Conversation channel has changed'), { status: 409, code: 'CHANNEL_CHANGED' });
      return this.withEvidence(input, () => this.processFeedbackInSession(input));
    }));
  }

  async processFeedbackInSession(input) {
    const current = await this.sessionManager.getSession(input.sessionId);
    if (current?.metadata?.graphRun?.status === 'running') return this.controlPlaneBlock('workflow_recovery_required', { recoveryRequired: true });
    if (!this.controlPlane.isEnabled()) return this.processConfiguredFeedback(input);
    const session = await this.sessionManager.getSession(input.sessionId);
    let snapshot;
    let route;
    try {
      snapshot = validateSnapshot(session?.metadata?.controlPlane);
      route = { ...resolvePublishedRoute(snapshot, normalizeChannel(session.metadata.channel), session.intent), environment: snapshot.environment, cohort: snapshot.cohort };
    } catch (error) {
      return this.controlPlaneBlock('configuration_unavailable');
    }
    if (!['automated', 'human'].includes(route.action)) return this.controlPlaneBlock(route.reason, route);
    return intentMapper.withPublishedIntents(snapshot.config.intents, async () => {
      const result = await this.processConfiguredFeedback(input);
      return { ...result, intent: session.intent, metadata: { ...(result.metadata || {}), ...route } };
    }, snapshot.config.prompts, { recordUsage: this.usageRecorder({ ...input, metadata: session.metadata }, snapshot, route.channel) }, snapshot.config.llm);
  }

  async processConfiguredFeedback({ sessionId, response, confirmed, authToken = null }) {
    logger.info('Processing human feedback', {
      sessionId,
      confirmed
    });

    try {
      // Get session
      const session = await this.sessionManager.getSession(sessionId);
      
      if (!session) {
        throw new Error('Session not found');
      }

      // Get pending feedback
      const feedback = await HumanFeedback.findOne({
        where: {
          sessionId,
          status: 'pending'
        },
        order: [['createdAt', 'DESC']]
      });

      if (!feedback) {
        throw new Error('No pending feedback found');
      }

      if (feedback.expiresAt && new Date(feedback.expiresAt) <= new Date()) {
        await feedback.update({ status: 'timeout', respondedAt: new Date() });
        await this.sessionManager.updateSession(sessionId, { status: 'active', requiredData: [] });
        return { type: 'cancelled', message: 'That pending request has expired. Please start it again.', confirmed: false, needsHumanInput: false };
      }

      // Update feedback
      await feedback.update({
        response,
        status: 'received',
        respondedAt: new Date()
      });

      // Process based on feedback type
      if (feedback.feedbackType === 'confirmation') {
        return await this.processConfirmation(sessionId, confirmed, feedback, authToken);
      } else {
        return await this.processDataCollection(sessionId, response, feedback, authToken);
      }

    } catch (error) {
      logger.error('Error processing human feedback', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process confirmation feedback
   */
  async processConfirmation(sessionId, confirmed, feedback, authToken = null) {
    const normalizedConfirmation = typeof confirmed === 'string'
      ? confirmed.trim().toLowerCase()
      : confirmed;

    if (normalizedConfirmation === true || normalizedConfirmation === 'yes') {
      const session = await this.sessionManager.getSession(sessionId);
      const latestUserMessage = this.getLatestUserMessage(session);
      // Recompute from the pinned intent allowlist; feedback JSON is not an
      // independent authority to execute tools.
      const handoff = feedback.context?.handoff;
      const tools = handoff ? [] : this.workflow.getToolsForState({
          intent: session.intent,
          collectedData: session.collectedData
        });

      // Determinism: re-run the same validation the StateGraph applies before
      // executing tools, so the confirm-then-execute path produces identical
      // tool calls (or the same re-prompt) as the graph path for identical
      // input + state. Without this, range/enum/pattern rules (e.g. amount max,
      // recipient pattern) are silently skipped on the confirmation path.
      const validationResult = handoff ? { valid: true } : intentMapper.validateData(session.intent, session.collectedData);
      if (!validationResult.valid) {
        const pendingFields = [...new Set([
          ...(validationResult.missing || []),
          ...(validationResult.invalid || []).map(issue => issue.field).filter(Boolean)
        ])];

        await this.sessionManager.updateSession(sessionId, {
          status: 'waiting_human_input',
          requiredData: pendingFields,
          currentStep: 'check_required_data'
        });

        await HumanFeedback.create({ sessionId, executionId: feedback.executionId, feedbackType: 'data_collection',
          question: 'Some details need to be corrected before I can proceed.', requiredFields: pendingFields,
          context: {}, status: 'pending', expiresAt: new Date(Date.now() + 300000) });

        return {
          type: 'human_input_required',
          message: 'Some details need to be corrected before I can proceed.',
          requiredFields: pendingFields,
          invalidFields: validationResult.invalid || [],
          needsHumanInput: true,
          currentStep: 'check_required_data'
        };
      }

      // Deterministic auth guard mirrors the graph path.
      if (tools.length > 0 && intentMapper.requiresAuth(session.intent) && !authToken) {
        const authBlock = this.policyEngine.block(
          'pre_tool',
          'authentication_required',
          'Your session is not authenticated for this banking action. Please sign in and try again.',
          { flags: ['missing_auth_token'], metadata: { intent: session.intent, tools } }
        );
        await this.sessionManager.updateSession(sessionId, { status: 'active', currentStep: 'policy_pre_tool' });
        return { currentStep: 'policy_pre_tool', needsHumanInput: false, ...this.buildPolicyResponse(authBlock) };
      }

      const confirmationState = { sessionId, userId: session.userId, intent: session.intent, collectedData: session.collectedData,
        channel: session.metadata?.channel || session.metadata?.runtimeContext?.channel, tenantId: session.metadata?.tenantId, interactionId: session.metadata?.interactionId, runtimeContext: session.metadata?.runtimeContext };
      if (!matchesConfirmation(feedback.context?.confirmation, confirmationState, tools, handoff ? 'handoff' : 'banking')) {
        if (handoff) return this.routeToHuman({ sessionId, userId: session.userId, metadata: session.metadata }, session.metadata.runtimeContext, handoff.reason, handoff.wording);
        const refreshed = await this.workflow.requestConfirmation(confirmationState);
        if (!refreshed.finalResponse || !feedback.executionId) return { type: 'cancelled', code: 'confirmation_changed', message: 'The pending request cannot be verified. Please repeat your request.', needsHumanInput: false };
        await HumanFeedback.create({ sessionId, executionId: feedback.executionId, feedbackType: 'confirmation', question: refreshed.finalResponse.question,
          context: refreshed.finalResponse.details, status: 'pending', expiresAt: new Date(Date.now() + 300000) });
        return { ...refreshed.finalResponse, code: 'confirmation_changed', currentStep: 'request_confirmation', needsHumanInput: true };
      }
      if (handoff) {
        try {
          const servicingCase = await this.integrations.createCase({ ...confirmationState, authToken, confirmationGranted: true }, handoff.reason);
          await this.sessionManager.updateSession(sessionId, { status: 'active', currentStep: 'human_handoff', requiredData: [] });
          return { type: 'human_escalation', message: handoff.wording || 'Your request has been queued for a support specialist.', intent: session.intent,
            needsHumanInput: false, caseId: servicingCase.id, metadata: { ...session.metadata.runtimeContext, caseId: servicingCase.id } };
        } catch (error) {
          if (error.code === 'RECONCILIATION_REQUIRED') return { type: 'reconciliation_required', operationId: error.operationId, reconcilePath: error.reconcilePath,
            message: 'The support request outcome is unconfirmed. Contact a support operator to reconcile it before trying again.', needsHumanInput: false };
          await this.sessionManager.updateSession(sessionId, { status: 'active', currentStep: 'human_handoff_failed', requiredData: [] });
          return { type: 'policy_blocked', code: 'case_creation_unavailable', message: 'The support request was not accepted. Please try again or contact support.', needsHumanInput: false };
        }
      }

      const policyDecision = this.policyEngine.evaluateToolExecution({
        intent: session.intent,
        tools,
        state: {
          sessionId,
          userId: session.userId,
          authToken,
          collectedData: session.collectedData,
          confirmationGranted: true
        }
      });

      await this.sessionManager.updateWorkflowState(sessionId, 'policy_pre_tool', {
        policy: policyDecision.audit
      });

      if (policyDecision.action === 'block') {
        await this.sessionManager.updateSession(sessionId, {
          status: 'active',
          currentStep: 'policy_pre_tool'
        });

        return {
          currentStep: 'policy_pre_tool',
          ...this.buildPolicyResponse(policyDecision)
        };
      }
      
      const toolResults = {};
      
      for (const tool of tools) {
        const parameters = this.workflow.buildToolParameters(tool, {
          sessionId,
          intent: session.intent,
          interactionId: session.metadata?.interactionId,
          tenantId: session.metadata?.tenantId,
          runtimeContext: session.metadata?.runtimeContext,
          confirmationGranted: true,
          userId: session.userId,
          authToken,
          collectedData: session.collectedData
        });

        const result = await this.mcpClient.executeToolWithRetry(
          tool,
          parameters,
          sessionId
        );
        toolResults[tool] = result;
      }

      let telemetryUnavailable = false;
      try { await this.sessionManager.updateWorkflowState(sessionId, 'execute_tools', { toolResults, policy: policyDecision.audit }); }
      catch (_error) { telemetryUnavailable = true; }

      const generationResult = await this.workflow.generateResponse({
        sessionId,
        userId: session.userId,
        intent: session.intent,
        interactionId: session.metadata?.interactionId,
        tenantId: session.metadata?.tenantId,
        runtimeContext: session.metadata?.runtimeContext,
        authToken,
        confirmationGranted: true,
        question: latestUserMessage,
        conversationHistory: session.conversationHistory,
        collectedData: session.collectedData,
        toolResults,
        telemetryUnavailable,
        policyTrace: [policyDecision.audit]
      });

      try { await this.sessionManager.updateSession(sessionId, {
        status: 'active',
        currentStep: generationResult.currentStep
      }); } catch (_error) { telemetryUnavailable = true; }

      return {
        confirmed: true,
        currentStep: generationResult.currentStep,
        needsHumanInput: false,
        ...generationResult.finalResponse,
        telemetryUnavailable: telemetryUnavailable || generationResult.finalResponse?.telemetryUnavailable === true
      };
    } else {
      // User cancelled
      await this.sessionManager.updateSession(sessionId, {
        status: 'active'
      });

      return {
        type: 'cancelled',
        message: 'Action cancelled. How else can I help you?',
        confirmed: false
      };
    }
  }

  /**
   * Process data collection feedback
   */
  async processDataCollection(sessionId, response, feedback, authToken = null) {
    await this.sessionManager.addMessage(
      sessionId,
      'user',
      typeof response === 'string' ? response : JSON.stringify(response),
      { source: 'human_feedback' }
    );

    const session = await this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    let slmResult = null;
    try {
      slmResult = await slmDataExtractor.extractAndValidate({
        intent: session.intent,
        conversationHistory: session.conversationHistory,
        latestInput: typeof response === 'string' ? response : JSON.stringify(response),
        existingData: session.collectedData
      });
    } catch (error) {
      logger.error('SLM extraction failed during feedback', {
        sessionId,
        error: error.message
      });
      if (isLlmError(error)) {
        // Extraction failed before any tool or workflow continuation. Retain
        // the original release/interaction and allow the same pending reply
        // to be retried after the configured provider recovers.
        await feedback.update({ status: 'pending', response: null, respondedAt: null });
        return modelUnavailable(error);
      }
    }

    const fallbackCollected = this.parseDataFromResponse(response, feedback.requiredFields, session.intent);
    const collectedData = {
      ...session.collectedData,
      ...(slmResult?.extractedData || {}),
      ...(!slmResult?.slmEnabled ? fallbackCollected : {})
    };

    // Fallback collection is merged after SLM extraction. Revalidate the final
    // values, otherwise a disabled SLM's stale missing-fields result discards
    // valid customer replies indefinitely.
    const validationResult = intentMapper.validateData(session.intent, collectedData);
    const requiredFields = validationResult.missing || [];
    const invalidFields = validationResult.invalid || [];
    const pendingFields = [...new Set([
      ...requiredFields,
      ...invalidFields
        .map(issue => issue.field)
        .filter(Boolean)
    ])];

    await this.sessionManager.updateSession(sessionId, {
      collectedData,
      requiredData: pendingFields,
      currentStep: 'check_required_data',
      status: pendingFields.length ? 'waiting_human_input' : session.status
    });

    await this.sessionManager.updateWorkflowState(sessionId, 'check_required_data', {
      validationResult,
      slm: { enabled: slmResult?.slmEnabled, modelOutput: slmResult?.modelOutput }
    });

    const needsMore = pendingFields.length > 0 || invalidFields.length > 0;

    if (!needsMore) {
      return await this.processMessageInSession({
        sessionId,
        intent: session.intent,
        question: session.conversationHistory[session.conversationHistory.length - 1]?.content || '',
        userId: session.userId,
        authToken,
        resumePublished: true
      });
    }

    await HumanFeedback.create({ sessionId, executionId: feedback.executionId, feedbackType: 'data_collection',
      question: 'Thank you. I still need some more information.', requiredFields: pendingFields,
      context: {}, status: 'pending', expiresAt: new Date(Date.now() + 300000) });

    return {
      type: 'human_input_required',
      message: 'Thank you. I still need some more information.',
      requiredFields: pendingFields,
      invalidFields
    };
  }

  /**
   * Parse data from user response
   */
  parseDataFromResponse(response, requiredFields, intent = null) {
    const collectedData = {};
    const fields = Array.isArray(requiredFields) ? requiredFields : [];
    const assign = (field, value) => {
      if (!fields.includes(field) || value === '' || value === undefined || value === null) return;
      const declaredType = intentMapper.getPublishedIntent(intent)?.fieldSchemas?.[field]?.type;
      if ((field === 'amount' || declaredType === 'number') && typeof value === 'string' && /^\$?-?[0-9,]+(?:\.[0-9]+)?$/.test(value.trim())) {
        collectedData[field] = Number(value.replace(/[$,]/g, ''));
      } else if ((field === 'isLegitimate' || declaredType === 'boolean') && typeof value === 'string' && /^(true|false|yes|no)$/i.test(value.trim())) {
        collectedData[field] = /^(true|yes)$/i.test(value.trim());
      } else {
        collectedData[field] = value;
      }
    };
    if (response && typeof response === 'object' && !Array.isArray(response)) {
      fields.forEach(field => {
        if (Object.prototype.hasOwnProperty.call(response, field)) assign(field, response[field]);
      });
      return collectedData;
    }
    if (typeof response !== 'string') return collectedData;
    try {
      const parsed = JSON.parse(response);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return this.parseDataFromResponse(parsed, fields, intent);
    } catch (_error) { /* Plain text is supported below. */ }
    response.split(/[\n;]/).forEach(line => {
      const separator = line.search(/[:=]/);
      if (separator > 0) assign(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
    });
    if (!Object.keys(collectedData).length && fields.length === 1) assign(fields[0], response.trim());
    return collectedData;
  }

  /**
   * Extract execution path from workflow result
   */
  extractExecutionPath(result) {
    const path = [];
    
    if (result.currentStep) {
      path.push(result.currentStep);
    }
    
    return path;
  }

  buildPolicyResponse(policyDecision) {
    return {
      type: 'policy_blocked',
      currentStep: `policy_${policyDecision.stage}`,
      stage: policyDecision.stage,
      code: policyDecision.code,
      message: policyDecision.message,
      policy: policyDecision.audit
    };
  }

  getLatestUserMessage(session) {
    const history = session?.conversationHistory || [];

    for (let index = history.length - 1; index >= 0; index -= 1) {
      if (history[index].role === 'user') {
        return history[index].content;
      }
    }

    return '';
  }

  /**
   * Get workflow execution history
   */
  async getExecutionHistory(sessionId) {
    return await WorkflowExecution.findAll({
      where: { sessionId },
      order: [['createdAt', 'DESC']],
      limit: 10
    });
  }
}

module.exports = WorkflowService;
