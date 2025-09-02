const { query, buildWhereClause, buildPagination, buildOrderBy } = require('../database');

class AccountModel {
    // Get account by ID
    static async findById(id) {
        const result = await query(
            'SELECT * FROM accounts WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    }

    // Get account by account number
    static async findByAccountNumber(accountNumber) {
        const result = await query(
            'SELECT * FROM accounts WHERE account_number = $1',
            [accountNumber]
        );
        return result.rows[0] || null;
    }

    // Get accounts by user ID
    static async findByUserId(userId) {
        const result = await query(
            'SELECT * FROM accounts WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        return result.rows;
    }

    // Create new account
    static async create(accountData) {
        const {
            id, user_id, account_number, account_type, status,
            credit_limit, current_balance, available_credit,
            minimum_payment, payment_due_date, interest_rate,
            late_fee, overlimit_fee
        } = accountData;

        const result = await query(`
            INSERT INTO accounts (
                id, user_id, account_number, account_type, status,
                credit_limit, current_balance, available_credit,
                minimum_payment, payment_due_date, interest_rate,
                late_fee, overlimit_fee
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
            ) RETURNING *
        `, [
            id, user_id, account_number, account_type, status,
            credit_limit, current_balance, available_credit,
            minimum_payment, payment_due_date, interest_rate,
            late_fee, overlimit_fee
        ]);

        return result.rows[0];
    }

    // Update account
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
            UPDATE accounts 
            SET ${fields.join(', ')}
            WHERE id = $${paramCounter}
            RETURNING *
        `, values);

        return result.rows[0] || null;
    }

    // Update balance
    static async updateBalance(id, amount, isCredit = false) {
        const operator = isCredit ? '-' : '+';
        const result = await query(`
            UPDATE accounts 
            SET current_balance = current_balance ${operator} $1,
                available_credit = credit_limit - (current_balance ${operator} $1)
            WHERE id = $2
            RETURNING *
        `, [Math.abs(amount), id]);

        return result.rows[0] || null;
    }

    // Get all accounts with filtering and pagination
    static async findAll(filters = {}, page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'DESC') {
        const { whereClause, values } = buildWhereClause(filters);
        const { limitClause } = buildPagination(page, limit);
        const orderByClause = buildOrderBy(sortBy, sortOrder);

        const result = await query(`
            SELECT a.*, u.first_name, u.last_name, u.email
            FROM accounts a
            JOIN users u ON a.user_id = u.id
            ${whereClause}
            ${orderByClause}
            ${limitClause}
        `, values);

        // Get total count
        const countResult = await query(`
            SELECT COUNT(*) as total 
            FROM accounts a
            JOIN users u ON a.user_id = u.id
            ${whereClause}
        `, values);

        return {
            accounts: result.rows,
            total: parseInt(countResult.rows[0].total),
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
        };
    }

    // Get account summary
    static async getSummary(userId) {
        const result = await query(`
            SELECT 
                COUNT(*) as total_accounts,
                SUM(credit_limit) as total_credit_limit,
                SUM(current_balance) as total_balance,
                SUM(available_credit) as total_available_credit,
                AVG(interest_rate) as avg_interest_rate,
                COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active_accounts
            FROM accounts
            WHERE user_id = $1
        `, [userId]);

        return result.rows[0];
    }

    // Get account statistics
    static async getStatistics() {
        const result = await query(`
            SELECT 
                COUNT(*) as total_accounts,
                COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active_accounts,
                SUM(credit_limit) as total_credit_limit,
                SUM(current_balance) as total_balance,
                SUM(available_credit) as total_available_credit,
                AVG(interest_rate) as avg_interest_rate,
                COUNT(CASE WHEN current_balance > credit_limit * 0.8 THEN 1 END) as high_utilization_accounts
            FROM accounts
        `);

        return result.rows[0];
    }

    // Get accounts with high utilization
    static async getHighUtilizationAccounts(threshold = 0.8) {
        const result = await query(`
            SELECT a.*, u.first_name, u.last_name, u.email,
                   (a.current_balance / a.credit_limit) as utilization_ratio
            FROM accounts a
            JOIN users u ON a.user_id = u.id
            WHERE a.current_balance > a.credit_limit * $1
            AND a.status = 'ACTIVE'
            ORDER BY utilization_ratio DESC
        `, [threshold]);

        return result.rows;
    }

    // Get accounts with payment due
    static async getAccountsWithPaymentDue(days = 7) {
        const result = await query(`
            SELECT a.*, u.first_name, u.last_name, u.email
            FROM accounts a
            JOIN users u ON a.user_id = u.id
            WHERE a.payment_due_date <= CURRENT_DATE + INTERVAL '${days} days'
            AND a.current_balance > 0
            AND a.status = 'ACTIVE'
            ORDER BY a.payment_due_date ASC
        `);

        return result.rows;
    }

    // Delete account (soft delete by setting status to CLOSED)
    static async delete(id) {
        const result = await query(
            'UPDATE accounts SET status = $1 WHERE id = $2 RETURNING *',
            ['CLOSED', id]
        );
        return result.rows[0] || null;
    }
}

module.exports = AccountModel;
