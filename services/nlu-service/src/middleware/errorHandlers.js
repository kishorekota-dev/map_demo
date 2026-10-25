/**
 * Error handling middleware
 */

const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  const status = Number.isInteger(err.status) && err.status >= 400 && err.status <= 599 ? err.status : 500;
  res.status(status).json({
    success: false,
    error: 'Request could not be completed'
  });
};

const notFoundHandler = (req, res) => {
  logger.warn('Route not found', {
    path: req.path,
    method: req.method
  });

  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
};

module.exports = {
  errorHandler,
  notFoundHandler
};
