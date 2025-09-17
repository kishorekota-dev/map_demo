const EventEmitter = require('events');
const logger = require('./logger');

class ChatService extends EventEmitter {
    constructor() {
        super();
        this.activeChats = new Map();
        this.messageHistory = new Map();
        this.userSessions = new Map();
        this.maxHistorySize = parseInt(process.env.MAX_CONVERSATION_HISTORY) || 100;
        this.messageRateLimit = parseInt(process.env.MESSAGE_RATE_LIMIT) || 60;
        this.conversationTimeout = parseInt(process.env.CONVERSATION_TIMEOUT) || 1800000; // 30 minutes
        this.autoSaveInterval = parseInt(process.env.AUTO_SAVE_INTERVAL) || 30000; // 30 seconds
        
        // Set up auto-save for conversation history
        this.setupAutoSave();
        
        logger.info('ChatService initialized', {
            maxHistorySize: this.maxHistorySize,
            messageRateLimit: this.messageRateLimit,
            conversationTimeout: this.conversationTimeout
        });
    }

    /**
     * Create a new chat session
     */
    async createChatSession(userId, sessionId, userData = {}) {
        try {
            const session = {
                sessionId,
                userId,
                createdAt: new Date(),
                lastActivity: new Date(),
                isActive: true,
                userData,
                messageCount: 0,
                conversationContext: {
                    currentIntent: null,
                    bankingContext: null,
                    previousIntents: [],
                    entities: {},
                    preferences: {}
                }
            };

            this.userSessions.set(sessionId, session);
            this.messageHistory.set(sessionId, []);
            this.activeChats.set(sessionId, {
                status: 'active',
                agentAssigned: false,
                queuePosition: null
            });

            logger.info('Chat session created', { 
                sessionId, 
                userId,
                userData: Object.keys(userData)
            });

            this.emit('sessionCreated', { sessionId, userId, session });
            return session;
        } catch (error) {
            logger.error('Error creating chat session', { error: error.message, sessionId, userId });
            throw error;
        }
    }

    /**
     * Process incoming message
     */
    async processMessage(sessionId, message, metadata = {}) {
        try {
            const session = this.userSessions.get(sessionId);
            if (!session) {
                throw new Error('Session not found');
            }

            // Rate limiting check
            if (!this.checkRateLimit(sessionId)) {
                throw new Error('Message rate limit exceeded');
            }

            // Update session activity
            session.lastActivity = new Date();
            session.messageCount++;

            // Create message object
            const messageObj = {
                id: this.generateMessageId(),
                sessionId,
                userId: session.userId,
                content: message.content,
                type: message.type || 'text',
                timestamp: new Date(),
                direction: 'incoming',
                metadata: {
                    ...metadata,
                    clientInfo: message.clientInfo,
                    attachments: message.attachments || []
                },
                processing: {
                    nlpAnalyzed: false,
                    nluProcessed: false,
                    mcpHandled: false,
                    bankingProcessed: false
                }
            };

            // Add to history
            this.addToHistory(sessionId, messageObj);

            logger.info('Message received for processing', { 
                sessionId, 
                messageId: messageObj.id,
                type: messageObj.type,
                contentLength: message.content?.length || 0
            });

            // Emit for processing pipeline
            this.emit('messageReceived', messageObj);

            return messageObj;
        } catch (error) {
            logger.error('Error processing message', { 
                error: error.message, 
                sessionId,
                messageContent: message?.content?.substring(0, 100)
            });
            throw error;
        }
    }

    /**
     * Send response message
     */
    async sendResponse(sessionId, response, agentInfo = {}) {
        try {
            const session = this.userSessions.get(sessionId);
            if (!session) {
                throw new Error('Session not found');
            }

            const responseObj = {
                id: this.generateMessageId(),
                sessionId,
                userId: session.userId,
                content: response.content,
                type: response.type || 'text',
                timestamp: new Date(),
                direction: 'outgoing',
                agentInfo: {
                    agentId: agentInfo.agentId || 'system',
                    agentType: agentInfo.agentType || 'ai',
                    confidence: agentInfo.confidence || null,
                    processingTime: agentInfo.processingTime || null
                },
                metadata: {
                    ...response.metadata,
                    suggestedActions: response.suggestedActions || [],
                    quickReplies: response.quickReplies || []
                }
            };

            // Add to history
            this.addToHistory(sessionId, responseObj);

            // Update session activity
            session.lastActivity = new Date();

            logger.info('Response sent', { 
                sessionId, 
                messageId: responseObj.id,
                agentType: agentInfo.agentType,
                contentLength: response.content?.length || 0
            });

            // Emit for real-time delivery
            this.emit('responseReady', responseObj);

            return responseObj;
        } catch (error) {
            logger.error('Error sending response', { 
                error: error.message, 
                sessionId,
                agentInfo
            });
            throw error;
        }
    }

