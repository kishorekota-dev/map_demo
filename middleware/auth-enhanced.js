const jwt = require('jsonwebtoken');
const { UserService, PermissionChecker } = require('../models/users');

// Enhanced authentication middleware with ChatBot session support
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') ||
                  req.body.authToken || // Support token in request body for ChatBot
                  req.query.token; // Support token in query params
    
    if (!token) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided',
        code: 'AUTH_TOKEN_MISSING'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'credit-card-secret-key');
    
    // Fetch full user data with session info
    const user = await UserService.findById(decoded.userId);
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({
        error: 'Access denied',
        message: 'User not found or inactive',
        code: 'AUTH_USER_INACTIVE'
      });
    }

    // Check if token is expired or blacklisted
    const tokenValid = await UserService.isTokenValid(token, user.userId);
    if (!tokenValid) {
      return res.status(401).json({
        error: 'Token invalid',
        message: 'Token has been revoked or expired',
        code: 'AUTH_TOKEN_INVALID'
      });
    }

    // Attach enhanced user context to request
    req.user = {
      userId: user.userId,
      email: user.email,
      role: user.role,
      accountIds: user.accountIds,
      permissions: UserService.getUserPermissions(user.role),
      firstName: user.firstName,
      lastName: user.lastName,
      customerId: user.customerId,
      sessionId: decoded.sessionId,
      tokenExpiry: decoded.exp,
      lastActivity: new Date()
    };

    // Update last activity for session tracking
    await UserService.updateLastActivity(user.userId, decoded.sessionId);

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Please login again',
        code: 'AUTH_TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Token verification failed',
        code: 'AUTH_TOKEN_MALFORMED'
      });
    }
    
    res.status(500).json({
      error: 'Authentication error',
      message: 'Internal authentication error',
      code: 'AUTH_INTERNAL_ERROR'
    });
  }
};

// Enhanced role-based authorization middleware
const authorize = (requiredPermission, dataScope = null) => {
  return (req, res, next) => {
    try {
      const { user } = req;
      
      if (!user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
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
          message: `Insufficient permissions for ${requiredPermission}`,
          code: 'AUTH_PERMISSION_DENIED',
          requiredPermission,
          userRole: user.role
        });
      }

      // Log authorization for audit trail
      console.log(`[AUTH] User ${user.userId} authorized for ${requiredPermission}`);
      
      next();
    } catch (error) {
      console.error('[AUTH] Authorization error:', error);
      res.status(500).json({
        error: 'Authorization error',
        message: 'Error checking permissions',
        code: 'AUTH_CHECK_FAILED'
      });
    }
  };
};

// Account access authorization with enhanced security
const authorizeAccountAccess = (req, res, next) => {
  try {
    const { user } = req;
    const accountId = req.params.accountId || req.body.accountId || req.query.accountId;
    
    if (!accountId) {
      return next(); // Let the endpoint handle missing accountId
    }

    // Check if user has access to this account
    if (!user.accountIds.includes(accountId)) {
      return res.status(403).json({
        error: 'Account access denied',
        message: 'You do not have access to this account',
        code: 'AUTH_ACCOUNT_ACCESS_DENIED',
        accountId
      });
    }

    // Additional role-based account access checks
    const accountAccessLevel = PermissionChecker.getAccountAccessLevel(user.role, accountId);
    req.accountAccessLevel = accountAccessLevel;

    console.log(`[AUTH] User ${user.userId} accessing account ${accountId} with level ${accountAccessLevel}`);
    
    next();
  } catch (error) {
    console.error('[AUTH] Account authorization error:', error);
    res.status(500).json({
      error: 'Account authorization error',
      message: 'Error checking account access',
      code: 'AUTH_ACCOUNT_CHECK_FAILED'
    });
  }
};

// Transaction authorization middleware
const authorizeTransactionAccess = (requiredAccessLevel = 'READ') => {
  return (req, res, next) => {
    try {
      const { user } = req;
      const transactionId = req.params.transactionId || req.body.transactionId;
      const accountId = req.params.accountId || req.body.accountId;

      // Check transaction access permissions
      const hasTransactionAccess = PermissionChecker.hasTransactionAccess(
        user.role,
        requiredAccessLevel,
        accountId,
        user.accountIds
      );

      if (!hasTransactionAccess) {
        return res.status(403).json({
          error: 'Transaction access denied',
          message: `Insufficient permissions for transaction ${requiredAccessLevel}`,
          code: 'AUTH_TRANSACTION_ACCESS_DENIED',
          requiredAccessLevel
        });
      }

      next();
    } catch (error) {
      console.error('[AUTH] Transaction authorization error:', error);
      res.status(500).json({
        error: 'Transaction authorization error',
        message: 'Error checking transaction access',
        code: 'AUTH_TRANSACTION_CHECK_FAILED'
      });
    }
  };
};

// Payment authorization middleware
const authorizePaymentAction = (req, res, next) => {
  try {
    const { user } = req;
    const paymentData = req.body;

    // Check payment limits and permissions
    const paymentAuth = PermissionChecker.authorizePayment(
      user.role,
      paymentData.amount,
      paymentData.paymentType,
      user.accountIds
    );

    if (!paymentAuth.authorized) {
      return res.status(403).json({
        error: 'Payment authorization failed',
        message: paymentAuth.reason,
        code: 'AUTH_PAYMENT_DENIED',
        limits: paymentAuth.limits
      });
    }

    // Attach payment authorization context
    req.paymentAuth = paymentAuth;
    
    next();
  } catch (error) {
    console.error('[AUTH] Payment authorization error:', error);
    res.status(500).json({
      error: 'Payment authorization error',
      message: 'Error checking payment authorization',
      code: 'AUTH_PAYMENT_CHECK_FAILED'
    });
  }
};

// ChatBot session validation middleware
const validateChatBotSession = async (req, res, next) => {
  try {
    const { user } = req;
    const sessionId = req.body.sessionId || req.headers['x-session-id'];

    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID required',
        message: 'ChatBot session ID is required for this operation',
        code: 'SESSION_ID_REQUIRED'
      });
    }

    // Validate session belongs to user
    const sessionValid = await UserService.validateSession(user.userId, sessionId);
    if (!sessionValid) {
      return res.status(403).json({
        error: 'Invalid session',
        message: 'Session does not belong to authenticated user',
        code: 'SESSION_INVALID'
      });
    }

    req.sessionId = sessionId;
    next();
  } catch (error) {
    console.error('[AUTH] Session validation error:', error);
    res.status(500).json({
      error: 'Session validation error',
      message: 'Error validating ChatBot session',
      code: 'SESSION_VALIDATION_FAILED'
    });
  }
};

module.exports = {
  auth,
  authorize,
  authorizeAccountAccess,
  authorizeTransactionAccess,
  authorizePaymentAction,
  validateChatBotSession
};
