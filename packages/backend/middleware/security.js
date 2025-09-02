const { PermissionChecker } = require('../models/users');

/**
 * Shared Security Library for Credit Card Enterprise API
 * Provides reusable security functions and middleware for consistent security across all endpoints
 */

/**
 * Security policies for different resources and operations
 */
const SECURITY_POLICIES = {
  // Account operations
  accounts: {
    read: {
      roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT', 'CUSTOMER'],
      permission: 'accounts:read',
      scope: 'conditional' // customers: own, others: all
    },
    create: {
      roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CUSTOMER'],
      permission: 'accounts:create',
      scope: 'conditional'
    },
    update: {
      roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'],
      permission: 'accounts:update',
      scope: 'all'
    },
    delete: {
      roles: ['SUPER_ADMIN', 'ADMIN'],
      permission: 'accounts:delete',
      scope: 'all'
    }
  },

  // Transaction operations
  transactions: {
    read: {
      roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT', 'CUSTOMER'],
      permission: 'transactions:read',
      scope: 'conditional'
    },
    create: {
      roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT', 'CUSTOMER'],
      permission: 'transactions:create',
      scope: 'conditional'
    },
    update: {
      roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT'],
      permission: 'transactions:update',
      scope: 'all'
    },
    delete: {
      roles: ['SUPER_ADMIN', 'ADMIN'],
      permission: 'transactions:delete',
      scope: 'all'
    }
  },

  // Card operations
  cards: {
    read: {
      roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT', 'CUSTOMER'],
      permission: 'cards:read',
      scope: 'conditional'
    },
    create: {
      roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT', 'CUSTOMER'],
      permission: 'cards:create',
      scope: 'conditional'
    },
    update: {
      roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT'],
      permission: 'cards:update',
      scope: 'conditional'
    },
    block: {
      roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT', 'CUSTOMER'],
      permission: 'cards:block',
      scope: 'conditional'
    }
  },

  // Fraud operations
  fraud: {
    read: {
      roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT'],
      permission: 'fraud:read',
      scope: 'all'
    },
    create: {
      roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT'],
      permission: 'fraud:create',
      scope: 'all'
    },
    update: {
      roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'],
      permission: 'fraud:update',
      scope: 'all'
    },
    investigate: {
      roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT'],
      permission: 'fraud:investigate',
      scope: 'all'
    }
  },

  // Dispute operations
  disputes: {
    read: {
      roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT', 'CUSTOMER'],
      permission: 'disputes:read',
      scope: 'conditional'
    },
    create: {
      roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT', 'CUSTOMER'],
      permission: 'disputes:create',
      scope: 'conditional'
    },
    update: {
      roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT'],
      permission: 'disputes:update',
      scope: 'all'
    },
    resolve: {
      roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'],
      permission: 'disputes:resolve',
      scope: 'all'
    }
  },

  // Balance transfer operations
  balanceTransfers: {
    read: {
      roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT', 'CUSTOMER'],
      permission: 'balance_transfers:read',
      scope: 'conditional'
    },
    create: {
      roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CUSTOMER'],
      permission: 'balance_transfers:create',
      scope: 'conditional'
    },
    update: {
      roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'],
      permission: 'balance_transfers:update',
      scope: 'all'
    }
  },

  // User management operations
  users: {
    read: {
      roles: ['SUPER_ADMIN', 'ADMIN'],
      permission: 'users:read',
      scope: 'all'
    },
    create: {
      roles: ['SUPER_ADMIN', 'ADMIN'],
      permission: 'users:create',
      scope: 'all'
    },
    update: {
      roles: ['SUPER_ADMIN', 'ADMIN'],
      permission: 'users:update',
      scope: 'all'
    },
    delete: {
      roles: ['SUPER_ADMIN'],
      permission: 'users:delete',
      scope: 'all'
    }
  }
};

/**
 * Security utility functions
 */
class SecurityUtils {
  /**
   * Check if user has access to a specific resource operation
   */
  static hasResourceAccess(user, resource, operation) {
    const policy = SECURITY_POLICIES[resource]?.[operation];
    if (!policy) return false;

    // Check if user role is allowed
    if (!policy.roles.includes(user.role)) return false;

    // Check permission
    return PermissionChecker.hasPermission(user.role, policy.permission);
  }

