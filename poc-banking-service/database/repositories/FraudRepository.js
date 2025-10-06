const db = require('../index');

class FraudRepository {
  // Get all fraud alerts for a user
  async findByUserId(userId, options = {}) {
    const { limit = 50, offset = 0, status, severity } = options;
    
    let query = `
      SELECT * FROM fraud_alerts 
      WHERE user_id = $1
    `;
    const params = [userId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (severity) {
      query += ` AND severity = $${paramIndex}`;
      params.push(severity);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  // Get fraud alert by ID
  async findById(alertId) {
    const query = 'SELECT * FROM fraud_alerts WHERE alert_id = $1';
    const result = await db.query(query, [alertId]);
    return result.rows[0];
  }

  // Get fraud alerts by account
  async findByAccountId(accountId, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    const query = `
      SELECT * FROM fraud_alerts 
      WHERE account_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await db.query(query, [accountId, limit, offset]);
    return result.rows;
  }

  // Get fraud alerts by transaction
  async findByTransactionId(transactionId) {
    const query = `
      SELECT * FROM fraud_alerts 
      WHERE transaction_id = $1
      ORDER BY created_at DESC
    `;
    const result = await db.query(query, [transactionId]);
    return result.rows;
  }

  // Create new fraud alert
  async create(alertData) {
    const {
      userId, accountId, transactionId, cardId, alertType, severity,
      riskScore, description, details, amount, location, ipAddress,
      deviceFingerprint, actionTaken
    } = alertData;

    const query = `
      INSERT INTO fraud_alerts (
        user_id, account_id, transaction_id, card_id, alert_type,
        severity, risk_score, description, details, amount, location,
        ip_address, device_fingerprint, action_taken
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const values = [
      userId, accountId, transactionId, cardId, alertType, severity,
      riskScore, description, details ? JSON.stringify(details) : null,
      amount, location, ipAddress, deviceFingerprint, actionTaken
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  // Update fraud alert
  async update(alertId, updateData) {
    const {
      status, actionTaken, resolvedBy, resolutionNotes
    } = updateData;

    const resolvedAt = (status === 'resolved' || status === 'false_positive' || status === 'confirmed') 
      ? new Date() 
      : null;

    const query = `
      UPDATE fraud_alerts SET
        status = COALESCE($2, status),
        action_taken = COALESCE($3, action_taken),
        resolved_by = $4,
        resolution_notes = $5,
        resolved_at = $6,
        updated_at = CURRENT_TIMESTAMP
      WHERE alert_id = $1
      RETURNING *
    `;

    const values = [
      alertId, status, actionTaken, resolvedBy, resolutionNotes, resolvedAt
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  // Mark alert as false positive
  async markAsFalsePositive(alertId, resolvedBy, notes) {
    return await this.update(alertId, {
      status: 'false_positive',
      resolvedBy,
      resolutionNotes: notes
    });
  }

  // Confirm fraud
  async confirmFraud(alertId, resolvedBy, notes, actionTaken) {
    return await this.update(alertId, {
      status: 'confirmed',
      actionTaken: actionTaken || 'manual_review',
      resolvedBy,
      resolutionNotes: notes
    });
  }

  // Get pending fraud alerts
  async findPending(options = {}) {
    const { severity, limit = 50, offset = 0 } = options;
    
    let query = `
      SELECT * FROM fraud_alerts 
      WHERE status IN ('pending', 'investigating')
    `;
    const params = [];
    let paramIndex = 1;

    if (severity) {
      query += ` AND severity = $${paramIndex}`;
      params.push(severity);
      paramIndex++;
    }

    query += ` ORDER BY 
      CASE severity 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
      END,
      created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  // Get high risk alerts (critical or high severity)
  async findHighRisk(userId = null) {
    let query = `
      SELECT * FROM fraud_alerts 
      WHERE severity IN ('critical', 'high')
        AND status IN ('pending', 'investigating')
    `;
    const params = [];

    if (userId) {
      query += ' AND user_id = $1';
      params.push(userId);
    }

    query += ' ORDER BY risk_score DESC, created_at DESC';

    const result = await db.query(query, params);
    return result.rows;
  }

  // Get fraud statistics
  async getStatistics(userId = null, startDate = null, endDate = null) {
    let query = `
      SELECT 
        COUNT(*) as total_alerts,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_count,
        COUNT(CASE WHEN status = 'false_positive' THEN 1 END) as false_positive_count,
        COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_count,
        COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_count,
        AVG(risk_score) as average_risk_score,
        SUM(amount) as total_amount_flagged,
        alert_type,
        COUNT(*) as type_count
      FROM fraud_alerts
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
      query += ` AND created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query += ' GROUP BY alert_type ORDER BY type_count DESC';

    const result = await db.query(query, params);
    return result.rows;
  }

  // Check for similar recent alerts (for pattern detection)
  async findSimilarRecent(userId, alertType, hours = 24) {
    const query = `
      SELECT * FROM fraud_alerts 
      WHERE user_id = $1
        AND alert_type = $2
        AND created_at >= CURRENT_TIMESTAMP - INTERVAL '${hours} hours'
      ORDER BY created_at DESC
    `;
    const result = await db.query(query, [userId, alertType]);
    return result.rows;
  }

  // Get alert types with counts
  async getAlertTypes() {
    const query = `
      SELECT 
        alert_type, 
        COUNT(*) as count,
        AVG(risk_score) as avg_risk_score
      FROM fraud_alerts
      GROUP BY alert_type
      ORDER BY count DESC
    `;
    const result = await db.query(query);
    return result.rows;
  }
}

module.exports = new FraudRepository();
