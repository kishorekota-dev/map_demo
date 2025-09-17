const EventEmitter = require('events');
const logger = require('./logger');

class SessionManager extends EventEmitter {
    constructor() {
        super();
        this.sessions = new Map();
        this.userSessions = new Map(); // userId -> Set of sessionIds
        this.sessionTTL = parseInt(process.env.SESSION_TTL) || 3600000; // 1 hour
        this.cleanupInterval = parseInt(process.env.SESSION_CLEANUP_INTERVAL) || 300000; // 5 minutes
        this.maxSessionsPerUser = parseInt(process.env.MAX_SESSIONS_PER_USER) || 5;
        this.sessionStorage = process.env.SESSION_STORAGE_TYPE || 'memory';
        
        this.setupCleanupScheduler();
        
        logger.info('SessionManager initialized', {
            sessionTTL: this.sessionTTL,
            cleanupInterval: this.cleanupInterval,
            maxSessionsPerUser: this.maxSessionsPerUser,
            storageType: this.sessionStorage
        });
    }

    /**
     * Create a new session
     */
    async createSession(userId, metadata = {}) {
        try {
            const sessionId = this.generateSessionId();
            const now = new Date();

            // Check session limits per user
            await this.enforceSessionLimits(userId);

            const session = {
                sessionId,
                userId,
                createdAt: now,
                lastAccessTime: now,
                expiresAt: new Date(now.getTime() + this.sessionTTL),
                isActive: true,
                metadata: {
                    userAgent: metadata.userAgent,
                    ipAddress: metadata.ipAddress,
                    deviceInfo: metadata.deviceInfo,
                    location: metadata.location,
                    ...metadata
                },
                state: {
                    currentStep: 'initial',
                    conversationStage: 'greeting',
                    authenticationStatus: 'pending',
                    lastIntent: null,
                    contextStack: [],
                    preferences: {}
                },
                statistics: {
                    messageCount: 0,
                    totalInteractionTime: 0,
                    agentsUsed: new Set(),
                    intentsProcessed: new Set(),
                    errorsEncountered: 0
                },
                security: {
                    ipAddress: metadata.ipAddress,
                    authenticatedAt: null,
                    lastAuthCheck: null,
                    securityFlags: [],
                    trustScore: 1.0
                }
            };

            // Store session
            this.sessions.set(sessionId, session);

            // Update user sessions mapping
            if (!this.userSessions.has(userId)) {
                this.userSessions.set(userId, new Set());
            }
            this.userSessions.get(userId).add(sessionId);

            logger.info('Session created', { 
                sessionId, 
                userId,
                userAgent: metadata.userAgent,
                ipAddress: metadata.ipAddress
            });

            this.emit('sessionCreated', { sessionId, userId, session });

            return session;
        } catch (error) {
            logger.error('Error creating session', { 
                error: error.message, 
                userId,
                metadata
            });
            throw error;
        }
    }

    /**
     * Get session by ID
     */
    async getSession(sessionId) {
        try {
            const session = this.sessions.get(sessionId);
            
            if (!session) {
                return null;
            }

            // Check if session is expired
            if (this.isSessionExpired(session)) {
                await this.expireSession(sessionId);
                return null;
            }

            // Update last access time
            session.lastAccessTime = new Date();
            
            return session;
        } catch (error) {
            logger.error('Error getting session', { 
                error: error.message, 
                sessionId
            });
            return null;
        }
    }

    /**
     * Update session data
     */
    async updateSession(sessionId, updates) {
        try {
            const session = this.sessions.get(sessionId);
            
            if (!session) {
                throw new Error('Session not found');
            }

            if (this.isSessionExpired(session)) {
                await this.expireSession(sessionId);
                throw new Error('Session expired');
            }

            // Merge updates
            if (updates.metadata) {
                session.metadata = { ...session.metadata, ...updates.metadata };
            }
            
            if (updates.state) {
                session.state = { ...session.state, ...updates.state };
            }
            
            if (updates.statistics) {
                // Handle Set types properly
                if (updates.statistics.agentsUsed) {
                    updates.statistics.agentsUsed.forEach(agent => 
                        session.statistics.agentsUsed.add(agent)
                    );
                    delete updates.statistics.agentsUsed;
                }
                
                if (updates.statistics.intentsProcessed) {
                    updates.statistics.intentsProcessed.forEach(intent => 
                        session.statistics.intentsProcessed.add(intent)
                    );
                    delete updates.statistics.intentsProcessed;
                }
                
                session.statistics = { ...session.statistics, ...updates.statistics };
            }
            
            if (updates.security) {
                session.security = { ...session.security, ...updates.security };
            }

            // Update last access time
            session.lastAccessTime = new Date();

            logger.debug('Session updated', { 
                sessionId, 
                updateKeys: Object.keys(updates)
            });

            this.emit('sessionUpdated', { sessionId, session, updates });

            return session;
        } catch (error) {
            logger.error('Error updating session', { 
                error: error.message, 
                sessionId,
                updates: Object.keys(updates)
            });
            throw error;
        }
    }

