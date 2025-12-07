const logger = require('../utils/logger');

/**
 * Async handler wrapper
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * 404 handler
 */
const notFoundHandler = (req, res) => {
  logger.warn('Route not found', {
    path: req.originalUrl,
    method: req.method,
    ip: req.ip
  });

  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl
  });
};

/**
 * Global error handler
 */
const errorHandler = (err, req, res, next) => {
  logger.error('Global error handler', {
    error: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method
  });

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = {
  asyncHandler,
  notFoundHandler,
  errorHandler
};
