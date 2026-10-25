const logger = require('../utils/logger');
const messages = {
  400: 'The request is invalid.', 401: 'Authentication is required.', 403: 'This operation is not permitted.',
  404: 'The requested resource was not found.', 409: 'The request conflicts with the current resource state.',
  413: 'The request exceeds its size limit.', 422: 'The request does not meet the input contract.',
  429: 'Too many requests. Please try again later.'
};
const safeStatus = status => Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
const mutation = req => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
const reconciliation = (service, req) => {
  const key = req.get?.('Idempotency-Key') || req.headers?.['idempotency-key'];
  if (service !== 'banking' || !mutation(req) || typeof key !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9:_.-]{0,127}$/.test(key)
    || !/^\/api\/banking\/v1\/(accounts|cards|transfers|transactions|fraud|disputes)(\/|$)/.test(req.originalUrl || '')) return {};
  return { reconciliationReference: key, reconcilePath: `/api/banking/v1/mutation-status/${encodeURIComponent(key)}` };
};

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log error
  const statusCode = safeStatus(err.statusCode || err.status);
  logger.error('Error occurred', { method: req.method, statusCode });

  // Determine status code

  // Prepare error response
  const errorResponse = {
    error: statusCode >= 500 ? 'ServiceUnavailable' : 'RequestRejected',
    message: messages[statusCode] || 'A required service is unavailable. Check the owning service before repeating a state-changing request.',
    timestamp: new Date().toISOString(),
    outcome: statusCode >= 500 && mutation(req) ? 'uncertain' : 'failed'
  };


  res.status(statusCode).json(errorResponse);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res) => {
  logger.warn('Route not found', { method: req.method, statusCode: 404 });

  res.status(404).json({
    error: 'NotFound',
    message: messages[404],
    timestamp: new Date().toISOString(),
    outcome: 'failed'
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
  const statusCode = ['ECONNREFUSED', 'ENOTFOUND'].includes(error.code) ? 503
    : ['ETIMEDOUT', 'ECONNABORTED'].includes(error.code) ? 504
    : Number.isInteger(error.response?.status) ? safeStatus(error.response.status) : 502;
  logger.error('Service communication error', { method: req.method, statusCode });
  const service = ['chat-backend', 'banking', 'mcp', 'nlu', 'nlp', 'ai-orchestrator'].includes(serviceName) ? serviceName : 'upstream';
  return { statusCode, error: statusCode >= 500 ? 'ServiceUnavailable' : 'RequestRejected',
    message: messages[statusCode] || 'The upstream response is unavailable. Check the owning service before repeating a state-changing request.',
    service, outcome: statusCode >= 500 && mutation(req) ? 'uncertain' : 'failed',
    ...(statusCode >= 500 ? reconciliation(service, req) : {}) };
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
