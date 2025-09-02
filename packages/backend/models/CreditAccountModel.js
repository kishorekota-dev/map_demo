const { query, transaction } = require('../database');

/**
 * Credit Account Model following BIAN Credit Account Lifecycle standards
 * Manages credit accounts, limits, and account-level operations
 */
class CreditAccountModel {
    
    // Create a new credit account for a customer
    static async createCreditAccount(accountData) {
        const {
            customerId,
            productId,
            creditLimit,
            cashAdvanceLimit,
            currentApr,
            cashAdvanceApr,
            statementCycleDay = 15,
            initialPromoApr = null,
            promoEndDate = null
        } = accountData;

        const accountNumber = await this.generateAccountNumber();
        const accountReference = await this.generateAccountReference();
        const availableCredit = creditLimit;

        const insertQuery = `
            INSERT INTO credit_accounts (
                customer_id, product_id, account_number, account_reference,
                credit_limit, cash_advance_limit, available_credit, current_balance,
                current_apr, cash_advance_apr, promotional_apr, promotional_end_date,
                statement_cycle_day, account_status, opened_date
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'ACTIVE', CURRENT_DATE
            ) RETURNING *
        `;

        const values = [
            customerId, productId, accountNumber, accountReference,
            creditLimit, cashAdvanceLimit || (creditLimit * 0.3), availableCredit, 0,
            currentApr, cashAdvanceApr, initialPromoApr, promoEndDate,
            statementCycleDay
        ];

        const result = await query(insertQuery, values);
        return result.rows[0];
    }

    // Generate unique account number
    static async generateAccountNumber() {
        const prefix = '4532'; // Credit card BIN range
        const timestamp = Date.now().toString().slice(-8);
        const random = Math.floor(Math.random() * 99999999).toString().padStart(8, '0');
        return `${prefix}${timestamp}${random}`;
    }

    // Generate internal account reference
    static async generateAccountReference() {
        const timestamp = Date.now().toString().slice(-10);
        const random = Math.floor(Math.random() * 999999).toString().padStart(6, '0');
        return `CCA${timestamp}${random}`;
    }

    // Get account by ID with full details
    static async getAccountById(accountId, includeCustomer = false) {
        let selectQuery = `
            SELECT ca.*, ccp.product_name, ccp.product_category, ccp.card_network
            FROM credit_accounts ca
            LEFT JOIN credit_card_products ccp ON ca.product_id = ccp.id
            WHERE ca.id = $1 AND ca.account_status != 'CLOSED'
        `;

        if (includeCustomer) {
            selectQuery = `
                SELECT ca.*, ccp.product_name, ccp.product_category, ccp.card_network,
                       c.first_name, c.last_name, c.email, c.customer_reference
                FROM credit_accounts ca
                LEFT JOIN credit_card_products ccp ON ca.product_id = ccp.id
                LEFT JOIN customers c ON ca.customer_id = c.id
                WHERE ca.id = $1 AND ca.account_status != 'CLOSED'
            `;
        }

        const result = await query(selectQuery, [accountId]);
        return result.rows[0] || null;
    }

    // Get accounts by customer ID
    static async getAccountsByCustomerId(customerId, filters = {}) {
        let whereClause = 'WHERE ca.customer_id = $1 AND ca.account_status != $2';
        let params = [customerId, 'CLOSED'];
        let paramCounter = 2;

        if (filters.status) {
            paramCounter++;
            whereClause += ` AND ca.account_status = $${paramCounter}`;
            params.push(filters.status);
        }

        if (filters.productCategory) {
            paramCounter++;
            whereClause += ` AND ccp.product_category = $${paramCounter}`;
            params.push(filters.productCategory);
        }

        const selectQuery = `
            SELECT ca.*, ccp.product_name, ccp.product_category, ccp.card_network
            FROM credit_accounts ca
            LEFT JOIN credit_card_products ccp ON ca.product_id = ccp.id
            ${whereClause}
            ORDER BY ca.opened_date DESC
        `;

        const result = await query(selectQuery, params);
        return result.rows;
    }

    // Update account balance after transaction
    static async updateAccountBalance(accountId, transactionAmount, transactionType) {
        const getAccountQuery = `
            SELECT current_balance, credit_limit, available_credit 
            FROM credit_accounts 
            WHERE id = $1
        `;

        const accountResult = await query(getAccountQuery, [accountId]);
        
        if (accountResult.rows.length === 0) {
            throw new Error('Account not found');
        }

        const account = accountResult.rows[0];
        let newBalance = parseFloat(account.current_balance);
        
        // Calculate new balance based on transaction type
        switch (transactionType) {
            case 'PURCHASE':
            case 'CASH_ADVANCE':
            case 'FEE':
            case 'INTEREST':
                newBalance += parseFloat(transactionAmount);
                break;
            case 'PAYMENT':
            case 'REFUND':
                newBalance -= parseFloat(transactionAmount);
                break;
            default:
                throw new Error(`Unsupported transaction type: ${transactionType}`);
        }

        // Ensure balance doesn't go negative
        newBalance = Math.max(0, newBalance);
        
        const newAvailableCredit = parseFloat(account.credit_limit) - newBalance;

        const updateQuery = `
            UPDATE credit_accounts 
            SET current_balance = $1, 
                available_credit = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING current_balance, available_credit
        `;

        const result = await query(updateQuery, [newBalance, newAvailableCredit, accountId]);
        return result.rows[0];
    }

