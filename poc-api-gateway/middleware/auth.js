const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';

/**
 * JWT Authentication Middleware
 */
const authMiddleware = (req, res, next) => {
  try {
    // Extract token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        error: 'Authorization header missing',
        message: 'Please provide a valid authentication token',
        timestamp: new Date().toISOString()
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Invalid authorization format',
        message: 'Authorization header must be in format: Bearer <token>',
        timestamp: new Date().toISOString()
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Attach user info to request
    req.user = decoded;
    req.userId = decoded.userId;
    req.userRole = decoded.role || 'user';
    
    logger.info('Authentication successful', {
      userId: decoded.userId,
      path: req.path,
      method: req.method
    });
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'The provided authentication token is invalid',
        timestamp: new Date().toISOString()
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Your session has expired. Please login again',
        timestamp: new Date().toISOString()
      });
    }
    
    logger.error('Authentication error', {
      error: error.message,
      path: req.path,
      method: req.method
    });
    
    res.status(500).json({
      error: 'Authentication failed',
      message: 'An error occurred during authentication',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Optional authentication middleware
 * Validates token if present, but allows request to proceed without it
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.userId = decoded.userId;
    req.userRole = decoded.role || 'user';
  } catch (error) {
    // Token invalid but we allow request to proceed
    logger.warn('Optional auth token invalid', { error: error.message });
  }
  
  next();
};

/**
 * Role-based authorization middleware
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.userRole) {
      return res.status(401).json({
        error: 'Not authenticated',
        message: 'Authentication required',
        timestamp: new Date().toISOString()
      });
    }

    if (!allowedRoles.includes(req.userRole)) {
      logger.warn('Authorization failed', {
        userId: req.userId,
        role: req.userRole,
        allowedRoles,
        path: req.path
      });
      
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to access this resource',
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
};

/**
 * Generate JWT token
 */
const generateToken = (payload, expiresIn = '24h') => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

/**
 * Verify JWT token
 */
const verifyToken = (token) => {
  try {
    return { valid: true, decoded: jwt.verify(token, JWT_SECRET) };
  } catch (error) {
    return { valid: false, error: error.message };
  }
};

module.exports = {
  authMiddleware,
  optionalAuth,
  requireRole,
  generateToken,
  verifyToken
};