    /**
     * Extend session expiration
     */
    async extendSession(sessionId, extensionMs = null) {
        try {
            const session = this.sessions.get(sessionId);
            
            if (!session) {
                throw new Error('Session not found');
            }

            const extension = extensionMs || this.sessionTTL;
            session.expiresAt = new Date(Date.now() + extension);
            session.lastAccessTime = new Date();

            logger.debug('Session extended', { 
                sessionId, 
                newExpiresAt: session.expiresAt,
                extensionMs: extension
            });

            this.emit('sessionExtended', { sessionId, session, extensionMs: extension });

            return session;
        } catch (error) {
            logger.error('Error extending session', { 
                error: error.message, 
                sessionId,
                extensionMs
            });
            throw error;
        }
    }

    /**
     * End session gracefully
     */
    async endSession(sessionId, reason = 'user_initiated') {
        try {
            const session = this.sessions.get(sessionId);
            
            if (!session) {
                return false;
            }

            // Mark as inactive
            session.isActive = false;
            session.endedAt = new Date();
            session.endReason = reason;

            // Calculate total interaction time
            if (session.createdAt) {
                session.statistics.totalInteractionTime = session.endedAt - session.createdAt;
            }

            logger.info('Session ended', { 
                sessionId, 
                userId: session.userId,
                reason,
                duration: session.statistics.totalInteractionTime,
                messageCount: session.statistics.messageCount
            });

            this.emit('sessionEnded', { sessionId, session, reason });

            // Remove from active sessions (but keep for analytics)
            this.removeFromUserSessions(session.userId, sessionId);

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
     * Expire session due to timeout
     */
    async expireSession(sessionId) {
        try {
            const session = this.sessions.get(sessionId);
            
            if (session) {
                logger.info('Session expired', { 
                    sessionId, 
                    userId: session.userId,
                    lastAccess: session.lastAccessTime,
                    expiresAt: session.expiresAt
                });

                await this.endSession(sessionId, 'expired');
            }

            return true;
        } catch (error) {
            logger.error('Error expiring session', { 
                error: error.message, 
                sessionId
            });
            return false;
        }
    }

    /**
     * Get all active sessions for a user
     */
    async getUserSessions(userId) {
        try {
            const sessionIds = this.userSessions.get(userId) || new Set();
            const sessions = [];

            for (const sessionId of sessionIds) {
                const session = await this.getSession(sessionId);
                if (session && session.isActive) {
                    sessions.push(session);
                }
            }

            return sessions;
        } catch (error) {
            logger.error('Error getting user sessions', { 
                error: error.message, 
                userId
            });
            return [];
        }
    }

    /**
     * Authenticate session
     */
    async authenticateSession(sessionId, authData) {
        try {
            const session = this.sessions.get(sessionId);
            
            if (!session) {
                throw new Error('Session not found');
            }

            if (this.isSessionExpired(session)) {
                await this.expireSession(sessionId);
                throw new Error('Session expired');
            }

            // Update authentication status
            session.security.authenticatedAt = new Date();
            session.security.lastAuthCheck = new Date();
            session.state.authenticationStatus = 'authenticated';
            
            // Update security info
            if (authData.trustScore !== undefined) {
                session.security.trustScore = authData.trustScore;
            }
            
            if (authData.authMethod) {
                session.security.authMethod = authData.authMethod;
            }

            logger.info('Session authenticated', { 
                sessionId, 
                userId: session.userId,
                authMethod: authData.authMethod,
                trustScore: session.security.trustScore
            });

            this.emit('sessionAuthenticated', { sessionId, session, authData });

            return session;
        } catch (error) {
            logger.error('Error authenticating session', { 
                error: error.message, 
                sessionId,
                authData: Object.keys(authData)
            });
            throw error;
        }
    }

    /**
     * Update session state
     */
    async updateSessionState(sessionId, stateUpdates) {
        try {
            return await this.updateSession(sessionId, { state: stateUpdates });
        } catch (error) {
            logger.error('Error updating session state', { 
                error: error.message, 
                sessionId,
                stateUpdates
            });
            throw error;
        }
    }

    /**
     * Update session statistics
     */
    async updateSessionStatistics(sessionId, statisticsUpdates) {
        try {
            return await this.updateSession(sessionId, { statistics: statisticsUpdates });
        } catch (error) {
            logger.error('Error updating session statistics', { 
                error: error.message, 
                sessionId,
                statisticsUpdates
            });
            throw error;
        }
    }

    /**
     * Check if session is expired
     */
    isSessionExpired(session) {
        return !session.isActive || (session.expiresAt && new Date() > session.expiresAt);
    }

    /**
     * Generate unique session ID
     */
    generateSessionId() {
        const timestamp = Date.now().toString(36);
        const randomPart = Math.random().toString(36).substr(2, 9);
        return `sess_${timestamp}_${randomPart}`;
    }

    /**
     * Enforce session limits per user
     */
    async enforceSessionLimits(userId) {
        try {
            const userSessionIds = this.userSessions.get(userId);
            
            if (!userSessionIds || userSessionIds.size < this.maxSessionsPerUser) {
                return;
            }

            // Get oldest sessions and end them
            const userSessions = [];
            for (const sessionId of userSessionIds) {
                const session = this.sessions.get(sessionId);
                if (session && session.isActive) {
                    userSessions.push(session);
                }
            }

            // Sort by creation time (oldest first)
            userSessions.sort((a, b) => a.createdAt - b.createdAt);

            // End oldest sessions to make room
            const sessionsToEnd = userSessions.slice(0, userSessions.length - this.maxSessionsPerUser + 1);
            
            for (const session of sessionsToEnd) {
                await this.endSession(session.sessionId, 'limit_exceeded');
            }

            logger.info('Session limits enforced', { 
                userId, 
                endedSessions: sessionsToEnd.length,
                maxAllowed: this.maxSessionsPerUser
            });
        } catch (error) {
            logger.error('Error enforcing session limits', { 
                error: error.message, 
                userId
            });
        }
    }

    /**
     * Remove session from user sessions mapping
     */
    removeFromUserSessions(userId, sessionId) {
        const userSessionIds = this.userSessions.get(userId);
        if (userSessionIds) {
            userSessionIds.delete(sessionId);
            if (userSessionIds.size === 0) {
                this.userSessions.delete(userId);
            }
        }
    }

    /**
     * Setup cleanup scheduler
     */
    setupCleanupScheduler() {
        setInterval(async () => {
            try {
                await this.cleanupExpiredSessions();
            } catch (error) {
                logger.error('Error during scheduled cleanup', { error: error.message });
            }
        }, this.cleanupInterval);
    }

    /**
     * Cleanup expired sessions
     */
    async cleanupExpiredSessions() {
        try {
            const now = new Date();
            const expiredSessions = [];

            for (const [sessionId, session] of this.sessions) {
                if (this.isSessionExpired(session)) {
                    expiredSessions.push(sessionId);
                }
            }

            for (const sessionId of expiredSessions) {
                await this.expireSession(sessionId);
            }

            if (expiredSessions.length > 0) {
                logger.info('Expired sessions cleaned up', { 
                    count: expiredSessions.length,
                    timestamp: now
                });
            }
        } catch (error) {
            logger.error('Error cleaning up expired sessions', { error: error.message });
        }
    }

    /**
     * Cleanup specific session
     */
    cleanupSession(sessionId) {
        try {
            const session = this.sessions.get(sessionId);
            
            if (session) {
                // Remove from user sessions mapping
                this.removeFromUserSessions(session.userId, sessionId);
                
                // Remove session data
                this.sessions.delete(sessionId);
                
                logger.debug('Session cleaned up', { sessionId });
            }
        } catch (error) {
            logger.error('Error cleaning up session', { 
                error: error.message, 
                sessionId
            });
        }
    }

    /**
     * Get manager health status
     */
    getHealthStatus() {
        const now = new Date();
        const activeSessions = Array.from(this.sessions.values()).filter(s => s.isActive);
        const expiredSessions = Array.from(this.sessions.values()).filter(s => this.isSessionExpired(s));

        return {
            status: 'healthy',
            totalSessions: this.sessions.size,
            activeSessions: activeSessions.length,
            expiredSessions: expiredSessions.length,
            uniqueUsers: this.userSessions.size,
            averageSessionDuration: this.calculateAverageSessionDuration(),
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            configuration: {
                sessionTTL: this.sessionTTL,
                maxSessionsPerUser: this.maxSessionsPerUser,
                cleanupInterval: this.cleanupInterval,
                storageType: this.sessionStorage
            }
        };
    }

    /**
     * Calculate average session duration
     */
    calculateAverageSessionDuration() {
        const activeSessions = Array.from(this.sessions.values()).filter(s => s.isActive);
        if (activeSessions.length === 0) return 0;

        const totalDuration = activeSessions.reduce((total, session) => {
            return total + (session.lastAccessTime - session.createdAt);
        }, 0);

        return Math.round(totalDuration / activeSessions.length);
    }
}

module.exports = SessionManager;