  /**
   * Filter data based on user access scope
   */
  static filterDataByAccess(user, resource, data, ownershipField = 'userId') {
    const policy = SECURITY_POLICIES[resource]?.read;
    if (!policy) return [];

    // Super admin and admin see everything
    if (['SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
      return data;
    }

    // Managers and agents see all (in production, filter by branch/assignment)
    if (['MANAGER', 'AGENT'].includes(user.role)) {
      return data;
    }

    // Customers see only their own data
    if (user.role === 'CUSTOMER') {
      if (resource === 'accounts' || resource === 'cards') {
        return data.filter(item => user.accountIds.includes(item.accountId));
      }
      return data.filter(item => item[ownershipField] === user.userId || 
                                 (item.accountId && user.accountIds.includes(item.accountId)));
    }

    return [];
  }

  /**
   * Check if user can access specific resource item
   */
  static canAccessResourceItem(user, resource, item, ownershipField = 'userId') {
    // Super admin and admin can access everything
    if (['SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
      return true;
    }

    // Managers and agents can access all (in production, check assignment)
    if (['MANAGER', 'AGENT'].includes(user.role)) {
      return true;
    }

    // Customers can only access their own items
    if (user.role === 'CUSTOMER') {
      if (resource === 'accounts' || resource === 'cards') {
        return user.accountIds.includes(item.accountId);
      }
      return item[ownershipField] === user.userId || 
             (item.accountId && user.accountIds.includes(item.accountId));
    }

    return false;
  }

  /**
   * Validate account access for operations
   */
  static validateAccountAccess(user, accountId) {
    if (['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT'].includes(user.role)) {
      return true;
    }

    if (user.role === 'CUSTOMER') {
      return user.accountIds.includes(accountId);
    }

    return false;
  }

  /**
   * Get user's accessible account IDs
   */
  static getAccessibleAccountIds(user) {
    if (['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT'].includes(user.role)) {
      return '*'; // All accounts
    }

    return user.accountIds || [];
  }

  /**
   * Log security event for audit
   */
  static logSecurityEvent(user, action, resource, resourceId = null, success = true, details = {}) {
    const event = {
      timestamp: new Date().toISOString(),
      userId: user.userId,
      userRole: user.role,
      userEmail: user.email,
      action,
      resource,
      resourceId,
      success,
      details,
      ip: details.ip || 'unknown',
      userAgent: details.userAgent || 'unknown'
    };

    // In production, send to logging service (ELK, CloudWatch, etc.)
    console.log('SECURITY_EVENT:', JSON.stringify(event));
    
    return event;
  }

  /**
   * Create standardized security response
   */
  static createSecurityResponse(success, message, data = null, errors = null) {
    const response = {
      success,
      message,
      timestamp: new Date().toISOString()
    };

    if (data) response.data = data;
    if (errors) response.errors = errors;

    return response;
  }

  /**
   * Sanitize data for user role (remove sensitive fields)
   */
  static sanitizeDataForRole(user, resource, data) {
    const sanitizedData = Array.isArray(data) ? [...data] : { ...data };

    // Remove sensitive fields based on user role
    if (user.role === 'CUSTOMER') {
      switch (resource) {
        case 'accounts':
          return this.sanitizeAccountDataForCustomer(sanitizedData);
        case 'transactions':
          return this.sanitizeTransactionDataForCustomer(sanitizedData);
        case 'cards':
          return this.sanitizeCardDataForCustomer(sanitizedData);
        default:
          return sanitizedData;
      }
    }

    // For staff roles, show all data but with appropriate masking
    if (['AGENT'].includes(user.role)) {
      switch (resource) {
        case 'cards':
          return this.maskSensitiveCardData(sanitizedData);
        default:
          return sanitizedData;
      }
    }

    return sanitizedData;
  }

  /**
   * Sanitize account data for customers
   */
  static sanitizeAccountDataForCustomer(data) {
    const fieldsToRemove = ['internalNotes', 'riskScore', 'creditScore'];
    
    if (Array.isArray(data)) {
      return data.map(item => this.removeFields(item, fieldsToRemove));
    }
    
    return this.removeFields(data, fieldsToRemove);
  }

  /**
   * Sanitize transaction data for customers
   */
  static sanitizeTransactionDataForCustomer(data) {
    const fieldsToRemove = ['internalNotes', 'processingFees', 'interchangeFees'];
    
    if (Array.isArray(data)) {
      return data.map(item => this.removeFields(item, fieldsToRemove));
    }
    
    return this.removeFields(data, fieldsToRemove);
  }

  /**
   * Sanitize card data for customers
   */
  static sanitizeCardDataForCustomer(data) {
    const fieldsToRemove = ['fullCardNumber', 'cvv', 'internalNotes'];
    
    if (Array.isArray(data)) {
      return data.map(item => this.removeFields(item, fieldsToRemove));
    }
    
    return this.removeFields(data, fieldsToRemove);
  }

  /**
   * Mask sensitive card data for agents
   */
  static maskSensitiveCardData(data) {
    if (Array.isArray(data)) {
      return data.map(item => ({
        ...item,
        cvv: '***' // Agents shouldn't see full CVV
      }));
    }
    
    return {
      ...data,
      cvv: '***'
    };
  }

  /**
   * Remove specified fields from object
   */
  static removeFields(obj, fields) {
    const cleaned = { ...obj };
    fields.forEach(field => delete cleaned[field]);
    return cleaned;
  }
}

/**
 * Enhanced middleware factory for resource-specific security
 */
function createResourceSecurityMiddleware(resource, operation, options = {}) {
  return (req, res, next) => {
    try {
      const { user } = req;
      
      if (!user) {
        SecurityUtils.logSecurityEvent(
          { userId: 'unknown', role: 'unknown', email: 'unknown' },
          operation,
          resource,
          req.params.id,
          false,
          { reason: 'no_user_context', ip: req.ip, userAgent: req.get('User-Agent') }
        );
        
        return res.status(401).json(
          SecurityUtils.createSecurityResponse(false, 'Authentication required')
        );
      }

      // Check if user has access to this resource operation
      if (!SecurityUtils.hasResourceAccess(user, resource, operation)) {
        SecurityUtils.logSecurityEvent(
          user,
          operation,
          resource,
          req.params.id,
          false,
          { reason: 'insufficient_permissions', requiredResource: resource, requiredOperation: operation }
        );
        
        return res.status(403).json(
          SecurityUtils.createSecurityResponse(
            false, 
            `Insufficient permissions for ${resource}:${operation}`,
            null,
            { requiredPermission: SECURITY_POLICIES[resource]?.[operation]?.permission }
          )
        );
      }

      // Account-specific validation for operations
      if (options.requireAccountAccess && req.body.accountId) {
        if (!SecurityUtils.validateAccountAccess(user, req.body.accountId)) {
          SecurityUtils.logSecurityEvent(
            user,
            operation,
            resource,
            req.body.accountId,
            false,
            { reason: 'account_access_denied', accountId: req.body.accountId }
          );
          
          return res.status(403).json(
            SecurityUtils.createSecurityResponse(false, 'Access denied to specified account')
          );
        }
      }

      // Resource item access validation for GET/PUT/DELETE operations
      if (options.requireItemAccess && req.params.id) {
        // This will be validated in the route handler with actual data
        req.securityOptions = { validateItemAccess: true };
      }

      // Log successful security check
      SecurityUtils.logSecurityEvent(
        user,
        operation,
        resource,
        req.params.id || req.body.accountId,
        true,
        { operation, resource }
      );

      next();
    } catch (error) {
      console.error('Security middleware error:', error);
      
      SecurityUtils.logSecurityEvent(
        req.user || { userId: 'unknown', role: 'unknown', email: 'unknown' },
        operation,
        resource,
        req.params.id,
        false,
        { reason: 'middleware_error', error: error.message }
      );
      
      res.status(500).json(
        SecurityUtils.createSecurityResponse(false, 'Security validation error')
      );
    }
  };
}

/**
 * Response wrapper that applies data filtering and sanitization
 */
function createSecureResponse(user, resource, data, message = 'Success') {
  // Filter data based on user access
  const filteredData = SecurityUtils.filterDataByAccess(user, resource, Array.isArray(data) ? data : [data]);
  
  // Sanitize data for user role
  const sanitizedData = SecurityUtils.sanitizeDataForRole(user, resource, filteredData);
  
  // Return appropriate format
  if (Array.isArray(data)) {
    return {
      message,
      data: sanitizedData,
      total: sanitizedData.length,
      userContext: {
        role: user.role,
        accessLevel: PermissionChecker.getUserPermissions?.(user.role)?.level || 0
      }
    };
  }
  
  return {
    message,
    data: sanitizedData[0] || null,
    userContext: {
      role: user.role,
      accessLevel: PermissionChecker.getUserPermissions?.(user.role)?.level || 0
    }
  };
}

module.exports = {
  SECURITY_POLICIES,
  SecurityUtils,
  createResourceSecurityMiddleware,
  createSecureResponse
};
