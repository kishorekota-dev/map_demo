const { Session, WorkflowExecution, HumanFeedback } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const config = require('../../config');

/**
 * Session Manager Service
 * Manages conversation sessions and workflow state persistence
 * 
 * Note: This service handles database-level session tracking for business logic
 * and audit purposes. LangGraph's checkpointer handles workflow state persistence
 * for conversation continuity. Both work together:
 * - SessionManager: User sessions, conversation history, metadata, audit trail
 * - LangGraph Checkpointer: Workflow state, step transitions, resumption points
 */
class SessionManager {
  constructor() {
    this.sessionTTL = config.session.ttl;
    this.maxSessionsPerUser = config.session.maxSessionsPerUser;
    
    // Start cleanup interval
    this.startCleanup();
    
    logger.info('Session Manager initialized');
  }

  /**
   * Create a new session
   * User is already authenticated - userId is required
   */
  async createSession(userId, sessionId, intent = null, metadata = {}) {
    try {
      if (!userId) {
        throw new Error('userId is required - user must be authenticated');
      }

      // Check if session already exists
      const existing = await Session.findOne({ where: { sessionId } });
      if (existing) {
        logger.warn('Session already exists', { sessionId, userId });
        return existing;
      }

      // Create new session with authenticated user
      const expiresAt = new Date(Date.now() + this.sessionTTL);
      
      const session = await Session.create({
        userId,
        sessionId,
        intent,
        status: 'active',
        workflowState: {},
        conversationHistory: [],
        collectedData: {},
        requiredData: [],
        metadata: {
          ...metadata,
          createdBy: 'authenticated_user',
          authenticatedUserId: userId
        },
        expiresAt,
        lastActivityAt: new Date()
      });

      logger.info('Session created for authenticated user', {
        sessionId,
        userId,
        intent,
        expiresAt
      });

      return session;
    } catch (error) {
      logger.error('Failed to create session', {
        sessionId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId) {
    try {
      const session = await Session.findOne({
        where: { sessionId },
        include: [
          {
            model: WorkflowExecution,
            order: [['createdAt', 'DESC']],
            limit: 10
          }
        ]
      });

      if (!session) {
        logger.warn('Session not found', { sessionId });
        return null;
      }

      // Check if expired
      if (session.expiresAt && new Date() > session.expiresAt) {
        logger.warn('Session expired', { sessionId });
        await this.expireSession(sessionId);
        return null;
      }

      return session;
    } catch (error) {
      logger.error('Failed to get session', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update session
   */
  async updateSession(sessionId, updates) {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Update last activity
      updates.lastActivityAt = new Date();

      await session.update(updates);

      logger.debug('Session updated', { sessionId, updates: Object.keys(updates) });

      return session;
    } catch (error) {
      logger.error('Failed to update session', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Add message to conversation history
   */
  async addMessage(sessionId, role, content, metadata = {}) {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      const message = {
        role,
        content,
        timestamp: new Date().toISOString(),
        ...metadata
      };

      const conversationHistory = [...session.conversationHistory, message];

      await session.update({
        conversationHistory,
        lastActivityAt: new Date()
      });

      logger.debug('Message added to session', { sessionId, role });

      return session;
    } catch (error) {
      logger.error('Failed to add message', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update workflow state
   */
  async updateWorkflowState(sessionId, currentStep, stateUpdates) {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      const workflowState = {
        ...session.workflowState,
        ...stateUpdates,
        lastStep: currentStep,
        updatedAt: new Date().toISOString()
      };

      await session.update({
        currentStep,
        workflowState,
        lastActivityAt: new Date()
      });

      logger.debug('Workflow state updated', { sessionId, currentStep });

      return session;
    } catch (error) {
      logger.error('Failed to update workflow state', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Collect data from user
   */
  async collectData(sessionId, fieldName, value) {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      const collectedData = {
        ...session.collectedData,
        [fieldName]: value
      };

      // Remove from required data if present
      const requiredData = session.requiredData.filter(field => field !== fieldName);

      await session.update({
        collectedData,
        requiredData,
        lastActivityAt: new Date()
      });

      logger.debug('Data collected', { sessionId, fieldName });

      return session;
    } catch (error) {
      logger.error('Failed to collect data', {
        sessionId,
        fieldName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Set required data fields
   */
  async setRequiredData(sessionId, fields) {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Filter out already collected fields
      const requiredData = fields.filter(
        field => !session.collectedData.hasOwnProperty(field)
      );

      await session.update({
        requiredData,
        status: requiredData.length > 0 ? 'waiting_human_input' : session.status,
        lastActivityAt: new Date()
      });

      logger.debug('Required data set', { sessionId, requiredData });

      return session;
    } catch (error) {
      logger.error('Failed to set required data', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check if all required data is collected
   */
  async isDataCollectionComplete(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) {
      return false;
    }

    return session.requiredData.length === 0;
  }

  /**
   * Complete session
   */
  async completeSession(sessionId) {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      await session.update({
        status: 'completed',
        lastActivityAt: new Date()
      });

      logger.info('Session completed', { sessionId });

      return session;
    } catch (error) {
      logger.error('Failed to complete session', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Expire session
   */
  async expireSession(sessionId) {
    try {
      const session = await Session.findOne({ where: { sessionId } });
      if (session) {
        await session.update({ status: 'expired' });
        logger.info('Session expired', { sessionId });
      }
      return session;
    } catch (error) {
      logger.error('Failed to expire session', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get user sessions
   */
  async getUserSessions(userId, status = null) {
    try {
      const where = { userId };
      if (status) {
        where.status = status;
      }

      const sessions = await Session.findAll({
        where,
        order: [['lastActivityAt', 'DESC']],
        limit: this.maxSessionsPerUser
      });

      return sessions;
    } catch (error) {
      logger.error('Failed to get user sessions', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions() {
    try {
      const result = await Session.update(
        { status: 'expired' },
        {
          where: {
            expiresAt: {
              [Op.lt]: new Date()
            },
            status: {
              [Op.notIn]: ['completed', 'expired']
            }
          }
        }
      );

      if (result[0] > 0) {
        logger.info('Expired sessions cleaned up', { count: result[0] });
      }

      return result[0];
    } catch (error) {
      logger.error('Failed to cleanup expired sessions', { error: error.message });
      throw error;
    }
  }

  /**
   * Start automatic cleanup
   */
  startCleanup() {
    const interval = config.session.cleanupInterval;
    
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredSessions();
      } catch (error) {
        logger.error('Cleanup interval error', { error: error.message });
      }
    }, interval);

    logger.info('Session cleanup started', {
      interval: `${interval}ms`
    });
  }

  /**
   * Stop automatic cleanup
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      logger.info('Session cleanup stopped');
    }
  }
}

module.exports = SessionManager;
