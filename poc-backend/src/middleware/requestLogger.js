/**
 * Request Logging Middleware
 * Provides detailed request logging and performance monitoring
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Request Logger Middleware
 * Logs incoming requests with performance metrics
 */
const requestLogger = (req, res, next) => {
  // Generate unique request ID
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);

  // Record start time
  const startTime = Date.now();
  req.startTime = startTime;

  // Log incoming request
  logger.debug('Incoming Request', {
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    timestamp: new Date().toISOString()
  });

  // Override res.end to capture response details
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    // Calculate response time
    const responseTime = Date.now() - startTime;
    res.setHeader('X-Response-Time', `${responseTime}ms`);

    // Log the request with response details
    logger.logRequest(req, res, responseTime);

    // Log performance if monitoring is enabled
    if (config.performance.enabled) {
      logger.logPerformance('HTTP Request', responseTime, {
        requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        contentLength: res.get('Content-Length')
      });
    }

    // Call original end function
    originalEnd.call(this, chunk, encoding);
  };

  next();
};

/**
 * Request Size Monitor
 * Monitors and logs request payload sizes
 */
const requestSizeMonitor = (req, res, next) => {
  const contentLength = parseInt(req.get('Content-Length') || '0', 10);
  
  if (contentLength > 0) {
    logger.debug('Request payload size', {
      requestId: req.headers['x-request-id'],
      contentLength: `${contentLength} bytes`,
      contentType: req.get('Content-Type')
    });

    // Log warning for large payloads
    const maxSize = parseInt(config.server.bodyLimit.replace(/\D/g, ''), 10) * 1024 * 1024; // Convert to bytes
    if (contentLength > maxSize * 0.8) { // 80% of limit
      logger.warn('Large request payload detected', {
        requestId: req.headers['x-request-id'],
        contentLength: `${contentLength} bytes`,
        limit: config.server.bodyLimit,
        percentage: Math.round((contentLength / maxSize) * 100)
      });
    }
  }

  next();
};

/**
 * Security Headers Middleware
 * Adds additional security headers to responses
 */
const securityHeaders = (req, res, next) => {
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Add cache control for API routes
  if (req.originalUrl.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  next();
};

module.exports = {
  requestLogger,
  requestSizeMonitor,
  securityHeaders
};