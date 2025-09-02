const express = require('express');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const { validateRequest, validateQuery } = require('../middleware/validation');
const { auth } = require('../middleware/auth');
const { 
  SecurityUtils, 
  createResourceSecurityMiddleware, 
  createSecureResponse 
} = require('../middleware/security');
const { 
  formatCurrency,
  generateReferenceNumber,
  getPaginationParams,
  createPaginatedResponse 
} = require('../utils/helpers');
const { 
  mockData, 
  findDisputesByUserId 
} = require('../models/mockData');

const router = express.Router();

// Validation schemas
const createDisputeSchema = Joi.object({
  transactionId: Joi.string().required(),
  disputeType: Joi.string().valid(
    'UNAUTHORIZED_CHARGE',
    'BILLING_ERROR',
    'DEFECTIVE_MERCHANDISE',
    'SERVICE_NOT_RECEIVED',
    'DUPLICATE_CHARGE',
    'INCORRECT_AMOUNT',
    'CANCELLED_TRANSACTION',
    'FRAUD',
    'OTHER'
  ).required(),
  reason: Joi.string().min(10).max(500).required(),
  disputeAmount: Joi.number().positive().optional(),
  evidence: Joi.array().items(Joi.object({
    type: Joi.string().valid('RECEIPT', 'EMAIL', 'PHOTO', 'DOCUMENT', 'OTHER').required(),
    description: Joi.string().max(255).required(),
    url: Joi.string().uri().optional() // In real system, files would be uploaded
  })).optional(),
  contactAttempts: Joi.array().items(Joi.object({
    date: Joi.date().iso().required(),
    method: Joi.string().valid('PHONE', 'EMAIL', 'CHAT', 'IN_PERSON').required(),
    outcome: Joi.string().max(255).required()
  })).optional()
});

const updateDisputeSchema = Joi.object({
  status: Joi.string().valid(
    'SUBMITTED',
    'UNDER_REVIEW',
    'PENDING_MERCHANT_RESPONSE',
    'RESOLVED_CUSTOMER_FAVOR',
    'RESOLVED_MERCHANT_FAVOR',
    'CLOSED',
    'ESCALATED'
  ).optional(),
  resolution: Joi.string().max(500).optional(),
  additionalEvidence: Joi.array().items(Joi.object({
    type: Joi.string().valid('RECEIPT', 'EMAIL', 'PHOTO', 'DOCUMENT', 'OTHER').required(),
    description: Joi.string().max(255).required(),
    url: Joi.string().uri().optional()
  })).optional()
});

const querySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  status: Joi.string().valid(
    'SUBMITTED',
    'UNDER_REVIEW',
    'PENDING_MERCHANT_RESPONSE',
    'RESOLVED_CUSTOMER_FAVOR',
    'RESOLVED_MERCHANT_FAVOR',
    'CLOSED',
    'ESCALATED'
  ).optional(),
  disputeType: Joi.string().valid(
    'UNAUTHORIZED_CHARGE',
    'BILLING_ERROR',
    'DEFECTIVE_MERCHANDISE',
    'SERVICE_NOT_RECEIVED',
    'DUPLICATE_CHARGE',
    'INCORRECT_AMOUNT',
    'CANCELLED_TRANSACTION',
    'FRAUD',
    'OTHER'
  ).optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional()
});

