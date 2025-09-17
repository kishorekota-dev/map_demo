/**
 * Chat Routes
 * Handles all chat-related API endpoints
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const ChatController = require('../controllers/chatController');
const { asyncHandler } = require('../middleware/errorHandlers');

const router = express.Router();

/**
 * POST /api/chat/message
 * Send a message and get intent analysis
 */
router.post('/message',
  [
    body('message')
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Message must be between 1 and 1000 characters'),
    body('sessionId')
      .optional()
      .isUUID()
      .withMessage('Session ID must be a valid UUID'),
    body('context')
      .optional()
      .isObject()
      .withMessage('Context must be an object')
  ],
  asyncHandler(ChatController.sendMessage)
);

/**
 * POST /api/chat/banking
 * Send a banking-specific message
 */
router.post('/banking',
  [
    body('message')
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Message must be between 1 and 1000 characters'),
    body('userId')
      .optional()
      .isString()
      .withMessage('User ID must be a string')
  ],
  asyncHandler(ChatController.sendBankingMessage)
);

/**
 * GET /api/chat/intents
 * Get available intents
 */
router.get('/intents',
  asyncHandler(ChatController.getIntents)
);

/**
 * POST /api/chat/analyze
 * Analyze intent without sending a message
 */
router.post('/analyze',
  [
    body('text')
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Text must be between 1 and 1000 characters')
  ],
  asyncHandler(ChatController.analyzeIntent)
);

/**
 * GET /api/chat/session/:sessionId
 * Get chat session details
 */
router.get('/session/:sessionId',
  [
    param('sessionId')
      .isUUID()
      .withMessage('Session ID must be a valid UUID')
  ],
  asyncHandler(ChatController.getSession)
);

/**
 * DELETE /api/chat/session/:sessionId
 * Clear chat session
 */
router.delete('/session/:sessionId',
  [
    param('sessionId')
      .isUUID()
      .withMessage('Session ID must be a valid UUID')
  ],
  asyncHandler(ChatController.clearSession)
);

/**
 * GET /api/chat/history
 * Get chat history for a session
 */
router.get('/history',
  [
    query('sessionId')
      .optional()
      .isUUID()
      .withMessage('Session ID must be a valid UUID'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer')
  ],
  asyncHandler(ChatController.getHistory)
);

module.exports = router;