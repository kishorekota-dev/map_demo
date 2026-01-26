const express = require('express');
const router = express.Router();
const transferController = require('../controllers/transfers');
const { validators, businessValidators } = require('../middleware/validation');
const { authorize, verifyAccountOwnership } = require('../middleware/auth');
const { bankingRateLimit } = require('../middleware/security');

// Apply banking rate limiting to all transfer routes
router.use(bankingRateLimit);

/**
 * @route   GET /api/transfers
 * @desc    Get all transfers for authenticated user
 * @access  Private
 */
router.get('/',
  validators.validatePagination,
  validators.validateDateRange,
  transferController.getAllTransfers
);

/**
 * @route   GET /api/transfers/:transferId
 * @desc    Get specific transfer details
 * @access  Private (Owner or Admin)
 */
router.get('/:transferId',
  validators.validateId,
  transferController.getTransferById
);

/**
 * @route   POST /api/transfers
 * @desc    Create new transfer
 * @access  Private
 */
router.post('/',
  validators.validateCreateTransfer,
  businessValidators.validateSufficientFunds,
  businessValidators.validateDailyLimits,
  transferController.createTransfer
);

// TODO: Implement getScheduledTransfers controller method
// /**
//  * @route   GET /api/transfers/scheduled
//  * @desc    Get scheduled transfers
//  * @access  Private
//  */
// router.get('/scheduled',
//   validators.validatePagination,
//   transferController.getScheduledTransfers
// );

/**
 * @route   POST /api/transfers/:transferId/cancel
 * @desc    Cancel pending or scheduled transfer
 * @access  Private (Owner or Admin)
 */
router.post('/:transferId/cancel',
  validators.validateId,
  transferController.cancelTransfer
);

// TODO: Implement recurring transfer methods
// /**
//  * @route   GET /api/transfers/recurring
//  * @desc    Get recurring transfers
//  * @access  Private
//  */
// router.get('/recurring',
//   validators.validatePagination,
//   transferController.getRecurringTransfers
// );

// /**
//  * @route   POST /api/transfers/recurring
//  * @desc    Set up recurring transfer
//  * @access  Private
//  */
// router.post('/recurring',
//   validators.validateCreateTransfer,
//   businessValidators.validateSufficientFunds,
//   transferController.createRecurringTransfer
// );

// /**
//  * @route   PUT /api/transfers/recurring/:transferId
//  * @desc    Update recurring transfer
//  * @access  Private (Owner or Admin)
//  */
// router.put('/recurring/:transferId',
//   validators.validateId,
//   transferController.updateRecurringTransfer
// );

// /**
//  * @route   DELETE /api/transfers/recurring/:transferId
//  * @desc    Delete recurring transfer
//  * @access  Private (Owner or Admin)
//  */
// router.delete('/recurring/:transferId',
//   validators.validateId,
//   transferController.deleteRecurringTransfer
// );

// /**
//  * @route   GET /api/transfers/limits
//  * @desc    Get transfer limits for user
//  * @access  Private
//  */
// router.get('/limits',
//   transferController.getTransferLimits
// );

// /**
//  * @route   POST /api/transfers/:transferId/approve
//  * @desc    Approve high-value transfer (Admin only)
//  * @access  Private (Admin)
//  */
// router.post('/:transferId/approve',
//   validators.validateId,
//   authorize(['admin']),
//   transferController.approveTransfer
// );

// /**
//  * @route   POST /api/transfers/:transferId/reject
//  * @desc    Reject transfer (Admin only)
//  * @access  Private (Admin)
//  */
// router.post('/:transferId/reject',
//   validators.validateId,
//   authorize(['admin']),
//   transferController.rejectTransfer
// );

module.exports = router;