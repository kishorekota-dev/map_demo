const express = require('express');
const Joi = require('joi');
const { validateRequest } = require('../middleware/validation');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const CustomerModel = require('../models/CustomerModel');
const { query } = require('../database');

const router = express.Router();

// Validation schemas
const updateCustomerSchema = Joi.object({
  // Contact information updates
  phoneNumber: Joi.string().pattern(/^\d{3}-\d{3}-\d{4}$/).optional(),
  alternatePhoneNumber: Joi.string().pattern(/^\d{3}-\d{3}-\d{4}$/).allow(null).optional(),
  email: Joi.string().email().optional(),
  
  // Address updates
  addressLine1: Joi.string().max(100).optional(),
  addressLine2: Joi.string().max(100).allow(null).optional(),
  city: Joi.string().max(50).optional(),
  state: Joi.string().length(2).optional(),
  zipCode: Joi.string().pattern(/^\d{5}(-\d{4})?$/).optional(),
  
  // Employment updates
  employmentStatus: Joi.string().valid('FULL_TIME', 'PART_TIME', 'SELF_EMPLOYED', 'RETIRED', 'STUDENT', 'UNEMPLOYED').optional(),
  employer: Joi.string().max(100).allow(null).optional(),
  jobTitle: Joi.string().max(100).allow(null).optional(),
  workPhoneNumber: Joi.string().pattern(/^\d{3}-\d{3}-\d{4}$/).allow(null).optional(),
  annualIncome: Joi.string().valid('0-25000', '25000-50000', '50000-75000', '75000-100000', '100000-150000', '150000+').optional(),
  
  // Preferences
  preferredLanguage: Joi.string().valid('EN', 'ES', 'FR', 'DE', 'IT', 'PT', 'ZH', 'JA', 'KO', 'AR').optional(),
  marketingOptIn: Joi.boolean().optional()
});

const searchCustomersSchema = Joi.object({
  // Search criteria
  query: Joi.string().min(2).optional(),
  customerNumber: Joi.string().optional(),
  email: Joi.string().email().optional(),
  phoneNumber: Joi.string().optional(),
  firstName: Joi.string().optional(),
  lastName: Joi.string().optional(),
  
  // Filters
  customerType: Joi.string().valid('INDIVIDUAL', 'BUSINESS', 'JOINT').optional(),
  kycStatus: Joi.string().valid('PENDING', 'IN_PROGRESS', 'VERIFIED', 'REJECTED').optional(),
  accountStatus: Joi.string().valid('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION').optional(),
  riskRating: Joi.string().valid('LOW', 'MEDIUM', 'HIGH').optional(),
  
  // Date filters
  registeredAfter: Joi.date().optional(),
  registeredBefore: Joi.date().optional(),
  lastLoginAfter: Joi.date().optional(),
  lastLoginBefore: Joi.date().optional(),
  
  // Pagination
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(25),
  sortBy: Joi.string().valid('created_at', 'last_login_at', 'first_name', 'last_name', 'customer_number').default('created_at'),
  sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC')
});

const updateKYCSchema = Joi.object({
  kycStatus: Joi.string().valid('PENDING', 'IN_PROGRESS', 'VERIFIED', 'REJECTED').required(),
  kycNotes: Joi.string().max(500).optional(),
  verifiedBy: Joi.string().optional(),
  riskRating: Joi.string().valid('LOW', 'MEDIUM', 'HIGH').optional()
});

