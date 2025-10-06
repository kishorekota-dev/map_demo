const db = require('../index');

class DisputeRepository {
  // Get all disputes for a user
  async findByUserId(userId, options = {}) {
    const { limit = 50, offset = 0, status, disputeType } = options;
    
    let query = `
      SELECT * FROM disputes 
      WHERE user_id = $1
    `;
    const params = [userId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (disputeType) {
      query += ` AND dispute_type = $${paramIndex}`;
      params.push(disputeType);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  // Get dispute by ID
  async findById(disputeId) {
    const query = 'SELECT * FROM disputes WHERE dispute_id = $1';
    const result = await db.query(query, [disputeId]);
    return result.rows[0];
  }

  // Get dispute by case number
  async findByCaseNumber(caseNumber) {
    const query = 'SELECT * FROM disputes WHERE case_number = $1';
    const result = await db.query(query, [caseNumber]);
    return result.rows[0];
  }

  // Get disputes by account
  async findByAccountId(accountId, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    const query = `
      SELECT * FROM disputes 
      WHERE account_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await db.query(query, [accountId, limit, offset]);
    return result.rows;
  }

  // Get disputes by transaction
  async findByTransactionId(transactionId) {
    const query = `
      SELECT * FROM disputes 
      WHERE transaction_id = $1
      ORDER BY created_at DESC
    `;
    const result = await db.query(query, [transactionId]);
    return result.rows;
  }

  // Create new dispute
  async create(disputeData) {
    const {
      userId, accountId, transactionId, cardId, disputeType, disputeCategory,
      amountDisputed, currency = 'USD', merchantName, transactionDate,
      description, evidenceProvided, evidenceDocuments, priority = 'normal',
      customerNotes
    } = disputeData;

    const caseNumber = await this.generateCaseNumber();
    const deadlineAt = new Date();
    deadlineAt.setDate(deadlineAt.getDate() + 30); // 30-day deadline

    const query = `
      INSERT INTO disputes (
        user_id, account_id, transaction_id, card_id, dispute_type,
        dispute_category, amount_disputed, currency, merchant_name,
        transaction_date, description, evidence_provided, evidence_documents,
        case_number, priority, customer_notes, deadline_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;

    const values = [
      userId, accountId, transactionId, cardId, disputeType, disputeCategory,
      amountDisputed, currency, merchantName, transactionDate, description,
      evidenceProvided, evidenceDocuments ? JSON.stringify(evidenceDocuments) : null,
      caseNumber, priority, customerNotes, deadlineAt
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  // Update dispute
  async update(disputeId, updateData) {
    const {
      status, resolution, refundAmount, assignedTo, priority,
      customerNotes, internalNotes, resolutionNotes
    } = updateData;

    const resolvedAt = (status && ['resolved_in_favor', 'resolved_against', 'partially_resolved', 'withdrawn'].includes(status))
      ? new Date()
      : null;

    const query = `
      UPDATE disputes SET
        status = COALESCE($2, status),
        resolution = COALESCE($3, resolution),
        refund_amount = COALESCE($4, refund_amount),
        assigned_to = COALESCE($5, assigned_to),
        priority = COALESCE($6, priority),
        customer_notes = COALESCE($7, customer_notes),
        internal_notes = COALESCE($8, internal_notes),
        resolution_notes = COALESCE($9, resolution_notes),
        resolved_at = $10,
        updated_at = CURRENT_TIMESTAMP
      WHERE dispute_id = $1
      RETURNING *
    `;

    const values = [
      disputeId, status, resolution, refundAmount, assignedTo, priority,
      customerNotes, internalNotes, resolutionNotes, resolvedAt
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  // Resolve dispute in favor
  async resolveInFavor(disputeId, refundAmount, resolutionNotes) {
    return await this.update(disputeId, {
      status: 'resolved_in_favor',
      resolution: 'full_refund',
      refundAmount,
      resolutionNotes
    });
  }

  // Resolve dispute against customer
  async resolveAgainst(disputeId, resolutionNotes) {
    return await this.update(disputeId, {
      status: 'resolved_against',
      resolution: 'no_refund',
      refundAmount: 0,
      resolutionNotes
    });
  }

  // Withdraw dispute
  async withdraw(disputeId, reason) {
    return await this.update(disputeId, {
      status: 'withdrawn',
      resolution: 'withdrawn',
      resolutionNotes: reason
    });
  }

  // Assign dispute to agent
  async assign(disputeId, agentId) {
    return await this.update(disputeId, {
      assignedTo: agentId
    });
  }

  // Get pending disputes
  async findPending(options = {}) {
    const { priority, limit = 50, offset = 0 } = options;
    
    let query = `
      SELECT * FROM disputes 
      WHERE status IN ('submitted', 'under_review', 'pending_merchant', 'pending_customer')
    `;
    const params = [];
    let paramIndex = 1;

    if (priority) {
      query += ` AND priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }

    query += ` ORDER BY 
      CASE priority 
        WHEN 'urgent' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'normal' THEN 3 
        WHEN 'low' THEN 4 
      END,
      submitted_at ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  // Get disputes approaching deadline
  async findApproachingDeadline(days = 7) {
    const query = `
      SELECT * FROM disputes 
      WHERE status IN ('submitted', 'under_review', 'pending_merchant', 'pending_customer')
        AND deadline_at <= CURRENT_TIMESTAMP + INTERVAL '${days} days'
        AND deadline_at > CURRENT_TIMESTAMP
      ORDER BY deadline_at ASC
    `;
    const result = await db.query(query);
    return result.rows;
  }

  // Get overdue disputes
  async findOverdue() {
    const query = `
      SELECT * FROM disputes 
      WHERE status IN ('submitted', 'under_review', 'pending_merchant', 'pending_customer')
        AND deadline_at < CURRENT_TIMESTAMP
      ORDER BY deadline_at ASC
    `;
    const result = await db.query(query);
    return result.rows;
  }

  // Add evidence to dispute
  async addEvidence(disputeId, evidenceType, evidenceData) {
    const query = `
      UPDATE disputes SET
        evidence_provided = array_append(evidence_provided, $2),
        evidence_documents = COALESCE(evidence_documents, '{}'::jsonb) || $3::jsonb,
        updated_at = CURRENT_TIMESTAMP
      WHERE dispute_id = $1
      RETURNING *
    `;
    const result = await db.query(query, [
      disputeId, 
      evidenceType, 
      JSON.stringify(evidenceData)
    ]);
    return result.rows[0];
  }

  // Generate unique case number
  async generateCaseNumber() {
    const query = 'SELECT generate_case_number() as case_number';
    const result = await db.query(query);
    return result.rows[0].case_number;
  }

  // Get dispute statistics
  async getStatistics(userId = null, startDate = null, endDate = null) {
    let query = `
      SELECT 
        COUNT(*) as total_disputes,
        COUNT(CASE WHEN status IN ('submitted', 'under_review') THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'resolved_in_favor' THEN 1 END) as resolved_in_favor_count,
        COUNT(CASE WHEN status = 'resolved_against' THEN 1 END) as resolved_against_count,
        SUM(amount_disputed) as total_amount_disputed,
        SUM(CASE WHEN status = 'resolved_in_favor' THEN refund_amount ELSE 0 END) as total_refunded,
        AVG(EXTRACT(EPOCH FROM (resolved_at - submitted_at))/86400) as avg_resolution_days,
        dispute_type,
        COUNT(*) as type_count
      FROM disputes
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (userId) {
      query += ` AND user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND submitted_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND submitted_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query += ' GROUP BY dispute_type ORDER BY type_count DESC';

    const result = await db.query(query, params);
    return result.rows;
  }
}

module.exports = new DisputeRepository();
