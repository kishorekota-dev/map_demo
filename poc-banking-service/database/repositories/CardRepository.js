const db = require('../index');

class CardRepository {
  // Get all cards for a user
  async findByUserId(userId, options = {}) {
    const { status, limit = 50, offset = 0 } = options;
    
    let query = `
      SELECT * FROM cards 
      WHERE user_id = $1
    `;
    const params = [userId];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  // Get cards by account
  async findByAccountId(accountId) {
    const query = 'SELECT * FROM cards WHERE account_id = $1 ORDER BY created_at DESC';
    const result = await db.query(query, [accountId]);
    return result.rows;
  }

  // Get card by ID
  async findById(cardId) {
    const query = 'SELECT * FROM cards WHERE card_id = $1';
    const result = await db.query(query, [cardId]);
    return result.rows[0];
  }

  // Get card by last 4 digits
  async findByLast4(userId, last4) {
    const query = 'SELECT * FROM cards WHERE user_id = $1 AND card_number_last4 = $2';
    const result = await db.query(query, [userId, last4]);
    return result.rows;
  }

  // Create new card
  async create(cardData) {
    const {
      accountId, userId, cardNumberEncrypted, cardNumberLast4, cardType,
      cardBrand, cardholderName, expiryMonth, expiryYear, cvvEncrypted,
      pinHash, dailyLimit = 2000, monthlyLimit = 20000,
      isContactless = true, isInternational = false, isVirtual = false,
      billingAddressLine1, billingCity, billingState, billingZipCode, billingCountry = 'USA'
    } = cardData;

    const query = `
      INSERT INTO cards (
        account_id, user_id, card_number_encrypted, card_number_last4,
        card_type, card_brand, cardholder_name, expiry_month, expiry_year,
        cvv_encrypted, pin_hash, daily_limit, monthly_limit,
        is_contactless, is_international, is_virtual,
        billing_address_line1, billing_city, billing_state, billing_zip_code, billing_country,
        activation_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, CURRENT_TIMESTAMP)
      RETURNING *
    `;

    const values = [
      accountId, userId, cardNumberEncrypted, cardNumberLast4, cardType,
      cardBrand, cardholderName, expiryMonth, expiryYear, cvvEncrypted,
      pinHash, dailyLimit, monthlyLimit, isContactless, isInternational,
      isVirtual, billingAddressLine1, billingCity, billingState,
      billingZipCode, billingCountry
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  // Update card
  async update(cardId, updateData) {
    const {
      status, dailyLimit, monthlyLimit, isContactless,
      isInternational, blockedReason
    } = updateData;

    const query = `
      UPDATE cards SET
        status = COALESCE($2, status),
        daily_limit = COALESCE($3, daily_limit),
        monthly_limit = COALESCE($4, monthly_limit),
        is_contactless = COALESCE($5, is_contactless),
        is_international = COALESCE($6, is_international),
        blocked_reason = $7,
        updated_at = CURRENT_TIMESTAMP
      WHERE card_id = $1
      RETURNING *
    `;

    const values = [
      cardId, status, dailyLimit, monthlyLimit,
      isContactless, isInternational, blockedReason
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  // Block card
  async block(cardId, reason, newStatus = 'blocked') {
    const query = `
      UPDATE cards SET
        status = $2,
        blocked_reason = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE card_id = $1
      RETURNING *
    `;
    const result = await db.query(query, [cardId, newStatus, reason]);
    return result.rows[0];
  }

  // Unblock/activate card
  async activate(cardId) {
    const query = `
      UPDATE cards SET
        status = 'active',
        blocked_reason = NULL,
        activation_date = COALESCE(activation_date, CURRENT_TIMESTAMP),
        updated_at = CURRENT_TIMESTAMP
      WHERE card_id = $1
      RETURNING *
    `;
    const result = await db.query(query, [cardId]);
    return result.rows[0];
  }

  // Update last used timestamp
  async updateLastUsed(cardId) {
    const query = `
      UPDATE cards SET
        last_used_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE card_id = $1
      RETURNING *
    `;
    const result = await db.query(query, [cardId]);
    return result.rows[0];
  }

  // Get active cards
  async findActive(userId) {
    const query = `
      SELECT * FROM cards 
      WHERE user_id = $1 AND status = 'active'
      ORDER BY created_at DESC
    `;
    const result = await db.query(query, [userId]);
    return result.rows;
  }

  // Check if card is expired
  async checkExpired(cardId) {
    const query = `
      SELECT 
        card_id,
        CASE 
          WHEN TO_DATE(expiry_year || '-' || LPAD(expiry_month::TEXT, 2, '0') || '-01', 'YYYY-MM-DD') < CURRENT_DATE 
          THEN true 
          ELSE false 
        END as is_expired
      FROM cards
      WHERE card_id = $1
    `;
    const result = await db.query(query, [cardId]);
    return result.rows[0]?.is_expired || false;
  }

  // Get cards expiring soon (within 60 days)
  async findExpiringSoon(userId) {
    const query = `
      SELECT * FROM cards
      WHERE user_id = $1
        AND status = 'active'
        AND TO_DATE(expiry_year || '-' || LPAD(expiry_month::TEXT, 2, '0') || '-01', 'YYYY-MM-DD') 
            BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'
      ORDER BY expiry_year, expiry_month
    `;
    const result = await db.query(query, [userId]);
    return result.rows;
  }

  // Replace card
  async replace(oldCardId, newCardData) {
    return await db.transaction(async (client) => {
      // Mark old card as cancelled
      const cancelQuery = `
        UPDATE cards SET
          status = 'cancelled',
          updated_at = CURRENT_TIMESTAMP
        WHERE card_id = $1
        RETURNING *
      `;
      await client.query(cancelQuery, [oldCardId]);

      // Create new card
      const insertQuery = `
        INSERT INTO cards (
          account_id, user_id, card_number_encrypted, card_number_last4,
          card_type, card_brand, cardholder_name, expiry_month, expiry_year,
          cvv_encrypted, pin_hash, daily_limit, monthly_limit,
          is_contactless, is_international, is_virtual,
          billing_address_line1, billing_city, billing_state, billing_zip_code, billing_country,
          activation_date
        ) SELECT
          account_id, user_id, $2, $3, card_type, card_brand, cardholder_name,
          $4, $5, $6, pin_hash, daily_limit, monthly_limit,
          is_contactless, is_international, is_virtual,
          billing_address_line1, billing_city, billing_state, billing_zip_code, billing_country,
          CURRENT_TIMESTAMP
        FROM cards WHERE card_id = $1
        RETURNING *
      `;
      
      const { cardNumberEncrypted, cardNumberLast4, expiryMonth, expiryYear, cvvEncrypted } = newCardData;
      const result = await client.query(insertQuery, [
        oldCardId, cardNumberEncrypted, cardNumberLast4, expiryMonth, expiryYear, cvvEncrypted
      ]);
      
      return result.rows[0];
    });
  }
}

module.exports = new CardRepository();
