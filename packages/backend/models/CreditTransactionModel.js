const { query, transaction } = require('../database');
const crypto = require('crypto');

/**
 * Credit Transaction Model following BIAN Transaction Processing standards
 * Handles all transaction processing, authorization, and settlement
 */
class CreditTransactionModel {

    // Create a new transaction with comprehensive details
    static async createTransaction(transactionData) {
        const {
            accountId,
            cardId,
            customerId,
            amount,
            currency = 'USD',
            transactionType,
            transactionSubtype,
            
            // Merchant information
            merchantName,
            merchantId,
            merchantCategoryCode,
            merchantCategoryDescription,
            merchantAddress,
            
            // Transaction processing
            authorizationCode,
            processingStatus = 'PENDING',
            
            // Location and channel
            transactionChannel,
            posEntryMode,
            cardPresent = false,
            cardholderPresent = false,
            locationCity,
            locationState,
            locationCountry,
            terminalId,
            
            // Risk and fraud
            fraudScore = 0.0,
            riskLevel = 'LOW',
            fraudIndicators = [],
            
            // Foreign transaction details
            originalAmount,
            originalCurrency,
            exchangeRate = 1.0,
            
            // Additional metadata
            metadata = {}
        } = transactionData;

        const transactionId = await this.generateTransactionId();
        const retrievalReferenceNumber = await this.generateRetrievalReference();
        const isInternational = locationCountry && locationCountry !== 'USA';

        const insertQuery = `
            INSERT INTO credit_transactions (
                account_id, card_id, customer_id, transaction_id, retrieval_reference_number,
                amount, currency, original_amount, original_currency, exchange_rate,
                transaction_type, transaction_subtype, processing_status,
                merchant_name, merchant_id, merchant_category_code, merchant_category_description,
                merchant_address, transaction_channel, pos_entry_mode, card_present,
                cardholder_present, location_city, location_state, location_country,
                terminal_id, is_international, fraud_score, risk_level, fraud_indicators,
                authorization_code, transaction_date, metadata
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, CURRENT_TIMESTAMP, $32
            ) RETURNING *
        `;

        const values = [
            accountId, cardId, customerId, transactionId, retrievalReferenceNumber,
            amount, currency, originalAmount, originalCurrency, exchangeRate,
            transactionType, transactionSubtype, processingStatus,
            merchantName, merchantId, merchantCategoryCode, merchantCategoryDescription,
            JSON.stringify(merchantAddress), transactionChannel, posEntryMode, cardPresent,
            cardholderPresent, locationCity, locationState, locationCountry,
            terminalId, isInternational, fraudScore, riskLevel, fraudIndicators,
            authorizationCode, JSON.stringify(metadata)
        ];

        const result = await query(insertQuery, values);
        return result.rows[0];
    }

    // Generate unique transaction ID
    static generateTransactionId() {
        const timestamp = Date.now().toString();
        const random = Math.floor(Math.random() * 999999).toString().padStart(6, '0');
        return `TXN${timestamp}${random}`;
    }

    // Generate retrieval reference number (ARN)
    static generateRetrievalReference() {
        const random = Math.floor(Math.random() * 999999999999).toString().padStart(12, '0');
        return random;
    }