// GET /api/v1/disputes
router.get('/', 
  createResourceSecurityMiddleware('disputes', 'read'),
  validateQuery(querySchema), 
  async (req, res) => {
    try {
      const { page, limit } = getPaginationParams(req.query);
      const { offset, actualLimit } = getPaginationParams(page, limit);
      const { status, disputeType, startDate, endDate } = req.query;
      const userRole = req.user.role;
      const userId = req.user.userId;

      // Get disputes based on role access
      let disputes = SecurityUtils.filterByUserAccess(mockData.disputes, userRole, userId);

      // Apply filters
      if (status) {
        disputes = disputes.filter(dispute => dispute.status === status);
      }

      if (disputeType) {
        disputes = disputes.filter(dispute => dispute.disputeType === disputeType);
      }

      if (startDate || endDate) {
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate) : new Date();
        disputes = disputes.filter(dispute => {
          const disputeDate = new Date(dispute.createdAt);
          return disputeDate >= start && disputeDate <= end;
        });
      }

      // Sort by creation date (newest first)
      disputes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Paginate
      const totalCount = disputes.length;
      const paginatedDisputes = disputes.slice(offset, offset + actualLimit);

      // Format response with transaction details and sanitize sensitive data
      const formattedDisputes = paginatedDisputes.map(dispute => {
        const transaction = mockData.transactions.get(dispute.transactionId);
        const sanitizedDispute = SecurityUtils.sanitizeDataByRole(dispute, userRole, ['internalNotes']);
        
        return {
          ...sanitizedDispute,
          formattedDisputeAmount: formatCurrency(sanitizedDispute.disputeAmount),
          transaction: transaction ? {
            id: transaction.id,
            amount: transaction.amount,
            formattedAmount: formatCurrency(transaction.amount),
            merchantName: transaction.merchantName,
            transactionDate: transaction.transactionDate,
            description: transaction.description
          } : null
        };
      });

      // Log access
      await SecurityUtils.logSecurityEvent(req, 'DISPUTE_LIST_ACCESS', {
        totalDisputes: formattedDisputes.length,
        filters: { status, disputeType, startDate, endDate }
      });

      const response = createPaginatedResponse(formattedDisputes, totalCount, page, limit);
      const secureResponse = createSecureResponse({
        message: 'Disputes retrieved successfully',
        ...response
      }, userRole);

      res.json(secureResponse);
    } catch (error) {
      console.error('Get disputes error:', error);
      res.status(500).json({
        error: 'Failed to retrieve disputes',
        message: 'An error occurred while retrieving disputes'
      });
    }
  }
);

// GET /api/v1/disputes/:id
router.get('/:id', 
  createResourceSecurityMiddleware('disputes', 'read'),
  async (req, res) => {
    try {
      const disputeId = req.params.id;
      const dispute = mockData.disputes.get(disputeId);
      const userRole = req.user.role;
      const userId = req.user.userId;

      if (!dispute) {
        return res.status(404).json({
          error: 'Dispute not found',
          message: 'Dispute not found'
        });
      }

      // Check if user has access to this dispute
      if (!SecurityUtils.hasResourceAccess(dispute, userRole, userId)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this dispute'
        });
      }

      // Get transaction details
      const transaction = mockData.transactions.get(dispute.transactionId);

      // Sanitize dispute data based on user role
      const sanitizedDispute = SecurityUtils.sanitizeDataByRole(dispute, userRole, ['internalNotes']);

      // Format response
      const formattedDispute = {
        ...sanitizedDispute,
        formattedDisputeAmount: formatCurrency(sanitizedDispute.disputeAmount),
        transaction: transaction ? {
          id: transaction.id,
          amount: transaction.amount,
        formattedAmount: formatCurrency(transaction.amount),
        merchantName: transaction.merchantName,
        transactionDate: transaction.transactionDate,
        description: transaction.description,
        authorizationCode: transaction.authorizationCode
      } : null
    };

    // Log access
    await SecurityUtils.logSecurityEvent(req, 'DISPUTE_DETAIL_ACCESS', {
      disputeId: disputeId,
      disputeType: dispute.disputeType
    });

    const secureResponse = createSecureResponse({
      message: 'Dispute retrieved successfully',
      dispute: formattedDispute
    }, userRole);

    res.json(secureResponse);
  } catch (error) {
    console.error('Get dispute error:', error);
    res.status(500).json({
      error: 'Failed to retrieve dispute',
      message: 'An error occurred while retrieving dispute'
    });
  }
});

