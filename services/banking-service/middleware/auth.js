const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');
const {
  AccountRepository,
  TransactionRepository,
  CardRepository,
  TransferRepository,
  FraudRepository,
  DisputeRepository
} = require('../database/repositories');

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
      id: decoded.id || decoded.userId,
      userId: decoded.userId || decoded.id,
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
const verifyAccountOwnership = async (req, res, next) => {
  const accountId = req.params?.accountId || req.body?.accountId ||
    req.body?.fromAccountId || req.query?.accountId;
  const userId = req.user.userId || req.user.id;

  // Admin users can access any account
  if (req.user.role === 'admin') {
    return next();
  }

  try {
    logger.info('Verifying account ownership', {
      userId: userId,
      accountId: accountId,
      path: req.path
    });

    if (!accountId) {
      return res.status(400).json({
        error: 'Account ID required',
        message: 'Account ID is missing from request',
        code: 'ACCOUNT_ID_REQUIRED'
      });
    }

    const account = await AccountRepository.findById(accountId);

    if (!account) {
      return res.status(404).json({
        error: 'Account not found',
        message: 'Account does not exist',
        code: 'ACCOUNT_NOT_FOUND'
      });
    }

    if (account.user_id !== userId) {
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

    req.ownedAccount = account;
    next();
  } catch (error) {
    logger.error('Account ownership verification error', {
      error: error.message,
      userId: userId,
      accountId: accountId,
      path: req.path
    });

    res.status(500).json({
      error: 'Ownership verification error',
      message: 'Unable to verify account ownership',
      code: 'ACCOUNT_OWNERSHIP_ERROR'
    });
  }
};

const verifyOptionalAccountOwnership = (req, res, next) => {
  const accountId = req.params?.accountId || req.body?.accountId ||
    req.body?.fromAccountId || req.query?.accountId;
  return accountId ? verifyAccountOwnership(req, res, next) : next();
};

const createResourceOwnershipVerifier = ({ resourceName, getId, resolve, attachAs }) => {
  return async (req, res, next) => {
    const resourceId = getId(req);
    const userId = req.user?.userId || req.user?.id;

    if (!resourceId) {
      return res.status(400).json({
        error: `${resourceName} ID required`,
        code: 'RESOURCE_ID_REQUIRED'
      });
    }

    try {
      const resolved = await resolve(resourceId);
      if (!resolved?.resource) {
        return res.status(404).json({
          error: `${resourceName} not found`,
          code: 'RESOURCE_NOT_FOUND'
        });
      }

      const ownerIds = (resolved.ownerIds || [resolved.ownerId])
        .filter(Boolean)
        .map(String);
      const isAdmin = req.user?.role === 'admin';
      if (!isAdmin && !ownerIds.includes(String(userId))) {
        logger.warn(`${resourceName} ownership verification failed`, {
          resourceId,
          userId,
          path: req.path
        });
        return res.status(403).json({
          error: 'Access forbidden',
          message: `You can only access your own ${resourceName.toLowerCase()} resources`,
          code: 'RESOURCE_ACCESS_DENIED'
        });
      }

      req[attachAs] = resolved.resource;
      next();
    } catch (error) {
      logger.error(`${resourceName} ownership verification error`, {
        error: error.message,
        resourceId,
        userId
      });
      res.status(500).json({
        error: 'Ownership verification error',
        code: 'RESOURCE_OWNERSHIP_ERROR'
      });
    }
  };
};

const verifyTransactionOwnership = createResourceOwnershipVerifier({
  resourceName: 'Transaction',
  getId: (req) => req.params?.transactionId || req.body?.transactionId,
  resolve: async (transactionId) => {
    const transaction = await TransactionRepository.findById(transactionId);
    if (!transaction) return null;
    const account = await AccountRepository.findById(transaction.account_id);
    return { resource: transaction, ownerId: account?.user_id };
  },
  attachAs: 'ownedTransaction'
});

const verifyOptionalTransactionOwnership = (req, res, next) => {
  return req.body?.transactionId ? verifyTransactionOwnership(req, res, next) : next();
};

const verifyCardOwnership = createResourceOwnershipVerifier({
  resourceName: 'Card',
  getId: (req) => req.params?.cardId || req.body?.cardId,
  resolve: async (cardId) => {
    const card = await CardRepository.findById(cardId);
    return card ? { resource: card, ownerId: card.user_id } : null;
  },
  attachAs: 'ownedCard'
});

const verifyOptionalCardOwnership = (req, res, next) => {
  return req.body?.cardId ? verifyCardOwnership(req, res, next) : next();
};

const verifyTransferOwnership = createResourceOwnershipVerifier({
  resourceName: 'Transfer',
  getId: (req) => req.params?.transferId,
  resolve: async (transferId) => {
    const transfer = await TransferRepository.findById(transferId);
    return transfer
      ? { resource: transfer, ownerIds: [transfer.from_user_id, transfer.to_user_id] }
      : null;
  },
  attachAs: 'ownedTransfer'
});

const verifyFraudAlertOwnership = createResourceOwnershipVerifier({
  resourceName: 'Fraud alert',
  getId: (req) => req.params?.alertId,
  resolve: async (alertId) => {
    const alert = await FraudRepository.findById(alertId);
    return alert ? { resource: alert, ownerId: alert.user_id } : null;
  },
  attachAs: 'ownedFraudAlert'
});

const verifyDisputeOwnership = createResourceOwnershipVerifier({
  resourceName: 'Dispute',
  getId: (req) => req.params?.disputeId,
  resolve: async (disputeId) => {
    const dispute = await DisputeRepository.findById(disputeId);
    return dispute ? { resource: dispute, ownerId: dispute.user_id } : null;
  },
  attachAs: 'ownedDispute'
});

module.exports = {
  authenticateToken,
  authorize,
  requirePermissions,
  verifyAccountOwnership,
  verifyOptionalAccountOwnership,
  verifyTransactionOwnership,
  verifyOptionalTransactionOwnership,
  verifyCardOwnership,
  verifyOptionalCardOwnership,
  verifyTransferOwnership,
  verifyFraudAlertOwnership,
  verifyDisputeOwnership
};
