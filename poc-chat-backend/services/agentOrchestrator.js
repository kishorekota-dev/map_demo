const EventEmitter = require('events');
const axios = require('axios');
const logger = require('./logger');

class AgentOrchestrator extends EventEmitter {
    constructor() {
        super();
        this.agents = new Map();
        this.activeConversations = new Map();
        this.agentLoadBalancer = new Map();
        this.fallbackAgent = process.env.DEFAULT_AGENT || 'banking-assistant';
        this.maxConcurrentAgents = parseInt(process.env.MAX_CONCURRENT_AGENTS) || 10;
        this.agentResponseTimeout = parseInt(process.env.AGENT_RESPONSE_TIMEOUT) || 30000;
        this.retryAttempts = parseInt(process.env.AGENT_RETRY_ATTEMPTS) || 3;
        this.fallbackEnabled = process.env.AGENT_FALLBACK_ENABLED === 'true';
        
        this.initializeAgents();
        
        logger.info('AgentOrchestrator initialized', {
            maxConcurrentAgents: this.maxConcurrentAgents,
            fallbackAgent: this.fallbackAgent,
            fallbackEnabled: this.fallbackEnabled
        });
    }

    /**
     * Initialize available agents
     */
    initializeAgents() {
        // Banking Assistant Agent
        this.registerAgent({
            id: 'banking-assistant',
            name: 'Banking Assistant',
            type: 'ai',
            capabilities: ['account_inquiry', 'transaction_history', 'balance_check', 'transfer_funds', 'card_services'],
            priority: 1,
            maxConcurrent: 5,
            serviceEndpoint: process.env.BANKING_SERVICE_URL,
            isActive: true
        });

        // NLP Processing Agent
        this.registerAgent({
            id: 'nlp-processor',
            name: 'Natural Language Processor',
            type: 'nlp',
            capabilities: ['text_analysis', 'sentiment_analysis', 'entity_extraction', 'intent_classification'],
            priority: 2,
            maxConcurrent: 3,
            serviceEndpoint: process.env.NLP_SERVICE_URL,
            isActive: true
        });

        // NLU Intent Agent
        this.registerAgent({
            id: 'nlu-intent',
            name: 'Natural Language Understanding',
            type: 'nlu',
            capabilities: ['intent_detection', 'context_understanding', 'dialogue_management'],
            priority: 2,
            maxConcurrent: 3,
            serviceEndpoint: process.env.NLU_SERVICE_URL,
            isActive: true
        });

        // MCP Tool Agent
        this.registerAgent({
            id: 'mcp-tools',
            name: 'Model Context Protocol Tools',
            type: 'mcp',
            capabilities: ['tool_calling', 'external_api', 'data_retrieval', 'system_integration'],
            priority: 3,
            maxConcurrent: 2,
            serviceEndpoint: process.env.MCP_SERVICE_URL,
            isActive: true
        });

        // Human Escalation Agent (fallback)
        this.registerAgent({
            id: 'human-escalation',
            name: 'Human Support Escalation',
            type: 'human',
            capabilities: ['complex_issues', 'dispute_resolution', 'manual_verification'],
            priority: 10,
            maxConcurrent: 1,
            serviceEndpoint: null,
            isActive: this.fallbackEnabled
        });
    }

    /**
     * Register a new agent
     */
    registerAgent(agentConfig) {
        try {
            const agent = {
                ...agentConfig,
                currentLoad: 0,
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                averageResponseTime: 0,
                lastHealthCheck: null,
                isHealthy: true,
                registeredAt: new Date()
            };

            this.agents.set(agentConfig.id, agent);
            this.agentLoadBalancer.set(agentConfig.id, {
                activeConversations: 0,
                requestQueue: [],
                healthStatus: 'healthy'
            });

            logger.info('Agent registered', { 
                agentId: agentConfig.id, 
                name: agentConfig.name,
                capabilities: agentConfig.capabilities
            });

            this.emit('agentRegistered', agent);
        } catch (error) {
            logger.error('Error registering agent', { 
                error: error.message, 
                agentConfig
            });
            throw error;
        }
    }

