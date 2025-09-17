const express = require('express');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { validateRequest } = require('../middleware/validation');
const { auth, authorize } = require('../middleware/auth');
const { UserService, ROLES } = require('../models/users');
const {
  createRouteDebugLogger,
  logAuthEvent,
  logBusinessOperation,
  logError,
  withPerformanceLogging
} = require('../middleware/apiDebugLogger');

const router = express.Router();

// Create route-specific debug logger
const debugLogger = createRouteDebugLogger('auth');

// Validation schemas
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  role: Joi.string().valid(...Object.keys(ROLES)).optional().default('CUSTOMER'),
  phone: Joi.string().optional(),
  address: Joi.object({
    street: Joi.string().required(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    zipCode: Joi.string().required(),
    country: Joi.string().default('USA')
  }).optional()
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required()
});

// Generate JWT token
const generateToken = (user) => {
  const payload = {
    userId: user.userId,
    email: user.email,
    role: user.role
  };

  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'credit-card-secret-key',
    { 
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      issuer: 'credit-card-enterprise',
      audience: 'credit-card-api'
    }
  );
};

// POST /api/v1/auth/login
router.post('/login', validateRequest(loginSchema), async (req, res) => {
  const startTime = Date.now();
  try {
    const { email, password } = req.body;

    debugLogger.info('Login attempt started', {
      requestId: req.requestId,
      email: email ? `${email.substring(0, 3)}***${email.substring(email.indexOf('@'))}` : 'unknown',
      clientInfo: {
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      }
    });

    // Find user by email
    const user = await UserService.findByEmail(email);
    if (!user) {
      const duration = Date.now() - startTime;
      
      logAuthEvent('Login failed - user not found', {
        email: email ? `${email.substring(0, 3)}***${email.substring(email.indexOf('@'))}` : 'unknown',
        requestId: req.requestId,
        duration: `${duration}ms`
      });
      
      debugLogger.warn('Login failed - user not found', {
        requestId: req.requestId,
        email: email ? `${email.substring(0, 3)}***${email.substring(email.indexOf('@'))}` : 'unknown',
        duration: `${duration}ms`
      });
      
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    debugLogger.debug('User found in system', {
      requestId: req.requestId,
      userId: user.userId,
      userStatus: user.status,
      userRole: user.role
    });

    // Check if user is active
    if (user.status !== 'ACTIVE') {
      const duration = Date.now() - startTime;
      
      logAuthEvent('Login failed - account inactive', {
        userId: user.userId,
        email: email ? `${email.substring(0, 3)}***${email.substring(email.indexOf('@'))}` : 'unknown',
        status: user.status,
        requestId: req.requestId,
        duration: `${duration}ms`
      });
      
      debugLogger.warn('Login failed - account inactive', {
        requestId: req.requestId,
        userId: user.userId,
        status: user.status,
        duration: `${duration}ms`
      });
      
      return res.status(401).json({
        error: 'Account inactive',
        message: 'Your account has been deactivated. Please contact support.'
      });
    }

    // Validate password
    const isPasswordValid = await UserService.validatePassword(password, user.password);
    if (!isPasswordValid) {
      const duration = Date.now() - startTime;
      
      logAuthEvent('Login failed - invalid password', {
        userId: user.userId,
        email: email ? `${email.substring(0, 3)}***${email.substring(email.indexOf('@'))}` : 'unknown',
        requestId: req.requestId,
        duration: `${duration}ms`
      });
      
      debugLogger.warn('Login failed - invalid password', {
        requestId: req.requestId,
        userId: user.userId,
        duration: `${duration}ms`
      });
      
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    debugLogger.debug('Password validation successful', {
      requestId: req.requestId,
      userId: user.userId
    });

    // Update last login
    await UserService.updateLastLogin(user.userId);

    // Generate JWT token
    const token = generateToken(user);

    debugLogger.debug('JWT token generated', {
      requestId: req.requestId,
      userId: user.userId,
      tokenLength: token.length
    });

    // Prepare user response (without sensitive data)
    const userResponse = {
      userId: user.userId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      permissions: UserService.getUserPermissions(user.role),
      accountIds: user.role === 'CUSTOMER' ? user.accountIds : undefined,
      lastLoginAt: new Date()
    };

    const duration = Date.now() - startTime;
    
    logAuthEvent('Login successful', {
      userId: user.userId,
      email: email ? `${email.substring(0, 3)}***${email.substring(email.indexOf('@'))}` : 'unknown',
      role: user.role,
      requestId: req.requestId,
      duration: `${duration}ms`
    });

    debugLogger.performance('Login completed successfully', duration, {
      requestId: req.requestId,
      userId: user.userId,
      role: user.role
    });

    res.status(200).json({
      message: 'Login successful',
      token,
      expiresAt: new Date(Date.now() + (24 * 60 * 60 * 1000)), // 24 hours
      user: userResponse
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logError(error, {
      requestId: req.requestId,
      operation: 'POST /auth/login',
      duration: `${duration}ms`,
      email: req.body.email ? `${req.body.email.substring(0, 3)}***${req.body.email.substring(req.body.email.indexOf('@'))}` : 'unknown'
    });
    
    debugLogger.error('Login error occurred', {
      requestId: req.requestId,
      error: error.message,
      duration: `${duration}ms`
    });
    
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'An error occurred during login'
    });
  }
});

// POST /api/v1/auth/register
router.post('/register', validateRequest(registerSchema), async (req, res) => {
  const startTime = Date.now();
  try {
    const userData = req.body;

    debugLogger.info('Registration attempt started', {
      requestId: req.requestId,
      email: userData.email ? `${userData.email.substring(0, 3)}***${userData.email.substring(userData.email.indexOf('@'))}` : 'unknown',
      role: userData.role || 'CUSTOMER',
      clientInfo: {
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      }
    });

    // Check if user already exists
    const existingUser = await UserService.findByEmail(userData.email);
    if (existingUser) {
      const duration = Date.now() - startTime;
      
      logAuthEvent('Registration failed - user already exists', {
        email: userData.email ? `${userData.email.substring(0, 3)}***${userData.email.substring(userData.email.indexOf('@'))}` : 'unknown',
        requestId: req.requestId,
        duration: `${duration}ms`
      });
      
      debugLogger.warn('Registration failed - user already exists', {
        requestId: req.requestId,
        email: userData.email ? `${userData.email.substring(0, 3)}***${userData.email.substring(userData.email.indexOf('@'))}` : 'unknown',
        duration: `${duration}ms`
      });
      
      return res.status(409).json({
        error: 'User already exists',
        message: 'An account with this email already exists'
      });
    }

    // Only allow customer registration for now (admin can create other roles)
    if (userData.role && userData.role !== 'CUSTOMER') {
      const duration = Date.now() - startTime;
      
      logAuthEvent('Registration failed - invalid role', {
        email: userData.email ? `${userData.email.substring(0, 3)}***${userData.email.substring(userData.email.indexOf('@'))}` : 'unknown',
        attemptedRole: userData.role,
        requestId: req.requestId,
        duration: `${duration}ms`
      });
      
      debugLogger.warn('Registration failed - invalid role', {
        requestId: req.requestId,
        attemptedRole: userData.role,
        duration: `${duration}ms`
      });
      
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only customer accounts can be self-registered'
      });
    }

    debugLogger.debug('Registration validation passed', {
      requestId: req.requestId,
      role: userData.role || 'CUSTOMER'
    });

    // Create new user
    const newUser = await UserService.createUser(userData);

    debugLogger.debug('New user created successfully', {
      requestId: req.requestId,
      userId: newUser.userId,
      role: newUser.role
    });

    // Generate initial accounts for customer
    if (newUser.role === 'CUSTOMER') {
      // In a real system, this would create actual accounts
      newUser.accountIds = [`acc_${newUser.userId.split('_')[2]}_001`];
      
      debugLogger.debug('Initial account IDs generated for customer', {
        requestId: req.requestId,
        userId: newUser.userId,
        accountIds: newUser.accountIds
      });
    }

    // Generate JWT token
    const token = generateToken(newUser);

    // Prepare response
    const userResponse = {
      userId: newUser.userId,
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      role: newUser.role,
      permissions: UserService.getUserPermissions(newUser.role),
      accountIds: newUser.accountIds
    };

    const duration = Date.now() - startTime;
    
    logAuthEvent('Registration successful', {
      userId: newUser.userId,
      email: userData.email ? `${userData.email.substring(0, 3)}***${userData.email.substring(userData.email.indexOf('@'))}` : 'unknown',
      role: newUser.role,
      requestId: req.requestId,
      duration: `${duration}ms`
    });

    debugLogger.performance('Registration completed successfully', duration, {
      requestId: req.requestId,
      userId: newUser.userId,
      role: newUser.role
    });

    res.status(201).json({
      message: 'Account created successfully',
      token,
      expiresAt: new Date(Date.now() + (24 * 60 * 60 * 1000)),
      user: userResponse
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logError(error, {
      requestId: req.requestId,
      operation: 'POST /auth/register',
      duration: `${duration}ms`,
      email: req.body.email ? `${req.body.email.substring(0, 3)}***${req.body.email.substring(req.body.email.indexOf('@'))}` : 'unknown'
    });
    
    debugLogger.error('Registration error occurred', {
      requestId: req.requestId,
      error: error.message,
      duration: `${duration}ms`
    });
    
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: 'An error occurred during registration'
    });
  }
});

