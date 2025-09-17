const express = require('express');
const router = express.Router();
const disputeController = require('../controllers/disputes');
const { validators } = require('../middleware/validation');
const { authorize } = require('../middleware/auth');
const { bankingRateLimit } = require('../middleware/security');

// Apply rate limiting to dispute routes
router.use(bankingRateLimit);

/**
 * @route   GET /api/disputes
 * @desc    Get all disputes for authenticated user
 * @access  Private
 */
router.get('/',
  validators.validatePagination,
  disputeController.getAllDisputes
);

/**
 * @route   GET /api/disputes/:disputeId
 * @desc    Get specific dispute details
 * @access  Private (Owner or Admin)
 */
router.get('/:disputeId',
  validators.validateId,
  disputeController.getDisputeById
);

/**
 * @route   POST /api/disputes
 * @desc    Create new dispute
 * @access  Private
 */
router.post('/',
  validators.validateCreateDispute,
  disputeController.createDispute
);

/**
 * @route   PUT /api/disputes/:disputeId
 * @desc    Update dispute details
 * @access  Private (Owner or Admin)
 */
router.put('/:disputeId',
  validators.validateId,
  validators.validateUpdateDispute,
  disputeController.updateDispute
);

/**
 * @route   POST /api/disputes/:disputeId/evidence
 * @desc    Add evidence to dispute
 * @access  Private (Owner or Admin)
 */
router.post('/:disputeId/evidence',
  validators.validateId,
  disputeController.addEvidence
);

/**
 * @route   DELETE /api/disputes/:disputeId/evidence/:evidenceId
 * @desc    Remove evidence from dispute
 * @access  Private (Owner or Admin)
 */
router.delete('/:disputeId/evidence/:evidenceId',
  validators.validateId,
  disputeController.removeEvidence
);

/**
 * @route   POST /api/disputes/:disputeId/close
 * @desc    Close dispute
 * @access  Private (Owner or Admin)
 */
router.post('/:disputeId/close',
  validators.validateId,
  disputeController.closeDispute
);

/**
 * @route   POST /api/disputes/:disputeId/reopen
 * @desc    Reopen closed dispute
 * @access  Private (Admin only)
 */
router.post('/:disputeId/reopen',
  validators.validateId,
  authorize(['admin']),
  disputeController.reopenDispute
);

/**
 * @route   GET /api/disputes/pending
 * @desc    Get pending disputes (Admin only)
 * @access  Private (Admin)
 */
router.get('/pending',
  authorize(['admin']),
  validators.validatePagination,
  disputeController.getPendingDisputes
);

/**
 * @route   POST /api/disputes/:disputeId/resolve
 * @desc    Resolve dispute (Admin only)
 * @access  Private (Admin)
 */
router.post('/:disputeId/resolve',
  validators.validateId,
  authorize(['admin']),
  disputeController.resolveDispute
);

/**
 * @route   POST /api/disputes/:disputeId/reject
 * @desc    Reject dispute (Admin only)
 * @access  Private (Admin)
 */
router.post('/:disputeId/reject',
  validators.validateId,
  authorize(['admin']),
  disputeController.rejectDispute
);

/**
 * @route   GET /api/disputes/statistics
 * @desc    Get dispute statistics (Admin only)
 * @access  Private (Admin)
 */
router.get('/statistics',
  authorize(['admin']),
  validators.validateDateRange,
  disputeController.getDisputeStatistics
);

module.exports = router;