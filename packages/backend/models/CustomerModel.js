const { query, transaction } = require('../database');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

/**
 * Enhanced Customer Model following BIAN standards
 * Supports comprehensive customer information management
 */
class CustomerModel {
    // Customer creation with comprehensive KYC data
    static async createCustomer(customerData) {
        const {
            // Core identity
            title, firstName, middleName, lastName, maidenName, preferredName, suffix,
            gender, dateOfBirth, placeOfBirth, nationality, citizenshipStatus,
            
            // Government ID
            ssn, ein, driversLicense, passport,
            
            // Contact information
            email, phonePrimary, phoneSecondary, preferredContactMethod, languagePreference,
            
            // Address
            addressLine1, addressLine2, city, state, postalCode, country, addressType,
            
            // Employment
            employmentStatus, employerName, jobTitle, workPhone, employmentStartDate,
            annualIncome, incomeSource,
            
            // Financial
            creditScore, netWorth, liquidAssets, monthlyExpenses,
            
            // Preferences and consent
            marketingConsent, dataSharingConsent, paperlessStatements,
            
            // Authentication
            password
        } = customerData;

        const customerReference = await this.generateCustomerReference();
        const passwordHash = await bcrypt.hash(password, 12);
        
        // Encrypt sensitive data
        const ssnEncrypted = ssn ? this.encryptSensitiveData(ssn) : null;
        const einEncrypted = ein ? this.encryptSensitiveData(ein) : null;

        const insertQuery = `
            INSERT INTO customers (
                customer_reference, title, first_name, middle_name, last_name, maiden_name,
                preferred_name, suffix, gender, date_of_birth, place_of_birth, nationality,
                citizenship_status, ssn_encrypted, ein_encrypted, email, phone_primary,
                phone_secondary, preferred_contact_method, language_preference,
                address_line1, address_line2, city, state, postal_code, country, address_type,
                employment_status, employer_name, job_title, work_phone, employment_start_date,
                annual_income, income_source, credit_score, net_worth, liquid_assets,
                monthly_expenses, marketing_consent, data_sharing_consent, paperless_statements,
                password_hash, kyc_status, customer_status
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32,
                $33, $34, $35, $36, $37, $38, $39, $40, $41, 'PENDING', 'PROSPECT'
            ) RETURNING *
        `;

        const values = [
            customerReference, title, firstName, middleName, lastName, maidenName,
            preferredName, suffix, gender, dateOfBirth, placeOfBirth, nationality,
            citizenshipStatus, ssnEncrypted, einEncrypted, email, phonePrimary,
            phoneSecondary, preferredContactMethod, languagePreference,
            addressLine1, addressLine2, city, state, postalCode, country, addressType,
            employmentStatus, employerName, jobTitle, workPhone, employmentStartDate,
            annualIncome, incomeSource, creditScore, netWorth, liquidAssets,
            monthlyExpenses, marketingConsent, dataSharingConsent, paperlessStatements,
            passwordHash
        ];

        const result = await query(insertQuery, values);
        return result.rows[0];
    }

    // Generate unique customer reference (CIF number)
    static async generateCustomerReference() {
        const timestamp = Date.now().toString().slice(-8);
        const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
        return `CIF${timestamp}${random}`;
    }

    // Encrypt sensitive data using AES-256
    static encryptSensitiveData(data) {
        const algorithm = 'aes-256-gcm';
        const secretKey = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
        const key = crypto.scryptSync(secretKey, 'salt', 32);
        const iv = crypto.randomBytes(16);
        
        const cipher = crypto.createCipher(algorithm, key);
        cipher.setAAD(Buffer.from('customer-data', 'utf8'));
        
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        return JSON.stringify({
            encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex')
        });
    }

    // Decrypt sensitive data
    static decryptSensitiveData(encryptedData) {
        try {
            const { encrypted, iv, authTag } = JSON.parse(encryptedData);
            const algorithm = 'aes-256-gcm';
            const secretKey = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
            const key = crypto.scryptSync(secretKey, 'salt', 32);
            
            const decipher = crypto.createDecipher(algorithm, key);
            decipher.setAAD(Buffer.from('customer-data', 'utf8'));
            decipher.setAuthTag(Buffer.from(authTag, 'hex'));
            
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            throw new Error('Failed to decrypt sensitive data');
        }
    }

