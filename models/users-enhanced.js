const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// Enhanced user roles with ChatBot permissions
const ROLES = {
  SUPER_ADMIN: {
    level: 100,
    permissions: ['*'], // All permissions
    description: 'Full system access',
    chatbotAccess: true,
    paymentLimits: { daily: 1000000, transaction: 100000 }
  },
  ADMIN: {
    level: 80,
    permissions: [
      'users:*', 'accounts:*', 'transactions:*', 'cards:*', 
      'fraud:*', 'disputes:*', 'reports:*', 'audit:*',
      'chatbot:admin', 'payments:*'
    ],
    description: 'Administrative access to all resources',
    chatbotAccess: true,
    paymentLimits: { daily: 500000, transaction: 50000 }
  },
  MANAGER: {
    level: 60,
    permissions: [
      'accounts:read', 'accounts:update', 'transactions:*', 
      'cards:*', 'fraud:*', 'disputes:*', 'reports:read',
      'chatbot:manage', 'payments:approve'
    ],
    description: 'Management access to customer operations',
    chatbotAccess: true,
    paymentLimits: { daily: 100000, transaction: 25000 }
  },
  AGENT: {
    level: 40,
    permissions: [
      'accounts:read', 'transactions:read', 'cards:read', 
      'cards:update', 'fraud:read', 'fraud:create', 'disputes:*',
      'chatbot:support', 'payments:initiate'
    ],
    description: 'Customer service agent access',
    chatbotAccess: true,
    paymentLimits: { daily: 50000, transaction: 10000 }
  },
  CUSTOMER: {
    level: 20,
    permissions: [
      'accounts:read:own', 'transactions:read:own', 'cards:read:own',
      'cards:create:own', 'disputes:create:own', 'disputes:read:own',
      'chatbot:basic', 'payments:own'
    ],
    description: 'Customer self-service access',
    chatbotAccess: true,
    paymentLimits: { daily: 10000, transaction: 5000 }
  },
  GUEST: {
    level: 10,
    permissions: ['chatbot:inquiry'],
    description: 'Limited inquiry access',
    chatbotAccess: true,
    paymentLimits: { daily: 0, transaction: 0 }
  }
};

// Enhanced mock user database with session tracking
const mockUsers = [
  {
    userId: 'user_superadmin_001',
    customerId: 'cust_admin_001',
    email: 'superadmin@creditcard.com',
    password: '$2a$10$8K9wX2fX3qwRvLBY7FMZfOvYx1J3QpQrS4WzN8VmB5A2C7D6E9F8G0', // 'admin123'
    firstName: 'Super',
    lastName: 'Admin',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    accountIds: ['acc_admin_001', 'acc_admin_002'],
    activeSessions: new Map(),
    lastActivity: new Date(),
    tokenHistory: new Set(),
    securitySettings: {
      mfaEnabled: true,
      sessionTimeout: 3600,
      maxSessions: 5
    }
  },
  {
    userId: 'user_demo_001',
    customerId: 'cust_demo_001',
    email: 'demo@creditcard.com',
    password: '$2a$10$8K9wX2fX3qwRvLBY7FMZfOvYx1J3QpQrS4WzN8VmB5A2C7D6E9F8G0', // 'admin123'
    firstName: 'Demo',
    lastName: 'Customer',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    accountIds: ['acc_demo_001', 'acc_demo_002'],
    activeSessions: new Map(),
    lastActivity: new Date(),
    tokenHistory: new Set(),
    securitySettings: {
      mfaEnabled: false,
      sessionTimeout: 1800,
      maxSessions: 3
    }
  },
  {
    userId: 'user_agent_001',
    customerId: 'cust_agent_001',
    email: 'agent@creditcard.com',
    password: '$2a$10$8K9wX2fX3qwRvLBY7FMZfOvYx1J3QpQrS4WzN8VmB5A2C7D6E9F8G0', // 'admin123'
    firstName: 'Support',
    lastName: 'Agent',
    role: 'AGENT',
    status: 'ACTIVE',
    accountIds: ['acc_agent_001'],
    activeSessions: new Map(),
    lastActivity: new Date(),
    tokenHistory: new Set(),
    securitySettings: {
      mfaEnabled: true,
      sessionTimeout: 2400,
      maxSessions: 2
    }
  }
];

