const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactions');
const { validators, businessValidators } = require('../middleware/validation');
const {
  verifyAccountOwnership,
  verifyTransactionOwnership
} = require('../middleware/auth');
const { bankingRateLimit } = require('../middleware/security');

// Apply banking rate limiting to all transaction routes
router.use(bankingRateLimit);

/**
 * @route   GET /api/transactions
 * @desc    Get all transactions for authenticated user
 * @access  Private
 */
router.get('/',
  validators.validatePagination,
  validators.validateDateRange,
  transactionController.getAllTransactions
);

// Static routes must be declared before /:transactionId or Express will treat
// names such as "pending" and "summary" as transaction IDs.
router.get('/pending',
  validators.validatePagination,
  transactionController.getPendingTransactions
);

router.get('/search',
  validators.validatePagination,
  validators.validateDateRange,
  transactionController.searchTransactions
);

router.get('/summary',
  validators.validateDateRange,
  verifyAccountOwnership,
  transactionController.getTransactionSummary
);

router.get('/categories',
  transactionController.getCategories
);

/**
 * @route   GET /api/transactions/:transactionId
 * @desc    Get specific transaction details
 * @access  Private (Owner or Admin)
 */
router.get('/:transactionId',
  validators.validateTransactionId,
  verifyTransactionOwnership,
  transactionController.getTransactionById
);

/**
 * @route   POST /api/transactions
 * @desc    Create new transaction
 * @access  Private
 */
router.post('/',
  validators.validateCreateTransaction,
  verifyAccountOwnership,
  businessValidators.validateTransactionPermission,
  businessValidators.validateSufficientFunds,
  businessValidators.validateDailyLimits,
  transactionController.createTransaction
);

/**
 * @route   POST /api/transactions/:transactionId/cancel
 * @desc    Cancel pending transaction
 * @access  Private (Owner or Admin)
 */
router.post('/:transactionId/cancel',
  validators.validateTransactionId,
  verifyTransactionOwnership,
  transactionController.cancelTransaction
);

/**
 * @route   POST /api/transactions/:transactionId/receipt
 * @desc    Generate transaction receipt
 * @access  Private (Owner or Admin)
 */
router.post('/:transactionId/receipt',
  validators.validateTransactionId,
  verifyTransactionOwnership,
  transactionController.generateReceipt
);

/**
 * @route   PUT /api/transactions/:transactionId/category
 * @desc    Update transaction category
 * @access  Private (Owner or Admin)
 */
// TODO: Implement updateTransactionCategory controller method
// router.put('/:transactionId/category',
//   validators.validateTransactionId,
//   transactionController.updateTransactionCategory
// );

/**
 * @route   POST /api/transactions/bulk
 * @desc    Process bulk transactions (Admin only)
 * @access  Private (Admin)
 */
// TODO: Implement processBulkTransactions controller method
// router.post('/bulk',
//   authorize(['admin']),
//   transactionController.processBulkTransactions
// );

/**
 * @route   GET /api/transactions/export
 * @desc    Export transactions to CSV/PDF
 * @access  Private
 */
// TODO: Implement exportTransactions controller method
// router.get('/export',
//   validators.validateDateRange,
//   transactionController.exportTransactions
// );

module.exports = router;
