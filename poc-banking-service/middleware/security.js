const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Rate limiting middleware
 * Prevents abuse by limiting requests per IP
 */
const createRateLimit = (options = {}) => {
  const defaults = {
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    standardHeaders: config.rateLimit.standardHeaders,
    legacyHeaders: config.rateLimit.legacyHeaders,
    message: {
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    },
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method
      });
      
      res.status(429).json(options.message || defaults.message);
    }
  };

  return rateLimit({ ...defaults, ...options });
};

// General API rate limiting
const generalRateLimit = createRateLimit();

// Stricter rate limiting for authentication endpoints
const authRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many authentication attempts',
    message: 'Too many login attempts. Please try again in 15 minutes.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED'
  }
});

// Rate limiting for sensitive banking operations
const bankingRateLimit = createRateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // Limit sensitive operations
  message: {
    error: 'Too many banking operations',
    message: 'Too many banking operations. Please wait before trying again.',
    code: 'BANKING_RATE_LIMIT_EXCEEDED'
  }
});

/**
 * Request sanitization middleware
 * Cleans and validates incoming requests
 */
const sanitizeInput = (req, res, next) => {
  try {
    // Remove potentially dangerous characters from string inputs
    const sanitizeString = (str) => {
      if (typeof str !== 'string') return str;
      
      return str
        .replace(/[<>]/g, '') // Remove angle brackets
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/on\w+=/gi, '') // Remove event handlers
        .trim();
    };

    // Recursively sanitize object properties
    const sanitizeObject = (obj) => {
      if (obj === null || typeof obj !== 'object') {
        return typeof obj === 'string' ? sanitizeString(obj) : obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      }

      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[sanitizeString(key)] = sanitizeObject(value);
      }
      return sanitized;
    };

    // Sanitize request body
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }

    // Sanitize URL parameters
    if (req.params) {
      req.params = sanitizeObject(req.params);
    }

    next();
  } catch (error) {
    logger.error('Input sanitization failed', {
      error: error.message,
      path: req.path,
      method: req.method
    });

    res.status(400).json({
      error: 'Invalid request format',
      message: 'Request could not be processed due to invalid input',
      code: 'INVALID_INPUT'
    });
  }
};

/**
 * Request validation middleware
 * Validates request structure and required fields
 */
const validateRequest = (req, res, next) => {
  // Check content type for POST/PUT requests
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.get('Content-Type');
    
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(400).json({
        error: 'Invalid content type',
        message: 'Content-Type must be application/json',
        code: 'INVALID_CONTENT_TYPE'
      });
    }
  }

  // Validate request size
  const contentLength = req.get('Content-Length');
  if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) { // 10MB limit
    return res.status(413).json({
      error: 'Request too large',
      message: 'Request body exceeds maximum size limit',
      code: 'REQUEST_TOO_LARGE'
    });
  }

  next();
};

/**
 * Security headers middleware
 * Adds additional security headers beyond helmet
 */
const securityHeaders = (req, res, next) => {
  // Add custom security headers
  res.setHeader('X-Banking-Service', 'POC-Banking-v1.0');
  res.setHeader('X-Request-ID', req.id || 'unknown');
  
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  next();
};

/**
 * IP whitelist middleware (for admin endpoints)
 * @param {Array} allowedIPs - Array of allowed IP addresses
 */
const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    // Allow localhost in development
    const devIPs = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
    const allowedList = [...allowedIPs, ...(process.env.NODE_ENV === 'development' ? devIPs : [])];
    
    if (!allowedList.includes(clientIP)) {
      logger.warn('IP access denied', {
        ip: clientIP,
        path: req.path,
        userAgent: req.get('User-Agent')
      });

      return res.status(403).json({
        error: 'Access forbidden',
        message: 'Your IP address is not authorized to access this resource',
        code: 'IP_NOT_ALLOWED'
      });
    }

    next();
  };
};

module.exports = {
  generalRateLimit,
  authRateLimit,
  bankingRateLimit,
  sanitizeInput,
  validateRequest,
  securityHeaders,
  ipWhitelist,
  createRateLimit
};