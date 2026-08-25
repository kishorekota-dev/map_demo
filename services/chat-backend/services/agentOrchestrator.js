const EventEmitter = require('events');
const axios = require('axios');
const logger = require('./logger');

/**
 * AgentOrchestrator
 *
 * Deterministic message router for the chat backend. For every customer
 * message it runs a fixed, reproducible pipeline:
 *
 *   1. classify intent via the NLU service (deterministic classifier;
 *      canonical snake_case vocabulary; stable fallback intent)
 *   2. run the canonical AI workflow in ai-orchestrator
 *      (LangGraph + policy engine) which performs data collection,
 *      confirmation gating, deterministic tool execution and response
 *      generation
 *   3. map the workflow result to the chat response contract, surfacing
 *      human-input / confirmation / escalation states explicitly
 *
 * Routing is a pure function of (intent, workflow state) — it does NOT depend
 * on live agent load or health, so identical input + state always produces the
 * same route. Capacity limits are handled as explicit backpressure, never by
 * silently dropping a processing step.
 */
class AgentOrchestrator extends EventEmitter {
    constructor() {
        super();

        // Downstream services
        this.nluServiceUrl = process.env.NLU_SERVICE_URL || 'http://localhost:3003';
        this.orchestratorUrl = process.env.AI_ORCHESTRATOR_URL || 'http://localhost:3007';

        // Timeouts / retries
        this.requestTimeout = parseInt(process.env.AGENT_RESPONSE_TIMEOUT, 10) || 30000;
        // Only network-level failures are retried; timeouts are NOT retried so a
        // slow state-changing call is never silently duplicated.
        this.networkRetryAttempts = parseInt(process.env.AGENT_NETWORK_RETRY_ATTEMPTS, 10) || 2;

        // Deterministic fallback intent when classification is unavailable.
        this.fallbackIntent = process.env.DEFAULT_INTENT || 'general_inquiry';
        this.escalationEnabled = process.env.AGENT_FALLBACK_ENABLED !== 'false';

        // Concurrency tracking is observability/backpressure only — it never
        // changes which steps run for a message.
        this.activeRequests = new Map();
        this.maxConcurrentRequests = parseInt(process.env.MAX_CONCURRENT_REQUESTS, 10) || 100;

        // Kept for the /health endpoint and event listeners that other modules
        // already subscribe to.
        this.agents = new Map();
        this.registerStaticAgents();

        logger.info('AgentOrchestrator initialized', {
            nluServiceUrl: this.nluServiceUrl,
            orchestratorUrl: this.orchestratorUrl,
            requestTimeout: this.requestTimeout,
            fallbackIntent: this.fallbackIntent
        });
    }

    /**
     * Register the logical pipeline stages for health reporting.
     */
    registerStaticAgents() {
        const stages = [
            { id: 'nlu-intent', name: 'NLU Intent Classifier', type: 'nlu', endpoint: this.nluServiceUrl },
            { id: 'ai-orchestrator', name: 'AI Orchestrator (LangGraph + Policy)', type: 'ai', endpoint: this.orchestratorUrl }
        ];
        for (const stage of stages) {
            this.agents.set(stage.id, { ...stage, isActive: true, isHealthy: true, totalRequests: 0, failedRequests: 0 });
        }
    }

    /**
     * Process a customer message deterministically.
     *
     * @param {string} sessionId
     * @param {object} message - { content, type, sessionId?, userId?, authToken? }
     * @param {object} conversationContext - session.state (may carry userId/authToken)
     * @returns {object} { finalResponse, conversationContextUpdates, processingTime, agentsInvolved }
     */
    async processMessage(sessionId, message, conversationContext = {}) {
        const startTime = Date.now();
        const requestKey = `${sessionId}:${message.id || startTime}`;

        // Explicit backpressure rather than silent step-dropping.
        if (this.activeRequests.size >= this.maxConcurrentRequests) {
            logger.warn('Orchestrator at capacity, applying backpressure', {
                sessionId,
                active: this.activeRequests.size
            });
            return this.buildResult(
                {
                    content: 'We are handling a high volume of requests right now. Please resend your message in a moment.',
                    type: 'text',
                    confidence: 1,
                    source: 'backpressure',
                    metadata: { retryable: true }
                },
                {},
                startTime,
                ['backpressure']
            );
        }

        this.activeRequests.set(requestKey, startTime);
        this.emit('processingStarted', { sessionId, messageId: message.id });

        try {
            const question = (message.content || '').trim();
            const userId = message.userId || conversationContext.userId || null;
            const authToken = message.authToken || conversationContext.authToken || null;

            if (!question) {
                return this.buildResult(
                    {
                        content: 'Please enter a message so I can help.',
                        type: 'text',
                        confidence: 1,
                        source: 'validation',
                        metadata: {}
                    },
                    {},
                    startTime,
                    ['validation']
                );
            }

            // If the customer is responding to a pending confirmation/data
            // request, route the reply to the workflow's feedback endpoint so the
            // confirm-then-execute path runs (with re-validation) instead of being
            // re-classified as a brand new intent.
            if (conversationContext.pendingFeedback) {
                return await this.continuePendingWorkflow({
                    sessionId,
                    question,
                    authToken,
                    pendingFeedback: conversationContext.pendingFeedback,
                    startTime
                });
            }

            // Step 1 — deterministic intent classification
            const intent = await this.classifyIntent(question, sessionId, conversationContext);

            // Step 2 — canonical AI workflow
            const workflow = await this.callOrchestrator({
                path: '/api/orchestrator/process',
                payload: { sessionId, intent, question, userId },
                authToken
            });

            this.emit('processingCompleted', { sessionId, messageId: message.id, intent });

            // Step 3 — map to chat response contract
            return this.mapWorkflowResult(workflow, { intent, startTime, sessionId });
        } catch (error) {
            logger.error('Orchestration failed', { sessionId, error: error.message });
            return this.escalate(sessionId, message, startTime, error);
        } finally {
            this.activeRequests.delete(requestKey);
        }
    }

