const express = require('express');
const router = express.Router();
const db = require('../database');

// BIAN: Initiate Party Reference Profile
router.post('/party-reference-profile/initiate', async (req, res, next) => {
  try {
    const {
      partyName,
      partyType,
      contactDetails,
      identificationDocuments,
      riskAssessment
    } = req.body;

    // Map BIAN fields to customer fields
    const result = await db.query(`
      INSERT INTO customers (
        first_name, last_name, email, phone, 
        id_type, id_number, risk_rating, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      partyName?.firstName || '',
      partyName?.lastName || '',
      contactDetails?.email || '',
      contactDetails?.phone || '',
      identificationDocuments?.type || '',
      identificationDocuments?.number || '',
      riskAssessment?.rating || 'MEDIUM',
      'system'
    ]);

    const customer = result.rows[0];

    res.status(201).json({
      status: 'success',
      controlRecordId: customer.id,
      controlRecordType: 'PartyReferenceProfile',
      data: {
        partyReferenceProfileId: customer.id,
        partyNumber: customer.customer_number,
        status: customer.status,
        kycStatus: customer.kyc_status
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
        action: 'initiate',
        correlationId: req.correlationId
      }
    });
  } catch (error) {
    next(error);
  }
});

// BIAN: Retrieve Party Reference Profile
router.get('/party-reference-profile/:id/retrieve', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await db.query('SELECT * FROM customers WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: {
          code: 'NOT_FOUND',
          message: 'Party Reference Profile not found'
        }
      });
    }

    const customer = result.rows[0];

    res.json({
      status: 'success',
      controlRecordId: customer.id,
      controlRecordType: 'PartyReferenceProfile',
      data: {
        partyReferenceProfileId: customer.id,
        partyNumber: customer.customer_number,
        partyName: {
          title: customer.title,
          firstName: customer.first_name,
          middleName: customer.middle_name,
          lastName: customer.last_name
        },
        dateOfBirth: customer.date_of_birth,
        contactDetails: {
          email: customer.email,
          phone: customer.phone,
          address: {
            line1: customer.address_line1,
            line2: customer.address_line2,
            city: customer.city,
            state: customer.state,
            postalCode: customer.postal_code,
            country: customer.country
          }
        },
        identificationDocuments: {
          type: customer.id_type,
          number: customer.id_number,
          expiryDate: customer.id_expiry_date,
          issuingCountry: customer.id_issuing_country
        },
        kycStatus: customer.kyc_status,
        riskRating: customer.risk_rating,
        status: customer.status
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
        action: 'retrieve',
        correlationId: req.correlationId
      }
    });
  } catch (error) {
    next(error);
  }
});

// BIAN: Update Party Reference Profile
router.put('/party-reference-profile/:id/update', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { contactDetails, status, riskRating } = req.body;

    const result = await db.query(`
      UPDATE customers
      SET 
        email = COALESCE($1, email),
        phone = COALESCE($2, phone),
        status = COALESCE($3, status),
        risk_rating = COALESCE($4, risk_rating),
        updated_by = $5
      WHERE id = $6
      RETURNING *
    `, [
      contactDetails?.email,
      contactDetails?.phone,
      status,
      riskRating,
      'system',
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: {
          code: 'NOT_FOUND',
          message: 'Party Reference Profile not found'
        }
      });
    }

    const customer = result.rows[0];

    res.json({
      status: 'success',
      controlRecordId: customer.id,
      controlRecordType: 'PartyReferenceProfile',
      data: {
        partyReferenceProfileId: customer.id,
        partyNumber: customer.customer_number,
        status: customer.status,
        riskRating: customer.risk_rating
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
        action: 'update',
        correlationId: req.correlationId
      }
    });
  } catch (error) {
    next(error);
  }
});

// BIAN: Control Party Reference Profile (Block/Suspend/Activate)
router.put('/party-reference-profile/:id/control', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action } = req.query; // block, suspend, activate

    let newStatus;
    switch (action?.toLowerCase()) {
      case 'block':
      case 'suspend':
        newStatus = 'SUSPENDED';
        break;
      case 'activate':
        newStatus = 'ACTIVE';
        break;
      case 'close':
        newStatus = 'CLOSED';
        break;
      default:
        return res.status(400).json({
          status: 'error',
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid action. Use: block, suspend, activate, or close'
          }
        });
    }

    const result = await db.query(`
      UPDATE customers
      SET status = $1, updated_by = $2
      WHERE id = $3
      RETURNING *
    `, [newStatus, 'system', id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        error: {
          code: 'NOT_FOUND',
          message: 'Party Reference Profile not found'
        }
      });
    }

    const customer = result.rows[0];

    res.json({
      status: 'success',
      controlRecordId: customer.id,
      controlRecordType: 'PartyReferenceProfile',
      data: {
        partyReferenceProfileId: customer.id,
        partyNumber: customer.customer_number,
        status: customer.status,
        action: action
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
        action: 'control',
        correlationId: req.correlationId
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
