/**
 * Enhanced API Debug Logger Middleware
 * Comprehensive debugging and tracing for all backend API routes
 * Provides detailed request/response logging, performance monitoring, and security tracking
 */

const crypto = require('crypto');
const util = require('util');

/**
 * API Debug Logger Class
 * Centralized debug logging for backend API with structured output
 */
class APIDebugLogger {
  constructor(component = 'BACKEND-API') {
    this.component = component;
    this.isDebugEnabled = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';
    this.logLevel = process.env.LOG_LEVEL || 'INFO';
    this.logDatabase = process.env.LOG_DATABASE === 'true';
    this.logRequests = process.env.LOG_REQUESTS === 'true' || this.isDebugEnabled;
    this.logResponses = process.env.LOG_RESPONSES === 'true' || this.isDebugEnabled;
    this.sanitizeSensitiveData = process.env.SANITIZE_LOGS !== 'false';
  }

  /**
   * Format timestamp for logs
   */
  formatTimestamp() {
    return new Date().toISOString();
  }

  /**
   * Format log message with component and context
   */
  formatMessage(level, message, context = {}) {
    const timestamp = this.formatTimestamp();
    const baseMessage = `[${level}] ${timestamp} - [${this.component}] ${message}`;
    
    if (Object.keys(context).length > 0) {
      return `${baseMessage}\nContext: ${JSON.stringify(context, null, 2)}`;
    }
    
    return baseMessage;
  }