    // Get customer by ID with decrypted sensitive data (for authorized access only)
    static async getCustomerById(customerId, includeEncrypted = false) {
        const selectQuery = `
            SELECT * FROM users WHERE id = $1 AND status = 'ACTIVE'
        `;
        
        const result = await query(selectQuery, [customerId]);
        
        if (result.rows.length === 0) {
            return null;
        }

        const customer = result.rows[0];
        
        // Decrypt sensitive data if authorized
        if (includeEncrypted && customer.ssn_encrypted) {
            try {
                customer.ssn = this.decryptSensitiveData(customer.ssn_encrypted);
                customer.ein = customer.ein_encrypted ? this.decryptSensitiveData(customer.ein_encrypted) : null;
            } catch (error) {
                // Log error but don't fail the request
                console.error('Failed to decrypt customer data:', error);
            }
        }

        // Remove encrypted fields from response
        delete customer.ssn_encrypted;
        delete customer.ein_encrypted;
        delete customer.password_hash;

        return customer;
    }

    // Search customers with filters and pagination
    static async searchCustomers(filters = {}, pagination = {}) {
        const { page = 1, limit = 50, sortBy = 'created_at', sortOrder = 'DESC' } = pagination;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE customer_status != $1';
        let whereParams = ['CLOSED'];
        let paramCounter = 1;

        // Build dynamic where clause
        if (filters.email) {
            paramCounter++;
            whereClause += ` AND email ILIKE $${paramCounter}`;
            whereParams.push(`%${filters.email}%`);
        }

        if (filters.customerReference) {
            paramCounter++;
            whereClause += ` AND customer_reference = $${paramCounter}`;
            whereParams.push(filters.customerReference);
        }

        if (filters.status) {
            paramCounter++;
            whereClause += ` AND customer_status = $${paramCounter}`;
            whereParams.push(filters.status);
        }

        if (filters.kycStatus) {
            paramCounter++;
            whereClause += ` AND kyc_status = $${paramCounter}`;
            whereParams.push(filters.kycStatus);
        }

        const countQuery = `SELECT COUNT(*) FROM customers ${whereClause}`;
        const selectQuery = `
            SELECT id, customer_reference, first_name, last_name, email, phone_primary,
                   customer_status, kyc_status, created_at, last_login
            FROM customers 
            ${whereClause}
            ORDER BY ${sortBy} ${sortOrder}
            LIMIT $${paramCounter + 1} OFFSET $${paramCounter + 2}
        `;

        const [countResult, customersResult] = await Promise.all([
            query(countQuery, whereParams),
            query(selectQuery, [...whereParams, limit, offset])
        ]);

        return {
            customers: customersResult.rows,
            pagination: {
                page,
                limit,
                total: parseInt(countResult.rows[0].count),
                totalPages: Math.ceil(countResult.rows[0].count / limit)
            }
        };
    }

    // Update customer KYC status
    static async updateKycStatus(customerId, kycStatus, verificationDetails = {}) {
        const updateQuery = `
            UPDATE customers 
            SET kyc_status = $1, kyc_completion_date = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING id, customer_reference, kyc_status, kyc_completion_date
        `;

        const completionDate = kycStatus === 'VERIFIED' ? new Date() : null;
        const result = await query(updateQuery, [kycStatus, completionDate, customerId]);

        // Log KYC status change for audit
        if (result.rows.length > 0) {
            await this.logCustomerEvent(customerId, 'KYC_STATUS_CHANGE', {
                previousStatus: verificationDetails.previousStatus,
                newStatus: kycStatus,
                verificationDetails
            });
        }

        return result.rows[0];
    }

