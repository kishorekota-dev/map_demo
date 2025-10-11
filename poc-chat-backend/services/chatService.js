const EventEmitter = require('events');
const logger = require('./logger');
const DatabaseService = require('./databaseService');

class ChatService extends EventEmitter {
    constructor() {
        super();
        this.activeChats = new Map();
        this.messageHistory = new Map(); // Keep in-memory cache for quick access
        this.userSessions = new Map(); // Keep in-memory cache for quick access
        this.maxHistorySize = parseInt(process.env.MAX_CONVERSATION_HISTORY) || 100;
        this.messageRateLimit = parseInt(process.env.MESSAGE_RATE_LIMIT) || 60;
        this.conversationTimeout = parseInt(process.env.CONVERSATION_TIMEOUT) || 1800000; // 30 minutes
        this.autoSaveInterval = parseInt(process.env.AUTO_SAVE_INTERVAL) || 30000; // 30 seconds
        
        // Initialize database service
        this.dbService = new DatabaseService();
        this.initializeDatabase();
        
        // Set up auto-save for conversation history
        this.setupAutoSave();
        
        logger.info('ChatService initialized', {
            maxHistorySize: this.maxHistorySize,
            messageRateLimit: this.messageRateLimit,
            conversationTimeout: this.conversationTimeout
        });
    }

    /**
     * Initialize database connection
     */
    async initializeDatabase() {
        try {
            await this.dbService.initialize();
            logger.info('ChatService database connection established');
        } catch (error) {
            logger.error('ChatService database initialization failed', {
                error: error.message
            });
            // Continue without database - will use in-memory only
        }
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

            // Store in memory
            this.userSessions.set(sessionId, session);
            this.messageHistory.set(sessionId, []);
            this.activeChats.set(sessionId, {
                status: 'active',
                agentAssigned: false,
                queuePosition: null
            });

            // Persist to database
            try {
                await this.dbService.createSession({
                    sessionId,
                    userId,
                    metadata: userData,
                    conversationContext: session.conversationContext,
                    state: { currentStep: 'initial' },
                    expiresAt: new Date(Date.now() + this.conversationTimeout)
                });
            } catch (dbError) {
                logger.warn('Failed to persist session to database', {
                    error: dbError.message,
                    sessionId
                });
                // Continue with in-memory session
            }

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

            // Persist to database
            try {
                await this.dbService.saveMessage({
                    id: messageObj.id,
                    sessionId: messageObj.sessionId,
                    userId: messageObj.userId,
                    direction: messageObj.direction,
                    content: messageObj.content,
                    type: messageObj.type,
                    metadata: messageObj.metadata,
                    processing: messageObj.processing
                });
            } catch (dbError) {
                logger.warn('Failed to persist message to database', {
                    error: dbError.message,
                    messageId: messageObj.id
                });
                // Continue without database persistence
            }

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

            // Persist to database
            try {
                await this.dbService.saveMessage({
                    id: responseObj.id,
                    sessionId: responseObj.sessionId,
                    userId: responseObj.userId,
                    direction: responseObj.direction,
                    content: responseObj.content,
                    type: responseObj.type,
                    metadata: responseObj.metadata,
                    agentInfo: responseObj.agentInfo,
                    confidenceScore: agentInfo.confidence
                });
            } catch (dbError) {
                logger.warn('Failed to persist response to database', {
                    error: dbError.message,
                    messageId: responseObj.id
                });
                // Continue without database persistence
            }

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
    async getConversationHistory(sessionId, limit = 50, offset = 0) {
        try {
            // Try to get from database first
            try {
                const dbHistory = await this.dbService.getConversationHistory(sessionId, limit, offset);
                if (dbHistory && dbHistory.length > 0) {
                    return dbHistory;
                }
            } catch (dbError) {
                logger.warn('Failed to get history from database, using in-memory', {
                    error: dbError.message,
                    sessionId
                });
            }

            // Fallback to in-memory history
            const history = this.messageHistory.get(sessionId) || [];
            return history.slice(offset, offset + limit);
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
    async getSession(sessionId) {
        // Check in-memory first
        let session = this.userSessions.get(sessionId);
        if (session) {
            return session;
        }

        // Try database
        try {
            const dbSession = await this.dbService.getSession(sessionId);
            if (dbSession) {
                // Cache in memory
                const sessionObj = {
                    sessionId: dbSession.session_id,
                    userId: dbSession.user_id,
                    createdAt: dbSession.created_at,
                    lastActivity: dbSession.last_activity,
                    isActive: dbSession.is_active,
                    userData: dbSession.metadata,
                    messageCount: dbSession.message_count,
                    conversationContext: dbSession.conversation_context
                };
                this.userSessions.set(sessionId, sessionObj);
                return sessionObj;
            }
        } catch (dbError) {
            logger.warn('Failed to get session from database', {
                error: dbError.message,
                sessionId
            });
        }

        return null;
    }

    /**
     * Get user's active sessions
     */
    async getUserActiveSessions(userId) {
        try {
            return await this.dbService.getUserActiveSessions(userId);
        } catch (error) {
            logger.error('Error getting user active sessions', {
                error: error.message,
                userId
            });
            return [];
        }
    }

    /**
     * Get user's unresolved sessions
     */
    async getUserUnresolvedSessions(userId) {
        try {
            return await this.dbService.getUserUnresolvedSessions(userId);
        } catch (error) {
            logger.error('Error getting user unresolved sessions', {
                error: error.message,
                userId
            });
            return [];
        }
    }

    /**
     * Resume a session
     */
    async resumeSession(sessionId) {
        try {
            const dbSession = await this.dbService.resumeSession(sessionId);
            if (!dbSession) {
                throw new Error('Session not found');
            }

            // Load into memory
            const sessionObj = {
                sessionId: dbSession.session_id,
                userId: dbSession.user_id,
                createdAt: dbSession.created_at,
                lastActivity: new Date(),
                isActive: true,
                userData: dbSession.metadata,
                messageCount: dbSession.message_count,
                conversationContext: dbSession.conversation_context
            };

            this.userSessions.set(sessionId, sessionObj);
            this.activeChats.set(sessionId, {
                status: 'active',
                agentAssigned: false,
                queuePosition: null
            });

            // Load message history into memory
            if (dbSession.messages && dbSession.messages.length > 0) {
                this.messageHistory.set(sessionId, dbSession.messages);
            } else {
                this.messageHistory.set(sessionId, []);
            }

            logger.info('Session resumed', {
                sessionId,
                userId: dbSession.user_id,
                messageCount: dbSession.messages?.length || 0
            });

            this.emit('sessionResumed', { sessionId, session: sessionObj });

            return {
                session: sessionObj,
                history: dbSession.messages || []
            };
        } catch (error) {
            logger.error('Error resuming session', {
                error: error.message,
                sessionId
            });
            throw error;
        }
    }

    /**
     * Mark session as resolved
     */
    async markSessionResolved(sessionId, notes = null) {
        try {
            await this.dbService.markSessionResolved(sessionId, notes);
            
            const session = this.userSessions.get(sessionId);
            if (session) {
                session.isResolved = true;
            }

            logger.info('Session marked as resolved', {
                sessionId,
                notes
            });

            return true;
        } catch (error) {
            logger.error('Error marking session as resolved', {
                error: error.message,
                sessionId
            });
            throw error;
        }
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

            // Persist to database
            try {
                await this.dbService.endSession(sessionId, reason);
            } catch (dbError) {
                logger.warn('Failed to end session in database', {
                    error: dbError.message,
                    sessionId
                });
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