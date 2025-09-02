/**
 * Enterprise Error Handler Middleware
 * Provides comprehensive error handling for the banking API
 * Includes security, logging, and production-ready error responses
 */

const logger = {
  error: (message, meta = {}) => {
    console.error(`[ERROR] ${new Date().toISOString()}: ${message}`, meta);
  },
  warn: (message, meta = {}) => {
    console.warn(`[WARN] ${new Date().toISOString()}: ${message}`, meta);
  },
  info: (message, meta = {}) => {
    console.info(`[INFO] ${new Date().toISOString()}: ${message}`, meta);
  }
};

/**
 * Custom error class for application-specific errors
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error response formatter
 */
const formatErrorResponse = (err, req) => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  const baseResponse = {
    status: 'error',
    message: err.message || 'An error occurred',
    code: err.code || 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
    requestId: req.id || req.headers['x-request-id'] || 'unknown'
  };

  // Include stack trace only in development
  if (!isProduction && err.stack) {
    baseResponse.stack = err.stack;
  }

  return baseResponse;
};

/**
 * Handle specific error types
 */
const handleDatabaseError = (err) => {
  let message = 'Database operation failed';
  let statusCode = 500;
  let code = 'DATABASE_ERROR';

  // PostgreSQL specific errors
  if (err.code) {
    switch (err.code) {
      case '23505': // Unique violation
        message = 'Resource already exists';
        statusCode = 409;
        code = 'DUPLICATE_RESOURCE';
        break;
      case '23503': // Foreign key violation
        message = 'Referenced resource not found';
        statusCode = 400;
        code = 'INVALID_REFERENCE';
        break;
      case '23502': // Not null violation
        message = 'Required field missing';
        statusCode = 400;
        code = 'MISSING_REQUIRED_FIELD';
        break;
      case '42P01': // Table does not exist
        message = 'Database configuration error';
        statusCode = 500;
        code = 'DATABASE_CONFIG_ERROR';
        break;
      default:
        logger.error('Unhandled database error', { code: err.code, message: err.message });
    }
  }

  return new AppError(message, statusCode, code);
};

const handleJWTError = () => {
  return new AppError('Invalid authentication token', 401, 'INVALID_TOKEN');
};

const handleJWTExpiredError = () => {
  return new AppError('Authentication token expired', 401, 'TOKEN_EXPIRED');
};

const handleValidationError = (err) => {
  const message = 'Invalid input data provided';
  return new AppError(message, 400, 'VALIDATION_ERROR');
};

const handleCastError = (err) => {
  const message = 'Invalid data format provided';
  return new AppError(message, 400, 'INVALID_DATA_FORMAT');
};

/**
 * Security error handler - prevents information leakage
 */
const handleSecurityError = (err, req) => {
  // Log the actual error for internal debugging
  logger.error('Security error occurred', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // Return generic error to client
  return new AppError('Access denied', 403, 'SECURITY_ERROR');
};

/**
 * Rate limiting error handler
 */
const handleRateLimitError = () => {
  return new AppError('Too many requests, please try again later', 429, 'RATE_LIMIT_EXCEEDED');
};

/**
 * Main error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error details
  const errorContext = {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    body: req.body,
    params: req.params,
    query: req.query
  };

  logger.error('Error occurred', {
    error: error.message,
    stack: error.stack,
    context: errorContext
  });

  // Handle specific error types
  if (err.name === 'CastError') {
    error = handleCastError(error);
  } else if (err.name === 'ValidationError') {
    error = handleValidationError(error);
  } else if (err.name === 'JsonWebTokenError') {
    error = handleJWTError();
  } else if (err.name === 'TokenExpiredError') {
    error = handleJWTExpiredError();
  } else if (err.code && typeof err.code === 'string') {
    // Database errors
    if (err.code.startsWith('23') || err.code.startsWith('42')) {
      error = handleDatabaseError(err);
    }
  } else if (err.type === 'security') {
    error = handleSecurityError(err, req);
  } else if (err.type === 'rate-limit') {
    error = handleRateLimitError();
  }

  // Ensure we have an AppError instance
  if (!(error instanceof AppError)) {
    error = new AppError(
      error.message || 'Something went wrong',
      error.statusCode || 500,
      error.code || 'INTERNAL_ERROR'
    );
  }

  // Send error response
  const response = formatErrorResponse(error, req);
  
  res.status(error.statusCode || 500).json(response);
};

/**
 * Handle 404 routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new AppError(
    `Route ${req.originalUrl} not found`,
    404,
    'ROUTE_NOT_FOUND'
  );
  next(error);
};

/**
 * Async error wrapper
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Graceful shutdown handler
 */
const gracefulShutdown = (server) => {
  return (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    
    server.close(() => {
      logger.info('Process terminated');
      process.exit(0);
    });

    // Force close server after 30 seconds
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 30000);
  };
};

module.exports = {
  AppError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  gracefulShutdown,
  logger
};