// Enhanced User Service with session management
class UserService {
  /**
   * Find user by ID
   */
  static async findById(userId) {
    return mockUsers.find(user => user.userId === userId);
  }

  /**
   * Find user by email
   */
  static async findByEmail(email) {
    return mockUsers.find(user => user.email === email);
  }

  /**
   * Authenticate user and create session
   */
  static async authenticate(email, password, sessionMetadata = {}) {
    const user = await this.findByEmail(email);
    if (!user || user.status !== 'ACTIVE') {
      throw new Error('Invalid credentials or inactive user');
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Create new session
    const sessionId = uuidv4();
    const tokenPayload = {
      userId: user.userId,
      email: user.email,
      role: user.role,
      sessionId,
      customerId: user.customerId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + user.securitySettings.sessionTimeout
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET || 'credit-card-secret-key');

    // Store session information
    user.activeSessions.set(sessionId, {
      sessionId,
      token,
      createdAt: new Date(),
      lastActivity: new Date(),
      metadata: sessionMetadata,
      isActive: true
    });

    // Add token to history for tracking
    user.tokenHistory.add(token);

    // Clean up old sessions if exceeding limit
    await this.cleanupOldSessions(user);

    return {
      token,
      sessionId,
      user: {
        userId: user.userId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        customerId: user.customerId,
        accountIds: user.accountIds,
        permissions: this.getUserPermissions(user.role),
        chatbotAccess: ROLES[user.role]?.chatbotAccess || false
      }
    };
  }

  /**
   * Validate if token is still valid
   */
  static async isTokenValid(token, userId) {
    const user = await this.findById(userId);
    if (!user) return false;

    // Check if token exists in user's token history
    if (!user.tokenHistory.has(token)) {
      return false;
    }

    // Check if any active session has this token
    for (const [sessionId, session] of user.activeSessions) {
      if (session.token === token && session.isActive) {
        return true;
      }
    }

    return false;
  }

  /**
   * Update user's last activity
   */
  static async updateLastActivity(userId, sessionId) {
    const user = await this.findById(userId);
    if (!user) return false;

    user.lastActivity = new Date();
    
    if (sessionId && user.activeSessions.has(sessionId)) {
      const session = user.activeSessions.get(sessionId);
      session.lastActivity = new Date();
      user.activeSessions.set(sessionId, session);
    }

    return true;
  }

  /**
   * Validate session belongs to user
   */
  static async validateSession(userId, sessionId) {
    const user = await this.findById(userId);
    if (!user) return false;

    const session = user.activeSessions.get(sessionId);
    return session && session.isActive;
  }

  /**
   * Get user permissions based on role
   */
  static getUserPermissions(role) {
    return ROLES[role]?.permissions || [];
  }

  /**
   * Get user payment limits
   */
  static getPaymentLimits(role) {
    return ROLES[role]?.paymentLimits || { daily: 0, transaction: 0 };
  }

  /**
   * Check if user has ChatBot access
   */
  static hasChatBotAccess(role) {
    return ROLES[role]?.chatbotAccess || false;
  }

  /**
   * Logout user session
   */
  static async logout(userId, sessionId) {
    const user = await this.findById(userId);
    if (!user) return false;

    if (user.activeSessions.has(sessionId)) {
      const session = user.activeSessions.get(sessionId);
      session.isActive = false;
      user.activeSessions.set(sessionId, session);
      
      // Remove token from history
      user.tokenHistory.delete(session.token);
    }

    return true;
  }

  /**
   * Logout all sessions for user
   */
  static async logoutAllSessions(userId) {
    const user = await this.findById(userId);
    if (!user) return false;

    for (const [sessionId, session] of user.activeSessions) {
      session.isActive = false;
      user.tokenHistory.delete(session.token);
    }

    user.activeSessions.clear();
    return true;
  }

  /**
   * Clean up old sessions
   */
  static async cleanupOldSessions(user) {
    const maxSessions = user.securitySettings.maxSessions;
    const sessions = Array.from(user.activeSessions.values())
      .filter(session => session.isActive)
      .sort((a, b) => b.lastActivity - a.lastActivity);

    // Remove oldest sessions if exceeding limit
    if (sessions.length > maxSessions) {
      const sessionsToRemove = sessions.slice(maxSessions);
      for (const session of sessionsToRemove) {
        session.isActive = false;
        user.tokenHistory.delete(session.token);
        user.activeSessions.delete(session.sessionId);
      }
    }
  }

  /**
   * Get user's active sessions
   */
  static async getActiveSessions(userId) {
    const user = await this.findById(userId);
    if (!user) return [];

    return Array.from(user.activeSessions.values())
      .filter(session => session.isActive);
  }
}

// Enhanced Permission Checker with ChatBot-specific permissions
class PermissionChecker {
  /**
   * Check if user has specific permission
   */
  static hasPermission(userRole, requiredPermission, dataScope = null, userId = null, targetUserId = null) {
    const roleConfig = ROLES[userRole];
    if (!roleConfig) return false;

    // Super admin has all permissions
    if (roleConfig.permissions.includes('*')) return true;

    // Check for exact permission match
    if (roleConfig.permissions.includes(requiredPermission)) return true;

    // Check for wildcard permissions
    const permissionParts = requiredPermission.split(':');
    const wildcardPermission = `${permissionParts[0]}:*`;
    if (roleConfig.permissions.includes(wildcardPermission)) return true;

    // Check for scope-specific permissions
    if (dataScope === 'own' && userId === targetUserId) {
      const ownPermission = `${requiredPermission}:own`;
      if (roleConfig.permissions.includes(ownPermission)) return true;
    }

    return false;
  }

