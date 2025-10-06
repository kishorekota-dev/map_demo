const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const logger = require('../utils/logger');

/**
 * POST /api/orchestrator/process
 * Process a message through the AI orchestrator workflow
 */
router.post('/process',
  [
    body('sessionId').notEmpty().withMessage('Session ID is required'),
    body('intent').notEmpty().withMessage('Intent is required'),
    body('question').notEmpty().withMessage('Question is required'),
    body('userId').optional().isString()
  ],
  async (req, res) => {
    try {
      const { sessionId, intent, question, userId, metadata } = req.body;
      const { workflowService } = req.app.locals;

      logger.info('Processing orchestrator request', {
        sessionId,
        intent,
        userId
      });

      // Process through workflow
      const result = await workflowService.processMessage({
        sessionId,
        intent,
        question,
        userId,
        metadata
      });

      res.json({
        success: true,
        sessionId,
        ...result
      });
    } catch (error) {
      logger.error('Error processing orchestrator request', {
        error: error.message,
        stack: error.stack
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to process request',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/orchestrator/feedback
 * Submit human feedback/input to continue workflow
 */
router.post('/feedback',
  [
    body('sessionId').notEmpty().withMessage('Session ID is required'),
    body('response').notEmpty().withMessage('Response is required')
  ],
  async (req, res) => {
    try {
      const { sessionId, response, confirmed } = req.body;
      const { workflowService } = req.app.locals;

      logger.info('Processing human feedback', {
        sessionId,
        hasResponse: !!response,
        confirmed
      });

      // Process feedback
      const result = await workflowService.processHumanFeedback({
        sessionId,
        response,
        confirmed
      });

      res.json({
        success: true,
        sessionId,
        ...result
      });
    } catch (error) {
      logger.error('Error processing feedback', {
        error: error.message
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to process feedback',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/orchestrator/session/:sessionId
 * Get session status and state
 */
router.get('/session/:sessionId',
  [
    param('sessionId').notEmpty().withMessage('Session ID is required')
  ],
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { sessionManager } = req.app.locals;

      const session = await sessionManager.getSession(sessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      res.json({
        success: true,
        session: {
          sessionId: session.sessionId,
          userId: session.userId,
          status: session.status,
          intent: session.intent,
          currentStep: session.currentStep,
          requiredData: session.requiredData,
          conversationHistory: session.conversationHistory,
          lastActivityAt: session.lastActivityAt,
          expiresAt: session.expiresAt
        }
      });
    } catch (error) {
      logger.error('Error getting session', {
        error: error.message
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get session',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/orchestrator/session
 * Create a new session
 */
router.post('/session',
  [
    body('sessionId').notEmpty().withMessage('Session ID is required'),
    body('userId').notEmpty().withMessage('User ID is required')
  ],
  async (req, res) => {
    try {
      const { sessionId, userId, intent, metadata } = req.body;
      const { sessionManager } = req.app.locals;

      const session = await sessionManager.createSession(
        userId,
        sessionId,
        intent,
        metadata
      );

      res.json({
        success: true,
        session: {
          sessionId: session.sessionId,
          userId: session.userId,
          status: session.status,
          expiresAt: session.expiresAt
        }
      });
    } catch (error) {
      logger.error('Error creating session', {
        error: error.message
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to create session',
        message: error.message
      });
    }
  }
);

/**
 * DELETE /api/orchestrator/session/:sessionId
 * Complete/end a session
 */
router.delete('/session/:sessionId',
  [
    param('sessionId').notEmpty().withMessage('Session ID is required')
  ],
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { sessionManager } = req.app.locals;

      await sessionManager.completeSession(sessionId);

      res.json({
        success: true,
        message: 'Session completed'
      });
    } catch (error) {
      logger.error('Error completing session', {
        error: error.message
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to complete session',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/orchestrator/user/:userId/sessions
 * Get user's active sessions
 */
router.get('/user/:userId/sessions',
  [
    param('userId').notEmpty().withMessage('User ID is required'),
    query('status').optional().isIn(['active', 'waiting_human_input', 'completed', 'failed', 'expired'])
  ],
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { status } = req.query;
      const { sessionManager } = req.app.locals;

      const sessions = await sessionManager.getUserSessions(userId, status);

      res.json({
        success: true,
        sessions: sessions.map(s => ({
          sessionId: s.sessionId,
          status: s.status,
          intent: s.intent,
          currentStep: s.currentStep,
          lastActivityAt: s.lastActivityAt,
          expiresAt: s.expiresAt
        }))
      });
    } catch (error) {
      logger.error('Error getting user sessions', {
        error: error.message
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get user sessions',
        message: error.message
      });
    }
  }
);

module.exports = router;