// GET /api/v1/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    const { user } = req;

    // Get fresh user data
    const userData = await UserService.findById(user.userId);
    if (!userData) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User data not available'
      });
    }

    const userResponse = {
      userId: userData.userId,
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      role: userData.role,
      permissions: UserService.getUserPermissions(userData.role),
      accountIds: userData.role === 'CUSTOMER' ? userData.accountIds : undefined,
      status: userData.status,
      createdAt: userData.createdAt,
      lastLoginAt: userData.lastLoginAt
    };

    res.status(200).json({
      user: userResponse
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Profile retrieval failed',
      message: 'An error occurred while retrieving profile'
    });
  }
});

// POST /api/v1/auth/refresh
router.post('/refresh', auth, async (req, res) => {
  try {
    const { user } = req;

    // Get fresh user data to ensure user is still active
    const userData = await UserService.findById(user.userId);
    if (!userData || userData.status !== 'ACTIVE') {
      return res.status(401).json({
        error: 'Invalid user',
        message: 'User account is no longer active'
      });
    }

    // Generate new token
    const token = generateToken(userData);

    res.status(200).json({
      message: 'Token refreshed successfully',
      token,
      expiresAt: new Date(Date.now() + (24 * 60 * 60 * 1000))
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Token refresh failed',
      message: 'An error occurred while refreshing token'
    });
  }
});

