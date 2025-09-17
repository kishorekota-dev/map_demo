/**
 * NLU Routes
 * API endpoints for natural language understanding operations
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const NLUController = require('../controllers/nlu.controller');
const { validateRequest } = require('../middleware/validation');

const router = express.Router();

/**
 * POST /api/nlu/intents
 * Detect intent from user message
 */
router.post('/intents',
  [
    body('message')
      .isString()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Message must be between 1 and 1000 characters'),
    body('userId')
      .optional()
      .isString()
      .withMessage('User ID must be a string'),
    body('sessionId')
      .optional()
      .isString()
      .withMessage('Session ID must be a string')
  ],
  validateRequest,
  NLUController.detectIntent
);

/**
 * POST /api/nlu/banking
 * Detect banking-specific intents
 */
router.post('/banking',
  [
    body('message')
      .isString()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Message must be between 1 and 1000 characters')
  ],
  validateRequest,
  NLUController.detectBankingIntent
);

/**
 * POST /api/nlu/entities
 * Extract entities from message
 */
router.post('/entities',
  [
    body('message')
      .isString()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Message must be between 1 and 1000 characters'),
    body('domain')
      .optional()
      .isIn(['general', 'banking'])
      .withMessage('Domain must be general or banking')
  ],
  validateRequest,
  NLUController.extractEntities
);

/**
 * POST /api/nlu/dialogflow
 * Use DialogFlow for intent detection
 */
router.post('/dialogflow',
  [
    body('message')
      .isString()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Message must be between 1 and 1000 characters'),
    body('sessionId')
      .optional()
      .isString()
      .withMessage('Session ID must be a string')
  ],
  validateRequest,
  NLUController.useDialogFlow
);

/**
 * GET /api/nlu/intents/available
 * Get list of available intents
 */
router.get('/intents/available', NLUController.getAvailableIntents);

/**
 * GET /api/nlu/banking/intents
 * Get banking-specific intents
 */
router.get('/banking/intents', NLUController.getBankingIntents);

/**
 * GET /api/nlu/banking/entities
 * Get banking entity types
 */
router.get('/banking/entities', NLUController.getBankingEntities);

/**
 * POST /api/nlu/context/:sessionId
 * Update context for session
 */
router.post('/context/:sessionId',
  [
    param('sessionId')
      .isString()
      .isLength({ min: 1 })
      .withMessage('Session ID is required'),
    body('context')
      .isObject()
      .withMessage('Context must be an object')
  ],
  validateRequest,
  NLUController.updateContext
);

/**
 * GET /api/nlu/context/:sessionId
 * Get context for session
 */
router.get('/context/:sessionId',
  [
    param('sessionId')
      .isString()
      .isLength({ min: 1 })
      .withMessage('Session ID is required')
  ],
  validateRequest,
  NLUController.getContext
);

/**
 * DELETE /api/nlu/context/:sessionId
 * Clear context for session
 */
router.delete('/context/:sessionId',
  [
    param('sessionId')
      .isString()
      .isLength({ min: 1 })
      .withMessage('Session ID is required')
  ],
  validateRequest,
  NLUController.clearContext
);

/**
 * POST /api/nlu/train
 * Train NLU model with new data
 */
router.post('/train',
  [
    body('trainingData')
      .isArray()
      .withMessage('Training data must be an array'),
    body('trainingData.*.message')
      .isString()
      .withMessage('Each training sample must have a message'),
    body('trainingData.*.intent')
      .isString()
      .withMessage('Each training sample must have an intent')
  ],
  validateRequest,
  NLUController.trainModel
);

/**
 * GET /api/nlu/health
 * Get NLU service health
 */
router.get('/health', NLUController.getHealth);

/**
 * GET /api/nlu/capabilities
 * Get detailed service capabilities
 */
router.get('/capabilities', NLUController.getCapabilities);

/**
 * GET /api/nlu/dialogflow/status
 * Get DialogFlow integration status
 */
router.get('/dialogflow/status', NLUController.getDialogFlowStatus);

module.exports = router;