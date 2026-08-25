const Joi = require('joi');
const logger = require('../utils/logger');
const { AccountRepository, TransactionRepository } = require('../database/repositories');

/**
 * Generic validation middleware factory
 * @param {Object} schema - Joi validation schema
 * @param {string} target - Target to validate ('body', 'query', 'params')
 */
const validate = (schema, target = 'body') => {
  return (req, res, next) => {
    const data = req[target];
    
    const shouldStripUnknown = target === 'body';
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      // Query validation is deliberately composable: several routes apply a
      // pagination schema followed by a date-range schema. Stripping on the
      // first pass would delete fields needed by the second pass. Request
      // bodies remain strict and sanitized.
      stripUnknown: shouldStripUnknown,
      allowUnknown: !shouldStripUnknown
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      logger.warn('Validation failed', {
        target: target,
        path: req.path,
        method: req.method,
        errors: errorDetails,
        userId: req.user?.id
      });

      return res.status(400).json({
        error: 'Validation failed',
        message: 'Request data does not meet required format',
        code: 'VALIDATION_ERROR',
        details: errorDetails
      });
    }

    // Replace the original data with validated/sanitized data
    req[target] = value;
    next();
  };
};

// Common validation schemas
const schemas = {
  // Account validation schemas
  createAccount: Joi.object({
    accountType: Joi.string().valid('checking', 'savings', 'credit', 'loan').required(),
    accountName: Joi.string().min(1).max(100).trim().required(),
    initialBalance: Joi.number().min(0).max(1000000),
    initialDeposit: Joi.number().min(0).max(1000000),
    currency: Joi.string().length(3).uppercase().default('USD'),
    creditLimit: Joi.number().min(0).max(1000000),
    interestRate: Joi.number().min(0).max(1),
    dailyTransactionLimit: Joi.number().positive().max(1000000),
    monthlyTransactionLimit: Joi.number().positive().max(10000000),
    metadata: Joi.object().default({})
  }).custom((value, helpers) => {
    if (value.initialBalance !== undefined && value.initialDeposit !== undefined) {
      return helpers.error('object.xor', { peers: ['initialBalance', 'initialDeposit'] });
    }
    if (value.initialBalance === undefined) {
      value.initialBalance = value.initialDeposit || 0;
    }
    delete value.initialDeposit;
    return value;
  }),

  updateAccount: Joi.object({
    nickname: Joi.string().max(50).trim(),
    status: Joi.string().valid('active', 'inactive', 'frozen', 'closed'),
    metadata: Joi.object()
  }),

  // Transaction validation schemas
  createTransaction: Joi.object({
    accountId: Joi.string(),
    fromAccountId: Joi.string(),
    amount: Joi.number().positive().max(100000).required(),
    transactionType: Joi.string().valid(
      'deposit', 'withdrawal', 'payment', 'fee', 'interest', 'refund',
      'adjustment', 'purchase', 'atm_withdrawal'
    ),
    type: Joi.string().valid(
      'deposit', 'withdrawal', 'payment', 'fee', 'interest', 'refund',
      'adjustment', 'purchase', 'atm_withdrawal'
    ),
    description: Joi.string().max(200).trim(),
    category: Joi.string().max(50).trim(),
    merchantName: Joi.string().max(255).trim(),
    metadata: Joi.object().default({})
  }).or('accountId', 'fromAccountId')
    .or('transactionType', 'type')
    .custom((value, helpers) => {
      if (value.accountId && value.fromAccountId && value.accountId !== value.fromAccountId) {
        return helpers.error('any.invalid');
      }
      if (value.transactionType && value.type && value.transactionType !== value.type) {
        return helpers.error('any.invalid');
      }
      value.accountId = value.accountId || value.fromAccountId;
      value.transactionType = value.transactionType || value.type;
      delete value.fromAccountId;
      delete value.type;
      return value;
    }),

  // Transfer validation schemas
  createTransfer: Joi.object({
    fromAccountId: Joi.string().required(),
    toAccountId: Joi.string().required(),
    amount: Joi.number().positive().max(50000).required(),
    transferType: Joi.string().valid('internal', 'domestic', 'international').required(),
    description: Joi.string().max(200).trim(),
    scheduledDate: Joi.date().min('now').optional(),
    recurring: Joi.object({
      frequency: Joi.string().valid('weekly', 'monthly', 'quarterly'),
      endDate: Joi.date().min(Joi.ref('../../scheduledDate'))
    }).optional()
  }),

  // Card validation schemas
  createCard: Joi.object({
    accountId: Joi.string().required(),
    cardType: Joi.string().valid('debit', 'credit', 'prepaid').required(),
    cardBrand: Joi.string().valid('visa', 'mastercard', 'amex', 'discover').default('visa'),
    cardholderName: Joi.string().min(1).max(200).trim().required(),
    dailyLimit: Joi.number().min(100).max(10000).default(2000),
    monthlyLimit: Joi.number().min(1000).max(50000).default(20000),
    nickname: Joi.string().max(50).trim(),
    billingAddressLine1: Joi.string().max(255).trim(),
    billingCity: Joi.string().max(100).trim(),
    billingState: Joi.string().max(50).trim(),
    billingZipCode: Joi.string().max(20).trim(),
    billingCountry: Joi.string().max(100).trim().default('USA')
  }),

  updateCard: Joi.object({
    status: Joi.string().valid('active', 'blocked', 'expired', 'cancelled'),
    dailyLimit: Joi.number().min(100).max(10000),
    monthlyLimit: Joi.number().min(1000).max(50000),
    nickname: Joi.string().max(50).trim()
  }),

  createFraudAlert: Joi.object({
    accountId: Joi.string(),
    transactionId: Joi.string(),
    cardId: Joi.string(),
    alertType: Joi.string().valid(
      'unusual_activity', 'high_value_transaction', 'multiple_failed_attempts',
      'location_mismatch', 'velocity_check', 'suspicious_merchant',
      'card_not_present', 'account_takeover', 'identity_theft'
    ).required(),
    severity: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
    riskScore: Joi.number().integer().min(0).max(100),
    description: Joi.string().min(3).max(1000).required(),
    details: Joi.object(),
    amount: Joi.number().positive(),
    location: Joi.string().max(255),
    ipAddress: Joi.string().ip(),
    deviceFingerprint: Joi.string().max(255),
    actionTaken: Joi.string().valid(
      'none', 'blocked_transaction', 'blocked_card', 'frozen_account',
      'notified_user', 'manual_review', 'escalated'
    )
  }),

  // Dispute validation schemas
  createDispute: Joi.object({
    transactionId: Joi.string().required(),
    disputeType: Joi.string().valid(
      'unauthorized_transaction', 'incorrect_amount', 'duplicate_charge',
      'service_not_received', 'product_not_received', 'defective_product',
      'cancelled_service', 'fraudulent_charge', 'billing_error', 'other'
    ).required(),
    amountDisputed: Joi.number().positive().required(),
    reason: Joi.string().min(3).max(500).required(),
    description: Joi.string().min(3).max(1000),
    merchantName: Joi.string().max(255).trim(),
    evidence: Joi.array().items(Joi.string()).max(5).default([])
  }),

  updateDispute: Joi.object({
    status: Joi.string().valid(
      'submitted', 'under_review', 'pending_merchant', 'pending_customer',
      'resolved_in_favor', 'resolved_against', 'partially_resolved',
      'withdrawn', 'escalated'
    ),
    resolution: Joi.string().max(500),
    description: Joi.string().min(3).max(1000),
    reason: Joi.string().min(3).max(500),
    amountDisputed: Joi.number().positive(),
    evidence: Joi.array().items(Joi.string()).max(10)
  }),

  // Query parameter schemas
  paginationQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().max(50),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }),

  dateRangeQuery: Joi.object({
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')),
    timezone: Joi.string().default('UTC')
  }),

  // Parameter schemas
  idParam: Joi.object({
    id: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/),
    cardId: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/),
    transferId: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/),
    alertId: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/),
    disputeId: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/)
  }).or('id', 'cardId', 'transferId', 'alertId', 'disputeId'),

  accountIdParam: Joi.object({
    accountId: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).required()
  }),

  transactionIdParam: Joi.object({
    transactionId: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).required()
  })
};