// POST /api/v1/disputes
router.post('/', 
  createResourceSecurityMiddleware('disputes', 'create'),
  validateRequest(createDisputeSchema), 
  async (req, res) => {
    try {
      const { 
        transactionId, 
        disputeType, 
        reason, 
        disputeAmount, 
        evidence, 
        contactAttempts 
      } = req.body;
      const userRole = req.user.role;
      const userId = req.user.userId;

      // Verify transaction exists and belongs to user
      const transaction = mockData.transactions.get(transactionId);
      if (!transaction) {
        return res.status(404).json({
          error: 'Transaction not found',
          message: 'The specified transaction does not exist'
        });
      }

      // Check if user has access to this transaction
      if (!SecurityUtils.hasResourceAccess(transaction, userRole, userId)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to dispute this transaction'
        });
      }

      // Verify user owns the account
      const account = mockData.accounts.get(transaction.accountId);
      if (!account || account.userId !== userId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this transaction'
        });
      }

      // Check if transaction is already disputed
      if (transaction.isDisputed) {
        return res.status(400).json({
          error: 'Transaction already disputed',
          message: 'This transaction has already been disputed'
        });
      }

    // Validate dispute amount
    const finalDisputeAmount = disputeAmount || transaction.amount;
    if (finalDisputeAmount > transaction.amount) {
      return res.status(400).json({
        error: 'Invalid dispute amount',
        message: 'Dispute amount cannot exceed transaction amount'
      });
    }

    // Create new dispute
    const newDispute = {
      id: uuidv4(),
      userId: req.user.userId,
      transactionId,
      accountId: transaction.accountId,
      disputeType,
      reason,
      disputeAmount: finalDisputeAmount,
      status: 'SUBMITTED',
      referenceNumber: generateReferenceNumber('DIS'),
      evidence: evidence || [],
      contactAttempts: contactAttempts || [],
      timeline: [
        {
          date: new Date(),
          status: 'SUBMITTED',
          description: 'Dispute submitted by customer',
          updatedBy: 'CUSTOMER'
        }
      ],
      expectedResolutionDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // 45 days
      provisionalCreditIssued: false,
      provisionalCreditAmount: 0,
      finalResolution: null,
      resolutionAmount: 0,
      createdAt: new Date(),
      lastModified: new Date()
    };

    mockData.disputes.set(newDispute.id, newDispute);

    // Mark transaction as disputed
    transaction.isDisputed = true;
    transaction.disputeId = newDispute.id;
    mockData.transactions.set(transaction.id, transaction);

    // Issue provisional credit for eligible disputes
    if (['UNAUTHORIZED_CHARGE', 'FRAUD'].includes(disputeType)) {
      newDispute.provisionalCreditIssued = true;
      newDispute.provisionalCreditAmount = finalDisputeAmount;
      
      // Credit the account (temporarily)
      if (account.accountType === 'CREDIT') {
        account.currentBalance = Math.max(0, account.currentBalance - finalDisputeAmount);
        account.availableCredit = account.creditLimit - account.currentBalance;
      } else {
        account.currentBalance += finalDisputeAmount;
      }
      
      account.lastModified = new Date();
      mockData.accounts.set(account.id, account);

      newDispute.timeline.push({
        date: new Date(),
        status: 'PROVISIONAL_CREDIT_ISSUED',
        description: `Provisional credit of ${formatCurrency(finalDisputeAmount)} issued`,
        updatedBy: 'SYSTEM'
      });
    }

    // Simulate automatic status updates
    setTimeout(() => {
      newDispute.status = 'UNDER_REVIEW';
      newDispute.timeline.push({
        date: new Date(),
        status: 'UNDER_REVIEW',
        description: 'Dispute is now under review',
        updatedBy: 'SYSTEM'
      });
      newDispute.lastModified = new Date();
      mockData.disputes.set(newDispute.id, newDispute);
    }, 2000);

    // Log dispute creation
    await SecurityUtils.logSecurityEvent(req, 'DISPUTE_CREATION', {
      disputeId: newDispute.id,
      transactionId: transactionId,
      disputeType: disputeType,
      disputeAmount: finalDisputeAmount
    });

    // Format response with sanitized data
    const sanitizedDispute = SecurityUtils.sanitizeDataByRole(newDispute, userRole, ['internalNotes']);
    const formattedDispute = {
      ...sanitizedDispute,
      formattedDisputeAmount: formatCurrency(sanitizedDispute.disputeAmount),
      transaction: {
        id: transaction.id,
        amount: transaction.amount,
        formattedAmount: formatCurrency(transaction.amount),
        merchantName: transaction.merchantName,
        transactionDate: transaction.transactionDate,
        description: transaction.description
      }
    };

    const secureResponse = createSecureResponse({
      message: 'Dispute created successfully',
      dispute: formattedDispute
    }, userRole);

    res.status(201).json(secureResponse);
  } catch (error) {
    console.error('Create dispute error:', error);
    res.status(500).json({
      error: 'Failed to create dispute',
      message: 'An error occurred while creating dispute'
    });
  }
});

