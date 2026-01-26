const db = require('../index');

class TransferRepository {
  // Get all transfers for a user
  async findByUserId(userId, options = {}) {
    const { limit = 50, offset = 0, status, transferType } = options;
    
    let query = `
      SELECT * FROM transfers 
      WHERE from_user_id = $1 OR to_user_id = $1
    `;
    const params = [userId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (transferType) {
      query += ` AND transfer_type = $${paramIndex}`;
      params.push(transferType);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  // Get transfers by account
  async findByAccountId(accountId, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    const query = `
      SELECT * FROM transfers 
      WHERE from_account_id = $1 OR to_account_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await db.query(query, [accountId, limit, offset]);
    return result.rows;
  }

  // Get transfer by ID
  async findById(transferId) {
    const query = 'SELECT * FROM transfers WHERE transfer_id = $1';
    const result = await db.query(query, [transferId]);
    return result.rows[0];
  }

  // Get transfer by reference number
  async findByReference(referenceNumber) {
    const query = 'SELECT * FROM transfers WHERE reference_number = $1';
    const result = await db.query(query, [referenceNumber]);
    return result.rows[0];
  }

  // Create new transfer
  async create(transferData) {
    const {
      fromAccountId, toAccountId, fromUserId, toUserId, transferType,
      amount, fee = 0, currency = 'USD', exchangeRate,
      recipientName, recipientAccountNumber, recipientBankName,
      recipientRoutingNumber, recipientSwiftCode, recipientIban,
      purpose, scheduledDate, metadata
    } = transferData;

    const totalAmount = parseFloat(amount) + parseFloat(fee);
    const referenceNumber = await this.generateReferenceNumber();

    const query = `
      INSERT INTO transfers (
        from_account_id, to_account_id, from_user_id, to_user_id,
        transfer_type, amount, fee, total_amount, currency, exchange_rate,
        recipient_name, recipient_account_number, recipient_bank_name,
        recipient_routing_number, recipient_swift_code, recipient_iban,
        purpose, reference_number, scheduled_date, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `;

    const values = [
      fromAccountId, toAccountId, fromUserId, toUserId, transferType,
      amount, fee, totalAmount, currency, exchangeRate,
      recipientName, recipientAccountNumber, recipientBankName,
      recipientRoutingNumber, recipientSwiftCode, recipientIban,
      purpose, referenceNumber, scheduledDate,
      metadata ? JSON.stringify(metadata) : null
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  // Update transfer status
  async updateStatus(transferId, status, failureReason = null) {
    const completedAt = (status === 'completed') ? new Date() : null;
    
    const query = `
      UPDATE transfers SET
        status = $2,
        completed_at = $3,
        failure_reason = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE transfer_id = $1
      RETURNING *
    `;
    const result = await db.query(query, [transferId, status, completedAt, failureReason]);
    return result.rows[0];
  }

  // Process transfer (atomic operation)
  async process(transferId) {
    return await db.transaction(async (client) => {
      // Get transfer details
      const getTransferQuery = 'SELECT * FROM transfers WHERE transfer_id = $1 FOR UPDATE';
      const transferResult = await client.query(getTransferQuery, [transferId]);
      const transfer = transferResult.rows[0];

      if (!transfer) {
        throw new Error('Transfer not found');
      }

      if (transfer.status !== 'pending') {
        throw new Error('Transfer is not in pending status');
      }

      // Lock and get source account
      const getFromAccountQuery = 'SELECT * FROM accounts WHERE account_id = $1 FOR UPDATE';
      const fromAccountResult = await client.query(getFromAccountQuery, [transfer.from_account_id]);
      const fromAccount = fromAccountResult.rows[0];

      if (!fromAccount) {
        throw new Error('Source account not found');
      }

      // Check sufficient funds
      if (parseFloat(fromAccount.available_balance) < parseFloat(transfer.total_amount)) {
        await client.query(
          'UPDATE transfers SET status = $2, failure_reason = $3 WHERE transfer_id = $1',
          [transferId, 'failed', 'Insufficient funds']
        );
        throw new Error('Insufficient funds');
      }

      // Deduct from source account
      const newFromBalance = parseFloat(fromAccount.balance) - parseFloat(transfer.total_amount);
      await client.query(
        'UPDATE accounts SET balance = $2, available_balance = $2 WHERE account_id = $1',
        [transfer.from_account_id, newFromBalance]
      );

      // If internal transfer, credit destination account
      if (transfer.to_account_id) {
        const getToAccountQuery = 'SELECT * FROM accounts WHERE account_id = $1 FOR UPDATE';
        const toAccountResult = await client.query(getToAccountQuery, [transfer.to_account_id]);
        const toAccount = toAccountResult.rows[0];

        if (toAccount) {
          const newToBalance = parseFloat(toAccount.balance) + parseFloat(transfer.amount);
          await client.query(
            'UPDATE accounts SET balance = $2, available_balance = $2 WHERE account_id = $1',
            [transfer.to_account_id, newToBalance]
          );
        }
      }

      // Update transfer status
      const updateQuery = `
        UPDATE transfers SET
          status = 'completed',
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE transfer_id = $1
        RETURNING *
      `;
      const result = await client.query(updateQuery, [transferId]);
      return result.rows[0];
    });
  }

  // Cancel transfer
  async cancel(transferId) {
    const query = `
      UPDATE transfers SET
        status = 'cancelled',
        updated_at = CURRENT_TIMESTAMP
      WHERE transfer_id = $1 AND status = 'pending'
      RETURNING *
    `;
    const result = await db.query(query, [transferId]);
    return result.rows[0];
  }

  // Get pending transfers
  async findPending(userId = null) {
    let query = `
      SELECT * FROM transfers 
      WHERE status = 'pending'
    `;
    const params = [];

    if (userId) {
      query += ' AND from_user_id = $1';
      params.push(userId);
    }

    query += ' ORDER BY created_at ASC';

    const result = await db.query(query, params);
    return result.rows;
  }

  // Get scheduled transfers due for processing
  async findScheduledDue() {
    const query = `
      SELECT * FROM transfers 
      WHERE status = 'pending'
        AND scheduled_date IS NOT NULL
        AND scheduled_date <= CURRENT_DATE
      ORDER BY scheduled_date ASC
    `;
    const result = await db.query(query);
    return result.rows;
  }

  // Generate unique reference number
  async generateReferenceNumber() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    return `TRF${timestamp}${random}`;
  }

  // Get transfer statistics
  async getStatistics(userId, startDate, endDate) {
    const query = `
      SELECT 
        COUNT(*) as total_count,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_amount,
        SUM(CASE WHEN status = 'completed' THEN fee ELSE 0 END) as total_fees,
        AVG(CASE WHEN status = 'completed' THEN amount END) as average_amount
      FROM transfers
      WHERE from_user_id = $1
        AND created_at BETWEEN $2 AND $3
    `;
    const result = await db.query(query, [userId, startDate, endDate]);
    return result.rows[0];
  }
}

module.exports = new TransferRepository();
