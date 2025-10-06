const jwt = require('jsonwebtoken');
const db = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Authentication Middleware
 * Verifies JWT token and attaches user info to request
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      return res.status(401).json({
        status: 'error',
        error: {
          code: 'MISSING_TOKEN',
          message: 'Access token is required'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
    
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (decoded.type !== 'access') {
      return res.status(401).json({
        status: 'error',
        error: {
          code: 'INVALID_TOKEN_TYPE',
          message: 'Invalid token type'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
    
    // Verify user still exists and is active
    const userQuery = `
      SELECT id, username, email, customer_id, is_active, is_locked
      FROM users
      WHERE id = $1
    `;
    
    const result = await db.query(userQuery, [decoded.userId]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        status: 'error',
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
    
    const user = result.rows[0];
    
    if (!user.is_active || user.is_locked) {
      return res.status(403).json({
        status: 'error',
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: 'Account is no longer active'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
    
    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      email: decoded.email,
      customerId: decoded.customerId,
      permissions: decoded.permissions || []
    };
    
    next();
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'error',
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid token'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Token has expired'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
    
    req.logger.error('Authentication error', { error: error.message });
    
    return res.status(500).json({
      status: 'error',
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred during authentication'
      },
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
      }
    });
  }
};

/**
 * Authorization Middleware
 * Checks if user has required permission
 * @param {string} permission - Required permission (e.g., 'customers.read')
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
    
    // Check if user has the required permission
    const hasPermission = req.user.permissions.some(p => 
      p.name === permission || p.name === 'admin.full_access'
    );
    
    if (!hasPermission) {
      req.logger.warn('Permission denied', { 
        userId: req.user.userId, 
        required: permission,
        available: req.user.permissions.map(p => p.name)
      });
      
      return res.status(403).json({
        status: 'error',
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to perform this action',
          required: permission
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
    
    next();
  };
};

/**
 * Role-based Authorization Middleware
 * Checks if user has required role
 * @param {string|Array<string>} roles - Required role(s)
 */
const requireRole = (roles) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
    
    try {
      // Get user roles
      const roleQuery = `
        SELECT r.name
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = $1
      `;
      
      const result = await db.query(roleQuery, [req.user.userId]);
      const userRoles = result.rows.map(r => r.name);
      
      // Check if user has any of the required roles
      const requiredRoles = Array.isArray(roles) ? roles : [roles];
      const hasRole = requiredRoles.some(role => userRoles.includes(role));
      
      if (!hasRole) {
        req.logger.warn('Role check failed', { 
          userId: req.user.userId, 
          required: requiredRoles,
          available: userRoles
        });
        
        return res.status(403).json({
          status: 'error',
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have the required role to perform this action',
            required: requiredRoles
          },
          metadata: {
            timestamp: new Date().toISOString(),
            correlationId: req.correlationId
          }
        });
      }
      
      next();
      
    } catch (error) {
      req.logger.error('Role check error', { error: error.message });
      
      return res.status(500).json({
        status: 'error',
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred during authorization'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });
    }
  };
};

/**
 * Optional Authentication Middleware
 * Attaches user info if token is present, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return next();
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (decoded.type === 'access') {
      req.user = {
        userId: decoded.userId,
        username: decoded.username,
        email: decoded.email,
        customerId: decoded.customerId,
        permissions: decoded.permissions || []
      };
    }
    
    next();
    
  } catch (error) {
    // If token is invalid, just continue without user info
    next();
  }
};

/**
 * Resource ownership check
 * Ensures customer can only access their own data
 */
const requireOwnership = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      status: 'error',
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      },
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
      }
    });
  }
  
  // Check if user has admin permission
  const isAdmin = req.user.permissions.some(p => 
    p.name === 'admin.full_access'
  );
  
  if (isAdmin) {
    return next();
  }
  
  // Check if the resource belongs to the user
  const customerId = req.params.id || req.params.customerId;
  
  if (customerId && customerId !== req.user.customerId) {
    req.logger.warn('Ownership check failed', { 
      userId: req.user.userId,
      requestedCustomerId: customerId,
      userCustomerId: req.user.customerId
    });
    
    return res.status(403).json({
      status: 'error',
      error: {
        code: 'FORBIDDEN',
        message: 'You can only access your own data'
      },
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
      }
    });
  }
  
  next();
};

module.exports = {
  authenticateToken,
  requirePermission,
  requireRole,
  optionalAuth,
  requireOwnership
};