    /**
     * Continue a workflow that is waiting on human input (confirmation or
     * additional data). Reproducible: the same reply + pending state always
     * resolves the same way.
     */
    async continuePendingWorkflow({ sessionId, question, authToken, pendingFeedback, startTime }) {
        const confirmed = pendingFeedback.type === 'confirmation_required'
            ? /\b(yes|confirm|approve|proceed|ok|okay)\b/i.test(question)
            : undefined;

        const workflow = await this.callOrchestrator({
            path: '/api/orchestrator/feedback',
            payload: { sessionId, response: question, confirmed },
            authToken
        });

        return this.mapWorkflowResult(workflow, { intent: pendingFeedback.intent, startTime, sessionId });
    }

    /**
     * Classify a message into a canonical orchestrator intent. The NLU service
     * is the single deterministic classifier and is responsible for returning a
     * canonical snake_case intent. On any failure we fall back to a fixed intent
     * so behaviour is still defined and reproducible.
     */
    async classifyIntent(question, sessionId, conversationContext) {
        // Honour an explicit intent already established for the conversation.
        if (conversationContext.lockedIntent) {
            return conversationContext.lockedIntent;
        }

        try {
            const response = await this.httpPost(
                `${this.nluServiceUrl}/api/nlu/intents`,
                { message: question, sessionId },
                { 'X-Session-ID': sessionId }
            );

            const intent = response?.data?.intent
                || response?.data?.result?.intent
                || response?.data?.data?.intent;

            if (intent && typeof intent === 'string') {
                logger.debug('Intent classified', { sessionId, intent });
                return intent;
            }

            logger.warn('NLU returned no intent, using fallback', { sessionId, fallback: this.fallbackIntent });
            return this.fallbackIntent;
        } catch (error) {
            logger.warn('NLU classification unavailable, using fallback intent', {
                sessionId,
                fallback: this.fallbackIntent,
                error: error.message
            });
            return this.fallbackIntent;
        }
    }

    /**
     * Call the AI orchestrator with deterministic timeout and bounded
     * network-only retries. A timeout aborts the in-flight request (so it cannot
     * complete after we have given up) and is NOT retried, preventing duplicate
     * execution of state-changing actions.
     */
    async callOrchestrator({ path, payload, authToken }) {
        const url = `${this.orchestratorUrl}${path}`;
        const headers = { 'Content-Type': 'application/json' };
        if (authToken) {
            headers.Authorization = `Bearer ${authToken}`;
        }

        let lastError;
        for (let attempt = 0; attempt <= this.networkRetryAttempts; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.requestTimeout);
            try {
                const response = await axios.post(url, payload, {
                    headers,
                    timeout: this.requestTimeout,
                    signal: controller.signal
                });
                return response.data;
            } catch (error) {
                lastError = error;
                const isNetwork = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(error.code);
                // Only retry pure connection failures, never timeouts/aborts or
                // HTTP error responses.
                if (!isNetwork || attempt === this.networkRetryAttempts) {
                    break;
                }
                logger.warn('Orchestrator unreachable, retrying', { url, attempt: attempt + 1 });
                await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
            } finally {
                clearTimeout(timer);
            }
        }