// GET /api/v1/customers/profile - Get own profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const customerId = req.user.customerId;

    if (!customerId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only customers can access this endpoint'
      });
    }

    const customer = await CustomerModel.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: 'Customer profile not found'
      });
    }

    // Get customer's accounts and cards
    const accountsQuery = `
      SELECT 
        ca.id, ca.account_number, ca.account_status, ca.credit_limit, 
        ca.current_balance, ca.available_credit, ca.minimum_payment_due,
        ca.payment_due_date, ca.statement_date, ca.current_apr,
        ccp.product_name, ccp.product_type, ccp.rewards_program,
        COUNT(cc.id) as card_count
      FROM credit_accounts ca
      LEFT JOIN credit_card_products ccp ON ca.product_id = ccp.id
      LEFT JOIN credit_cards cc ON ca.id = cc.account_id AND cc.card_status = 'ACTIVE'
      WHERE ca.customer_id = $1 AND ca.account_status != 'CLOSED'
      GROUP BY ca.id, ccp.id
      ORDER BY ca.created_at DESC
    `;
    
    const accountsResult = await query(accountsQuery, [customerId]);

    // Prepare response with decrypted PII for own profile
    const customerProfile = {
      id: customer.id,
      customerNumber: customer.customer_number,
      customerType: customer.customer_type,
      
      // Personal information
      title: customer.title,
      firstName: customer.first_name,
      lastName: customer.last_name,
      fullName: customer.full_name,
      dateOfBirth: customer.date_of_birth,
      placeOfBirth: customer.place_of_birth,
      
      // Contact information
      email: customer.email,
      phoneNumber: customer.phone_number,
      alternatePhoneNumber: customer.alternate_phone_number,
      
      // Address
      addressLine1: customer.address_line_1,
      addressLine2: customer.address_line_2,
      city: customer.city,
      state: customer.state,
      zipCode: customer.zip_code,
      country: customer.country,
      
      // Identification (masked for security)
      ssnMasked: customer.ssn ? `***-**-${customer.ssn.slice(-4)}` : null,
      driversLicenseNumber: customer.drivers_license_number ? `****${customer.drivers_license_number.slice(-4)}` : null,
      driversLicenseState: customer.drivers_license_state,
      
      // Employment
      employmentStatus: customer.employment_status,
      employer: customer.employer,
      jobTitle: customer.job_title,
      workPhoneNumber: customer.work_phone_number,
      annualIncome: customer.annual_income,
      
      // Business information (if applicable)
      businessName: customer.business_name,
      businessType: customer.business_type,
      businessPhone: customer.business_phone,
      yearsInBusiness: customer.years_in_business,
      
      // Account information
      kycStatus: customer.kyc_status,
      accountStatus: customer.account_status,
      riskRating: customer.risk_rating,
      preferredLanguage: customer.preferred_language,
      marketingOptIn: customer.marketing_opt_in,
      emailVerified: customer.email_verified,
      
      // Timestamps
      customerSince: customer.customer_since,
      lastLoginAt: customer.last_login_at,
      emailVerifiedAt: customer.email_verified_at,
      
      // Associated accounts
      accounts: accountsResult.rows
    };

    res.status(200).json({
      customer: customerProfile
    });

  } catch (error) {
    console.error('Get customer profile error:', error);
    res.status(500).json({
      error: 'Profile fetch failed',
      message: 'An error occurred while fetching customer profile'
    });
  }
});

// PUT /api/v1/customers/profile - Update own profile
router.put('/profile', authenticateToken, validateRequest(updateCustomerSchema), async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const updates = req.body;

    if (!customerId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only customers can update their profile'
      });
    }

    // Validate customer exists
    const existingCustomer = await CustomerModel.findById(customerId);
    if (!existingCustomer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: 'Customer profile not found'
      });
    }

    // Check for email conflicts if email is being updated
    if (updates.email && updates.email !== existingCustomer.email) {
      const emailConflict = await CustomerModel.findByEmail(updates.email);
      if (emailConflict) {
        return res.status(409).json({
          error: 'Email already exists',
          message: 'Another customer is already using this email address'
        });
      }
      // If email is being changed, mark as unverified
      updates.emailVerified = false;
      updates.emailVerifiedAt = null;
    }

    // Update customer
    const updatedCustomer = await CustomerModel.updateCustomer(customerId, updates);

    // Log the update
    await query(`
      INSERT INTO audit_logs (
        customer_id, action, details, ip_address, created_at
      ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
    `, [
      customerId,
      'CUSTOMER_PROFILE_UPDATED',
      JSON.stringify({ updatedFields: Object.keys(updates) }),
      req.ip
    ]);

    res.status(200).json({
      message: 'Profile updated successfully',
      customer: {
        id: updatedCustomer.id,
        customerNumber: updatedCustomer.customer_number,
        firstName: updatedCustomer.first_name,
        lastName: updatedCustomer.last_name,
        email: updatedCustomer.email,
        emailVerified: updatedCustomer.email_verified,
        updatedAt: updatedCustomer.updated_at
      }
    });

  } catch (error) {
    console.error('Update customer profile error:', error);
    res.status(500).json({
      error: 'Profile update failed',
      message: 'An error occurred while updating customer profile'
    });
  }
});

