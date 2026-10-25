const logger = require('../utils/logger');

/**
 * Global error handling middleware
 * Catches and handles all application errors
 */
const errorHandler = (err, req, res, next) => {
  const known = {
    VALIDATION_ERROR: [400, 'Validation error', 'One or more fields are invalid.'],
    NOT_FOUND: [404, 'Not found', 'The requested resource was not found.'],
    UNAUTHORIZED: [401, 'Authentication error', 'A valid access token is required.'],
    FORBIDDEN: [403, 'Access forbidden', 'This operation is not permitted.'],
    CONFLICT: [409, 'Resource conflict', 'The request conflicts with the current resource state.'],
    SERVICE_UNAVAILABLE: [503, 'Service unavailable', 'A required service is unavailable.'],
    INSUFFICIENT_FUNDS: [400, 'Transaction declined', 'Insufficient funds for transaction.'],
    DAILY_LIMIT_EXCEEDED: [400, 'Transaction declined', 'The daily transaction limit was exceeded.'],
    ACCOUNT_BLOCKED: [403, 'Account unavailable', 'The account is currently blocked.'],
    FRAUD_DETECTED: [403, 'Transaction declined', 'The transaction requires a security review.']
  };
  const byName = {
    ValidationError: ['VALIDATION_ERROR', 400, 'Validation error', 'One or more fields are invalid.'],
    CastError: ['INVALID_FORMAT', 400, 'Invalid data format', 'Invalid identifier or data type.'],
    JsonWebTokenError: ['INVALID_TOKEN', 401, 'Authentication error', 'Invalid authentication token.'],
    TokenExpiredError: ['TOKEN_EXPIRED', 401, 'Authentication error', 'The authentication token has expired.'],
    TimeoutError: ['REQUEST_TIMEOUT', 504, 'Request timeout', 'The request took too long to process.']
  };
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let title = 'Internal server error';
  let message = 'An unexpected error occurred.';
  if (Object.hasOwn(known, err.code)) {
    [status, title, message] = known[err.code];
    code = err.code;
  } else if (Object.hasOwn(byName, err.name)) {
    [code, status, title, message] = byName[err.name];
  } else if (['ECONNREFUSED', 'ENOTFOUND'].includes(err.code)) {
    status = 503; code = 'SERVICE_UNAVAILABLE'; title = 'Service unavailable'; message = 'A required service is unavailable.';
  } else {
    const suppliedStatus = Number.isInteger(err.statusCode) ? err.statusCode : err.status;
    if (Number.isInteger(suppliedStatus) && suppliedStatus >= 400 && suppliedStatus <= 599) {
      status = suppliedStatus; code = 'HTTP_ERROR'; title = 'Request failed'; message = 'The request could not be completed.';
    }
  }
  // Error objects can contain SQL, credentials and provider bodies in any environment.
  logger.error('Application error occurred', { method: req.method, statusCode: status });
  const response = { error: title, message, code, timestamp: new Date().toISOString(), requestId: 'unknown' };
  res.status(status).json(response);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res) => {
  logger.warn('Route not found', { method: req.method, statusCode: 404 });

  res.status(404).json({
    error: 'Not found',
    message: 'The requested route was not found.',
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