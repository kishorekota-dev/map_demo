const BankingChatWorkflow = require('../workflows/bankingChatWorkflow');
const { WorkflowExecution, HumanFeedback } = require('../models');
const logger = require('../utils/logger');
const slmDataExtractor = require('./poc-slm-data-extractor');
const intentMapper = require('./intentMapper');
const PolicyEngine = require('./policyEngine');

/**
 * Workflow Service
 * Orchestrates workflow execution and manages state
 * Now uses Enhanced MCP Client with hybrid protocol support
 */
class WorkflowService {
  constructor(mcpClient, sessionManager) {
    this.mcpClient = mcpClient;
    this.sessionManager = sessionManager;
    this.policyEngine = new PolicyEngine();
    this.workflow = new BankingChatWorkflow(mcpClient, sessionManager, this.policyEngine);
    
    logger.info('Workflow Service initialized with Enhanced MCP Client and Policy Engine');
  }

  /**
   * Process a message through the workflow
   */
  async processMessage({ sessionId, intent, question, userId, authToken = null, metadata = {} }) {
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
        intent,
        question,
        conversationHistory: session.conversationHistory,
        collectedData: session.collectedData,
        requiredData: session.requiredData || [],
        policyTrace: ingressPolicy.audit ? [ingressPolicy.audit] : [],
        confirmationGranted: false
      };

      // Execute workflow
      const result = await this.workflow.execute(workflowInput);

      // Update execution record
      const executionStatus = result.error
        ? 'failed'
        : result.finalResponse?.type === 'policy_blocked'
          ? 'cancelled'
          : 'completed';

      await execution.update({
        status: executionStatus,
        output: result.finalResponse,
        currentNode: result.currentStep,
        executionPath: this.extractExecutionPath(result),
        error: result.error ? { message: result.error } : null,
        completedAt: new Date()
      });

      // Handle human input required
      if (result.needsHumanInput) {
        const feedback = await HumanFeedback.create({
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
      }

      logger.info('Workflow execution completed', {
        sessionId,
        executionId,
        status: result.error ? 'failed' : 'completed',
        needsHumanInput: result.needsHumanInput
      });

      return {
        executionId,
        ...result.finalResponse,
        needsHumanInput: result.needsHumanInput,
        currentStep: result.currentStep
      };

    } catch (error) {
      logger.error('Workflow processing error', {
        sessionId,
        executionId,
        error: error.message,
        stack: error.stack
      });

      // Update execution as failed
      await WorkflowExecution.update(
        {
          status: 'failed',
          error: { message: error.message, stack: error.stack },
          completedAt: new Date()
        },
        { where: { executionId } }
      );

      throw error;
    }
  }

  /**
   * Process human feedback
   */
  async processHumanFeedback({ sessionId, response, confirmed, authToken = null }) {
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
      const tools = feedback.context.tools?.length
        ? feedback.context.tools
        : intentMapper.getToolsForIntent(session.intent);

      // Determinism: re-run the same validation the StateGraph applies before
      // executing tools, so the confirm-then-execute path produces identical
      // tool calls (or the same re-prompt) as the graph path for identical
      // input + state. Without this, range/enum/pattern rules (e.g. amount max,
      // recipient pattern) are silently skipped on the confirmation path.
      const validationResult = intentMapper.validateData(session.intent, session.collectedData);
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

      await this.sessionManager.updateWorkflowState(sessionId, 'execute_tools', {
        toolResults,
        policy: policyDecision.audit
      });

      const generationResult = await this.workflow.generateResponse({
        sessionId,
        userId: session.userId,
        intent: session.intent,
        question: latestUserMessage,
        conversationHistory: session.conversationHistory,
        collectedData: session.collectedData,
        toolResults,
        policyTrace: [policyDecision.audit]
      });

      await this.sessionManager.updateSession(sessionId, {
        status: 'active',
        currentStep: generationResult.currentStep
      });

      return {
        confirmed: true,
        currentStep: generationResult.currentStep,
        needsHumanInput: false,
        ...generationResult.finalResponse
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
    }

    const fallbackCollected = this.parseDataFromResponse(response, feedback.requiredFields);
    const collectedData = {
      ...session.collectedData,
      ...(slmResult?.extractedData || {}),
      ...(!slmResult?.slmEnabled ? fallbackCollected : {})
    };

    const validationResult = slmResult?.validationResult || intentMapper.validateData(session.intent, collectedData);
    const requiredFields = slmResult?.missingFields ?? validationResult.missing ?? [];
    const invalidFields = slmResult?.invalidFields ?? validationResult.invalid ?? [];
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
      return await this.processMessage({
        sessionId,
        intent: session.intent,
        question: session.conversationHistory[session.conversationHistory.length - 1]?.content || '',
        userId: session.userId,
        authToken
      });
    }

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
  parseDataFromResponse(response, requiredFields) {
    const collectedData = {};
    
    // Simple parsing - in production, use NLU service
    if (typeof response === 'object') {
      return response;
    }
    
    // Try to extract values from text
    // This is a simple implementation - should be enhanced
    requiredFields.forEach(field => {
      if (field === 'amount') {
        const match = response.match(/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
        if (match) {
          collectedData[field] = parseFloat(match[1].replace(',', ''));
        }
      } else {
        collectedData[field] = response;
      }
    });
    
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