// GET /api/v1/customers - Search/list customers (Admin only)
router.get('/', authenticateToken, authorizeRoles(['ADMIN', 'MANAGER', 'SUPPORT']), validateRequest(searchCustomersSchema, 'query'), async (req, res) => {
  try {
    const filters = req.query;
    const pagination = {
      page: filters.page,
      limit: filters.limit,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder
    };

    // Remove pagination from filters
    delete filters.page;
    delete filters.limit;
    delete filters.sortBy;
    delete filters.sortOrder;

    const result = await CustomerModel.searchCustomers(filters, pagination);

    res.status(200).json({
      customers: result.customers,
      pagination: result.pagination,
      filters: filters
    });

  } catch (error) {
    console.error('Search customers error:', error);
    res.status(500).json({
      error: 'Customer search failed',
      message: 'An error occurred while searching customers'
    });
  }
});

// GET /api/v1/customers/:customerId - Get specific customer (Admin only)
router.get('/:customerId', authenticateToken, authorizeRoles(['ADMIN', 'MANAGER', 'SUPPORT']), async (req, res) => {
  try {
    const { customerId } = req.params;

    const customer = await CustomerModel.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: 'Customer with specified ID not found'
      });
    }

    // Get customer's accounts, cards, and recent transactions
    const accountsQuery = `
      SELECT 
        ca.id, ca.account_number, ca.account_status, ca.credit_limit, 
        ca.current_balance, ca.available_credit, ca.minimum_payment_due,
        ca.payment_due_date, ca.statement_date, ca.current_apr, ca.created_at,
        ccp.product_name, ccp.product_type, ccp.rewards_program
      FROM credit_accounts ca
      LEFT JOIN credit_card_products ccp ON ca.product_id = ccp.id
      WHERE ca.customer_id = $1
      ORDER BY ca.created_at DESC
    `;

    const cardsQuery = `
      SELECT 
        cc.id, cc.card_number, cc.card_type, cc.card_status, cc.embossed_name,
        cc.expiration_date, cc.international_usage_enabled, cc.online_usage_enabled,
        ca.account_number
      FROM credit_cards cc
      JOIN credit_accounts ca ON cc.account_id = ca.id
      WHERE cc.customer_id = $1
      ORDER BY cc.created_at DESC
    `;

    const recentTransactionsQuery = `
      SELECT 
        ct.id, ct.transaction_id, ct.amount, ct.transaction_type, ct.processing_status,
        ct.merchant_name, ct.transaction_date, ca.account_number
      FROM credit_transactions ct
      JOIN credit_accounts ca ON ct.account_id = ca.id
      WHERE ct.customer_id = $1
      ORDER BY ct.transaction_date DESC
      LIMIT 10
    `;

    const [accountsResult, cardsResult, transactionsResult] = await Promise.all([
      query(accountsQuery, [customerId]),
      query(cardsQuery, [customerId]),
      query(recentTransactionsQuery, [customerId])
    ]);

    // Mask card numbers for security
    const maskedCards = cardsResult.rows.map(card => ({
      ...card,
      card_number: `****-****-****-${card.card_number.slice(-4)}`
    }));

    // Prepare detailed customer response with decrypted PII (admin access)
    const customerDetail = await CustomerModel.getCustomerWithDecryptedPII(customerId);

    const response = {
      ...customerDetail,
      accounts: accountsResult.rows,
      cards: maskedCards,
      recentTransactions: transactionsResult.rows
    };

    res.status(200).json({
      customer: response
    });

  } catch (error) {
    console.error('Get customer detail error:', error);
    res.status(500).json({
      error: 'Customer fetch failed',
      message: 'An error occurred while fetching customer details'
    });
  }
});