    // Process credit limit increase request
    static async requestCreditLimitIncrease(accountId, requestedLimit, requestReason) {
        const getCurrentLimitQuery = `
            SELECT credit_limit, customer_id 
            FROM credit_accounts 
            WHERE id = $1
        `;

        const accountResult = await query(getCurrentLimitQuery, [accountId]);
        
        if (accountResult.rows.length === 0) {
            throw new Error('Account not found');
        }

        const { credit_limit: currentLimit, customer_id } = accountResult.rows[0];

        // Create limit increase request record
        const createRequestQuery = `
            INSERT INTO credit_limit_requests (
                account_id, customer_id, current_limit, requested_limit, 
                request_reason, request_status, requested_date
            ) VALUES ($1, $2, $3, $4, $5, 'PENDING', CURRENT_TIMESTAMP)
            RETURNING *
        `;

        const result = await query(createRequestQuery, [
            accountId, customer_id, currentLimit, requestedLimit, requestReason
        ]);

        return result.rows[0];
    }

    // Update credit limit (for approved requests)
    static async updateCreditLimit(accountId, newCreditLimit, approvedBy) {
        const updateQuery = `
            UPDATE credit_accounts 
            SET credit_limit = $1,
                available_credit = $1 - current_balance,
                cash_advance_limit = $1 * 0.3,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
        `;

        const result = await query(updateQuery, [newCreditLimit, accountId]);

        // Log the credit limit change
        if (result.rows.length > 0) {
            await this.logAccountEvent(accountId, 'CREDIT_LIMIT_UPDATE', {
                newLimit: newCreditLimit,
                approvedBy: approvedBy,
                timestamp: new Date()
            });
        }

        return result.rows[0];
    }

    // Calculate minimum payment due
    static async calculateMinimumPayment(accountId) {
        const getAccountQuery = `
            SELECT current_balance, credit_limit, last_statement_balance,
                   late_payment_count, payment_due_date
            FROM credit_accounts ca
            LEFT JOIN credit_card_products ccp ON ca.product_id = ccp.id
            WHERE ca.id = $1
        `;

        const result = await query(getAccountQuery, [accountId]);
        
        if (result.rows.length === 0) {
            throw new Error('Account not found');
        }

        const account = result.rows[0];
        const balance = parseFloat(account.current_balance);
        
        if (balance <= 0) {
            return 0;
        }

        // Standard minimum payment calculation: 2% of balance or $25, whichever is higher
        let minimumPayment = Math.max(balance * 0.02, 25);
        
        // If balance is less than $25, minimum payment is the full balance
        if (balance < 25) {
            minimumPayment = balance;
        }

        // Add late fees if applicable
        if (account.late_payment_count > 0) {
            minimumPayment += 25; // Late fee
        }

        return Math.round(minimumPayment * 100) / 100; // Round to 2 decimal places
    }

    // Update minimum payment and due date
    static async updateMinimumPayment(accountId, minimumPayment, dueDate) {
        const updateQuery = `
            UPDATE credit_accounts 
            SET minimum_payment_amount = $1,
                payment_due_date = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING minimum_payment_amount, payment_due_date
        `;

        const result = await query(updateQuery, [minimumPayment, dueDate, accountId]);
        return result.rows[0];
    }

    // Process monthly statement
    static async generateMonthlyStatement(accountId) {
        const account = await this.getAccountById(accountId);
        
        if (!account) {
            throw new Error('Account not found');
        }

        // Calculate statement period
        const statementDate = new Date();
        const nextStatementDate = new Date(statementDate);
        nextStatementDate.setMonth(nextStatementDate.getMonth() + 1);

        // Get transactions for the statement period
        const getTransactionsQuery = `
            SELECT * FROM credit_transactions 
            WHERE account_id = $1 
            AND posting_date >= $2 
            AND posting_date < $3
            ORDER BY posting_date DESC
        `;

        const previousStatementDate = account.last_statement_date || 
            new Date(statementDate.getFullYear(), statementDate.getMonth() - 1, account.statement_cycle_day);

        const transactions = await query(getTransactionsQuery, [
            accountId, previousStatementDate, statementDate
        ]);

        // Calculate minimum payment
        const minimumPayment = await this.calculateMinimumPayment(accountId);
        
        // Calculate payment due date (21 days from statement date)
        const paymentDueDate = new Date(statementDate);
        paymentDueDate.setDate(paymentDueDate.getDate() + 21);

        // Update account with statement information
        const updateQuery = `
            UPDATE credit_accounts 
            SET last_statement_date = $1,
                last_statement_balance = current_balance,
                current_statement_balance = current_balance,
                minimum_payment_amount = $2,
                payment_due_date = $3,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
            RETURNING *
        `;

        const result = await query(updateQuery, [
            statementDate, minimumPayment, paymentDueDate, accountId
        ]);

        return {
            account: result.rows[0],
            transactions: transactions.rows,
            statementPeriod: {
                startDate: previousStatementDate,
                endDate: statementDate
            }
        };
    }