    /**
     * Process message through appropriate agents
     */
    async processMessage(sessionId, message, conversationContext = {}) {
        try {
            logger.info('Starting message processing', { 
                sessionId, 
                messageId: message.id,
                contentLength: message.content?.length || 0
            });

            // Determine required agents based on message type and context
            const requiredAgents = await this.determineRequiredAgents(message, conversationContext);
            
            // Create processing pipeline
            const processingPipeline = this.createProcessingPipeline(requiredAgents, sessionId);
            
            // Execute pipeline
            const result = await this.executePipeline(processingPipeline, message, conversationContext);
            
            logger.info('Message processing completed', { 
                sessionId, 
                messageId: message.id,
                agentsInvolved: requiredAgents.map(a => a.id),
                processingTime: result.processingTime
            });

            return result;
        } catch (error) {
            logger.error('Error processing message through agents', { 
                error: error.message, 
                sessionId,
                messageId: message.id
            });
            
            // Try fallback processing
            if (this.fallbackEnabled) {
                return await this.fallbackProcessing(sessionId, message, conversationContext);
            }
            
            throw error;
        }
    }

    /**
     * Determine which agents are needed for processing
     */
    async determineRequiredAgents(message, conversationContext) {
        const requiredAgents = [];
        const messageContent = message.content?.toLowerCase() || '';
        
        try {
            // Always start with NLP for text analysis
            if (message.type === 'text' && messageContent) {
                const nlpAgent = this.getAvailableAgent('nlp-processor');
                if (nlpAgent) requiredAgents.push(nlpAgent);
            }

            // Add NLU for intent detection
            const nluAgent = this.getAvailableAgent('nlu-intent');
            if (nluAgent) requiredAgents.push(nluAgent);

            // Determine if banking services are needed
            const bankingKeywords = ['account', 'balance', 'transfer', 'payment', 'card', 'transaction', 'deposit', 'withdrawal'];
            if (bankingKeywords.some(keyword => messageContent.includes(keyword)) || 
                conversationContext.currentIntent?.includes('banking')) {
                const bankingAgent = this.getAvailableAgent('banking-assistant');
                if (bankingAgent) requiredAgents.push(bankingAgent);
            }

            // Check if MCP tools are needed
            const mcpKeywords = ['calculate', 'search', 'lookup', 'external', 'api', 'tool'];
            if (mcpKeywords.some(keyword => messageContent.includes(keyword)) ||
                conversationContext.requiresTools) {
                const mcpAgent = this.getAvailableAgent('mcp-tools');
                if (mcpAgent) requiredAgents.push(mcpAgent);
            }

            // Fallback to banking assistant if no specific agents determined
            if (requiredAgents.length === 0) {
                const fallbackAgent = this.getAvailableAgent(this.fallbackAgent);
                if (fallbackAgent) requiredAgents.push(fallbackAgent);
            }

            return requiredAgents;
        } catch (error) {
            logger.error('Error determining required agents', { 
                error: error.message, 
                messageContent: messageContent.substring(0, 100)
            });
            return [];
        }
    }

    /**
     * Get available agent by type or ID
     */
    getAvailableAgent(agentIdentifier) {
        try {
            // Try by ID first
            let agent = this.agents.get(agentIdentifier);
            
            // If not found, try by type
            if (!agent) {
                agent = Array.from(this.agents.values()).find(a => a.type === agentIdentifier);
            }

            if (!agent || !agent.isActive || !agent.isHealthy) {
                return null;
            }

            const loadInfo = this.agentLoadBalancer.get(agent.id);
            if (loadInfo && loadInfo.activeConversations >= agent.maxConcurrent) {
                return null;
            }

            return agent;
        } catch (error) {
            logger.error('Error getting available agent', { 
                error: error.message, 
                agentIdentifier
            });
            return null;
        }
    }

    /**
     * Create processing pipeline
     */
    createProcessingPipeline(agents, sessionId) {
        return {
            sessionId,
            agents,
            steps: agents.map(agent => ({
                agentId: agent.id,
                agentName: agent.name,
                agentType: agent.type,
                serviceEndpoint: agent.serviceEndpoint,
                timeout: this.agentResponseTimeout,
                retries: this.retryAttempts
            })),
            startTime: new Date(),
            results: []
        };
    }

