/**
 * NLP Routes
 * API endpoints for natural language processing operations
 */

const express = require('express');
const { body, query } = require('express-validator');
const NLPController = require('../controllers/nlp.controller');
const { validateRequest } = require('../middleware/validation');

const router = express.Router();

/**
 * POST /api/nlp/process
 * Process text with comprehensive NLP analysis
 */
router.post('/process',
  [
    body('text')
      .isString()
      .isLength({ min: 1, max: 10000 })
      .withMessage('Text must be between 1 and 10000 characters'),
    body('options')
      .optional()
      .isObject()
      .withMessage('Options must be an object')
  ],
  validateRequest,
  NLPController.processText
);

/**
 * POST /api/nlp/analyze
 * Analyze text structure and components
 */
router.post('/analyze',
  [
    body('text')
      .isString()
      .isLength({ min: 1, max: 10000 })
      .withMessage('Text must be between 1 and 10000 characters')
  ],
  validateRequest,
  NLPController.analyzeStructure
);

/**
 * POST /api/nlp/sentiment
 * Analyze sentiment of text
 */
router.post('/sentiment',
  [
    body('text')
      .isString()
      .isLength({ min: 1, max: 5000 })
      .withMessage('Text must be between 1 and 5000 characters')
  ],
  validateRequest,
  NLPController.analyzeSentiment
);

/**
 * POST /api/nlp/entities
 * Extract named entities from text
 */
router.post('/entities',
  [
    body('text')
      .isString()
      .isLength({ min: 1, max: 5000 })
      .withMessage('Text must be between 1 and 5000 characters')
  ],
  validateRequest,
  NLPController.extractEntities
);

/**
 * POST /api/nlp/keywords
 * Extract keywords from text
 */
router.post('/keywords',
  [
    body('text')
      .isString()
      .isLength({ min: 1, max: 5000 })
      .withMessage('Text must be between 1 and 5000 characters'),
    body('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50')
  ],
  validateRequest,
  NLPController.extractKeywords
);

/**
 * POST /api/nlp/tokenize
 * Tokenize text into words
 */
router.post('/tokenize',
  [
    body('text')
      .isString()
      .isLength({ min: 1, max: 5000 })
      .withMessage('Text must be between 1 and 5000 characters')
  ],
  validateRequest,
  NLPController.tokenizeText
);

/**
 * POST /api/nlp/normalize
 * Normalize text for processing
 */
router.post('/normalize',
  [
    body('text')
      .isString()
      .isLength({ min: 1, max: 5000 })
      .withMessage('Text must be between 1 and 5000 characters')
  ],
  validateRequest,
  NLPController.normalizeText
);

/**
 * GET /api/nlp/health
 * Get service health and capabilities
 */
router.get('/health', NLPController.getHealth);

/**
 * GET /api/nlp/capabilities
 * Get detailed service capabilities
 */
router.get('/capabilities', NLPController.getCapabilities);

module.exports = router;