    // Authorize a transaction
    static async authorizeTransaction(authData) {
        const {
            accountId,
            cardId,
            amount,
            merchantId,
            merchantName,
            merchantCategoryCode,
            transactionChannel,
            locationCountry = 'USA'
        } = authData;

        // Check account status and available credit
        const accountQuery = `
            SELECT available_credit, account_status, credit_limit, current_balance,
                   international_usage_enabled, fraud_alerts_enabled
            FROM credit_accounts ca
            LEFT JOIN credit_cards cc ON cc.account_id = ca.id
            WHERE ca.id = $1 AND cc.id = $2
        `;

        const accountResult = await query(accountQuery, [accountId, cardId]);
        
        if (accountResult.rows.length === 0) {
            return this.createAuthorizationResponse('DECLINED', 'INVALID_ACCOUNT', null, amount);
        }

        const account = accountResult.rows[0];

        // Check account status
        if (account.account_status !== 'ACTIVE') {
            return this.createAuthorizationResponse('DECLINED', 'ACCOUNT_INACTIVE', null, amount);
        }

        // Check available credit
        if (parseFloat(amount) > parseFloat(account.available_credit)) {
            return this.createAuthorizationResponse('DECLINED', 'INSUFFICIENT_FUNDS', null, amount);
        }

        // Check international transaction restrictions
        const isInternational = locationCountry !== 'USA';
        if (isInternational && !account.international_usage_enabled) {
            return this.createAuthorizationResponse('DECLINED', 'INTERNATIONAL_BLOCKED', null, amount);
        }

        // Perform fraud check
        const fraudCheck = await this.performFraudCheck({
            accountId, cardId, amount, merchantId, merchantCategoryCode,
            transactionChannel, isInternational
        });

        if (fraudCheck.riskLevel === 'BLOCKED') {
            return this.createAuthorizationResponse('DECLINED', 'FRAUD_SUSPECTED', null, amount);
        }

        // Generate authorization code
        const authorizationCode = this.generateAuthorizationCode();

        // Create authorization record
        const authQuery = `
            INSERT INTO transaction_authorizations (
                account_id, card_id, authorization_code, amount, merchant_name, merchant_id,
                authorization_status, authorized_amount, available_credit_impact, expires_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, 'APPROVED', $4, $4, CURRENT_TIMESTAMP + INTERVAL '7 days'
            ) RETURNING *
        `;

        const authResult = await query(authQuery, [
            accountId, cardId, authorizationCode, amount, merchantName, merchantId
        ]);

        // Update available credit (hold the amount)
        await query(
            'UPDATE credit_accounts SET available_credit = available_credit - $1 WHERE id = $2',
            [amount, accountId]
        );

        return this.createAuthorizationResponse('APPROVED', 'APPROVED', authorizationCode, amount, {
            fraudScore: fraudCheck.fraudScore,
            riskLevel: fraudCheck.riskLevel
        });
    }

    // Create authorization response
    static createAuthorizationResponse(status, responseCode, authCode, amount, additionalData = {}) {
        return {
            authorizationStatus: status,
            responseCode,
            authorizationCode: authCode,
            authorizedAmount: status === 'APPROVED' ? amount : 0,
            timestamp: new Date(),
            ...additionalData
        };
    }

    // Generate authorization code
    static generateAuthorizationCode() {
        return Math.floor(Math.random() * 999999).toString().padStart(6, '0');
    }

    // Perform fraud scoring and risk assessment
    static async performFraudCheck(transactionData) {
        const {
            accountId, cardId, amount, merchantId, merchantCategoryCode,
            transactionChannel, isInternational
        } = transactionData;

        let fraudScore = 0.0;
        const riskFactors = [];

        // Check velocity patterns (multiple transactions in short time)
        const velocityQuery = `
            SELECT COUNT(*) as recent_count, SUM(amount) as recent_amount
            FROM credit_transactions 
            WHERE account_id = $1 
            AND transaction_date >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
            AND processing_status != 'DECLINED'
        `;

        const velocityResult = await query(velocityQuery, [accountId]);
        const { recent_count, recent_amount } = velocityResult.rows[0];

        // Velocity scoring
        if (parseInt(recent_count) >= 5) {
            fraudScore += 0.3;
            riskFactors.push('HIGH_VELOCITY_COUNT');
        }

        if (parseFloat(recent_amount) >= 5000) {
            fraudScore += 0.2;
            riskFactors.push('HIGH_VELOCITY_AMOUNT');
        }

        // Amount-based scoring
        if (parseFloat(amount) >= 2000) {
            fraudScore += 0.1;
            riskFactors.push('HIGH_AMOUNT');
        }

        // International transaction scoring
        if (isInternational) {
            fraudScore += 0.15;
            riskFactors.push('INTERNATIONAL');
        }

        // Merchant category risk
        const highRiskMCCs = ['5993', '7995', '4829', '5122']; // Cigar stores, gambling, money transfer, drugs
        if (highRiskMCCs.includes(merchantCategoryCode)) {
            fraudScore += 0.2;
            riskFactors.push('HIGH_RISK_MERCHANT');
        }

        // Time-based scoring (unusual hours)
        const hour = new Date().getHours();
        if (hour < 6 || hour > 23) {
            fraudScore += 0.1;
            riskFactors.push('UNUSUAL_HOURS');
        }

        // Determine risk level
        let riskLevel;
        if (fraudScore >= 0.8) {
            riskLevel = 'BLOCKED';
        } else if (fraudScore >= 0.5) {
            riskLevel = 'HIGH';
        } else if (fraudScore >= 0.3) {
            riskLevel = 'MEDIUM';
        } else {
            riskLevel = 'LOW';
        }

        return {
            fraudScore: Math.round(fraudScore * 100) / 100,
            riskLevel,
            riskFactors
        };
    }