    /**
     * Execute processing pipeline
     */
    async executePipeline(pipeline, message, conversationContext) {
        const pipelineStartTime = Date.now();
        let aggregatedResult = {
            responses: [],
            nlpAnalysis: null,
            intentDetection: null,
            bankingResult: null,
            mcpResult: null,
            finalResponse: null,
            conversationContextUpdates: {},
            processingTime: 0,
            agentsInvolved: []
        };

        try {
            for (const step of pipeline.steps) {
                try {
                    logger.debug('Executing pipeline step', { 
                        sessionId: pipeline.sessionId,
                        agentId: step.agentId,
                        agentType: step.agentType
                    });

                    // Reserve agent
                    this.reserveAgent(step.agentId, pipeline.sessionId);

                    // Process with agent
                    const stepResult = await this.processWithAgent(step, message, conversationContext, aggregatedResult);
                    
                    // Update aggregated result
                    this.updateAggregatedResult(aggregatedResult, step.agentType, stepResult);
                    
                    // Release agent
                    this.releaseAgent(step.agentId, pipeline.sessionId);

                    pipeline.results.push({
                        agentId: step.agentId,
                        agentType: step.agentType,
                        success: true,
                        result: stepResult,
                        timestamp: new Date()
                    });

                } catch (stepError) {
                    logger.error('Pipeline step failed', { 
                        error: stepError.message,
                        sessionId: pipeline.sessionId,
                        agentId: step.agentId
                    });

                    // Release agent on error
                    this.releaseAgent(step.agentId, pipeline.sessionId);

                    pipeline.results.push({
                        agentId: step.agentId,
                        agentType: step.agentType,
                        success: false,
                        error: stepError.message,
                        timestamp: new Date()
                    });

                    // Continue with next agent unless critical failure
                    if (step.agentType === 'banking' && !this.fallbackEnabled) {
                        throw stepError;
                    }
                }
            }

            // Generate final response
            aggregatedResult.finalResponse = this.generateFinalResponse(aggregatedResult, message);
            aggregatedResult.processingTime = Date.now() - pipelineStartTime;
            aggregatedResult.agentsInvolved = pipeline.results.map(r => r.agentId);

            return aggregatedResult;
        } catch (error) {
            logger.error('Pipeline execution failed', { 
                error: error.message,
                sessionId: pipeline.sessionId,
                completedSteps: pipeline.results.length
            });
            throw error;
        }
    }

    /**
     * Process message with specific agent
     */
    async processWithAgent(step, message, conversationContext, aggregatedResult) {
        try {
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Agent timeout')), step.timeout);
            });

            const processingPromise = this.callAgentService(step, message, conversationContext, aggregatedResult);

