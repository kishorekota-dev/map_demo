const Joi = require('joi');
const logger = require('../utils/logger');

/**
 * Generic validation middleware factory
 * @param {Object} schema - Joi validation schema
 * @param {string} target - Target to validate ('body', 'query', 'params')
 */
const validate = (schema, target = 'body') => {
  return (req, res, next) => {
    const data = req[target];
    
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: false
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
    initialDeposit: Joi.number().min(0).max(1000000).default(0),
    currency: Joi.string().length(3).uppercase().default('USD'),
    metadata: Joi.object().default({})
  }),

  updateAccount: Joi.object({
    nickname: Joi.string().max(50).trim(),
    status: Joi.string().valid('active', 'inactive', 'frozen', 'closed'),
    metadata: Joi.object()
  }),

  // Transaction validation schemas
  createTransaction: Joi.object({
    fromAccountId: Joi.string().required(),
    toAccountId: Joi.string().when('type', {
      is: Joi.string().valid('transfer', 'payment'),
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    amount: Joi.number().positive().max(100000).required(),
    type: Joi.string().valid('deposit', 'withdrawal', 'transfer', 'payment', 'fee').required(),
    description: Joi.string().max(200).trim(),
    category: Joi.string().max(50).trim(),
    metadata: Joi.object().default({})
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
    dailyLimit: Joi.number().min(100).max(10000).default(2000),
    monthlyLimit: Joi.number().min(1000).max(50000).default(20000),
    nickname: Joi.string().max(50).trim()
  }),

  updateCard: Joi.object({
    status: Joi.string().valid('active', 'blocked', 'expired', 'cancelled'),
    dailyLimit: Joi.number().min(100).max(10000),
    monthlyLimit: Joi.number().min(1000).max(50000),
    nickname: Joi.string().max(50).trim()
  }),

  // Dispute validation schemas
  createDispute: Joi.object({
    transactionId: Joi.string().required(),
    reason: Joi.string().valid('fraud', 'billing_error', 'duplicate_charge', 'unauthorized', 'other').required(),
    description: Joi.string().min(10).max(500).required(),
    evidence: Joi.array().items(Joi.string()).max(5).default([]),
    requestedAmount: Joi.number().positive().optional()
  }),

  updateDispute: Joi.object({
    status: Joi.string().valid('open', 'investigating', 'resolved', 'rejected'),
    resolution: Joi.string().max(500),
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
    id: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).required()
  }),

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
  /**
   * Validate transaction amount against account balance
   */
  validateSufficientFunds: async (req, res, next) => {
    try {
      const { fromAccountId, amount } = req.body;
      
      // TODO: Implement actual balance check with database
      // For now, we'll simulate the check
      const mockBalance = 5000; // This should come from database
      
      if (amount > mockBalance) {
        return res.status(400).json({
          error: 'Insufficient funds',
          message: 'Account balance is insufficient for this transaction',
          code: 'INSUFFICIENT_FUNDS',
          available: mockBalance,
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
      const { amount } = req.body;
      const userId = req.user.id;
      
      // TODO: Implement actual daily limit check with database
      const dailySpent = 0; // This should come from database
      const dailyLimit = 10000; // This should come from user settings
      
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