const logger = require('../utils/logger');

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log error
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.userId,
    requestId: req.id
  });

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  // Prepare error response
  const errorResponse = {
    error: err.name || 'InternalServerError',
    message: err.message || 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
    path: req.path,
    requestId: req.id
  };

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }

  // Add validation errors if present
  if (err.errors) {
    errorResponse.errors = err.errors;
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res) => {
  logger.warn('Route not found', {
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  res.status(404).json({
    error: 'NotFound',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString(),
    path: req.path
  });
};

/**
 * Async route wrapper to catch errors
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Service error handler for proxy errors
 */
const serviceErrorHandler = (error, serviceName, req) => {
  logger.error('Service communication error', {
    service: serviceName,
    error: error.message,
    path: req.path,
    method: req.method,
    code: error.code
  });

  if (error.code === 'ECONNREFUSED') {
    return {
      statusCode: 503,
      error: 'ServiceUnavailable',
      message: `The ${serviceName} service is currently unavailable. Please try again later.`,
      service: serviceName
    };
  }

  if (error.code === 'ETIMEDOUT') {
    return {
      statusCode: 504,
      error: 'GatewayTimeout',
      message: `Request to ${serviceName} service timed out. Please try again.`,
      service: serviceName
    };
  }

  if (error.response) {
    return {
      statusCode: error.response.status,
      error: error.response.data?.error || 'ServiceError',
      message: error.response.data?.message || 'An error occurred while processing your request',
      service: serviceName,
      details: error.response.data
    };
  }

  return {
    statusCode: 500,
    error: 'ServiceError',
    message: 'An unexpected error occurred while communicating with the service',
    service: serviceName
  };
};

/**
 * Custom error classes
 */
class ValidationError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.errors = errors;
  }
}

class AuthenticationError extends Error {
  constructor(message = 'Authentication failed') {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = 401;
  }
}

class AuthorizationError extends Error {
  constructor(message = 'Access denied') {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = 403;
  }
}

class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

class ServiceUnavailableError extends Error {
  constructor(service, message = 'Service is currently unavailable') {
    super(message);
    this.name = 'ServiceUnavailableError';
    this.statusCode = 503;
    this.service = service;
  }
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  serviceErrorHandler,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ServiceUnavailableError
};
