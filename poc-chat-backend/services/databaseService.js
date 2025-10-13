const { models, sequelize } = require('../database');
const { ChatSession, ChatMessage } = models;
const logger = require('./logger');
const { Op } = require('sequelize');

class DatabaseService {
    constructor() {
        this.ChatSession = ChatSession;
        this.ChatMessage = ChatMessage;
        this.initialized = false;
    }

    /**
     * Initialize database connection and sync models
     */
    async initialize() {
        try {
            await sequelize.authenticate();
            logger.info('Database connection established');
            
            // Sync models without alter since migrations handle schema
            // Using alter: false prevents conflicts with database views
            await sequelize.sync({ alter: false });
            logger.info('Database models synchronized');
            
            this.initialized = true;
            return true;
        } catch (error) {
            logger.error('Database initialization failed', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Create a new chat session in database
     */
    async createSession(sessionData) {
        try {
            const session = await ChatSession.create({
                session_id: sessionData.sessionId,
                user_id: sessionData.userId,
                is_active: true,
                is_resolved: false,
                status: 'active',
                last_activity: new Date(),
                expires_at: sessionData.expiresAt,
                metadata: sessionData.metadata || {},
                conversation_context: sessionData.conversationContext || {},
                state: sessionData.state || {},
                statistics: sessionData.statistics || {},
                security: sessionData.security || {}
            });

            logger.info('Chat session created in database', {
                sessionId: session.session_id,
                userId: session.user_id
            });

            return session;
        } catch (error) {
            logger.error('Failed to create session in database', {
                error: error.message,
                sessionId: sessionData.sessionId
            });
            throw error;
        }
    }

    /**
     * Get session by ID
     */
    async getSession(sessionId) {
        try {
            const session = await ChatSession.findByPk(sessionId);
            return session;
        } catch (error) {
            logger.error('Failed to get session from database', {
                error: error.message,
                sessionId
            });
            return null;
        }
    }

    /**
     * Update session in database
     */
    async updateSession(sessionId, updates) {
        try {
            const session = await ChatSession.findByPk(sessionId);
            if (!session) {
                throw new Error('Session not found');
            }

            // Update allowed fields
            const allowedFields = [
                'is_active', 'is_resolved', 'status', 'last_activity',
                'message_count', 'metadata', 'conversation_context',
                'state', 'statistics', 'security', 'resolution_notes'
            ];

            allowedFields.forEach(field => {
                if (updates[field] !== undefined) {
                    session[field] = updates[field];
                }
            });

            await session.save();

            logger.debug('Session updated in database', {
                sessionId,
                updatedFields: Object.keys(updates)
            });

            return session;
        } catch (error) {
            logger.error('Failed to update session in database', {
                error: error.message,
                sessionId
            });
            throw error;
        }
    }

    /**
     * End a session
     */
    async endSession(sessionId, reason = 'user_request') {
        try {
            const session = await ChatSession.findByPk(sessionId);
            if (!session) {
                throw new Error('Session not found');
            }

            await session.endSession(reason);

            logger.info('Session ended in database', {
                sessionId,
                reason
            });

            return session;
        } catch (error) {
            logger.error('Failed to end session in database', {
                error: error.message,
                sessionId
            });
            throw error;
        }
    }

    /**
     * Save a chat message to database
     */
    async saveMessage(messageData) {
        try {
            // Get current message count for sequence number
            const messageCount = await ChatMessage.count({
                where: { session_id: messageData.sessionId }
            });

            const message = await ChatMessage.create({
                message_id: messageData.id,
                session_id: messageData.sessionId,
                user_id: messageData.userId,
                direction: messageData.direction,
                content: messageData.content,
                message_type: messageData.type || 'text',
                metadata: messageData.metadata || {},
                processing: messageData.processing || {},
                agent_info: messageData.agentInfo || {},
                intent: messageData.intent,
                entities: messageData.entities || {},
                sentiment: messageData.sentiment,
                confidence_score: messageData.confidenceScore,
                processing_time_ms: messageData.processingTimeMs,
                parent_message_id: messageData.parentMessageId,
                sequence_number: messageCount
            });

            // Update session message count and last activity
            await this.updateSession(messageData.sessionId, {
                message_count: messageCount + 1,
                last_activity: new Date()
            });

            logger.debug('Message saved to database', {
                messageId: message.message_id,
                sessionId: message.session_id,
                direction: message.direction
            });

            return message;
        } catch (error) {
            logger.error('Failed to save message to database', {
                error: error.message,
                sessionId: messageData.sessionId
            });
            throw error;
        }
    }

    /**
     * Get conversation history for a session
     */
    async getConversationHistory(sessionId, limit = 50, offset = 0) {
        try {
            const messages = await ChatMessage.findAll({
                where: { session_id: sessionId },
                order: [['sequence_number', 'ASC']],
                limit,
                offset,
                attributes: [
                    'message_id', 'direction', 'content', 'message_type',
                    'intent', 'confidence_score', 'created_at', 'sequence_number'
                ]
            });

            return messages;
        } catch (error) {
            logger.error('Failed to get conversation history', {
                error: error.message,
                sessionId
            });
            return [];
        }
    }

    /**
     * Get user's active sessions
     */
    async getUserActiveSessions(userId) {
        try {
            const sessions = await ChatSession.findAll({
                where: {
                    user_id: userId,
                    is_active: true
                },
                order: [['last_activity', 'DESC']],
                include: [{
                    model: ChatMessage,
                    as: 'messages',
                    limit: 5,
                    order: [['sequence_number', 'DESC']],
                    attributes: ['message_id', 'content', 'direction', 'created_at']
                }]
            });

            return sessions;
        } catch (error) {
            logger.error('Failed to get user active sessions', {
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
            const sessions = await ChatSession.findAll({
                where: {
                    user_id: userId,
                    is_resolved: false,
                    is_active: true
                },
                order: [['last_activity', 'DESC']],
                include: [{
                    model: ChatMessage,
                    as: 'messages',
                    limit: 5,
                    order: [['sequence_number', 'DESC']],
                    attributes: ['message_id', 'content', 'direction', 'created_at']
                }]
            });

            return sessions;
        } catch (error) {
            logger.error('Failed to get user unresolved sessions', {
                error: error.message,
                userId
            });
            return [];
        }
    }

    /**
     * Get user's recent sessions
     */
    async getUserRecentSessions(userId, limit = 10) {
        try {
            const sessions = await ChatSession.findAll({
                where: {
                    user_id: userId
                },
                order: [['last_activity', 'DESC']],
                limit,
                include: [{
                    model: ChatMessage,
                    as: 'messages',
                    limit: 3,
                    order: [['sequence_number', 'DESC']],
                    attributes: ['message_id', 'content', 'direction', 'created_at']
                }]
            });

            return sessions;
        } catch (error) {
            logger.error('Failed to get user recent sessions', {
                error: error.message,
                userId
            });
            return [];
        }
    }

    /**
     * Mark session as resolved
     */
    async markSessionResolved(sessionId, notes = null) {
        try {
            const session = await ChatSession.findByPk(sessionId);
            if (!session) {
                throw new Error('Session not found');
            }

            await session.markResolved(notes);

            logger.info('Session marked as resolved', {
                sessionId,
                notes
            });

            return session;
        } catch (error) {
            logger.error('Failed to mark session as resolved', {
                error: error.message,
                sessionId
            });
            throw error;
        }
    }

    /**
     * Resume a session
     */
    async resumeSession(sessionId) {
        try {
            const session = await ChatSession.findByPk(sessionId, {
                include: [{
                    model: ChatMessage,
                    as: 'messages',
                    order: [['sequence_number', 'ASC']]
                }]
            });

            if (!session) {
                throw new Error('Session not found');
            }

            // Reactivate if not active
            if (!session.is_active) {
                await session.markActive();
            }

            logger.info('Session resumed', {
                sessionId,
                messageCount: session.messages?.length || 0
            });

            return session;
        } catch (error) {
            logger.error('Failed to resume session', {
                error: error.message,
                sessionId
            });
            throw error;
        }
    }

    /**
     * Clean up expired sessions
     */
    async cleanupExpiredSessions() {
        try {
            const result = await ChatSession.update(
                {
                    is_active: false,
                    status: 'expired',
                    ended_at: new Date(),
                    ended_reason: 'expired'
                },
                {
                    where: {
                        expires_at: {
                            [Op.lt]: new Date()
                        },
                        is_active: true
                    }
                }
            );

            logger.info('Expired sessions cleaned up', {
                count: result[0]
            });

            return result[0];
        } catch (error) {
            logger.error('Failed to cleanup expired sessions', {
                error: error.message
            });
            return 0;
        }
    }

    /**
     * Get database health status
     */
    async getHealthStatus() {
        try {
            await sequelize.authenticate();
            const [[result]] = await sequelize.query('SELECT NOW() as current_time, version() as db_version');
            
            return {
                status: 'healthy',
                connected: true,
                timestamp: result.current_time,
                version: result.db_version
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                connected: false,
                error: error.message
            };
        }
    }
}

module.exports = DatabaseService;
