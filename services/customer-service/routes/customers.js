const express = require('express');
const router = express.Router();
const Joi = require('joi');
const db = require('../database');

// Validation schemas
const createCustomerSchema = Joi.object({
  title: Joi.string().valid('Mr', 'Mrs', 'Ms', 'Dr', 'Prof'),
  firstName: Joi.string().required().max(100),
  middleName: Joi.string().max(100),
  lastName: Joi.string().required().max(100),
  dateOfBirth: Joi.date().required().max('now'),
  gender: Joi.string().valid('MALE', 'FEMALE', 'OTHER'),
  nationality: Joi.string().length(3),
  email: Joi.string().email().required(),
  phone: Joi.string().required(),
  addressLine1: Joi.string().max(255),
  addressLine2: Joi.string().max(255),
  city: Joi.string().max(100),
  state: Joi.string().max(100),
  postalCode: Joi.string().max(20),
  country: Joi.string().length(3),
  idType: Joi.string().max(50),
  idNumber: Joi.string().max(100),
  idExpiryDate: Joi.date().greater('now'),
  idIssuingCountry: Joi.string().length(3)
});

// Validation middleware
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        status: 'error',
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: error.details.map(d => ({
            field: d.path.join('.'),
            message: d.message
          }))
        }
      });
    }
    req.body = value;
    next();
  };
};

// Get all customers
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, kyc_status } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM customers WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` AND status = $${paramCount++}`;
      params.push(status);
    }

    if (kyc_status) {
      query += ` AND kyc_status = $${paramCount++}`;
      params.push(kyc_status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    
    const countQuery = 'SELECT COUNT(*) FROM customers WHERE 1=1' + 
      (status ? ` AND status = '${status}'` : '') +
      (kyc_status ? ` AND kyc_status = '${kyc_status}'` : '');
    const countResult = await db.query(countQuery);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      status: 'success',
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      },
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get customer by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'SELECT * FROM customers WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: {
          code: 'NOT_FOUND',
          message: 'Customer not found',
          details: { customerId: id }
        }
      });
    }

    res.json({
      status: 'success',
      data: result.rows[0],
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create customer
router.post('/', validate(createCustomerSchema), async (req, res, next) => {
  try {
    const {
      title, firstName, middleName, lastName, dateOfBirth, gender, nationality,
      email, phone, addressLine1, addressLine2, city, state, postalCode, country,
      idType, idNumber, idExpiryDate, idIssuingCountry
    } = req.body;

    // Check if email already exists
    const existingCustomer = await db.query(
      'SELECT id FROM customers WHERE email = $1',
      [email]
    );

    if (existingCustomer.rows.length > 0) {
      return res.status(409).json({
        status: 'error',
        error: {
          code: 'CONFLICT',
          message: 'Customer with this email already exists',
          details: { email }
        }
      });
    }

    const result = await db.query(`
      INSERT INTO customers (
        title, first_name, middle_name, last_name, date_of_birth, gender, nationality,
        email, phone, address_line1, address_line2, city, state, postal_code, country,
        id_type, id_number, id_expiry_date, id_issuing_country, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `, [
      title, firstName, middleName, lastName, dateOfBirth, gender, nationality,
      email, phone, addressLine1, addressLine2, city, state, postalCode, country,
      idType, idNumber, idExpiryDate, idIssuingCountry, 'system'
    ]);

    // Create default preferences
    await db.query(`
      INSERT INTO customer_preferences (customer_id)
      VALUES ($1)
    `, [result.rows[0].id]);

    req.logger.info('Customer created', {
      customerId: result.rows[0].id,
      customerNumber: result.rows[0].customer_number,
      correlationId: req.correlationId
    });

    res.status(201).json({
      status: 'success',
      data: result.rows[0],
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId,
        action: 'create'
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update customer
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = [];
    const values = [];
    let paramCount = 1;

    // Build dynamic UPDATE query
    const allowedFields = [
      'title', 'first_name', 'middle_name', 'last_name', 'email', 'phone',
      'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'country',
      'kyc_status', 'risk_rating', 'status'
    ];

    for (const [key, value] of Object.entries(req.body)) {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      if (allowedFields.includes(snakeKey) && value !== undefined) {
        updates.push(`${snakeKey} = $${paramCount++}`);
        values.push(value);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        status: 'error',
        error: {
          code: 'VALIDATION_ERROR',
          message: 'No valid fields to update'
        }
      });
    }

    updates.push(`updated_by = $${paramCount++}`);
    values.push('system');
    values.push(id);

    const result = await db.query(`
      UPDATE customers 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: {
          code: 'NOT_FOUND',
          message: 'Customer not found'
        }
      });
    }

    res.json({
      status: 'success',
      data: result.rows[0],
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId,
        action: 'update'
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get customer KYC status
router.get('/:id/kyc', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await db.query(`
      SELECT id, customer_number, kyc_status, kyc_verified_at, kyc_verified_by, 
             risk_rating, id_type, id_number, id_expiry_date
      FROM customers 
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: {
          code: 'NOT_FOUND',
          message: 'Customer not found'
        }
      });
    }

    res.json({
      status: 'success',
      data: result.rows[0],
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update KYC status
router.post('/:id/kyc/verify', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, verifiedBy, riskRating } = req.body;

    const result = await db.query(`
      UPDATE customers
      SET kyc_status = $1,
          kyc_verified_at = CURRENT_TIMESTAMP,
          kyc_verified_by = $2,
          risk_rating = $3,
          updated_by = $4
      WHERE id = $5
      RETURNING *
    `, [status, verifiedBy, riskRating, 'system', id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: {
          code: 'NOT_FOUND',
          message: 'Customer not found'
        }
      });
    }

    req.logger.info('KYC status updated', {
      customerId: id,
      kycStatus: status,
      correlationId: req.correlationId
    });

    res.json({
      status: 'success',
      data: result.rows[0],
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId,
        action: 'kyc_verification'
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
