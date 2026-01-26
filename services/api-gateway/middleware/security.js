const logger = require('../utils/logger');

/**
 * Security middleware for additional protection
 */

/**
 * Request ID middleware
 */
const requestId = (req, res, next) => {
  req.id = req.headers['x-request-id'] || generateId();
  res.setHeader('X-Request-ID', req.id);
  next();
};

/**
 * Remove sensitive headers
 */
const sanitizeHeaders = (req, res, next) => {
  // Remove potentially sensitive headers from client
  delete req.headers['x-powered-by'];
  delete req.headers['server'];
  
  next();
};

/**
 * IP whitelist middleware (if enabled)
 */
const ipWhitelist = (req, res, next) => {
  const whitelist = process.env.IP_WHITELIST?.split(',') || [];
  
  if (whitelist.length === 0) {
    return next(); // Whitelist not configured, allow all
  }

  const clientIp = req.ip || req.connection.remoteAddress;
  
  if (whitelist.includes(clientIp)) {
    return next();
  }

  logger.security('IP blocked', { ip: clientIp, path: req.path });
  
  res.status(403).json({
    error: 'Forbidden',
    message: 'Access denied',
    timestamp: new Date().toISOString()
  });
};

/**
 * API key validation middleware
 */
const apiKeyValidation = (req, res, next) => {
  const requiredApiKey = process.env.API_KEY;
  
  if (!requiredApiKey) {
    return next(); // API key not required
  }

  const providedApiKey = req.headers['x-api-key'];
  
  if (!providedApiKey) {
    logger.security('Missing API key', {
      ip: req.ip,
      path: req.path
    });
    
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'API key required',
      timestamp: new Date().toISOString()
    });
  }

  if (providedApiKey !== requiredApiKey) {
    logger.security('Invalid API key', {
      ip: req.ip,
      path: req.path
    });
    
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key',
      timestamp: new Date().toISOString()
    });
  }

  next();
};

/**
 * Content Security Policy headers
 */
const contentSecurity = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
};

/**
 * Request logging for security audit
 */
const securityAudit = (req, res, next) => {
  const sensitiveRoutes = ['/auth', '/login', '/register', '/password'];
  const isSensitive = sensitiveRoutes.some(route => req.path.includes(route));

  if (isSensitive) {
    logger.security('Sensitive route accessed', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      userId: req.userId
    });
  }

  next();
};

/**
 * Prevent parameter pollution
 */
const preventParameterPollution = (req, res, next) => {
  // Check for duplicate query parameters
  const duplicates = [];
  const seen = new Set();

  for (const key in req.query) {
    if (Array.isArray(req.query[key])) {
      duplicates.push(key);
    }
    seen.add(key);
  }

  if (duplicates.length > 0) {
    logger.warn('Parameter pollution detected', {
      duplicates,
      path: req.path,
      ip: req.ip
    });
  }

  next();
};

/**
 * CORS preflight handler
 */
const handleCorsPreflightpreflight = (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
};

/**
 * Generate unique ID for requests
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Combined security middleware
 */
const securityMiddleware = [
  requestId,
  sanitizeHeaders,
  contentSecurity,
  securityAudit,
  preventParameterPollution,
  handleCorsPreflightpreflight
];

module.exports = securityMiddleware;
module.exports.requestId = requestId;
module.exports.sanitizeHeaders = sanitizeHeaders;
module.exports.ipWhitelist = ipWhitelist;
module.exports.apiKeyValidation = apiKeyValidation;
module.exports.contentSecurity = contentSecurity;
module.exports.securityAudit = securityAudit;
module.exports.preventParameterPollution = preventParameterPollution;