// POST /api/v1/auth/change-password
router.post('/change-password', auth, validateRequest(changePasswordSchema), async (req, res) => {
  try {
    const { user } = req;
    const { currentPassword, newPassword } = req.body;

    // Get user data
    const userData = await UserService.findById(user.userId);
    if (!userData) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User data not available'
      });
    }

    // Validate current password
    const isCurrentPasswordValid = await UserService.validatePassword(currentPassword, userData.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        error: 'Invalid password',
        message: 'Current password is incorrect'
      });
    }

    // Update password (this would update the database in a real system)
    const bcrypt = require('bcryptjs');
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    userData.password = hashedNewPassword;

    res.status(200).json({
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      error: 'Password change failed',
      message: 'An error occurred while changing password'
    });
  }
});

// GET /api/v1/auth/users (Admin only)
router.get('/users', auth, authorize('users:read'), async (req, res) => {
  try {
    const { user } = req;
    
    const users = await UserService.getAllUsers(user.role);
    
    res.status(200).json({
      users,
      total: users.length
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      error: 'Failed to retrieve users',
      message: 'An error occurred while retrieving users'
    });
  }
});

// GET /api/v1/auth/permissions
router.get('/permissions', auth, (req, res) => {
  try {
    const { user } = req;
    
    const roleInfo = ROLES[user.role];
    
    res.status(200).json({
      role: user.role,
      permissions: roleInfo ? roleInfo.permissions : [],
      level: roleInfo ? roleInfo.level : 0,
      description: roleInfo ? roleInfo.description : 'Unknown role'
    });

  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({
      error: 'Failed to retrieve permissions',
      message: 'An error occurred while retrieving permissions'
    });
  }
});

// POST /api/v1/auth/logout
router.post('/logout', auth, (req, res) => {
  try {
    // In a real system, you'd invalidate the token in a blacklist/database
    // For this demo, we'll just return success
    res.status(200).json({
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: 'An error occurred during logout'
    });
  }
});

module.exports = router;
