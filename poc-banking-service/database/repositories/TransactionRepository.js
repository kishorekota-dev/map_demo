const db = require('../index');

class TransactionRepository {
  // Get all transactions for an account
  async findByAccountId(accountId, options = {}) {
    const { limit = 50, offset = 0, status, startDate, endDate } = options;
    
    let query = `
      SELECT * FROM transactions 
      WHERE account_id = $1
    `;
    const params = [accountId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  // Get transaction by ID
  async findById(transactionId) {
    const query = 'SELECT * FROM transactions WHERE transaction_id = $1';
    const result = await db.query(query, [transactionId]);
    return result.rows[0];
  }

  // Get transaction by reference number
  async findByReference(referenceNumber) {
    const query = 'SELECT * FROM transactions WHERE reference_number = $1';
    const result = await db.query(query, [referenceNumber]);
    return result.rows[0];
  }

  // Create new transaction
  async create(transactionData) {
    const {
      accountId, transactionType, amount, currency = 'USD',
      description, category, merchantName, merchantCategory,
      relatedAccountId, location, deviceId, ipAddress, metadata
    } = transactionData;

    const referenceNumber = await this.generateReferenceNumber();

    const query = `
      INSERT INTO transactions (
        account_id, transaction_type, amount, currency, description,
        category, merchant_name, merchant_category, reference_number,
        related_account_id, location, device_id, ip_address, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const values = [
      accountId, transactionType, amount, currency, description,
      category, merchantName, merchantCategory, referenceNumber,
      relatedAccountId, location, deviceId, ipAddress,
      metadata ? JSON.stringify(metadata) : null
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  // Update transaction status
  async updateStatus(transactionId, status, completedAt = null) {
    const query = `
      UPDATE transactions SET
        status = $2,
        completed_at = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE transaction_id = $1
      RETURNING *
    `;
    const result = await db.query(query, [transactionId, status, completedAt]);
    return result.rows[0];
  }

  // Cancel transaction
  async cancel(transactionId) {
    return await this.updateStatus(transactionId, 'cancelled', new Date());
  }

  // Get pending transactions
  async findPending(accountId = null) {
    let query = `
      SELECT * FROM transactions 
      WHERE status = 'pending'
    `;
    const params = [];

    if (accountId) {
      query += ' AND account_id = $1';
      params.push(accountId);
    }

    query += ' ORDER BY created_at DESC';

    const result = await db.query(query, params);
    return result.rows;
  }

  // Search transactions
  async search(criteria) {
    const {
      accountId, userId, transactionType, category, minAmount, maxAmount,
      startDate, endDate, status, merchantName, limit = 50, offset = 0
    } = criteria;

    let query = `
      SELECT t.* FROM transactions t
    `;
    const params = [];
    const conditions = [];
    let paramIndex = 1;

    if (accountId) {
      conditions.push(`t.account_id = $${paramIndex}`);
      params.push(accountId);
      paramIndex++;
    }

    if (userId) {
      query += ` JOIN accounts a ON t.account_id = a.account_id`;
      conditions.push(`a.user_id = $${paramIndex}`);
      params.push(userId);
      paramIndex++;
    }

    if (transactionType) {
      conditions.push(`t.transaction_type = $${paramIndex}`);
      params.push(transactionType);
      paramIndex++;
    }

    if (category) {
      conditions.push(`t.category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    if (minAmount) {
      conditions.push(`ABS(t.amount) >= $${paramIndex}`);
      params.push(minAmount);
      paramIndex++;
    }

    if (maxAmount) {
      conditions.push(`ABS(t.amount) <= $${paramIndex}`);
      params.push(maxAmount);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`t.created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`t.created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    if (status) {
      conditions.push(`t.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (merchantName) {
      conditions.push(`t.merchant_name ILIKE $${paramIndex}`);
      params.push(`%${merchantName}%`);
      paramIndex++;
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ` ORDER BY t.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  // Get transaction summary
  async getSummary(accountId, startDate, endDate) {
    const query = `
      SELECT 
        COUNT(*) as total_count,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        SUM(CASE WHEN amount > 0 AND status = 'completed' THEN amount ELSE 0 END) as total_credits,
        SUM(CASE WHEN amount < 0 AND status = 'completed' THEN ABS(amount) ELSE 0 END) as total_debits,
        AVG(CASE WHEN status = 'completed' THEN ABS(amount) END) as average_amount,
        MAX(ABS(amount)) as max_amount,
        category,
        COUNT(*) as category_count
      FROM transactions
      WHERE account_id = $1
        AND created_at BETWEEN $2 AND $3
      GROUP BY category
      ORDER BY category_count DESC
    `;
    const result = await db.query(query, [accountId, startDate, endDate]);
    return result.rows;
  }

  // Generate unique reference number
  async generateReferenceNumber() {
    const query = 'SELECT generate_reference_number() as reference_number';
    const result = await db.query(query);
    return result.rows[0].reference_number;
  }

  // Get transaction categories
  async getCategories() {
    const query = `
      SELECT DISTINCT category 
      FROM transactions 
      WHERE category IS NOT NULL 
      ORDER BY category
    `;
    const result = await db.query(query);
    return result.rows.map(row => row.category);
  }
}

module.exports = new TransactionRepository();