// PUT /api/v1/disputes/:id
router.put('/:id', 
  createResourceSecurityMiddleware('disputes', 'update'),
  validateRequest(updateDisputeSchema), 
  async (req, res) => {
    try {
      const disputeId = req.params.id;
      const dispute = mockData.disputes.get(disputeId);
      const userRole = req.user.role;
      const userId = req.user.userId;

      if (!dispute) {
        return res.status(404).json({
          error: 'Dispute not found',
          message: 'Dispute not found'
        });
      }

      // Check if user has access to update this dispute
      if (!SecurityUtils.hasResourceAccess(dispute, userRole, userId)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to update this dispute'
        });
      }

      const { status, resolution, additionalEvidence } = req.body;

      // Update dispute
      if (status && status !== dispute.status) {
        dispute.status = status;
        dispute.timeline.push({
          date: new Date(),
          status: status,
          description: resolution || `Status updated to ${status}`,
          updatedBy: req.user.email
        });
      }

      if (resolution) {
        dispute.finalResolution = resolution;
      }

      if (additionalEvidence) {
        dispute.evidence.push(...additionalEvidence);
      }

      dispute.lastModified = new Date();
      mockData.disputes.set(dispute.id, dispute);

      // Log dispute update
      await SecurityUtils.logSecurityEvent(req, 'DISPUTE_UPDATE', {
        disputeId: disputeId,
        updatedFields: Object.keys(req.body)
      });

      // Format response with sanitized data
      const sanitizedDispute = SecurityUtils.sanitizeDataByRole(dispute, userRole, ['internalNotes']);
      const formattedDispute = {
        ...sanitizedDispute,
        formattedDisputeAmount: formatCurrency(sanitizedDispute.disputeAmount)
      };

      const secureResponse = createSecureResponse({
        message: 'Dispute updated successfully',
        dispute: formattedDispute
      }, userRole);

      res.json(secureResponse);
    } catch (error) {
      console.error('Update dispute error:', error);
      res.status(500).json({
        error: 'Failed to update dispute',
        message: 'An error occurred while updating dispute'
      });
    }
  }
);

// POST /api/v1/disputes/:id/withdraw
router.post('/:id/withdraw', auth, (req, res) => {
  try {
    const dispute = mockData.disputes.get(req.params.id);

    if (!dispute || dispute.userId !== req.user.userId) {
      return res.status(404).json({
        error: 'Dispute not found',
        message: 'Dispute not found or access denied'
      });
    }

    // Can only withdraw submitted or under review disputes
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(dispute.status)) {
      return res.status(400).json({
        error: 'Cannot withdraw dispute',
        message: 'Only submitted or under review disputes can be withdrawn'
      });
    }

    // Update dispute status
    dispute.status = 'CLOSED';
    dispute.finalResolution = 'Customer withdrew dispute';
    dispute.timeline.push({
      date: new Date(),
      status: 'CLOSED',
      description: 'Dispute withdrawn by customer',
      updatedBy: req.user.email
    });
    dispute.lastModified = new Date();
    mockData.disputes.set(dispute.id, dispute);

    // Reverse provisional credit if it was issued
    if (dispute.provisionalCreditIssued) {
      const account = mockData.accounts.get(dispute.accountId);
      if (account) {
        if (account.accountType === 'CREDIT') {
          account.currentBalance += dispute.provisionalCreditAmount;
          account.availableCredit = account.creditLimit - account.currentBalance;
        } else {
          account.currentBalance -= dispute.provisionalCreditAmount;
        }
        account.lastModified = new Date();
        mockData.accounts.set(account.id, account);
      }
    }

    // Update transaction
    const transaction = mockData.transactions.get(dispute.transactionId);
    if (transaction) {
      transaction.isDisputed = false;
      transaction.disputeId = null;
      mockData.transactions.set(transaction.id, transaction);
    }

    // Format response
    const formattedDispute = {
      ...dispute,
      formattedDisputeAmount: formatCurrency(dispute.disputeAmount)
    };

    res.json({
      message: 'Dispute withdrawn successfully',
      dispute: formattedDispute
    });
  } catch (error) {
    console.error('Withdraw dispute error:', error);
    res.status(500).json({
      error: 'Failed to withdraw dispute',
      message: 'An error occurred while withdrawing dispute'
    });
  }
});

