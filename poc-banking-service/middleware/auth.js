const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * JWT Authentication Middleware
 * Validates JWT tokens for protected routes
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    logger.warn('Authentication failed: No token provided', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });
    
    return res.status(401).json({
      error: 'Access denied',
      message: 'No authentication token provided',
      code: 'NO_TOKEN'
    });
  }

  jwt.verify(token, config.security.jwtSecret, (err, decoded) => {
    if (err) {
      logger.warn('Authentication failed: Invalid token', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        error: err.message
      });

      const errorResponse = {
        error: 'Authentication failed',
        code: 'INVALID_TOKEN'
      };

      if (err.name === 'TokenExpiredError') {
        errorResponse.message = 'Token has expired';
        errorResponse.code = 'TOKEN_EXPIRED';
      } else if (err.name === 'JsonWebTokenError') {
        errorResponse.message = 'Invalid token format';
        errorResponse.code = 'MALFORMED_TOKEN';
      } else {
        errorResponse.message = 'Token verification failed';
      }

      return res.status(403).json(errorResponse);
    }

    // Add user info to request object
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      permissions: decoded.permissions || []
    };

    logger.info('User authenticated successfully', {
      userId: req.user.id,
      email: req.user.email,
      path: req.path,
      method: req.method
    });

    next();
  });
};

/**
 * Role-based authorization middleware
 * @param {string|Array} roles - Required role(s) for access
 */
const authorize = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated',
        code: 'NOT_AUTHENTICATED'
      });
    }

    const userRole = req.user.role;
    const requiredRoles = Array.isArray(roles) ? roles : [roles];

    if (!requiredRoles.includes(userRole)) {
      logger.warn('Authorization failed: Insufficient permissions', {
        userId: req.user.id,
        userRole: userRole,
        requiredRoles: requiredRoles,
        path: req.path
      });

      return res.status(403).json({
        error: 'Access forbidden',
        message: 'Insufficient permissions for this resource',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    logger.info('User authorized successfully', {
      userId: req.user.id,
      userRole: userRole,
      path: req.path
    });

    next();
  };
};

/**
 * Permission-based authorization middleware
 * @param {string|Array} permissions - Required permission(s) for access
 */
const requirePermissions = (permissions) => {
  return (req, res, next) => {
    if (!req.user || !req.user.permissions) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User permissions not available',
        code: 'NO_PERMISSIONS'
      });
    }

    const userPermissions = req.user.permissions;
    const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];

    const hasPermission = requiredPermissions.every(permission => 
      userPermissions.includes(permission)
    );

    if (!hasPermission) {
      logger.warn('Permission check failed', {
        userId: req.user.id,
        userPermissions: userPermissions,
        requiredPermissions: requiredPermissions,
        path: req.path
      });

      return res.status(403).json({
        error: 'Access forbidden',
        message: 'Required permissions not granted',
        code: 'MISSING_PERMISSIONS',
        required: requiredPermissions
      });
    }

    next();
  };
};

/**
 * Account ownership verification middleware
 * Ensures users can only access their own accounts
 */
const verifyAccountOwnership = (req, res, next) => {
  const accountId = req.params.accountId || req.body.accountId;
  const userId = req.user.id;

  // Admin users can access any account
  if (req.user.role === 'admin') {
    return next();
  }

  // TODO: Implement actual database check
  // For now, we'll use a simple ID matching logic
  // In production, this should query the database to verify ownership
  
  logger.info('Verifying account ownership', {
    userId: userId,
    accountId: accountId,
    path: req.path
  });

  // Placeholder logic - replace with actual database query
  if (accountId && !accountId.startsWith(userId.toString())) {
    logger.warn('Account ownership verification failed', {
      userId: userId,
      accountId: accountId,
      path: req.path
    });

    return res.status(403).json({
      error: 'Access forbidden',
      message: 'You can only access your own accounts',
      code: 'ACCOUNT_ACCESS_DENIED'
    });
  }

  next();
};

module.exports = {
  authenticateToken,
  authorize,
  requirePermissions,
  verifyAccountOwnership
};