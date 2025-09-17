const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const Joi = require('joi');
const { validateRequest } = require('../middleware/validation');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const CustomerModel = require('../models/CustomerModel');
const { UserService } = require('../models/users');
const { query } = require('../database');

const router = express.Router();

// Validation schemas
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  loginType: Joi.string().valid('CUSTOMER', 'ADMIN').default('CUSTOMER')
});

const registerCustomerSchema = Joi.object({
  // Basic Information
  customerType: Joi.string().valid('INDIVIDUAL', 'BUSINESS', 'JOINT').default('INDIVIDUAL'),
  title: Joi.string().valid('Mr', 'Mrs', 'Ms', 'Dr', 'Prof').optional(),
  firstName: Joi.string().min(1).max(50).required(),
  lastName: Joi.string().min(1).max(50).required(),
  dateOfBirth: Joi.date().max('now').required(),
  placeOfBirth: Joi.string().max(100).optional(),
  
  // Contact Information
  email: Joi.string().email().required(),
  password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    }),
  phoneNumber: Joi.string().pattern(/^\d{3}-\d{3}-\d{4}$/).required()
    .messages({
      'string.pattern.base': 'Phone number must be in format XXX-XXX-XXXX'
    }),
  alternatePhoneNumber: Joi.string().pattern(/^\d{3}-\d{3}-\d{4}$/).optional(),
  
  // Address Information
  addressLine1: Joi.string().max(100).required(),
  addressLine2: Joi.string().max(100).optional(),
  city: Joi.string().max(50).required(),
  state: Joi.string().length(2).required(),
  zipCode: Joi.string().pattern(/^\d{5}(-\d{4})?$/).required(),
  country: Joi.string().default('USA'),
  
  // Identification
  ssn: Joi.string().pattern(/^\d{3}-\d{2}-\d{4}$/).required()
    .messages({
      'string.pattern.base': 'SSN must be in format XXX-XX-XXXX'
    }),
  driversLicenseNumber: Joi.string().max(20).optional(),
  driversLicenseState: Joi.string().length(2).optional(),
  
  // Employment Information
  employmentStatus: Joi.string().valid('FULL_TIME', 'PART_TIME', 'SELF_EMPLOYED', 'RETIRED', 'STUDENT', 'UNEMPLOYED').required(),
  employer: Joi.string().max(100).when('employmentStatus', {
    is: Joi.valid('FULL_TIME', 'PART_TIME'),
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  jobTitle: Joi.string().max(100).optional(),
  workPhoneNumber: Joi.string().pattern(/^\d{3}-\d{3}-\d{4}$/).optional(),
  annualIncome: Joi.string().valid('0-25000', '25000-50000', '50000-75000', '75000-100000', '100000-150000', '150000+').required(),
  
  // Business Information (for business customers)
  businessName: Joi.string().max(100).when('customerType', {
    is: 'BUSINESS',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  businessType: Joi.string().valid('LLC', 'Corporation', 'Partnership', 'Sole Proprietorship').when('customerType', {
    is: 'BUSINESS',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  ein: Joi.string().pattern(/^\d{2}-\d{7}$/).when('customerType', {
    is: 'BUSINESS',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  
  // Preferences
  preferredLanguage: Joi.string().default('EN'),
  marketingOptIn: Joi.boolean().default(false)
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required()
});

// Generate JWT token
const generateToken = (user, type = 'CUSTOMER') => {
  const payload = {
    userId: user.id,
    email: user.email,
    type: type,
    customerId: type === 'CUSTOMER' ? user.id : null,
    role: type === 'ADMIN' ? user.role : 'CUSTOMER',
    permissions: type === 'ADMIN' ? user.permissions : UserService.getUserPermissions('CUSTOMER')?.permissions || [
      'accounts:read:own', 'transactions:read:own', 'cards:read:own',
      'cards:create:own', 'disputes:create:own', 'disputes:read:own'
    ]
  };

  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'enterprise-banking-secret-key',
    { 
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      issuer: 'enterprise-banking-api',
      audience: 'banking-application'
    }
  );
};

// POST /api/v1/auth/login
router.post('/login', validateRequest(loginSchema), async (req, res) => {
  try {
    const { email, password, loginType } = req.body;

    if (loginType === 'ADMIN') {
      // Admin login - check admin users table
      const adminQuery = `
        SELECT id, email, password_hash, role, permissions, is_active, last_login_at
        FROM admin_users 
        WHERE email = $1 AND is_active = true
      `;
      
      const adminResult = await query(adminQuery, [email]);
      
      if (adminResult.rows.length === 0) {
        return res.status(401).json({
          error: 'Invalid credentials',
          message: 'Email or password is incorrect'
        });
      }

      const admin = adminResult.rows[0];
      
      // Verify password
      const isPasswordValid = await bcrypt.compare(password, admin.password_hash);
      if (!isPasswordValid) {
        return res.status(401).json({
          error: 'Invalid credentials',
          message: 'Email or password is incorrect'
        });
      }

      // Update last login
      await query(
        'UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
        [admin.id]
      );

      const token = generateToken(admin, 'ADMIN');

      return res.status(200).json({
        message: 'Admin login successful',
        token,
        expiresAt: new Date(Date.now() + (24 * 60 * 60 * 1000)),
        user: {
          id: admin.id,
          email: admin.email,
          role: admin.role,
          permissions: admin.permissions,
          type: 'ADMIN',
          lastLoginAt: new Date()
        }
      });
    }

    // Customer login
    const customer = await CustomerModel.findByEmail(email);
    if (!customer) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Check account status
    if (customer.status !== 'ACTIVE') {
      return res.status(401).json({
        error: 'Account inactive',
        message: 'Your account has been deactivated. Please contact customer service.',
        accountStatus: customer.status
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, customer.password_hash);
    if (!isPasswordValid) {
      // Track failed login attempt
      await CustomerModel.trackLoginAttempt(customer.id, false, req.ip);
      
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Check for account lockout
    if (customer.account_locked_until && new Date() < new Date(customer.account_locked_until)) {
      return res.status(423).json({
        error: 'Account locked',
        message: 'Account is temporarily locked due to multiple failed login attempts',
        lockedUntil: customer.account_locked_until
      });
    }

    // Successful login - track it
    await CustomerModel.trackLoginAttempt(customer.id, true, req.ip);

    // Generate token
    const token = generateToken(customer, 'CUSTOMER');

    // Get customer's accounts
    const accountsQuery = `
      SELECT a.id, a.account_number, a.status, a.credit_limit, a.current_balance,
             a.account_type
      FROM accounts a
      WHERE a.user_id = $1 AND a.status != 'CLOSED'
    `;
    
    const accountsResult = await query(accountsQuery, [customer.id]);

    // Prepare customer response (without sensitive data)
    const customerResponse = {
      id: customer.id,
      customerNumber: customer.customer_number,
      email: customer.email,
      firstName: customer.first_name,
      lastName: customer.last_name,
      fullName: customer.full_name,
      customerType: customer.customer_type,
      kycStatus: customer.kyc_status,
      riskRating: customer.risk_rating,
      preferredLanguage: customer.preferred_language,
      accounts: accountsResult.rows,
      lastLoginAt: new Date()
    };

    res.status(200).json({
      message: 'Login successful',
      token,
      expiresAt: new Date(Date.now() + (24 * 60 * 60 * 1000)),
      customer: customerResponse
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'An error occurred during login'
    });
  }
});

// POST /api/v1/auth/register
router.post('/register', validateRequest(registerCustomerSchema), async (req, res) => {
  try {
    const customerData = req.body;

    // Check if customer already exists
    const existingCustomer = await CustomerModel.findByEmail(customerData.email);
    if (existingCustomer) {
      return res.status(409).json({
        error: 'Customer already exists',
        message: 'An account with this email already exists'
      });
    }

    // Check for SSN conflicts (for individual customers)
    if (customerData.customerType === 'INDIVIDUAL') {
      const existingSSN = await CustomerModel.findBySSN(customerData.ssn);
      if (existingSSN) {
        return res.status(409).json({
          error: 'SSN already registered',
          message: 'A customer with this SSN already exists'
        });
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(customerData.password, 12);
    delete customerData.password; // Remove plain password

    // Add password hash to customer data
    customerData.passwordHash = passwordHash;
    customerData.kycStatus = 'PENDING'; // New customers start with pending KYC
    customerData.riskRating = 'MEDIUM'; // Default risk rating
    customerData.accountStatus = 'PENDING_VERIFICATION'; // Require verification before activation

    // Create customer
    const newCustomer = await CustomerModel.createCustomer(customerData);

    // Log registration event
    await query(`
      INSERT INTO audit_logs (
        customer_id, action, details, ip_address, created_at
      ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
    `, [
      newCustomer.id,
      'CUSTOMER_REGISTRATION',
      JSON.stringify({ email: newCustomer.email, customerType: newCustomer.customer_type }),
      req.ip
    ]);

    // Prepare response (without sensitive data)
    const customerResponse = {
      id: newCustomer.id,
      customerNumber: newCustomer.customer_number,
      email: newCustomer.email,
      firstName: newCustomer.first_name,
      lastName: newCustomer.last_name,
      customerType: newCustomer.customer_type,
      kycStatus: newCustomer.kyc_status,
      accountStatus: newCustomer.account_status,
      message: 'Registration successful. Please verify your email and complete KYC requirements.'
    };

    res.status(201).json({
      message: 'Customer registration successful',
      customer: customerResponse,
      nextSteps: [
        'Verify your email address',
        'Complete identity verification (KYC)',
        'Upload required documents',
        'Account will be activated after verification'
      ]
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.code === '23505') { // PostgreSQL unique constraint violation
      return res.status(409).json({
        error: 'Registration failed',
        message: 'A customer with this information already exists'
      });
    }

    res.status(500).json({
      error: 'Registration failed',
      message: 'An error occurred during registration'
    });
  }
});

// POST /api/v1/auth/change-password
router.post('/change-password', authenticateToken, validateRequest(changePasswordSchema), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const customerId = req.user.customerId;

    if (!customerId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only customers can change their password'
      });
    }

    // Get current customer data
    const customer = await CustomerModel.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: 'Customer account not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, customer.password_hash);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        error: 'Invalid current password',
        message: 'The current password you entered is incorrect'
      });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await query(
      'UPDATE customers SET password_hash = $1, password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, customerId]
    );

    // Log password change
    await query(`
      INSERT INTO audit_logs (
        customer_id, action, details, ip_address, created_at
      ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
    `, [
      customerId,
      'PASSWORD_CHANGED',
      JSON.stringify({ email: customer.email }),
      req.ip
    ]);

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

// POST /api/v1/auth/logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // In a production system, you might want to blacklist the JWT token
    // For now, we'll just log the logout event
    
    if (req.user.customerId) {
      await query(`
        INSERT INTO audit_logs (
          customer_id, action, details, ip_address, created_at
        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      `, [
        req.user.customerId,
        'CUSTOMER_LOGOUT',
        JSON.stringify({ email: req.user.email }),
        req.ip
      ]);
    }

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

// GET /api/v1/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const { userId, type, customerId } = req.user;

    if (type === 'ADMIN') {
      const adminQuery = `
        SELECT id, email, role, permissions, last_login_at, created_at
        FROM admin_users 
        WHERE id = $1 AND is_active = true
      `;
      
      const adminResult = await query(adminQuery, [userId]);
      
      if (adminResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Admin not found',
          message: 'Admin account not found'
        });
      }

      const admin = adminResult.rows[0];
      
      return res.status(200).json({
        user: {
          id: admin.id,
          email: admin.email,
          role: admin.role,
          permissions: admin.permissions,
          type: 'ADMIN',
          lastLoginAt: admin.last_login_at,
          memberSince: admin.created_at
        }
      });
    }

    // Customer profile
    const customer = await CustomerModel.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: 'Customer account not found'
      });
    }

    // Get customer's accounts
    const accountsQuery = `
      SELECT ca.id, ca.account_number, ca.account_status, ca.credit_limit, 
             ca.current_balance, ca.available_credit, ca.minimum_payment_due,
             ccp.product_name, ccp.product_type
      FROM credit_accounts ca
      LEFT JOIN credit_card_products ccp ON ca.product_id = ccp.id
      WHERE ca.customer_id = $1 AND ca.account_status != 'CLOSED'
    `;
    
    const accountsResult = await query(accountsQuery, [customerId]);

    // Prepare customer response (without sensitive PII)
    const customerResponse = {
      id: customer.id,
      customerNumber: customer.customer_number,
      email: customer.email,
      firstName: customer.first_name,
      lastName: customer.last_name,
      fullName: customer.full_name,
      customerType: customer.customer_type,
      phoneNumber: customer.phone_number,
      city: customer.city,
      state: customer.state,
      kycStatus: customer.kyc_status,
      riskRating: customer.risk_rating,
      accountStatus: customer.account_status,
      preferredLanguage: customer.preferred_language,
      marketingOptIn: customer.marketing_opt_in,
      customerSince: customer.customer_since,
      lastLoginAt: customer.last_login_at,
      accounts: accountsResult.rows
    };

    res.status(200).json({
      customer: customerResponse
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Profile fetch failed',
      message: 'An error occurred while fetching profile'
    });
  }
});

// POST /api/v1/auth/verify-email
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        error: 'Verification token required',
        message: 'Email verification token is required'
      });
    }

    // In a production system, you would verify the email verification token
    // For this demo, we'll simulate email verification
    
    // Decode token to get customer ID (in production, verify signature)
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.customerId) {
      return res.status(400).json({
        error: 'Invalid token',
        message: 'Invalid email verification token'
      });
    }

    // Update customer email verification status
    const updateResult = await query(
      'UPDATE customers SET email_verified = true, email_verified_at = CURRENT_TIMESTAMP WHERE id = $1 AND email_verified = false',
      [decoded.customerId]
    );

    if (updateResult.rowCount === 0) {
      return res.status(400).json({
        error: 'Email already verified',
        message: 'Email address has already been verified'
      });
    }

    res.status(200).json({
      message: 'Email verified successfully'
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      error: 'Email verification failed',
      message: 'An error occurred during email verification'
    });
  }
});

module.exports = router;