    // Log customer events for audit trail
    static async logCustomerEvent(customerId, eventType, eventData = {}) {
        const insertQuery = `
            INSERT INTO customer_audit_log (customer_id, event_type, event_data, created_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        `;

        await query(insertQuery, [customerId, eventType, JSON.stringify(eventData)]);
    }

    // Update customer information
    static async updateCustomer(customerId, updateData) {
        const allowedFields = [
            'phone_primary', 'phone_secondary', 'preferred_contact_method',
            'address_line1', 'address_line2', 'city', 'state', 'postal_code',
            'employment_status', 'employer_name', 'job_title', 'annual_income',
            'marketing_consent', 'data_sharing_consent', 'paperless_statements'
        ];

        const updateFields = [];
        const updateValues = [];
        let paramCounter = 0;

        Object.keys(updateData).forEach(key => {
            if (allowedFields.includes(key)) {
                paramCounter++;
                updateFields.push(`${key} = $${paramCounter}`);
                updateValues.push(updateData[key]);
            }
        });

        if (updateFields.length === 0) {
            throw new Error('No valid fields provided for update');
        }

        paramCounter++;
        updateValues.push(customerId);

        const updateQuery = `
            UPDATE customers 
            SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP, last_profile_update = CURRENT_TIMESTAMP
            WHERE id = $${paramCounter}
            RETURNING *
        `;

        const result = await query(updateQuery, updateValues);
        return result.rows[0];
    }

    // Verify customer password
    static async verifyPassword(customerId, password) {
        const selectQuery = 'SELECT password_hash FROM users WHERE id = $1';
        const result = await query(selectQuery, [customerId]);

        if (result.rows.length === 0) {
            return false;
        }

        return await bcrypt.compare(password, result.rows[0].password_hash);
    }

    // Update last login timestamp
    static async updateLastLogin(customerId) {
        const updateQuery = `
            UPDATE users 
            SET last_login = CURRENT_TIMESTAMP, failed_login_attempts = 0
            WHERE id = $1
        `;

        await query(updateQuery, [customerId]);
    }

    // Handle failed login attempt
    static async recordFailedLogin(email) {
        const updateQuery = `
            UPDATE users 
            SET failed_login_attempts = failed_login_attempts + 1,
                account_locked_until = CASE 
                    WHEN failed_login_attempts >= 4 THEN CURRENT_TIMESTAMP + INTERVAL '30 minutes'
                    ELSE account_locked_until
                END
            WHERE email = $1
            RETURNING failed_login_attempts, account_locked_until
        `;

        const result = await query(updateQuery, [email]);
        return result.rows[0];
    }

    // Check if account is locked
    static async isAccountLocked(email) {
        const selectQuery = `
            SELECT account_locked_until, failed_login_attempts
            FROM users 
            WHERE email = $1
        `;

        const result = await query(selectQuery, [email]);
        
        if (result.rows.length === 0) {
            return false;
        }

        const { account_locked_until, failed_login_attempts } = result.rows[0];
        
        if (account_locked_until && new Date() < new Date(account_locked_until)) {
            return true;
        }

        return false;
    }

    // Find customer by email address
    static async findByEmail(email) {
        const selectQuery = `
            SELECT * FROM users 
            WHERE email = $1 AND status = 'ACTIVE'
        `;
        
        const result = await query(selectQuery, [email]);
        
        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0];
    }

    // Find customer by ID
    static async findById(customerId) {
        return await this.getCustomerById(customerId, false);
    }

    // Track login attempts for security
    static async trackLoginAttempt(customerId, successful, ipAddress) {
        const insertQuery = `
            INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, timestamp, status)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)
        `;

        const status = successful ? 'SUCCESS' : 'FAILED';

        await query(insertQuery, [customerId, 'LOGIN', 'USER', customerId, ipAddress, status]);

        if (successful) {
            await this.updateLastLogin(customerId);
        } else {
            await this.recordFailedLogin(customerId);
        }
    }

    // Find customer by SSN (encrypted)
    static async findBySSN(ssn) {
        // This would need to be implemented with proper encryption search
        // For now, return null as this is a complex operation requiring decryption
        return null;
    }
}

module.exports = CustomerModel;
