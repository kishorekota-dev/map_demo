/**
 * Request Logger Middleware
 * Provides comprehensive request logging for the banking API
 * Includes security monitoring, performance tracking, and audit trails
 */

const crypto = require('crypto');

const logger = {
  info: (message, meta = {}) => {
    console.info(`[INFO] ${new Date().toISOString()}: ${message}`, JSON.stringify(meta, null, 2));
  },
  warn: (message, meta = {}) => {
    console.warn(`[WARN] ${new Date().toISOString()}: ${message}`, JSON.stringify(meta, null, 2));
  },
  error: (message, meta = {}) => {
    console.error(`[ERROR] ${new Date().toISOString()}: ${message}`, JSON.stringify(meta, null, 2));
  }
};

/**
 * Generate unique request ID
 */
const generateRequestId = () => {
  return crypto.randomBytes(16).toString('hex');
};

/**
 * Sanitize sensitive data from logs
 */
const sanitizeData = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sensitiveFields = [
    'password', 'ssn', 'social_security_number', 'tax_id',
    'account_number', 'routing_number', 'card_number', 'cvv',
    'pin', 'token', 'authorization', 'cookie', 'session',
    'credit_score', 'income', 'phone_number', 'email'
  ];
  
  const sanitized = { ...obj };
  
  const sanitizeValue = (value, key) => {
    if (typeof value === 'string') {
      const lowerKey = key.toLowerCase();
      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        return value.length > 4 ? 
          `${value.substring(0, 2)}${'*'.repeat(value.length - 4)}${value.substring(value.length - 2)}` :
          '***';
      }
    } else if (typeof value === 'object' && value !== null) {
      return sanitizeData(value);
    }
    return value;
  };
  
  for (const [key, value] of Object.entries(sanitized)) {
    sanitized[key] = sanitizeValue(value, key);
  }
  
  return sanitized;
};

/**
 * Extract client information
 */
const extractClientInfo = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const clientIp = forwarded ? forwarded.split(',')[0] : (realIp || req.connection.remoteAddress);
  
  return {
    ip: clientIp,
    userAgent: req.headers['user-agent'],
    origin: req.headers.origin,
    referer: req.headers.referer,
    acceptLanguage: req.headers['accept-language']
  };
};

/**
 * Main request logger middleware
 */
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] || generateRequestId();
  
  // Add request ID to request object
  req.id = requestId;
  
  // Add request ID to response headers
  res.setHeader('X-Request-ID', requestId);
  
  const clientInfo = extractClientInfo(req);
  
  // Log incoming request
  const requestData = {
    requestId,
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    query: sanitizeData(req.query),
    body: sanitizeData(req.body),
    headers: {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length'],
      'authorization': req.headers.authorization ? '***' : undefined,
      'user-agent': req.headers['user-agent']
    },
    client: clientInfo,
    timestamp: new Date().toISOString()
  };
  
  logger.info('Incoming request', requestData);
  
  // Capture original res.json method
  const originalJson = res.json;
  const originalSend = res.send;
  
  // Override res.json to log response
  res.json = function(body) {
    const duration = Date.now() - startTime;
    
    const responseData = {
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      responseSize: JSON.stringify(body).length,
      timestamp: new Date().toISOString()
    };
    
    // Log response (without body content for security)
    if (res.statusCode >= 400) {
      logger.error('Request failed', responseData);
    } else if (res.statusCode >= 300) {
      logger.warn('Request redirected', responseData);
    } else {
      logger.info('Request completed', responseData);
    }
    
    // Performance monitoring
    if (duration > 5000) {
      logger.warn('Slow request detected', {
        requestId,
        url: req.originalUrl,
        duration: `${duration}ms`
      });
    }
    
    return originalJson.call(this, body);
  };
  
  // Override res.send to log response
  res.send = function(body) {
    const duration = Date.now() - startTime;
    
    const responseData = {
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      responseSize: typeof body === 'string' ? body.length : JSON.stringify(body).length,
      timestamp: new Date().toISOString()
    };
    
    // Log response
    if (res.statusCode >= 400) {
      logger.error('Request failed', responseData);
    } else if (res.statusCode >= 300) {
      logger.warn('Request redirected', responseData);
    } else {
      logger.info('Request completed', responseData);
    }
    
    return originalSend.call(this, body);
  };
  
  // Log when request is finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    // Security monitoring - detect suspicious patterns
    if (duration < 10 && req.method === 'POST') {
      logger.warn('Suspiciously fast POST request', {
        requestId,
        url: req.originalUrl,
        duration: `${duration}ms`,
        ip: clientInfo.ip
      });
    }
    
    // Monitor failed authentication attempts
    if (res.statusCode === 401 && req.originalUrl.includes('auth')) {
      logger.warn('Authentication failure', {
        requestId,
        url: req.originalUrl,
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent
      });
    }
    
    // Monitor potential attacks
    if (res.statusCode === 403) {
      logger.warn('Access denied', {
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
 * Security event logger
 */
const logSecurityEvent = (event, details = {}) => {
  logger.warn(`Security event: ${event}`, {
    event,
    timestamp: new Date().toISOString(),
    ...details
  });
};

/**
 * Audit logger for financial transactions
 */
const auditLogger = (action, details = {}) => {
  logger.info(`Audit: ${action}`, {
    action,
    timestamp: new Date().toISOString(),
    ...sanitizeData(details)
  });
};

/**
 * Error correlation middleware
 */
const errorCorrelation = (err, req, res, next) => {
  const requestId = req.id || 'unknown';
  
  logger.error('Error correlation', {
    requestId,
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method
  });
  
  next(err);
};

module.exports = {
  requestLogger,
  logSecurityEvent,
  auditLogger,
  errorCorrelation,
  logger
};
