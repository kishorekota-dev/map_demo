const express = require('express');
const router = express.Router();
const fraudController = require('../controllers/fraud');
const { validators } = require('../middleware/validation');
const { authorize } = require('../middleware/auth');
const { bankingRateLimit } = require('../middleware/security');

// Apply rate limiting to fraud routes
router.use(bankingRateLimit);

/**
 * @route   GET /api/fraud/alerts
 * @desc    Get fraud alerts for user
 * @access  Private
 */
router.get('/alerts',
  validators.validatePagination,
  fraudController.getFraudAlerts
);

/**
 * @route   GET /api/fraud/alerts/:alertId
 * @desc    Get specific fraud alert details
 * @access  Private (Owner or Admin)
 */
router.get('/alerts/:alertId',
  validators.validateId,
  fraudController.getFraudAlertById
);

/**
 * @route   POST /api/fraud/report
 * @desc    Report suspicious transaction
 * @access  Private
 */
router.post('/report',
  fraudController.reportSuspiciousTransaction
);

/**
 * @route   POST /api/fraud/verify
 * @desc    Verify legitimate transaction
 * @access  Private
 */
router.post('/verify',
  fraudController.verifyTransaction
);

/**
 * @route   GET /api/fraud/score/:transactionId
 * @desc    Get fraud risk score for transaction
 * @access  Private (Admin only)
 */
router.get('/score/:transactionId',
  validators.validateId,
  authorize(['admin']),
  fraudController.getFraudScore
);

/**
 * @route   POST /api/fraud/whitelist
 * @desc    Add merchant to whitelist
 * @access  Private
 */
router.post('/whitelist',
  fraudController.addToWhitelist
);

/**
 * @route   DELETE /api/fraud/whitelist/:merchantId
 * @desc    Remove merchant from whitelist
 * @access  Private
 */
router.delete('/whitelist/:merchantId',
  validators.validateId,
  fraudController.removeFromWhitelist
);

/**
 * @route   GET /api/fraud/patterns
 * @desc    Get fraud patterns analysis (Admin only)
 * @access  Private (Admin)
 */
router.get('/patterns',
  authorize(['admin']),
  validators.validateDateRange,
  fraudController.getFraudPatterns
);

/**
 * @route   POST /api/fraud/investigate
 * @desc    Start fraud investigation (Admin only)
 * @access  Private (Admin)
 */
router.post('/investigate',
  authorize(['admin']),
  fraudController.startInvestigation
);

/**
 * @route   PUT /api/fraud/investigation/:investigationId
 * @desc    Update fraud investigation status (Admin only)
 * @access  Private (Admin)
 */
router.put('/investigation/:investigationId',
  validators.validateId,
  authorize(['admin']),
  fraudController.updateInvestigation
);

/**
 * @route   GET /api/fraud/statistics
 * @desc    Get fraud statistics (Admin only)
 * @access  Private (Admin)
 */
router.get('/statistics',
  authorize(['admin']),
  validators.validateDateRange,
  fraudController.getFraudStatistics
);

module.exports = router;