// Pre-configured validation middleware
const validators = {
  // Account validators
  validateCreateAccount: validate(schemas.createAccount, 'body'),
  validateUpdateAccount: validate(schemas.updateAccount, 'body'),
  validateAccountId: validate(schemas.accountIdParam, 'params'),

  // Transaction validators
  validateCreateTransaction: validate(schemas.createTransaction, 'body'),
  validateTransactionId: validate(schemas.transactionIdParam, 'params'),

  // Transfer validators
  validateCreateTransfer: validate(schemas.createTransfer, 'body'),

  // Card validators
  validateCreateCard: validate(schemas.createCard, 'body'),
  validateUpdateCard: validate(schemas.updateCard, 'body'),

  // Fraud validators
  validateCreateFraudAlert: validate(schemas.createFraudAlert, 'body'),

  // Dispute validators
  validateCreateDispute: validate(schemas.createDispute, 'body'),
  validateUpdateDispute: validate(schemas.updateDispute, 'body'),

  // Query validators
  validatePagination: validate(schemas.paginationQuery, 'query'),
  validateDateRange: validate(schemas.dateRangeQuery, 'query'),

  // Parameter validators
  validateId: validate(schemas.idParam, 'params')
};

/**
 * Custom validation for business rules
 */
const businessValidators = {
  validateTransactionPermission: (req, res, next) => {
    const transactionType = req.body.transactionType || req.body.type;
    const privilegedTypes = new Set(['deposit', 'refund', 'interest', 'adjustment', 'fee']);
    if (privilegedTypes.has(transactionType) && !['admin', 'service'].includes(req.user?.role)) {
      return res.status(403).json({
        error: 'Access forbidden',
        message: `Creating ${transactionType} transactions requires a privileged role`,
        code: 'TRANSACTION_TYPE_FORBIDDEN'
      });
    }
    next();
  },

  /**
   * Validate transaction amount against account balance
   */
  validateSufficientFunds: async (req, res, next) => {
    try {
      const transactionType = req.body.transactionType || req.body.type;
      const creditTypes = new Set(['deposit', 'refund', 'interest', 'adjustment']);
      if (creditTypes.has(transactionType)) {
        return next();
      }

      const { fromAccountId, accountId, amount } = req.body;
      const targetAccountId = fromAccountId || accountId;

      if (!targetAccountId) {
        return res.status(400).json({
          error: 'Account ID required',
          message: 'Account ID is required for balance validation',
          code: 'ACCOUNT_ID_REQUIRED'
        });
      }

      const hasFunds = await AccountRepository.hasSufficientFunds(targetAccountId, amount);

      if (!hasFunds) {
        const balances = await AccountRepository.getBalance(targetAccountId);
        const availableBalance = balances?.available_balance ?? 0;

        return res.status(400).json({
          error: 'Insufficient funds',
          message: 'Account balance is insufficient for this transaction',
          code: 'INSUFFICIENT_FUNDS',
          available: availableBalance,
          requested: amount
        });
      }

      next();
    } catch (error) {
      logger.error('Business validation error', {
        error: error.message,
        path: req.path,
        method: req.method,
        userId: req.user?.id
      });

      res.status(500).json({
        error: 'Validation service error',
        message: 'Unable to validate business rules',
        code: 'VALIDATION_SERVICE_ERROR'
      });
    }
  },

  /**
   * Validate daily transaction limits
   */
  validateDailyLimits: async (req, res, next) => {
    try {
      const transactionType = req.body.transactionType || req.body.type;
      const creditTypes = new Set(['deposit', 'refund', 'interest', 'adjustment']);
      if (creditTypes.has(transactionType)) {
        return next();
      }

      const { fromAccountId, accountId, amount } = req.body;
      const targetAccountId = fromAccountId || accountId;

      if (!targetAccountId) {
        return res.status(400).json({
          error: 'Account ID required',
          message: 'Account ID is required for daily limit validation',
          code: 'ACCOUNT_ID_REQUIRED'
        });
      }

      const account = await AccountRepository.findById(targetAccountId);

      if (!account) {
        return res.status(404).json({
          error: 'Account not found',
          message: 'Account does not exist',
          code: 'ACCOUNT_NOT_FOUND'
        });
      }

      const dailyLimit = parseFloat(account.daily_transaction_limit || 10000);
      const dailySpent = await TransactionRepository.getDailySpent(targetAccountId, new Date());

      if (dailySpent + amount > dailyLimit) {
        return res.status(400).json({
          error: 'Daily limit exceeded',
          message: 'This transaction would exceed your daily spending limit',
          code: 'DAILY_LIMIT_EXCEEDED',
          dailyLimit: dailyLimit,
          dailySpent: dailySpent,
          requested: amount
        });
      }

      next();
    } catch (error) {
      logger.error('Daily limit validation error', {
        error: error.message,
        path: req.path,
        method: req.method,
        userId: req.user?.id
      });

      res.status(500).json({
        error: 'Validation service error',
        message: 'Unable to validate daily limits',
        code: 'VALIDATION_SERVICE_ERROR'
      });
    }
  }
};

module.exports = {
  validate,
  schemas,
  validators,
  businessValidators
};