// GET /api/v1/disputes/types
router.get('/types', auth, (req, res) => {
  try {
    const disputeTypes = [
      {
        code: 'UNAUTHORIZED_CHARGE',
        name: 'Unauthorized Charge',
        description: 'A charge you did not make or authorize',
        eligibleForProvisionalCredit: true,
        requiredEvidence: ['Receipt or proof of authorized charges', 'Police report (if applicable)']
      },
      {
        code: 'BILLING_ERROR',
        name: 'Billing Error',
        description: 'An error in billing amount, date, or merchant information',
        eligibleForProvisionalCredit: false,
        requiredEvidence: ['Receipt or invoice', 'Correspondence with merchant']
      },
      {
        code: 'DEFECTIVE_MERCHANDISE',
        name: 'Defective Merchandise',
        description: 'Product received was defective or not as described',
        eligibleForProvisionalCredit: false,
        requiredEvidence: ['Photos of defective product', 'Return receipt', 'Merchant correspondence']
      },
      {
        code: 'SERVICE_NOT_RECEIVED',
        name: 'Service Not Received',
        description: 'Service was paid for but not received',
        eligibleForProvisionalCredit: false,
        requiredEvidence: ['Contract or service agreement', 'Proof of payment', 'Merchant correspondence']
      },
      {
        code: 'DUPLICATE_CHARGE',
        name: 'Duplicate Charge',
        description: 'Charged multiple times for the same transaction',
        eligibleForProvisionalCredit: false,
        requiredEvidence: ['Receipt showing single purchase', 'Statement showing multiple charges']
      },
      {
        code: 'INCORRECT_AMOUNT',
        name: 'Incorrect Amount',
        description: 'Charged amount differs from agreed amount',
        eligibleForProvisionalCredit: false,
        requiredEvidence: ['Receipt showing correct amount', 'Price advertisement or quote']
      },
      {
        code: 'CANCELLED_TRANSACTION',
        name: 'Cancelled Transaction',
        description: 'Transaction was cancelled but charge was not reversed',
        eligibleForProvisionalCredit: false,
        requiredEvidence: ['Cancellation confirmation', 'Merchant correspondence']
      },
      {
        code: 'FRAUD',
        name: 'Fraud',
        description: 'Fraudulent use of your card',
        eligibleForProvisionalCredit: true,
        requiredEvidence: ['Police report', 'Affidavit of fraud']
      },
      {
        code: 'OTHER',
        name: 'Other',
        description: 'Other dispute reason not listed above',
        eligibleForProvisionalCredit: false,
        requiredEvidence: ['Detailed explanation', 'Supporting documentation']
      }
    ];

    res.json({
      message: 'Dispute types retrieved successfully',
      disputeTypes
    });
  } catch (error) {
    console.error('Get dispute types error:', error);
    res.status(500).json({
      error: 'Failed to retrieve dispute types',
      message: 'An error occurred while retrieving dispute types'
    });
  }
});

module.exports = router;