    // Capture an authorized transaction
    static async captureTransaction(authorizationCode, captureAmount = null) {
        const getAuthQuery = `
            SELECT * FROM transaction_authorizations 
            WHERE authorization_code = $1 AND authorization_status = 'APPROVED'
            AND expires_at > CURRENT_TIMESTAMP
        `;

        const authResult = await query(getAuthQuery, [authorizationCode]);
        
        if (authResult.rows.length === 0) {
            throw new Error('Invalid or expired authorization');
        }

        const authorization = authResult.rows[0];
        const finalAmount = captureAmount || authorization.amount;

        if (parseFloat(finalAmount) > parseFloat(authorization.authorized_amount)) {
            throw new Error('Capture amount exceeds authorized amount');
        }

        // Create the transaction record
        const transactionId = this.generateTransactionId();
        
        const insertTransactionQuery = `
            INSERT INTO credit_transactions (
                account_id, card_id, transaction_id, authorization_code,
                amount, transaction_type, processing_status, merchant_name, merchant_id,
                transaction_date, capture_date
            ) VALUES (
                $1, $2, $3, $4, $5, 'PURCHASE', 'CAPTURED', $6, $7, $8, CURRENT_TIMESTAMP
            ) RETURNING *
        `;

        const transactionResult = await query(insertTransactionQuery, [
            authorization.account_id, authorization.card_id, transactionId, authorizationCode,
            finalAmount, authorization.merchant_name, authorization.merchant_id,
            authorization.authorized_at
        ]);

        // Update authorization status
        await query(
            'UPDATE transaction_authorizations SET authorization_status = $1, captured_at = CURRENT_TIMESTAMP, transaction_id = $2 WHERE id = $3',
            ['CAPTURED', transactionResult.rows[0].id, authorization.id]
        );

        return transactionResult.rows[0];
    }

