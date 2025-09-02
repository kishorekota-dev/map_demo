const { query, buildWhereClause, buildPagination, buildOrderBy } = require('../database');

class TransactionModel {
    // Get transaction by ID
    static async findById(id) {
        const result = await query(`
            SELECT t.*, a.account_number, u.first_name, u.last_name, u.email
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            JOIN users u ON t.user_id = u.id
            WHERE t.id = $1
        `, [id]);
        return result.rows[0] || null;
    }

    // Get transaction by transaction ID
    static async findByTransactionId(transactionId) {
        const result = await query(
            'SELECT * FROM transactions WHERE transaction_id = $1',
            [transactionId]
        );
        return result.rows[0] || null;
    }

    // Get transactions by user ID
    static async findByUserId(userId, page = 1, limit = 20) {
        const { limitClause } = buildPagination(page, limit);
        
        const result = await query(`
            SELECT t.*, a.account_number
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            WHERE t.user_id = $1
            ORDER BY t.created_at DESC
            ${limitClause}
        `, [userId]);

        const countResult = await query(
            'SELECT COUNT(*) as total FROM transactions WHERE user_id = $1',
            [userId]
        );

        return {
            transactions: result.rows,
            total: parseInt(countResult.rows[0].total),
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
        };
    }

    // Get transactions by account ID
    static async findByAccountId(accountId, page = 1, limit = 20) {
        const { limitClause } = buildPagination(page, limit);
        
        const result = await query(`
            SELECT * FROM transactions
            WHERE account_id = $1
            ORDER BY created_at DESC
            ${limitClause}
        `, [accountId]);

        const countResult = await query(
            'SELECT COUNT(*) as total FROM transactions WHERE account_id = $1',
            [accountId]
        );

        return {
            transactions: result.rows,
            total: parseInt(countResult.rows[0].total),
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
        };
    }

    // Create new transaction
    static async create(transactionData) {
        const {
            id, account_id, card_id, user_id, transaction_id, amount,
            currency, transaction_type, status, merchant_name,
            merchant_category, merchant_id, description, authorization_code,
            reference_number, location_city, location_state, location_country,
            is_international, is_online, processing_fee, exchange_rate,
            original_amount, original_currency, fraud_score, risk_level
        } = transactionData;

        const result = await query(`
            INSERT INTO transactions (
                id, account_id, card_id, user_id, transaction_id, amount,
                currency, transaction_type, status, merchant_name,
                merchant_category, merchant_id, description, authorization_code,
                reference_number, location_city, location_state, location_country,
                is_international, is_online, processing_fee, exchange_rate,
                original_amount, original_currency, processed_at, settled_at,
                fraud_score, risk_level
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, 
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $25, $26
            ) RETURNING *
        `, [
            id, account_id, card_id, user_id, transaction_id, amount,
            currency, transaction_type, status, merchant_name,
            merchant_category, merchant_id, description, authorization_code,
            reference_number, location_city, location_state, location_country,
            is_international, is_online, processing_fee, exchange_rate,
            original_amount, original_currency, fraud_score, risk_level
        ]);

        return result.rows[0];
    }

    // Update transaction
    static async update(id, updateData) {
        const fields = [];
        const values = [];
        let paramCounter = 1;

        Object.entries(updateData).forEach(([key, value]) => {
            if (value !== undefined) {
                fields.push(`${key} = $${paramCounter++}`);
                values.push(value);
            }
        });

        if (fields.length === 0) {
            throw new Error('No fields to update');
        }

        values.push(id);
        const result = await query(`
            UPDATE transactions 
            SET ${fields.join(', ')}
            WHERE id = $${paramCounter}
            RETURNING *
        `, values);

        return result.rows[0] || null;
    }

    // Get all transactions with filtering and pagination
    static async findAll(filters = {}, page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'DESC') {
        const { whereClause, values } = buildWhereClause(filters);
        const { limitClause } = buildPagination(page, limit);
        const orderByClause = buildOrderBy(sortBy, sortOrder);

        const result = await query(`
            SELECT t.*, a.account_number, u.first_name, u.last_name, u.email
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            JOIN users u ON t.user_id = u.id
            ${whereClause}
            ${orderByClause}
            ${limitClause}
        `, values);

        // Get total count
        const countResult = await query(`
            SELECT COUNT(*) as total 
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            JOIN users u ON t.user_id = u.id
            ${whereClause}
        `, values);

        return {
            transactions: result.rows,
            total: parseInt(countResult.rows[0].total),
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
        };
    }

