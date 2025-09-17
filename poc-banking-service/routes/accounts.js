const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accounts');
const { validators, businessValidators } = require('../middleware/validation');
const { authorize, verifyAccountOwnership } = require('../middleware/auth');
const { bankingRateLimit } = require('../middleware/security');

// Apply banking rate limiting to all account routes
router.use(bankingRateLimit);

/**
 * @route   GET /api/accounts
 * @desc    Get all accounts for authenticated user
 * @access  Private
 */
router.get('/',
  validators.validatePagination,
  accountController.getAllAccounts
);

/**
 * @route   GET /api/accounts/:accountId
 * @desc    Get specific account details
 * @access  Private (Owner or Admin)
 */
router.get('/:accountId',
  validators.validateAccountId,
  verifyAccountOwnership,
  accountController.getAccountById
);

/**
 * @route   POST /api/accounts
 * @desc    Create new account
 * @access  Private
 */
router.post('/',
  validators.validateCreateAccount,
  accountController.createAccount
);

/**
 * @route   PUT /api/accounts/:accountId
 * @desc    Update account details
 * @access  Private (Owner or Admin)
 */
router.put('/:accountId',
  validators.validateAccountId,
  validators.validateUpdateAccount,
  verifyAccountOwnership,
  accountController.updateAccount
);

/**
 * @route   DELETE /api/accounts/:accountId
 * @desc    Close/deactivate account
 * @access  Private (Owner or Admin)
 */
router.delete('/:accountId',
  validators.validateAccountId,
  verifyAccountOwnership,
  accountController.closeAccount
);

/**
 * @route   GET /api/accounts/:accountId/balance
 * @desc    Get account balance
 * @access  Private (Owner or Admin)
 */
router.get('/:accountId/balance',
  validators.validateAccountId,
  verifyAccountOwnership,
  accountController.getAccountBalance
);

/**
 * @route   GET /api/accounts/:accountId/transactions
 * @desc    Get account transaction history
 * @access  Private (Owner or Admin)
 */
router.get('/:accountId/transactions',
  validators.validateAccountId,
  validators.validatePagination,
  validators.validateDateRange,
  verifyAccountOwnership,
  accountController.getAccountTransactions
);

/**
 * @route   GET /api/accounts/:accountId/statements
 * @desc    Get account statements
 * @access  Private (Owner or Admin)
 */
router.get('/:accountId/statements',
  validators.validateAccountId,
  validators.validateDateRange,
  verifyAccountOwnership,
  accountController.getAccountStatements
);

/**
 * @route   POST /api/accounts/:accountId/freeze
 * @desc    Freeze account (Admin only)
 * @access  Private (Admin)
 */
router.post('/:accountId/freeze',
  validators.validateAccountId,
  authorize(['admin']),
  accountController.freezeAccount
);

/**
 * @route   POST /api/accounts/:accountId/unfreeze
 * @desc    Unfreeze account (Admin only)
 * @access  Private (Admin)
 */
router.post('/:accountId/unfreeze',
  validators.validateAccountId,
  authorize(['admin']),
  accountController.unfreezeAccount
);

/**
 * @route   GET /api/accounts/:accountId/activity
 * @desc    Get recent account activity
 * @access  Private (Owner or Admin)
 */
router.get('/:accountId/activity',
  validators.validateAccountId,
  verifyAccountOwnership,
  accountController.getAccountActivity
);

module.exports = router;