// PUT /api/v1/customers/:customerId/kyc - Update KYC status (Admin only)
router.put('/:customerId/kyc', authenticateToken, authorizeRoles(['ADMIN', 'MANAGER']), validateRequest(updateKYCSchema), async (req, res) => {
  try {
    const { customerId } = req.params;
    const { kycStatus, kycNotes, verifiedBy, riskRating } = req.body;

    // Validate customer exists
    const customer = await CustomerModel.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: 'Customer with specified ID not found'
      });
    }

    // Prepare update data
    const updateData = {
      kycStatus,
      kycNotes,
      kycVerifiedBy: verifiedBy || req.user.email,
      kycVerifiedAt: kycStatus === 'VERIFIED' ? new Date() : null
    };

    if (riskRating) {
      updateData.riskRating = riskRating;
    }

    // Update customer KYC status
    const updatedCustomer = await CustomerModel.updateCustomer(customerId, updateData);

    // If KYC is verified, activate the account
    if (kycStatus === 'VERIFIED' && customer.account_status === 'PENDING_VERIFICATION') {
      await CustomerModel.updateCustomer(customerId, { accountStatus: 'ACTIVE' });
    }

    // Log KYC update
    await query(`
      INSERT INTO audit_logs (
        customer_id, action, details, performed_by, ip_address, created_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    `, [
      customerId,
      'KYC_STATUS_UPDATED',
      JSON.stringify({ 
        previousStatus: customer.kyc_status,
        newStatus: kycStatus,
        notes: kycNotes,
        riskRating: riskRating 
      }),
      req.user.email,
      req.ip
    ]);

    res.status(200).json({
      message: 'KYC status updated successfully',
      customer: {
        id: updatedCustomer.id,
        customerNumber: updatedCustomer.customer_number,
        kycStatus: updatedCustomer.kyc_status,
        riskRating: updatedCustomer.risk_rating,
        accountStatus: updatedCustomer.account_status,
        updatedAt: updatedCustomer.updated_at
      }
    });

  } catch (error) {
    console.error('Update KYC status error:', error);
    res.status(500).json({
      error: 'KYC update failed',
      message: 'An error occurred while updating KYC status'
    });
  }
});

// POST /api/v1/customers/:customerId/lock - Lock customer account (Admin only)
router.post('/:customerId/lock', authenticateToken, authorizeRoles(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const { customerId } = req.params;
    const { reason, duration } = req.body; // duration in hours

    const customer = await CustomerModel.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: 'Customer with specified ID not found'
      });
    }

    const lockUntil = duration ? new Date(Date.now() + duration * 60 * 60 * 1000) : null;

    await CustomerModel.lockAccount(customerId, reason, lockUntil);

    // Log account lock
    await query(`
      INSERT INTO audit_logs (
        customer_id, action, details, performed_by, ip_address, created_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    `, [
      customerId,
      'ACCOUNT_LOCKED',
      JSON.stringify({ reason, lockUntil }),
      req.user.email,
      req.ip
    ]);

    res.status(200).json({
      message: 'Account locked successfully',
      lockedUntil: lockUntil
    });

  } catch (error) {
    console.error('Lock account error:', error);
    res.status(500).json({
      error: 'Account lock failed',
      message: 'An error occurred while locking account'
    });
  }
});

// POST /api/v1/customers/:customerId/unlock - Unlock customer account (Admin only)
router.post('/:customerId/unlock', authenticateToken, authorizeRoles(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const { customerId } = req.params;

    const customer = await CustomerModel.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: 'Customer with specified ID not found'
      });
    }

    await CustomerModel.unlockAccount(customerId);

    // Log account unlock
    await query(`
      INSERT INTO audit_logs (
        customer_id, action, details, performed_by, ip_address, created_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    `, [
      customerId,
      'ACCOUNT_UNLOCKED',
      JSON.stringify({}),
      req.user.email,
      req.ip
    ]);

    res.status(200).json({
      message: 'Account unlocked successfully'
    });

  } catch (error) {
    console.error('Unlock account error:', error);
    res.status(500).json({
      error: 'Account unlock failed',
      message: 'An error occurred while unlocking account'
    });
  }
});

// GET /api/v1/customers/:customerId/audit-logs - Get customer audit logs (Admin only)
router.get('/:customerId/audit-logs', authenticateToken, authorizeRoles(['ADMIN', 'MANAGER', 'SUPPORT']), async (req, res) => {
  try {
    const { customerId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // Validate customer exists
    const customer = await CustomerModel.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        error: 'Customer not found',
        message: 'Customer with specified ID not found'
      });
    }

    const auditQuery = `
      SELECT id, action, details, performed_by, ip_address, created_at
      FROM audit_logs
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `
      SELECT COUNT(*) FROM audit_logs WHERE customer_id = $1
    `;

    const [auditResult, countResult] = await Promise.all([
      query(auditQuery, [customerId, limit, offset]),
      query(countQuery, [customerId])
    ]);

    const totalCount = parseInt(countResult.rows[0].count);

    res.status(200).json({
      auditLogs: auditResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({
      error: 'Audit logs fetch failed',
      message: 'An error occurred while fetching audit logs'
    });
  }
});

module.exports = router;