  /**
   * Sanitize sensitive data from logs
   */
  sanitizeData(obj) {
    if (!this.sanitizeSensitiveData || !obj || typeof obj !== 'object') {
      return obj;
    }

    const sensitiveFields = [
      'password', 'newPassword', 'currentPassword', 'confirmPassword',
      'ssn', 'social_security_number', 'tax_id', 'ein',
      'account_number', 'routing_number', 'iban',
      'card_number', 'cvv', 'cvc', 'pin', 'security_code',
      'token', 'jwt', 'authorization', 'auth', 'bearer',
      'cookie', 'session', 'csrf', 'api_key', 'secret',
      'credit_score', 'income', 'salary', 'net_worth',
      'phone_number', 'email', 'date_of_birth', 'dob'
    ];

    const sanitized = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveFields.some(field => lowerKey.includes(field));

      if (isSensitive) {
        if (typeof value === 'string') {
          if (value.length <= 4) {
            sanitized[key] = '[SANITIZED]';
          } else {
            sanitized[key] = `${value.substring(0, 2)}${'*'.repeat(value.length - 4)}${value.substring(value.length - 2)}`;
          }
        } else {
          sanitized[key] = '[SANITIZED]';
        }
      } else if (value && typeof value === 'object') {
        sanitized[key] = this.sanitizeData(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `REQ-${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Extract client information from request
   */
  extractClientInfo(req) {
    const forwarded = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    const clientIp = forwarded ? forwarded.split(',')[0] : (realIp || req.connection.remoteAddress);
    
    return {
      ip: clientIp,
      userAgent: req.headers['user-agent'],
      origin: req.headers.origin,
      referer: req.headers.referer,
      acceptLanguage: req.headers['accept-language'],
      contentType: req.headers['content-type'],
      contentLength: req.headers['content-length']
    };
  }

  /**
   * Check if logging is enabled for the given level
   */
  shouldLog(level) {
    const levels = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
    const currentLevel = levels[this.logLevel] || 2;
    const messageLevel = levels[level] || 2;
    return messageLevel <= currentLevel;
  }

  /**
   * Log debug messages
   */
  debug(message, context = {}) {
    if (this.isDebugEnabled && this.shouldLog('DEBUG')) {
      console.log(this.formatMessage('DEBUG', message, context));
    }
  }

  /**
   * Log info messages
   */
  info(message, context = {}) {
    if (this.shouldLog('INFO')) {
      console.log(this.formatMessage('INFO', message, context));
    }
  }

  /**
   * Log warning messages
   */
  warn(message, context = {}) {
    if (this.shouldLog('WARN')) {
      console.warn(this.formatMessage('WARN', message, context));
    }
  }

  /**
   * Log error messages
   */
  error(message, context = {}) {
    if (this.shouldLog('ERROR')) {
      console.error(this.formatMessage('ERROR', message, context));
    }
  }

  /**
   * Log performance metrics
   */
  performance(message, duration, context = {}) {
    const perfContext = {
      ...context,
      duration: `${duration}ms`,
      performance: {
        slow: duration > 1000,
        acceptable: duration <= 1000 && duration > 500,
        fast: duration <= 500
      }
    };

    if (duration > 2000) {
      this.warn(`SLOW REQUEST: ${message}`, perfContext);
    } else if (duration > 1000) {
      this.info(`MODERATE REQUEST: ${message}`, perfContext);
    } else if (this.isDebugEnabled) {
      this.debug(`FAST REQUEST: ${message}`, perfContext);
    }
  }

  /**
   * Log security events
   */
  security(event, details = {}) {
    this.warn(`SECURITY EVENT: ${event}`, {
      securityEvent: event,
      timestamp: this.formatTimestamp(),
      ...this.sanitizeData(details)
    });
  }

  /**
   * Log database operations
   */
  database(operation, details = {}) {
    if (this.logDatabase || this.isDebugEnabled) {
      this.debug(`DATABASE: ${operation}`, {
        dbOperation: operation,
        ...this.sanitizeData(details)
      });
    }
  }

  /**
   * Log authentication events
   */
  auth(event, details = {}) {
    this.info(`AUTH: ${event}`, {
      authEvent: event,
      timestamp: this.formatTimestamp(),
      ...this.sanitizeData(details)
    });
  }

  /**
   * Log API route access
   */
  route(method, path, details = {}) {
    if (this.isDebugEnabled) {
      this.debug(`ROUTE ACCESS: ${method} ${path}`, {
        method,
        path,
        ...this.sanitizeData(details)
      });
    }
  }

  /**
   * Log validation errors
   */
  validation(error, details = {}) {
    this.warn(`VALIDATION ERROR: ${error}`, {
      validationError: error,
      ...this.sanitizeData(details)
    });
  }

  /**
   * Log business logic operations
   */
  business(operation, details = {}) {
    if (this.isDebugEnabled) {
      this.debug(`BUSINESS LOGIC: ${operation}`, {
        businessOperation: operation,
        ...this.sanitizeData(details)
      });
    }
  }

  /**
   * Log external API calls
   */
  external(service, operation, details = {}) {
    this.info(`EXTERNAL API: ${service} - ${operation}`, {
      externalService: service,
      operation,
      ...this.sanitizeData(details)
    });
  }
}

// Global API debug logger instance
const apiDebugLogger = new APIDebugLogger();

/**
 * Enhanced API Debug Middleware
 * Comprehensive request/response logging with performance monitoring
 */
const apiDebugMiddleware = (req, res, next) => {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] || apiDebugLogger.generateRequestId();
  
  // Add request ID to request object
  req.requestId = requestId;
  req.debugLogger = apiDebugLogger;
  
  // Add request ID to response headers
  res.setHeader('X-Request-ID', requestId);
  
  const clientInfo = apiDebugLogger.extractClientInfo(req);
  
  // Log incoming request
  if (apiDebugLogger.logRequests) {
    const requestData = {
      requestId,
      method: req.method,
      url: req.originalUrl,
      path: req.path,
      query: apiDebugLogger.sanitizeData(req.query),
      body: apiDebugLogger.sanitizeData(req.body),
      headers: {
        'content-type': req.headers['content-type'],
        'content-length': req.headers['content-length'],
        'authorization': req.headers.authorization ? '[SANITIZED]' : undefined,
        'user-agent': req.headers['user-agent'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-real-ip': req.headers['x-real-ip']
      },
      client: clientInfo,
      timestamp: apiDebugLogger.formatTimestamp()
    };
    
    apiDebugLogger.info(`Incoming request: ${req.method} ${req.originalUrl}`, requestData);
  }

  // Store original methods
  const originalJson = res.json;
  const originalSend = res.send;
  const originalEnd = res.end;

  // Override res.json to log response
  res.json = function(body) {
    const duration = Date.now() - startTime;
    
    if (apiDebugLogger.logResponses) {
      const responseData = {
        requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        responseSize: JSON.stringify(body).length,
        timestamp: apiDebugLogger.formatTimestamp()
      };
      
      if (res.statusCode >= 400) {
        apiDebugLogger.error(`Request failed: ${req.method} ${req.originalUrl}`, responseData);
      } else if (res.statusCode >= 300) {
        apiDebugLogger.warn(`Request redirected: ${req.method} ${req.originalUrl}`, responseData);
      } else {
        apiDebugLogger.info(`Request completed: ${req.method} ${req.originalUrl}`, responseData);
      }
    }
    
    // Log performance
    apiDebugLogger.performance(`${req.method} ${req.originalUrl}`, duration, { requestId });
    
    return originalJson.call(this, body);
  };

  // Override res.send to log response
  res.send = function(body) {
    const duration = Date.now() - startTime;
    
    if (apiDebugLogger.logResponses) {
      const responseData = {
        requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        responseSize: typeof body === 'string' ? body.length : JSON.stringify(body).length,
        timestamp: apiDebugLogger.formatTimestamp()
      };
      
      if (res.statusCode >= 400) {
        apiDebugLogger.error(`Request failed: ${req.method} ${req.originalUrl}`, responseData);
      } else {
        apiDebugLogger.info(`Request completed: ${req.method} ${req.originalUrl}`, responseData);
      }
    }
    
    // Log performance
    apiDebugLogger.performance(`${req.method} ${req.originalUrl}`, duration, { requestId });
    
    return originalSend.call(this, body);
  };

  // Monitor for security events
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    // Security monitoring
    if (res.statusCode === 401) {
      apiDebugLogger.security('Authentication failure', {
        requestId,
        url: req.originalUrl,
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent
      });
    }
    
    if (res.statusCode === 403) {
      apiDebugLogger.security('Access denied', {
        requestId,
        url: req.originalUrl,
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent
      });
    }
    
    if (res.statusCode === 429) {
      apiDebugLogger.security('Rate limit exceeded', {
        requestId,
        url: req.originalUrl,
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent
      });
    }
    
    // Detect suspicious patterns
    if (duration < 10 && req.method === 'POST' && req.originalUrl.includes('auth')) {
      apiDebugLogger.security('Suspiciously fast auth request', {
        requestId,
        url: req.originalUrl,
        duration: `${duration}ms`,
        ip: clientInfo.ip
      });
    }
    
    // Monitor for potential attacks
    if (req.originalUrl.includes('../') || req.originalUrl.includes('..\\')) {
      apiDebugLogger.security('Path traversal attempt detected', {
        requestId,
        url: req.originalUrl,
        ip: clientInfo.ip
      });
    }
    
    if (req.headers['user-agent'] && req.headers['user-agent'].toLowerCase().includes('bot')) {
      apiDebugLogger.security('Bot detected', {
        requestId,
        url: req.originalUrl,
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent
      });
    }
  });

  next();
};

/**
 * Route-specific debug logger factory
 * Creates debug loggers for specific routes with context
 */
const createRouteDebugLogger = (routeName) => {
  return new APIDebugLogger(`${routeName.toUpperCase()}-ROUTE`);
};

/**
 * Database operation debug logger
 */
const logDatabaseOperation = (operation, query, params = [], duration = 0) => {
  apiDebugLogger.database(`${operation} - ${duration}ms`, {
    query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
    paramCount: params.length,
    duration: `${duration}ms`
  });
};

/**
 * Authentication event logger
 */
const logAuthEvent = (event, userId, details = {}) => {
  apiDebugLogger.auth(event, {
    userId: userId || 'unknown',
    ...details
  });
};

/**
 * Business operation logger
 */
const logBusinessOperation = (operation, details = {}) => {
  apiDebugLogger.business(operation, details);
};

/**
 * Error correlation logger
 */
const logError = (error, context = {}) => {
  apiDebugLogger.error(`${error.name}: ${error.message}`, {
    errorName: error.name,
    errorMessage: error.message,
    errorStack: error.stack,
    ...context
  });
};

/**
 * Performance monitoring decorator
 */
const withPerformanceLogging = (fn, operationName) => {
  return async (...args) => {
    const startTime = Date.now();
    try {
      const result = await fn(...args);
      const duration = Date.now() - startTime;
      apiDebugLogger.performance(operationName, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      apiDebugLogger.error(`${operationName} failed after ${duration}ms`, {
        operation: operationName,
        duration: `${duration}ms`,
        error: error.message
      });
      throw error;
    }
  };
};

module.exports = {
  APIDebugLogger,
  apiDebugLogger,
  apiDebugMiddleware,
  createRouteDebugLogger,
  logDatabaseOperation,
  logAuthEvent,
  logBusinessOperation,
  logError,
  withPerformanceLogging
};
