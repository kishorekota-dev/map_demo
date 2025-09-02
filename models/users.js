const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// User roles with hierarchical permissions
const ROLES = {
  SUPER_ADMIN: {
    level: 100,
    permissions: ['*'], // All permissions
    description: 'Full system access'
  },
  ADMIN: {
    level: 80,
    permissions: [
      'users:*', 'accounts:*', 'transactions:*', 'cards:*', 
      'fraud:*', 'disputes:*', 'reports:*', 'audit:*'
    ],
    description: 'Administrative access to all resources'
  },
  MANAGER: {
    level: 60,
    permissions: [
      'accounts:read', 'accounts:update', 'transactions:*', 
      'cards:*', 'fraud:*', 'disputes:*', 'reports:read'
    ],
    description: 'Management access to customer operations'
  },
  AGENT: {
    level: 40,
    permissions: [
      'accounts:read', 'transactions:read', 'cards:read', 
      'cards:update', 'fraud:read', 'fraud:create', 'disputes:*'
    ],
    description: 'Customer service agent access'
  },
  CUSTOMER: {
    level: 20,
    permissions: [
      'accounts:read:own', 'transactions:read:own', 'cards:read:own',
      'cards:create:own', 'disputes:create:own', 'disputes:read:own'
    ],
    description: 'Customer self-service access'
  }
};

// Mock user database
const mockUsers = [
  {
    userId: 'user_superadmin_001',
    email: 'superadmin@creditcard.com',
    password: '$2a$10$8K9wX2fX3qwRvLBY7FMZfOvYx1J3QpQrS4WzN8VmB5A2C7D6E9F8G0', // 'admin123'
    firstName: 'Super',
    lastName: 'Admin',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    accountIds: ['*'], // Access to all accounts
    createdAt: new Date('2024-01-01'),
    lastLoginAt: new Date(),
    department: 'IT',
    employeeId: 'EMP001'
  },
  {
    userId: 'user_admin_001',
    email: 'admin@creditcard.com',
    password: '$2a$10$8K9wX2fX3qwRvLBY7FMZfOvYx1J3QpQrS4WzN8VmB5A2C7D6E9F8G0', // 'admin123'
    firstName: 'System',
    lastName: 'Administrator',
    role: 'ADMIN',
    status: 'ACTIVE',
    accountIds: ['*'], // Access to all accounts
    createdAt: new Date('2024-01-01'),
    lastLoginAt: new Date(),
    department: 'Operations',
    employeeId: 'EMP002'
  },
  {
    userId: 'user_manager_001',
    email: 'manager@creditcard.com',
    password: '$2a$10$8K9wX2fX3qwRvLBY7FMZfOvYx1J3QpQrS4WzN8VmB5A2C7D6E9F8G0', // 'admin123'
    firstName: 'Branch',
    lastName: 'Manager',
    role: 'MANAGER',
    status: 'ACTIVE',
    accountIds: ['*'], // Can access all customer accounts in their branch
    createdAt: new Date('2024-01-01'),
    lastLoginAt: new Date(),
    department: 'Customer Relations',
    employeeId: 'EMP003',
    branchId: 'BRANCH_001'
  },
  {
    userId: 'user_agent_001',
    email: 'agent@creditcard.com',
    password: '$2a$10$8K9wX2fX3qwRvLBY7FMZfOvYx1J3QpQrS4WzN8VmB5A2C7D6E9F8G0', // 'admin123'
    firstName: 'Customer',
    lastName: 'Agent',
    role: 'AGENT',
    status: 'ACTIVE',
    accountIds: ['*'], // Can access customer accounts they're assigned to
    createdAt: new Date('2024-01-01'),
    lastLoginAt: new Date(),
    department: 'Customer Service',
    employeeId: 'EMP004',
    branchId: 'BRANCH_001'
  },
  {
    userId: 'user_customer_001',
    email: 'john.doe@email.com',
    password: '$2a$10$8K9wX2fX3qwRvLBY7FMZfOvYx1J3QpQrS4WzN8VmB5A2C7D6E9F8G0', // 'admin123'
    firstName: 'John',
    lastName: 'Doe',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    accountIds: ['acc_001', 'acc_002'], // Only their own accounts
    createdAt: new Date('2024-01-01'),
    lastLoginAt: new Date(),
    customerId: 'CUST_001',
    phone: '+1-555-0101',
    address: {
      street: '123 Main St',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      country: 'USA'
    }
  },
  {
    userId: 'user_customer_002',
    email: 'jane.smith@email.com',
    password: '$2a$10$8K9wX2fX3qwRvLBY7FMZfOvYx1J3QpQrS4WzN8VmB5A2C7D6E9F8G0', // 'admin123'
    firstName: 'Jane',
    lastName: 'Smith',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    accountIds: ['acc_003', 'acc_004'], // Only their own accounts
    createdAt: new Date('2024-01-15'),
    lastLoginAt: new Date(),
    customerId: 'CUST_002',
    phone: '+1-555-0102',
    address: {
      street: '456 Oak Ave',
      city: 'Los Angeles',
      state: 'CA',
      zipCode: '90210',
      country: 'USA'
    }
  },
  {
    userId: 'user_customer_003',
    email: 'demo@example.com',
    password: '$2a$10$8K9wX2fX3qwRvLBY7FMZfOvYx1J3QpQrS4WzN8VmB5A2C7D6E9F8G0', // 'admin123'
    firstName: 'Demo',
    lastName: 'User',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    accountIds: ['acc_005'], // Only their own account
    createdAt: new Date('2024-02-01'),
    lastLoginAt: new Date(),
    customerId: 'CUST_003',
    phone: '+1-555-0103',
    address: {
      street: '789 Demo St',
      city: 'Demo City',
      state: 'DC',
      zipCode: '12345',
      country: 'USA'
    }
  }
];