    /**
     * Update conversation context
     */
    updateConversationContext(sessionId, contextUpdates) {
        try {
            const session = this.userSessions.get(sessionId);
            if (!session) {
                throw new Error('Session not found');
            }

            // Merge context updates
            session.conversationContext = {
                ...session.conversationContext,
                ...contextUpdates,
                updatedAt: new Date()
            };

            logger.debug('Conversation context updated', { 
                sessionId, 
                updates: Object.keys(contextUpdates)
            });

            this.emit('contextUpdated', { sessionId, context: session.conversationContext });
        } catch (error) {
            logger.error('Error updating conversation context', { 
                error: error.message, 
                sessionId,
                contextUpdates
            });
            throw error;
        }
    }

    /**
     * Get conversation history
     */
    getConversationHistory(sessionId, limit = 50) {
        try {
            const history = this.messageHistory.get(sessionId) || [];
            return history.slice(-limit);
        } catch (error) {
            logger.error('Error getting conversation history', { 
                error: error.message, 
                sessionId,
                limit
            });
            return [];
        }
    }

    /**
     * Get session information
     */
    getSession(sessionId) {
        return this.userSessions.get(sessionId) || null;
    }

    /**
     * End chat session
     */
    async endSession(sessionId, reason = 'user_initiated') {
        try {
            const session = this.userSessions.get(sessionId);
            if (!session) {
                return false;
            }

            session.isActive = false;
            session.endedAt = new Date();
            session.endReason = reason;

            // Mark chat as inactive
            const chatInfo = this.activeChats.get(sessionId);
            if (chatInfo) {
                chatInfo.status = 'ended';
            }

            logger.info('Chat session ended', { 
                sessionId, 
                userId: session.userId,
                reason,
                duration: session.endedAt - session.createdAt,
                messageCount: session.messageCount
            });

            this.emit('sessionEnded', { sessionId, session, reason });

            // Schedule cleanup
            setTimeout(() => this.cleanupSession(sessionId), 300000); // 5 minutes

            return true;
        } catch (error) {
            logger.error('Error ending session', { 
                error: error.message, 
                sessionId,
                reason
            });
            throw error;
        }
    }

    /**
     * Rate limiting check
     */
    checkRateLimit(sessionId) {
        // Simple rate limiting implementation
        // In production, use Redis or more sophisticated rate limiting
        const session = this.userSessions.get(sessionId);
        if (!session) return false;

        const now = Date.now();
        const windowStart = now - (this.messageRateLimit * 1000);
        
        const history = this.messageHistory.get(sessionId) || [];
        const recentMessages = history.filter(msg => 
            msg.direction === 'incoming' && 
            msg.timestamp.getTime() > windowStart
        );

        return recentMessages.length < this.messageRateLimit;
    }

    /**
     * Add message to history
     */
    addToHistory(sessionId, message) {
        let history = this.messageHistory.get(sessionId) || [];
        history.push(message);

        // Trim history if too long
        if (history.length > this.maxHistorySize) {
            history = history.slice(-this.maxHistorySize);
        }

        this.messageHistory.set(sessionId, history);
    }

    /**
     * Generate unique message ID
     */
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Setup auto-save for conversation history
     */
    setupAutoSave() {
        setInterval(() => {
            try {
                // In production, save to database or persistent storage
                logger.debug('Auto-save conversation data', {
                    activeSessions: this.userSessions.size,
                    totalMessages: Array.from(this.messageHistory.values()).reduce((total, history) => total + history.length, 0)
                });
            } catch (error) {
                logger.error('Error during auto-save', { error: error.message });
            }
        }, this.autoSaveInterval);
    }

    /**
     * Cleanup inactive sessions
     */
    cleanupSession(sessionId) {
        try {
            this.userSessions.delete(sessionId);
            this.messageHistory.delete(sessionId);
            this.activeChats.delete(sessionId);
            
            logger.info('Session cleaned up', { sessionId });
        } catch (error) {
            logger.error('Error cleaning up session', { 
                error: error.message, 
                sessionId
            });
        }
    }

    /**
     * Get service health status
     */
    getHealthStatus() {
        return {
            status: 'healthy',
            activeSessions: this.userSessions.size,
            activeChats: this.activeChats.size,
            totalMessageHistory: Array.from(this.messageHistory.values()).reduce((total, history) => total + history.length, 0),
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage()
        };
    }
}

module.exports = ChatService;