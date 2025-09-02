const jwt = require('jsonwebtoken');
const { UserService, PermissionChecker } = require('../models/users');

// Enhanced authentication middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'credit-card-secret-key');
    
    // Fetch full user data
    const user = await UserService.findById(decoded.userId);
    if (!user || user.status !== 'ACTIVE') {
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
const authorize = (requiredPermission, dataScope = null) => {
  return (req, res, next) => {
    try {
      const { user } = req;
      
      if (!user) {
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

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Insufficient permissions for ${requiredPermission}`
        });
      }

      next();
    } catch (error) {
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

module.exports = { 
  auth, 
  authorize, 
  authorizeAccountAccess, 
  optionalAuth 
};