    // Get transaction statistics
    static async getStatistics(userId = null, dateRange = 30) {
        let whereClause = '';
        let values = [];
        
        if (userId) {
            whereClause = 'WHERE user_id = $1 AND';
            values.push(userId);
        } else {
            whereClause = 'WHERE';
        }
        
        const result = await query(`
            SELECT 
                COUNT(*) as total_transactions,
                COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_transactions,
                COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_transactions,
                COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed_transactions,
                SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_spent,
                SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_payments,
                AVG(amount) as avg_transaction_amount,
                COUNT(CASE WHEN fraud_score > 0.5 THEN 1 END) as high_risk_transactions,
                COUNT(CASE WHEN is_international = true THEN 1 END) as international_transactions,
                COUNT(CASE WHEN is_online = true THEN 1 END) as online_transactions
            FROM transactions
            ${whereClause} created_at > CURRENT_DATE - INTERVAL '${dateRange} days'
        `, values);

        return result.rows[0];
    }

    // Get transactions by date range
    static async findByDateRange(startDate, endDate, userId = null, page = 1, limit = 20) {
        const { limitClause } = buildPagination(page, limit);
        let whereClause = 'WHERE created_at >= $1 AND created_at <= $2';
        let values = [startDate, endDate];
        
        if (userId) {
            whereClause += ' AND user_id = $3';
            values.push(userId);
        }

        const result = await query(`
            SELECT t.*, a.account_number, u.first_name, u.last_name, u.email
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            JOIN users u ON t.user_id = u.id
            ${whereClause}
            ORDER BY created_at DESC
            ${limitClause}
        `, values);

        const countResult = await query(`
            SELECT COUNT(*) as total FROM transactions
            ${whereClause}
        `, values);

        return {
            transactions: result.rows,
            total: parseInt(countResult.rows[0].total),
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
        };
    }

    // Get suspicious transactions
    static async getSuspiciousTransactions(fraudThreshold = 0.7) {
        const result = await query(`
            SELECT t.*, a.account_number, u.first_name, u.last_name, u.email
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            JOIN users u ON t.user_id = u.id
            WHERE t.fraud_score >= $1 OR t.risk_level IN ('HIGH', 'CRITICAL')
            ORDER BY t.fraud_score DESC, t.created_at DESC
        `, [fraudThreshold]);

        return result.rows;
    }

    // Get recent transactions for dashboard
    static async getRecentTransactions(userId = null, limit = 10) {
        let whereClause = '';
        let values = [];
        
        if (userId) {
            whereClause = 'WHERE t.user_id = $1';
            values.push(userId);
        }

        const result = await query(`
            SELECT t.*, a.account_number
            FROM transactions t
            JOIN accounts a ON t.account_id = a.id
            ${whereClause}
            ORDER BY t.created_at DESC
            LIMIT $${values.length + 1}
        `, [...values, limit]);

        return result.rows;
    }

    // Get spending by category
    static async getSpendingByCategory(userId, dateRange = 30) {
        const result = await query(`
            SELECT 
                merchant_category,
                COUNT(*) as transaction_count,
                SUM(amount) as total_amount,
                AVG(amount) as avg_amount
            FROM transactions
            WHERE user_id = $1 
            AND amount > 0 
            AND status = 'COMPLETED'
            AND created_at > CURRENT_DATE - INTERVAL '${dateRange} days'
            GROUP BY merchant_category
            ORDER BY total_amount DESC
        `, [userId]);

        return result.rows;
    }

    // Delete transaction (soft delete by setting status to CANCELLED)
    static async delete(id) {
        const result = await query(
            'UPDATE transactions SET status = $1 WHERE id = $2 RETURNING *',
            ['CANCELLED', id]
        );
        return result.rows[0] || null;
    }
}

module.exports = TransactionModel;