// Permission checking utilities
class PermissionChecker {
  static hasPermission(userRole, requiredPermission, dataScope = null, userId = null, resourceOwnerId = null) {
    const role = ROLES[userRole];
    if (!role) return false;

    // Super admin has all permissions
    if (userRole === 'SUPER_ADMIN') return true;

    // Check if user has wildcard permission
    if (role.permissions.includes('*')) return true;

    // Check exact permission match
    if (role.permissions.includes(requiredPermission)) return true;

    // Check wildcard resource permissions (e.g., 'accounts:*')
    const [resource] = requiredPermission.split(':');
    if (role.permissions.includes(`${resource}:*`)) return true;

    // Check scope-specific permissions (e.g., 'accounts:read:own')
    if (dataScope) {
      const scopedPermission = `${requiredPermission}:${dataScope}`;
      if (role.permissions.includes(scopedPermission)) {
        // For 'own' scope, check if user is accessing their own data
        if (dataScope === 'own') {
          return userId === resourceOwnerId;
        }
        return true;
      }
    }

    return false;
  }

  static canAccessAccount(userRole, userId, accountId, accountOwnerId) {
    // Super admin and admin can access all accounts
    if (['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(userRole)) {
      return true;
    }

    // Agents can access accounts they're assigned to (simplified for demo)
    if (userRole === 'AGENT') {
      return true; // In real implementation, check assignment
    }

    // Customers can only access their own accounts
    if (userRole === 'CUSTOMER') {
      return userId === accountOwnerId;
    }

    return false;
  }

  static getAccessibleAccountIds(user) {
    if (['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT'].includes(user.role)) {
      return '*'; // Can access all accounts
    }
    
    return user.accountIds || [];
  }
}

// User database operations
class UserService {
  static async findByEmail(email) {
    return mockUsers.find(user => user.email.toLowerCase() === email.toLowerCase());
  }

  static async findById(userId) {
    return mockUsers.find(user => user.userId === userId);
  }

  static async validatePassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  static async createUser(userData) {
    const userId = `user_${userData.role.toLowerCase()}_${uuidv4().substring(0, 8)}`;
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    const newUser = {
      userId,
      ...userData,
      password: hashedPassword,
      status: 'ACTIVE',
      createdAt: new Date(),
      lastLoginAt: null
    };

    mockUsers.push(newUser);
    return newUser;
  }

  static async updateLastLogin(userId) {
    const user = mockUsers.find(u => u.userId === userId);
    if (user) {
      user.lastLoginAt = new Date();
    }
    return user;
  }

  static async getAllUsers(requesterRole) {
    // Only admins can see all users
    if (['SUPER_ADMIN', 'ADMIN'].includes(requesterRole)) {
      return mockUsers.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
    }
    return [];
  }

  static getUserPermissions(userRole) {
    return ROLES[userRole] || null;
  }
}

module.exports = {
  ROLES,
  PermissionChecker,
  UserService,
  mockUsers
};
