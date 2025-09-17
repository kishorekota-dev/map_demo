const express = require('express');
const router = express.Router();
const cardController = require('../controllers/cards');
const { validators } = require('../middleware/validation');
const { authorize, verifyAccountOwnership } = require('../middleware/auth');
const { bankingRateLimit } = require('../middleware/security');

// Apply banking rate limiting to all card routes
router.use(bankingRateLimit);

/**
 * @route   GET /api/cards
 * @desc    Get all cards for authenticated user
 * @access  Private
 */
router.get('/',
  validators.validatePagination,
  cardController.getAllCards
);

/**
 * @route   GET /api/cards/:cardId
 * @desc    Get specific card details
 * @access  Private (Owner or Admin)
 */
router.get('/:cardId',
  validators.validateId,
  cardController.getCardById
);

/**
 * @route   POST /api/cards
 * @desc    Create new card
 * @access  Private
 */
router.post('/',
  validators.validateCreateCard,
  cardController.createCard
);

/**
 * @route   PUT /api/cards/:cardId
 * @desc    Update card details
 * @access  Private (Owner or Admin)
 */
router.put('/:cardId',
  validators.validateId,
  validators.validateUpdateCard,
  cardController.updateCard
);

/**
 * @route   POST /api/cards/:cardId/block
 * @desc    Block/freeze card
 * @access  Private (Owner or Admin)
 */
router.post('/:cardId/block',
  validators.validateId,
  cardController.blockCard
);

/**
 * @route   POST /api/cards/:cardId/unblock
 * @desc    Unblock card
 * @access  Private (Owner or Admin)
 */
router.post('/:cardId/unblock',
  validators.validateId,
  cardController.unblockCard
);

/**
 * @route   POST /api/cards/:cardId/replace
 * @desc    Request card replacement
 * @access  Private (Owner or Admin)
 */
router.post('/:cardId/replace',
  validators.validateId,
  cardController.replaceCard
);

/**
 * @route   GET /api/cards/:cardId/transactions
 * @desc    Get card transaction history
 * @access  Private (Owner or Admin)
 */
router.get('/:cardId/transactions',
  validators.validateId,
  validators.validatePagination,
  validators.validateDateRange,
  cardController.getCardTransactions
);

/**
 * @route   POST /api/cards/:cardId/activate
 * @desc    Activate new card
 * @access  Private (Owner or Admin)
 */
router.post('/:cardId/activate',
  validators.validateId,
  cardController.activateCard
);

/**
 * @route   POST /api/cards/:cardId/cancel
 * @desc    Cancel card
 * @access  Private (Owner or Admin)
 */
router.post('/:cardId/cancel',
  validators.validateId,
  cardController.cancelCard
);

/**
 * @route   GET /api/cards/:cardId/limits
 * @desc    Get card spending limits
 * @access  Private (Owner or Admin)
 */
router.get('/:cardId/limits',
  validators.validateId,
  cardController.getCardLimits
);

/**
 * @route   PUT /api/cards/:cardId/limits
 * @desc    Update card spending limits
 * @access  Private (Owner or Admin)
 */
router.put('/:cardId/limits',
  validators.validateId,
  cardController.updateCardLimits
);

/**
 * @route   POST /api/cards/:cardId/pin
 * @desc    Change card PIN
 * @access  Private (Owner only)
 */
router.post('/:cardId/pin',
  validators.validateId,
  cardController.changeCardPin
);

/**
 * @route   GET /api/cards/:cardId/statements
 * @desc    Get card statements
 * @access  Private (Owner or Admin)
 */
router.get('/:cardId/statements',
  validators.validateId,
  validators.validateDateRange,
  cardController.getCardStatements
);

module.exports = router;