  /**
   * Get account access level for user
   */
  static getAccountAccessLevel(userRole, accountId) {
    const roleConfig = ROLES[userRole];
    if (!roleConfig) return 'NONE';

    if (roleConfig.level >= 80) return 'FULL';
    if (roleConfig.level >= 60) return 'MANAGE';
    if (roleConfig.level >= 40) return 'READ';
    return 'LIMITED';
  }

  /**
   * Check transaction access permissions
   */
  static hasTransactionAccess(userRole, accessLevel, accountId, userAccountIds) {
    const roleConfig = ROLES[userRole];
    if (!roleConfig) return false;

    // Check if user has access to the account
    if (userAccountIds && !userAccountIds.includes(accountId)) {
      return false;
    }

    // Check permission based on access level
    const permission = `transactions:${accessLevel.toLowerCase()}`;
    return this.hasPermission(userRole, permission);
  }

  /**
   * Authorize payment based on role and limits
   */
  static authorizePayment(userRole, amount, paymentType, userAccountIds) {
    const roleConfig = ROLES[userRole];
    if (!roleConfig) {
      return { authorized: false, reason: 'Invalid user role' };
    }

    const limits = roleConfig.paymentLimits;
    if (!limits) {
      return { authorized: false, reason: 'No payment limits configured' };
    }

    // Check transaction limit
    if (amount > limits.transaction) {
      return { 
        authorized: false, 
        reason: `Amount exceeds transaction limit of ${limits.transaction}`,
        limits 
      };
    }

    // Check if user has payment permission
    if (!this.hasPermission(userRole, 'payments:initiate') && 
        !this.hasPermission(userRole, 'payments:own')) {
      return { 
        authorized: false, 
        reason: 'Insufficient payment permissions',
        limits 
      };
    }

    return { 
      authorized: true, 
      limits,
      requiresApproval: amount > (limits.transaction * 0.8) // Require approval for large transactions
    };
  }

  /**
   * Check ChatBot access permissions
   */
  static hasChatBotAccess(userRole, operation = 'basic') {
    const roleConfig = ROLES[userRole];
    if (!roleConfig || !roleConfig.chatbotAccess) return false;

    const chatbotPermission = `chatbot:${operation}`;
    return this.hasPermission(userRole, chatbotPermission);
  }
}

module.exports = {
  UserService,
  PermissionChecker,
  ROLES
};