            return await Promise.race([processingPromise, timeoutPromise]);
        } catch (error) {
            // Retry logic
            for (let retry = 1; retry <= step.retries; retry++) {
                try {
                    logger.warn(`Retrying agent call (attempt ${retry})`, { 
                        agentId: step.agentId,
                        error: error.message
                    });
                    
                    const retryPromise = this.callAgentService(step, message, conversationContext, aggregatedResult);
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Agent timeout on retry')), step.timeout);
                    });

                    return await Promise.race([retryPromise, timeoutPromise]);
                } catch (retryError) {
                    if (retry === step.retries) {
                        throw retryError;
                    }
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, 1000 * retry));
                }
            }
        }
    }

    /**
     * Call agent service
     */
    async callAgentService(step, message, conversationContext, aggregatedResult) {
        try {
            if (!step.serviceEndpoint) {
                throw new Error('No service endpoint configured');
            }

            const requestData = {
                message,
                conversationContext,
                previousResults: aggregatedResult,
                sessionInfo: {
                    sessionId: message.sessionId,
                    userId: message.userId,
                    timestamp: new Date().toISOString()
                }
            };

            const response = await axios.post(
                `${step.serviceEndpoint}/api/process`,
                requestData,
                {
                    timeout: step.timeout,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Agent-Type': step.agentType,
                        'X-Session-ID': message.sessionId
                    }
                }
            );

            return response.data;
        } catch (error) {
            if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                throw new Error(`Agent service unavailable: ${step.agentId}`);
            }
            throw error;
        }
    }

    /**
     * Update aggregated result based on agent type
     */
    updateAggregatedResult(aggregatedResult, agentType, stepResult) {
        switch (agentType) {
            case 'nlp':
                aggregatedResult.nlpAnalysis = stepResult;
                break;
            case 'nlu':
                aggregatedResult.intentDetection = stepResult;
                if (stepResult.conversationContextUpdates) {
                    Object.assign(aggregatedResult.conversationContextUpdates, stepResult.conversationContextUpdates);
                }
                break;
            case 'ai':
            case 'banking':
                aggregatedResult.bankingResult = stepResult;
                break;
            case 'mcp':
                aggregatedResult.mcpResult = stepResult;
                break;
        }

        aggregatedResult.responses.push({
            agentType,
            result: stepResult,
            timestamp: new Date()
        });
    }

    /**
     * Generate final response from aggregated results
     */
    generateFinalResponse(aggregatedResult, originalMessage) {
        try {
            // Priority: Banking > MCP > NLU > NLP
            if (aggregatedResult.bankingResult && aggregatedResult.bankingResult.response) {
                return {
                    content: aggregatedResult.bankingResult.response,
                    type: 'text',
                    confidence: aggregatedResult.bankingResult.confidence || 0.8,
                    source: 'banking-assistant',
                    metadata: {
                        intent: aggregatedResult.intentDetection?.intent,
                        entities: aggregatedResult.nlpAnalysis?.entities,
                        sentiment: aggregatedResult.nlpAnalysis?.sentiment,
                        suggestedActions: aggregatedResult.bankingResult.suggestedActions,
                        quickReplies: aggregatedResult.bankingResult.quickReplies
                    }
                };
            }

            if (aggregatedResult.mcpResult && aggregatedResult.mcpResult.response) {
                return {
                    content: aggregatedResult.mcpResult.response,
                    type: 'text',
                    confidence: aggregatedResult.mcpResult.confidence || 0.7,
                    source: 'mcp-tools',
                    metadata: {
                        toolsUsed: aggregatedResult.mcpResult.toolsUsed,
                        dataRetrieved: aggregatedResult.mcpResult.dataRetrieved
                    }
                };
            }

            // Fallback response
            return {
                content: "I understand your message. How can I assist you with your banking needs today?",
                type: 'text',
                confidence: 0.5,
                source: 'fallback',
                metadata: {
                    intent: aggregatedResult.intentDetection?.intent || 'general_inquiry',
                    entities: aggregatedResult.nlpAnalysis?.entities || {},
                    sentiment: aggregatedResult.nlpAnalysis?.sentiment || 'neutral'
                }
            };
        } catch (error) {
            logger.error('Error generating final response', { 
                error: error.message,
                aggregatedResult: Object.keys(aggregatedResult)
            });
            
            return {
                content: "I apologize, but I'm having trouble processing your request right now. Please try again.",
                type: 'text',
                confidence: 0.1,
                source: 'error-fallback',
                metadata: {}
            };
        }
    }

    /**
     * Fallback processing when main pipeline fails
     */
    async fallbackProcessing(sessionId, message, conversationContext) {
        try {
            logger.info('Using fallback processing', { sessionId, messageId: message.id });
            
            return {
                responses: [],
                finalResponse: {
                    content: "I'm sorry, I'm experiencing some technical difficulties. A human agent will assist you shortly.",
                    type: 'text',
                    confidence: 0.3,
                    source: 'fallback-human',
                    metadata: {
                        escalationRequired: true,
                        originalMessage: message.content
                    }
                },
                conversationContextUpdates: {
                    escalationRequested: true,
                    fallbackUsed: true
                },
                processingTime: 100,
                agentsInvolved: ['fallback']
            };
        } catch (error) {
            logger.error('Fallback processing failed', { 
                error: error.message, 
                sessionId
            });
            throw error;
        }
    }

    /**
     * Reserve agent for processing
     */
    reserveAgent(agentId, sessionId) {
        const loadInfo = this.agentLoadBalancer.get(agentId);
        if (loadInfo) {
            loadInfo.activeConversations++;
        }

        const agent = this.agents.get(agentId);
        if (agent) {
            agent.currentLoad++;
            agent.totalRequests++;
        }

        logger.debug('Agent reserved', { agentId, sessionId });
    }

    /**
     * Release agent after processing
     */
    releaseAgent(agentId, sessionId) {
        const loadInfo = this.agentLoadBalancer.get(agentId);
        if (loadInfo && loadInfo.activeConversations > 0) {
            loadInfo.activeConversations--;
        }

        const agent = this.agents.get(agentId);
        if (agent && agent.currentLoad > 0) {
            agent.currentLoad--;
        }

        logger.debug('Agent released', { agentId, sessionId });
    }

    /**
     * Get orchestrator health status
     */
    getHealthStatus() {
        const agentStatuses = Array.from(this.agents.values()).map(agent => ({
            id: agent.id,
            name: agent.name,
            type: agent.type,
            isActive: agent.isActive,
            isHealthy: agent.isHealthy,
            currentLoad: agent.currentLoad,
            totalRequests: agent.totalRequests,
            successRate: agent.totalRequests > 0 ? (agent.successfulRequests / agent.totalRequests) * 100 : 0
        }));

        return {
            status: 'healthy',
            totalAgents: this.agents.size,
            activeAgents: Array.from(this.agents.values()).filter(a => a.isActive).length,
            healthyAgents: Array.from(this.agents.values()).filter(a => a.isHealthy).length,
            activeConversations: this.activeConversations.size,
            agentStatuses,
            uptime: process.uptime()
        };
    }
}

module.exports = AgentOrchestrator;