        const agent = this.agents.get('ai-orchestrator');
        if (agent) { agent.failedRequests++; }
        throw new Error(`AI orchestrator call failed (${path}): ${lastError?.message || 'unknown error'}`);
    }

    /**
     * Translate an ai-orchestrator workflow result into the chat response
     * contract and the conversation-context updates the socket layer applies.
     * The response `type` returned by the workflow drives the mapping
     * deterministically.
     */
    mapWorkflowResult(workflow, { intent, startTime, sessionId }) {
        const type = workflow?.type;

        // The workflow needs more information or a confirmation from the user.
        if (workflow?.needsHumanInput || type === 'human_input_required' || type === 'confirmation_required') {
            const question = workflow.question
                || workflow.message
                || 'Could you provide a bit more detail so I can continue?';

            return this.buildResult(
                {
                    content: question,
                    type: 'text',
                    confidence: 1,
                    source: 'ai-orchestrator',
                    metadata: {
                        intent,
                        requiresUserResponse: true,
                        responseType: type,
                        requiredFields: workflow.requiredFields || [],
                        details: workflow.details || null
                    }
                },
                {
                    // Persist pending state so the next user reply is routed to the
                    // workflow's feedback endpoint, not re-classified.
                    pendingFeedback: { type, intent },
                    lockedIntent: intent
                },
                startTime,
                ['nlu-intent', 'ai-orchestrator']
            );
        }

        // A policy block (auth required, prompt injection, limit exceeded, etc.).
        if (type === 'policy_blocked') {
            return this.buildResult(
                {
                    content: workflow.message || 'I cannot complete that request under current policy.',
                    type: 'text',
                    confidence: 1,
                    source: 'policy-engine',
                    metadata: { intent, policyCode: workflow.code, stage: workflow.stage }
                },
                { pendingFeedback: null, lockedIntent: null },
                startTime,
                ['ai-orchestrator']
            );
        }

        // Workflow error → escalate deterministically.
        if (type === 'error') {
            return this.escalate(sessionId, { content: workflow.message }, startTime, new Error(workflow.error || 'workflow error'));
        }

        // Completed: a normal response.
        const content = workflow?.response
            || workflow?.message
            || "I've processed your request.";

        return this.buildResult(
            {
                content,
                type: 'text',
                confidence: 0.9,
                source: 'ai-orchestrator',
                metadata: { intent, policy: workflow?.policy || null }
            },
            // Clear any pending state once a turn completes.
            { pendingFeedback: null, lockedIntent: null },
            startTime,
            ['nlu-intent', 'ai-orchestrator']
        );
    }

    /**
     * Deterministic human escalation. Emits an escalation event the agent
     * surface can consume and returns a stable message.
     */
    escalate(sessionId, message, startTime, error) {
        const escalationContext = {
            escalationRequired: true,
            escalationReason: error?.message || 'processing_error',
            escalatedAt: new Date().toISOString()
        };

        if (this.escalationEnabled) {
            this.emit('humanEscalation', {
                sessionId,
                reason: escalationContext.escalationReason,
                originalMessage: message?.content
            });
        }

        return this.buildResult(
            {
                content: this.escalationEnabled
                    ? "I'm connecting you with a support specialist who can help. Please hold on."
                    : "I'm having trouble completing that right now. Please try again shortly.",
                type: 'text',
                confidence: 0.3,
                source: 'human-escalation',
                metadata: escalationContext
            },
            escalationContext,
            startTime,
            ['human-escalation']
        );
    }

    /**
     * Shape the orchestrator result into the contract socketHandler expects.
     */
    buildResult(finalResponse, conversationContextUpdates, startTime, agentsInvolved) {
        return {
            finalResponse,
            conversationContextUpdates,
            processingTime: Date.now() - startTime,
            agentsInvolved
        };
    }

    /**
     * POST helper with AbortController-based timeout (so timed-out requests are
     * actually cancelled, not left dangling).
     */
    async httpPost(url, body, extraHeaders = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.requestTimeout);
        try {
            return await axios.post(url, body, {
                timeout: this.requestTimeout,
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json', ...extraHeaders }
            });
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Health status for the /health endpoint.
     */
    getHealthStatus() {
        const agentStatuses = Array.from(this.agents.values()).map((agent) => ({
            id: agent.id,
            name: agent.name,
            type: agent.type,
            endpoint: agent.endpoint,
            isActive: agent.isActive,
            isHealthy: agent.isHealthy,
            totalRequests: agent.totalRequests,
            failedRequests: agent.failedRequests
        }));

        return {
            status: 'healthy',
            pipeline: ['nlu-intent', 'ai-orchestrator'],
            activeRequests: this.activeRequests.size,
            maxConcurrentRequests: this.maxConcurrentRequests,
            agentStatuses,
            uptime: process.uptime()
        };
    }
}

module.exports = AgentOrchestrator;
