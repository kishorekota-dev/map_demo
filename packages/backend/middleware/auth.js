const jwt = require('jsonwebtoken');
const { UserService, PermissionChecker } = require('../models/users');
const { 
  createRouteDebugLogger,
  logAuthEvent,
  logError 
} = require('./apiDebugLogger');

// Create auth middleware debug logger
const authLogger = createRouteDebugLogger('auth-middleware');

// Enhanced authentication middleware
const auth = async (req, res, next) => {
  try {
    const startTime = Date.now();
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    authLogger.debug('Authentication middleware started', {
      requestId: req.requestId,
      path: req.path,
      method: req.method,
      hasToken: !!token,
      tokenLength: token ? token.length : 0
    });
    
    if (!token) {
      authLogger.warn('Authentication failed - no token provided', {
        requestId: req.requestId,
        path: req.path,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress
      });
      
      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'credit-card-secret-key');
    
    authLogger.debug('JWT token decoded successfully', {
      requestId: req.requestId,
      userId: decoded.userId,
      email: decoded.email ? `${decoded.email.substring(0, 3)}***${decoded.email.substring(decoded.email.indexOf('@'))}` : 'unknown',
      role: decoded.role
    });
    
    // Fetch full user data from database (not mock data)
    const { query } = require('../database');
    let user = null;
    let userExists = false;
    let userStatus = null;

    try {
      // Check if it's a customer login (database user)
      if (decoded.customerId || decoded.type === 'CUSTOMER') {
        const customerResult = await query(
          'SELECT id, email, first_name, last_name, status FROM users WHERE id = $1',
          [decoded.userId]
        );
        
        if (customerResult.rows.length > 0) {
          const customer = customerResult.rows[0];
          userExists = true;
          userStatus = customer.status;
          
          if (customer.status === 'ACTIVE') {
            // Get user's account IDs
            const accountsResult = await query(
              'SELECT id FROM accounts WHERE user_id = $1 AND status != $2',
              [customer.id, 'CLOSED']
            );
            
            user = {
              userId: customer.id,
              email: customer.email,
              role: 'CUSTOMER',
              accountIds: accountsResult.rows.map(row => row.id),
              firstName: customer.first_name,
              lastName: customer.last_name,
              status: customer.status
            };
          }
        }
      } else {
        // Fall back to mock users for admin/staff
        user = await UserService.findById(decoded.userId);
        userExists = !!user;
        userStatus = user?.status;
      }
    } catch (dbError) {
      authLogger.error('Database error during user lookup', {
        requestId: req.requestId,
        userId: decoded.userId,
        error: dbError.message
      });
    }

    if (!user || userStatus !== 'ACTIVE') {
      const duration = Date.now() - startTime;
      
      authLogger.warn('Authentication failed - user not found or inactive', {
        requestId: req.requestId,
        userId: decoded.userId,
        userExists,
        userStatus,
        duration: `${duration}ms`
      });
      
      logAuthEvent('Authentication failed - user not found or inactive', {
        userId: decoded.userId,
        userExists,
        userStatus,
        requestId: req.requestId
      });
      
      return res.status(401).json({
        error: 'Access denied',
        message: 'User not found or inactive'
      });
    }

    // Attach user to request
    req.user = {
      userId: user.userId,
      email: user.email,
      role: user.role,
      accountIds: user.accountIds,
      permissions: UserService.getUserPermissions(user.role),
      firstName: user.firstName,
      lastName: user.lastName
    };

    const duration = Date.now() - startTime;
    
    authLogger.debug('Authentication successful', {
      requestId: req.requestId,
      userId: user.userId,
      role: user.role,
      permissionCount: req.user.permissions.length,
      duration: `${duration}ms`
    });

    logAuthEvent('Authentication successful', {
      userId: user.userId,
      role: user.role,
      requestId: req.requestId,
      path: req.path
    });

    next();
  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (error.name === 'TokenExpiredError') {
      authLogger.warn('Authentication failed - token expired', {
        requestId: req.requestId,
        error: error.message,
        duration: `${duration}ms`
      });
      
      logAuthEvent('Authentication failed - token expired', {
        requestId: req.requestId,
        error: error.message
      });
      
      return res.status(401).json({
        error: 'Token expired',
        message: 'Please login again'
      });
    }
    
    authLogger.error('Authentication failed - token verification error', {
      requestId: req.requestId,
      error: error.message,
      errorName: error.name,
      duration: `${duration}ms`
    });
    
    logError(error, {
      requestId: req.requestId,
      operation: 'authentication middleware',
      context: 'JWT token verification'
    });
    
    res.status(401).json({
      error: 'Invalid token',
      message: 'Token verification failed'
    });
  }
};

