/**
 * Error Handling Middleware
 * Provides centralized error handling for the application
 */

const logger = require('../utils/logger');
const config = require('../config');

/**
 * 404 Not Found Handler
 */
const notFoundHandler = (req, res, next) => {
  const error = {
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    statusCode: 404,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  };

  logger.warn('Route not found', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json(error);
};

/**
 * Global Error Handler
 */
const errorHandler = (err, req, res, next) => {
  // Default error response
  let error = {
    success: false,
    message: 'Internal Server Error',
    statusCode: 500,
    timestamp: new Date().toISOString()
  };

  // Handle different error types
  if (err.name === 'ValidationError') {
    error = {
      ...error,
      message: 'Validation Error',
      statusCode: 400,
      details: err.details || err.message
    };
  } else if (err.name === 'UnauthorizedError') {
    error = {
      ...error,
      message: 'Unauthorized',
      statusCode: 401
    };
  } else if (err.name === 'ForbiddenError') {
    error = {
      ...error,
      message: 'Forbidden',
      statusCode: 403
    };
  } else if (err.statusCode || err.status) {
    error = {
      ...error,
      message: err.message || error.message,
      statusCode: err.statusCode || err.status
    };
  } else if (err.message) {
    error = {
      ...error,
      message: config.isDevelopment ? err.message : 'Internal Server Error'
    };
  }

  // Add stack trace in development
  if (config.isDevelopment && err.stack) {
    error.stack = err.stack;
  }

  // Add request context if available
  if (req) {
    error.requestId = req.headers['x-request-id'];
    error.path = req.originalUrl;
    error.method = req.method;
  }

  // Log the error
  logger.logError(err, req);

  // Send error response
  res.status(error.statusCode).json(error);
};

/**
 * Async Error Wrapper
 * Wraps async route handlers to catch errors
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Rate Limit Error Handler
 */
const rateLimitHandler = (req, res) => {
  const error = {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    statusCode: 429,
    timestamp: new Date().toISOString(),
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000)
  };

  logger.warn('Rate limit exceeded', {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    path: req.originalUrl
  });

  res.status(429).json(error);
};

module.exports = {
  notFoundHandler,
  errorHandler,
  asyncHandler,
  rateLimitHandler
};