    // Settle a captured transaction
    static async settleTransaction(transactionId) {
        const getTransactionQuery = `
            SELECT * FROM credit_transactions 
            WHERE transaction_id = $1 AND processing_status = 'CAPTURED'
        `;

        const transactionResult = await query(getTransactionQuery, [transactionId]);
        
        if (transactionResult.rows.length === 0) {
            throw new Error('Transaction not found or not in captured status');
        }

        const transaction = transactionResult.rows[0];

        // Start database transaction for atomic settlement
        const client = await require('../database').getClient();
        
        try {
            await client.query('BEGIN');

            // Update transaction status
            await client.query(
                'UPDATE credit_transactions SET processing_status = $1, settlement_date = CURRENT_TIMESTAMP, posting_date = CURRENT_TIMESTAMP WHERE id = $2',
                ['SETTLED', transaction.id]
            );

            // Update account balance
            await client.query(
                'UPDATE credit_accounts SET current_balance = current_balance + $1 WHERE id = $2',
                [transaction.amount, transaction.account_id]
            );

            // Calculate and apply fees if international
            if (transaction.is_international) {
                const foreignTransactionFee = parseFloat(transaction.amount) * 0.025; // 2.5% foreign transaction fee
                
                await client.query(`
                    INSERT INTO credit_transactions (
                        account_id, customer_id, transaction_id, amount, transaction_type,
                        processing_status, description, transaction_date, posting_date
                    ) VALUES ($1, $2, $3, $4, 'FEE', 'SETTLED', 'Foreign Transaction Fee', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `, [
                    transaction.account_id, transaction.customer_id,
                    this.generateTransactionId(), foreignTransactionFee
                ]);

                await client.query(
                    'UPDATE credit_accounts SET current_balance = current_balance + $1 WHERE id = $2',
                    [foreignTransactionFee, transaction.account_id]
                );
            }

            // Update available credit
            await client.query(
                'UPDATE credit_accounts SET available_credit = credit_limit - current_balance WHERE id = $1',
                [transaction.account_id]
            );

            await client.query('COMMIT');

            // Get updated transaction
            const updatedResult = await query('SELECT * FROM credit_transactions WHERE id = $1', [transaction.id]);
            return updatedResult.rows[0];

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Process a payment transaction
    static async processPayment(paymentData) {
        const {
            accountId,
            customerId,
            paymentAmount,
            paymentMethod,
            sourceAccountInfo,
            scheduledDate = null
        } = paymentData;

        const transactionId = this.generateTransactionId();
        const paymentReference = `PAY${Date.now()}${Math.floor(Math.random() * 9999)}`;

        const insertQuery = `
            INSERT INTO credit_transactions (
                account_id, customer_id, transaction_id, amount, transaction_type,
                processing_status, transaction_channel, reference_number, transaction_date
            ) VALUES (
                $1, $2, $3, $4, 'PAYMENT', 'PENDING', $5, $6, CURRENT_TIMESTAMP
            ) RETURNING *
        `;

        const result = await query(insertQuery, [
            accountId, customerId, transactionId, paymentAmount, paymentMethod, paymentReference
        ]);

        // Create payment record
        const paymentQuery = `
            INSERT INTO payments (
                account_id, customer_id, payment_reference, payment_amount,
                payment_method, payment_status, scheduled_date
            ) VALUES (
                $1, $2, $3, $4, $5, 'PENDING', $6
            ) RETURNING *
        `;

        const paymentResult = await query(paymentQuery, [
            accountId, customerId, paymentReference, paymentAmount,
            paymentMethod, scheduledDate || new Date()
        ]);

        return {
            transaction: result.rows[0],
            payment: paymentResult.rows[0]
        };
    }

    // Get transactions with filters and pagination
    static async getTransactions(filters = {}, pagination = {}) {
        const { page = 1, limit = 50, sortBy = 'transaction_date', sortOrder = 'DESC' } = pagination;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        let params = [];
        let paramCounter = 0;

        // Build dynamic where clause
        if (filters.accountId) {
            paramCounter++;
            whereClause += ` AND account_id = $${paramCounter}`;
            params.push(filters.accountId);
        }

        if (filters.customerId) {
            paramCounter++;
            whereClause += ` AND customer_id = $${paramCounter}`;
            params.push(filters.customerId);
        }

        if (filters.transactionType) {
            paramCounter++;
            whereClause += ` AND transaction_type = $${paramCounter}`;
            params.push(filters.transactionType);
        }

        if (filters.status) {
            paramCounter++;
            whereClause += ` AND processing_status = $${paramCounter}`;
            params.push(filters.status);
        }

        if (filters.startDate) {
            paramCounter++;
            whereClause += ` AND transaction_date >= $${paramCounter}`;
            params.push(filters.startDate);
        }

        if (filters.endDate) {
            paramCounter++;
            whereClause += ` AND transaction_date <= $${paramCounter}`;
            params.push(filters.endDate);
        }

        if (filters.merchantId) {
            paramCounter++;
            whereClause += ` AND merchant_id = $${paramCounter}`;
            params.push(filters.merchantId);
        }

        if (filters.amountMin) {
            paramCounter++;
            whereClause += ` AND amount >= $${paramCounter}`;
            params.push(filters.amountMin);
        }

        if (filters.amountMax) {
            paramCounter++;
            whereClause += ` AND amount <= $${paramCounter}`;
            params.push(filters.amountMax);
        }

        const countQuery = `SELECT COUNT(*) FROM credit_transactions ${whereClause}`;
        const selectQuery = `
            SELECT * FROM credit_transactions 
            ${whereClause}
            ORDER BY ${sortBy} ${sortOrder}
            LIMIT $${paramCounter + 1} OFFSET $${paramCounter + 2}
        `;

        const [countResult, transactionsResult] = await Promise.all([
            query(countQuery, params),
            query(selectQuery, [...params, limit, offset])
        ]);

        return {
            transactions: transactionsResult.rows,
            pagination: {
                page,
                limit,
                total: parseInt(countResult.rows[0].count),
                totalPages: Math.ceil(countResult.rows[0].count / limit)
            }
        };
    }

    // Get transaction by ID
    static async getTransactionById(transactionId) {
        const selectQuery = `
            SELECT ct.*, ca.account_number, c.first_name, c.last_name, c.email
            FROM credit_transactions ct
            LEFT JOIN credit_accounts ca ON ct.account_id = ca.id
            LEFT JOIN customers c ON ct.customer_id = c.id
            WHERE ct.transaction_id = $1
        `;

        const result = await query(selectQuery, [transactionId]);
        return result.rows[0] || null;
    }

    // Reverse a transaction
    static async reverseTransaction(originalTransactionId, reversalReason, reversedBy) {
        const getOriginalQuery = `
            SELECT * FROM credit_transactions 
            WHERE transaction_id = $1 AND processing_status = 'SETTLED'
        `;

        const originalResult = await query(getOriginalQuery, [originalTransactionId]);
        
        if (originalResult.rows.length === 0) {
            throw new Error('Original transaction not found or not settled');
        }

        const originalTransaction = originalResult.rows[0];
        const reversalTransactionId = this.generateTransactionId();

        const client = await require('../database').getClient();
        
        try {
            await client.query('BEGIN');

            // Create reversal transaction
            await client.query(`
                INSERT INTO credit_transactions (
                    account_id, customer_id, transaction_id, amount, transaction_type,
                    processing_status, description, reference_number, transaction_date,
                    posting_date, created_by
                ) VALUES (
                    $1, $2, $3, $4, 'ADJUSTMENT', 'SETTLED', $5, $6, CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP, $7
                )
            `, [
                originalTransaction.account_id, originalTransaction.customer_id,
                reversalTransactionId, -originalTransaction.amount, // Negative amount for reversal
                `Reversal: ${reversalReason}`, originalTransaction.reference_number, reversedBy
            ]);

            // Update account balance
            await client.query(
                'UPDATE credit_accounts SET current_balance = current_balance - $1, available_credit = credit_limit - current_balance WHERE id = $2',
                [originalTransaction.amount, originalTransaction.account_id]
            );

            // Update original transaction status
            await client.query(
                'UPDATE credit_transactions SET processing_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                ['REVERSED', originalTransaction.id]
            );

            await client.query('COMMIT');

            return { reversalTransactionId, originalTransactionId };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Get spending analytics
    static async getSpendingAnalytics(accountId, period = '12 months') {
        const analyticsQuery = `
            SELECT 
                merchant_category_description,
                COUNT(*) as transaction_count,
                SUM(amount) as total_amount,
                AVG(amount) as average_amount,
                MAX(amount) as largest_amount
            FROM credit_transactions 
            WHERE account_id = $1 
            AND transaction_type = 'PURCHASE'
            AND processing_status = 'SETTLED'
            AND transaction_date >= CURRENT_DATE - INTERVAL '${period}'
            GROUP BY merchant_category_description
            ORDER BY total_amount DESC
            LIMIT 10
        `;

        const result = await query(analyticsQuery, [accountId]);
        return result.rows;
    }
}

module.exports = CreditTransactionModel;
