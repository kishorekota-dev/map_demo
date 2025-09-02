const { query, buildWhereClause, buildPagination, buildOrderBy } = require('../database');

class UserModel {
    // Get user by email
    static async findByEmail(email) {
        const result = await query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        return result.rows[0] || null;
    }

    // Get user by ID
    static async findById(id) {
        const result = await query(
            'SELECT * FROM users WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    }

    // Create new user
    static async create(userData) {
        const {
            id, email, password_hash, first_name, last_name, phone,
            date_of_birth, ssn, address_line1, address_line2, city,
            state, zip_code, country, role, status
        } = userData;

        const result = await query(`
            INSERT INTO users (
                id, email, password_hash, first_name, last_name, phone,
                date_of_birth, ssn, address_line1, address_line2, city,
                state, zip_code, country, role, status, email_verified, phone_verified
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
            ) RETURNING *
        `, [
            id, email, password_hash, first_name, last_name, phone,
            date_of_birth, ssn, address_line1, address_line2, city,
            state, zip_code, country, role, status, false, false
        ]);

        return result.rows[0];
    }

    // Update user
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
            UPDATE users 
            SET ${fields.join(', ')}
            WHERE id = $${paramCounter}
            RETURNING *
        `, values);

        return result.rows[0] || null;
    }

    // Get all users with filtering and pagination
    static async findAll(filters = {}, page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'DESC') {
        const { whereClause, values } = buildWhereClause(filters);
        const { limitClause } = buildPagination(page, limit);
        const orderByClause = buildOrderBy(sortBy, sortOrder);

        const result = await query(`
            SELECT * FROM users
            ${whereClause}
            ${orderByClause}
            ${limitClause}
        `, values);

        // Get total count
        const countResult = await query(`
            SELECT COUNT(*) as total FROM users
            ${whereClause}
        `, values);

        return {
            users: result.rows,
            total: parseInt(countResult.rows[0].total),
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
        };
    }

    // Update last login
    static async updateLastLogin(id) {
        await query(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [id]
        );
    }

    // Increment failed login attempts
    static async incrementFailedLoginAttempts(id) {
        await query(
            'UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = $1',
            [id]
        );
    }

    // Reset failed login attempts
    static async resetFailedLoginAttempts(id) {
        await query(
            'UPDATE users SET failed_login_attempts = 0, account_locked_until = NULL WHERE id = $1',
            [id]
        );
    }

    // Lock account
    static async lockAccount(id, lockUntil) {
        await query(
            'UPDATE users SET account_locked_until = $1 WHERE id = $2',
            [lockUntil, id]
        );
    }

    // Delete user (soft delete by setting status to CLOSED)
    static async delete(id) {
        const result = await query(
            'UPDATE users SET status = $1 WHERE id = $2 RETURNING *',
            ['CLOSED', id]
        );
        return result.rows[0] || null;
    }

    // Get user statistics
    static async getStatistics() {
        const result = await query(`
            SELECT 
                COUNT(*) as total_users,
                COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active_users,
                COUNT(CASE WHEN role = 'CUSTOMER' THEN 1 END) as customers,
                COUNT(CASE WHEN role IN ('AGENT', 'MANAGER', 'ADMIN', 'SUPER_ADMIN') THEN 1 END) as staff,
                COUNT(CASE WHEN email_verified = true THEN 1 END) as verified_emails,
                COUNT(CASE WHEN created_at > CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as new_this_month
            FROM users
        `);

        return result.rows[0];
    }
}

module.exports = UserModel;