// Role-based authorization middleware
const authorize = (requiredPermission, dataScope = null) => {
  return (req, res, next) => {
    try {
      const startTime = Date.now();
      const { user } = req;
      
      authLogger.debug('Authorization check started', {
        requestId: req.requestId,
        userId: user?.userId,
        requiredPermission,
        dataScope,
        userRole: user?.role
      });
      
      if (!user) {
        authLogger.warn('Authorization failed - no authenticated user', {
          requestId: req.requestId,
          requiredPermission,
          path: req.path
        });
        
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }

      // Check if user has the required permission
      const hasPermission = PermissionChecker.hasPermission(
        user.role,
        requiredPermission,
        dataScope,
        user.userId,
        req.params.userId || req.body.userId
      );

      const duration = Date.now() - startTime;

      if (!hasPermission) {
        authLogger.warn('Authorization failed - insufficient permissions', {
          requestId: req.requestId,
          userId: user.userId,
          userRole: user.role,
          requiredPermission,
          dataScope,
          duration: `${duration}ms`
        });
        
        logAuthEvent('Authorization failed - insufficient permissions', {
          userId: user.userId,
          userRole: user.role,
          requiredPermission,
          dataScope,
          requestId: req.requestId
        });
        
        return res.status(403).json({
          error: 'Forbidden',
          message: `Insufficient permissions for ${requiredPermission}`
        });
      }

      authLogger.debug('Authorization successful', {
        requestId: req.requestId,
        userId: user.userId,
        userRole: user.role,
        requiredPermission,
        duration: `${duration}ms`
      });

      next();
    } catch (error) {
      authLogger.error('Authorization error occurred', {
        requestId: req.requestId,
        error: error.message,
        requiredPermission,
        userId: req.user?.userId
      });
      
      logError(error, {
        requestId: req.requestId,
        operation: 'authorization middleware',
        context: `permission check for ${requiredPermission}`
      });
      
      res.status(500).json({
        error: 'Authorization error',
        message: 'Error checking permissions'
      });
    }
  };
};

// Account access authorization
const authorizeAccountAccess = (req, res, next) => {
  try {
    const { user } = req;
    const accountId = req.params.accountId || req.body.accountId;
    
    if (!accountId) {
      return next(); // Let the endpoint handle missing accountId
    }

    // Check if user can access this account
    if (user.accountIds === '*' || user.accountIds.includes(accountId)) {
      return next();
    }

    // For customers, additional check against account ownership
    if (user.role === 'CUSTOMER') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only access your own accounts'
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      error: 'Authorization error',
      message: 'Error checking account access'
    });
  }
};

// Optional authentication (for public endpoints that can benefit from user context)
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'credit-card-secret-key');
      const user = await UserService.findById(decoded.userId);
      
      if (user && user.status === 'ACTIVE') {
        req.user = {
          userId: user.userId,
          email: user.email,
          role: user.role,
          accountIds: user.accountIds,
          permissions: UserService.getUserPermissions(user.role),
          firstName: user.firstName,
          lastName: user.lastName
        };
      }
    }
    
    next();
  } catch (error) {
    // Ignore authentication errors for optional auth
    next();
  }
};

// Enhanced token authentication for enterprise routes
const authenticateToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'enterprise_banking_jwt_secret_2024_secure_key_for_production');
    
    // For enterprise routes, expect customer-specific token structure
    req.user = {
      customerId: decoded.customerId,
      email: decoded.email,
      role: decoded.role || 'CUSTOMER',
      tokenType: decoded.tokenType || 'ACCESS'
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Please login again'
      });
    }
    
    res.status(401).json({
      error: 'Invalid token',
      message: 'Token verification failed'
    });
  }
};

// Role-based authorization middleware
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

module.exports = { 
  auth, 
  authorize, 
  authorizeAccountAccess, 
  optionalAuth,
  authenticateToken,
  authorizeRoles
};
