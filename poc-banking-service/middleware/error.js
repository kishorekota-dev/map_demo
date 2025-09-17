const logger = require('../utils/logger');

/**
 * Global error handling middleware
 * Catches and handles all application errors
 */
const errorHandler = (err, req, res, next) => {
  // Log the error details
  logger.error('Application error occurred', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Default error response
  let status = 500;
  let response = {
    error: 'Internal server error',
    message: 'An unexpected error occurred',
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
    requestId: req.id || 'unknown'
  };

  // Handle specific error types
  if (err.name === 'ValidationError') {
    status = 400;
    response = {
      error: 'Validation error',
      message: err.message,
      code: 'VALIDATION_ERROR',
      details: err.details || []
    };
  } else if (err.name === 'CastError') {
    status = 400;
    response = {
      error: 'Invalid data format',
      message: 'Invalid ID format or data type',
      code: 'INVALID_FORMAT'
    };
  } else if (err.name === 'JsonWebTokenError') {
    status = 401;
    response = {
      error: 'Authentication error',
      message: 'Invalid authentication token',
      code: 'INVALID_TOKEN'
    };
  } else if (err.name === 'TokenExpiredError') {
    status = 401;
    response = {
      error: 'Authentication error',
      message: 'Authentication token has expired',
      code: 'TOKEN_EXPIRED'
    };
  } else if (err.code === 'ECONNREFUSED') {
    status = 503;
    response = {
      error: 'Service unavailable',
      message: 'Unable to connect to required services',
      code: 'SERVICE_UNAVAILABLE'
    };
  } else if (err.code === 'ENOTFOUND') {
    status = 503;
    response = {
      error: 'Service unavailable',
      message: 'Required service not found',
      code: 'SERVICE_NOT_FOUND'
    };
  } else if (err.name === 'TimeoutError') {
    status = 504;
    response = {
      error: 'Request timeout',
      message: 'The request took too long to process',
      code: 'REQUEST_TIMEOUT'
    };
  } else if (err.status && err.message) {
    // Handle HTTP errors with status codes
    status = err.status;
    response = {
      error: err.message,
      message: err.details || err.message,
      code: err.code || 'HTTP_ERROR'
    };
  }

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production') {
    delete response.stack;
    if (status === 500) {
      response.message = 'An unexpected error occurred';
    }
  } else {
    // Include stack trace in development
    response.stack = err.stack;
  }

  res.status(status).json(response);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res) => {
  logger.warn('Route not found', {
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`,
    code: 'ROUTE_NOT_FOUND',
    timestamp: new Date().toISOString(),
    availableRoutes: {
      accounts: '/api/accounts',
      transactions: '/api/transactions',
      cards: '/api/cards',
      transfers: '/api/transfers',
      fraud: '/api/fraud',
      disputes: '/api/disputes',
      health: '/health'
    }
  });
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch promise rejections
 */
const asyncErrorHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Business logic error classes
 */
class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

class ServiceUnavailableError extends AppError {
  constructor(service = 'Service') {
    super(`${service} is currently unavailable`, 503, 'SERVICE_UNAVAILABLE');
  }
}

/**
 * Banking-specific error classes
 */
class InsufficientFundsError extends AppError {
  constructor(available, requested) {
    super('Insufficient funds for transaction', 400, 'INSUFFICIENT_FUNDS');
    this.available = available;
    this.requested = requested;
  }
}

class DailyLimitExceededError extends AppError {
  constructor(limit, spent, requested) {
    super('Daily transaction limit exceeded', 400, 'DAILY_LIMIT_EXCEEDED');
    this.dailyLimit = limit;
    this.dailySpent = spent;
    this.requested = requested;
  }
}

class AccountBlockedError extends AppError {
  constructor(accountId) {
    super('Account is currently blocked', 403, 'ACCOUNT_BLOCKED');
    this.accountId = accountId;
  }
}

class FraudDetectedError extends AppError {
  constructor(reason) {
    super('Transaction flagged for potential fraud', 403, 'FRAUD_DETECTED');
    this.reason = reason;
  }
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncErrorHandler,
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  ServiceUnavailableError,
  InsufficientFundsError,
  DailyLimitExceededError,
  AccountBlockedError,
  FraudDetectedError
};