    // Check for overlimit condition
    static async checkOverlimitStatus(accountId) {
        const getAccountQuery = `
            SELECT current_balance, credit_limit, overlimit_opt_in, overlimit_count
            FROM credit_accounts 
            WHERE id = $1
        `;

        const result = await query(getAccountQuery, [accountId]);
        
        if (result.rows.length === 0) {
            return null;
        }

        const account = result.rows[0];
        const isOverlimit = parseFloat(account.current_balance) > parseFloat(account.credit_limit);

        if (isOverlimit && !account.overlimit_opt_in) {
            // Customer hasn't opted in for overlimit - decline transaction
            return { status: 'DECLINED', reason: 'OVERLIMIT_NO_OPTIN' };
        }

        if (isOverlimit) {
            // Update overlimit count
            await query(
                'UPDATE credit_accounts SET overlimit_count = overlimit_count + 1 WHERE id = $1',
                [accountId]
            );

            return { status: 'OVERLIMIT', fee: 35.00 };
        }

        return { status: 'OK' };
    }

    // Suspend account
    static async suspendAccount(accountId, reason, suspendedBy) {
        const updateQuery = `
            UPDATE credit_accounts 
            SET account_status = 'SUSPENDED',
                account_sub_status = $1,
                updated_at = CURRENT_TIMESTAMP,
                updated_by = $2
            WHERE id = $3
            RETURNING *
        `;

        const result = await query(updateQuery, [reason, suspendedBy, accountId]);

        if (result.rows.length > 0) {
            await this.logAccountEvent(accountId, 'ACCOUNT_SUSPENDED', {
                reason,
                suspendedBy,
                timestamp: new Date()
            });
        }

        return result.rows[0];
    }

    // Reactivate account
    static async reactivateAccount(accountId, reactivatedBy) {
        const updateQuery = `
            UPDATE credit_accounts 
            SET account_status = 'ACTIVE',
                account_sub_status = NULL,
                updated_at = CURRENT_TIMESTAMP,
                updated_by = $1
            WHERE id = $2
            RETURNING *
        `;

        const result = await query(updateQuery, [reactivatedBy, accountId]);

        if (result.rows.length > 0) {
            await this.logAccountEvent(accountId, 'ACCOUNT_REACTIVATED', {
                reactivatedBy,
                timestamp: new Date()
            });
        }

        return result.rows[0];
    }

    // Close account
    static async closeAccount(accountId, closureReason, closedBy) {
        // Check if account has outstanding balance
        const getBalanceQuery = 'SELECT current_balance FROM credit_accounts WHERE id = $1';
        const balanceResult = await query(getBalanceQuery, [accountId]);

        if (balanceResult.rows.length === 0) {
            throw new Error('Account not found');
        }

        const currentBalance = parseFloat(balanceResult.rows[0].current_balance);
        
        if (currentBalance > 0) {
            throw new Error('Cannot close account with outstanding balance');
        }

        const updateQuery = `
            UPDATE credit_accounts 
            SET account_status = 'CLOSED',
                closure_reason = $1,
                closed_date = CURRENT_DATE,
                updated_at = CURRENT_TIMESTAMP,
                updated_by = $2
            WHERE id = $3
            RETURNING *
        `;

        const result = await query(updateQuery, [closureReason, closedBy, accountId]);

        if (result.rows.length > 0) {
            await this.logAccountEvent(accountId, 'ACCOUNT_CLOSED', {
                closureReason,
                closedBy,
                timestamp: new Date()
            });
        }

        return result.rows[0];
    }

    // Log account events for audit trail
    static async logAccountEvent(accountId, eventType, eventData = {}) {
        const insertQuery = `
            INSERT INTO account_audit_log (account_id, event_type, event_data, created_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        `;

        await query(insertQuery, [accountId, eventType, JSON.stringify(eventData)]);
    }

    // Get account statistics
    static async getAccountStatistics(accountId, period = '12 months') {
        const statisticsQuery = `
            SELECT 
                COUNT(*) as total_transactions,
                SUM(CASE WHEN transaction_type = 'PURCHASE' THEN amount ELSE 0 END) as total_purchases,
                SUM(CASE WHEN transaction_type = 'PAYMENT' THEN amount ELSE 0 END) as total_payments,
                SUM(CASE WHEN transaction_type = 'CASH_ADVANCE' THEN amount ELSE 0 END) as total_cash_advances,
                AVG(CASE WHEN transaction_type = 'PURCHASE' THEN amount ELSE NULL END) as avg_purchase_amount,
                MAX(amount) as largest_transaction,
                COUNT(DISTINCT DATE_TRUNC('month', transaction_date)) as active_months
            FROM credit_transactions 
            WHERE account_id = $1 
            AND transaction_date >= CURRENT_DATE - INTERVAL '${period}'
            AND processing_status = 'SETTLED'
        `;

        const result = await query(statisticsQuery, [accountId]);
        return result.rows[0];
    }
}

module.exports = CreditAccountModel;
