const { query, transaction } = require('../database');
const crypto = require('crypto');

/**
 * Payment Model following BIAN Payment Services standards
 * Handles payment processing, ACH, wire transfers, and payment scheduling
 */
class PaymentModel {

    // Create a new payment
    static async createPayment(paymentData) {
        const {
            accountId,
            customerId,
            paymentAmount,
            paymentMethod,
            paymentType = 'MINIMUM',
            
            // Source account details
            sourceAccountNumber,
            sourceRoutingNumber,
            sourceAccountType,
            sourceAccountName,
            
            // Scheduling
            scheduledDate,
            isRecurring = false,
            recurringFrequency = null, // 'MONTHLY', 'WEEKLY', 'BIWEEKLY'
            recurringEndDate = null,
            
            // Processing details
            processingPriority = 'STANDARD',
            memo = null,
            confirmationMethod = 'EMAIL'
        } = paymentData;

        const paymentReference = this.generatePaymentReference();

        const insertQuery = `
            INSERT INTO payments (
                account_id, customer_id, payment_reference, payment_amount, payment_method,
                payment_type, source_account_number, source_routing_number, source_account_type,
                source_account_name, scheduled_date, is_recurring, recurring_frequency,
                recurring_end_date, processing_priority, memo, confirmation_method, payment_status
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'PENDING'
            ) RETURNING *
        `;

        const values = [
            accountId, customerId, paymentReference, paymentAmount, paymentMethod,
            paymentType, sourceAccountNumber, sourceRoutingNumber, sourceAccountType,
            sourceAccountName, scheduledDate, isRecurring, recurringFrequency,
            recurringEndDate, processingPriority, memo, confirmationMethod
        ];

        const result = await query(insertQuery, values);
        
        // If scheduled for today or past date, process immediately
        const scheduledDateObj = new Date(scheduledDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (scheduledDateObj <= today) {
            await this.processPayment(result.rows[0].id);
        }

        return result.rows[0];
    }

    // Generate unique payment reference
    static generatePaymentReference() {
        const timestamp = Date.now().toString();
        const random = Math.floor(Math.random() * 999999).toString().padStart(6, '0');
        return `PAY${timestamp}${random}`;
    }

    // Process a payment
    static async processPayment(paymentId) {
        const getPaymentQuery = `
            SELECT p.*, ca.current_balance, ca.minimum_payment_due, ca.credit_limit,
                   c.first_name, c.last_name, c.email
            FROM payments p
            JOIN credit_accounts ca ON p.account_id = ca.id
            JOIN customers c ON p.customer_id = c.id
            WHERE p.id = $1 AND p.payment_status = 'PENDING'
        `;

        const paymentResult = await query(getPaymentQuery, [paymentId]);
        
        if (paymentResult.rows.length === 0) {
            throw new Error('Payment not found or already processed');
        }

        const payment = paymentResult.rows[0];

        // Validate payment amount
        if (parseFloat(payment.payment_amount) <= 0) {
            await this.updatePaymentStatus(paymentId, 'REJECTED', 'Invalid payment amount');
            throw new Error('Invalid payment amount');
        }

        // Validate payment doesn't exceed balance
        if (parseFloat(payment.payment_amount) > parseFloat(payment.current_balance)) {
            await this.updatePaymentStatus(paymentId, 'REJECTED', 'Payment amount exceeds current balance');
            throw new Error('Payment amount exceeds current balance');
        }

        try {
            // Simulate payment processing based on method
            const processingResult = await this.processPaymentByMethod(payment);
            
            if (processingResult.success) {
                await this.completePayment(paymentId, payment);
                return { success: true, message: 'Payment processed successfully' };
            } else {
                await this.updatePaymentStatus(paymentId, 'FAILED', processingResult.errorMessage);
                throw new Error(processingResult.errorMessage);
            }
        } catch (error) {
            await this.updatePaymentStatus(paymentId, 'FAILED', error.message);
            throw error;
        }
    }

    // Process payment by specific method
    static async processPaymentByMethod(payment) {
        switch (payment.payment_method) {
            case 'ACH':
                return await this.processACHPayment(payment);
            case 'WIRE':
                return await this.processWirePayment(payment);
            case 'DEBIT_CARD':
                return await this.processDebitCardPayment(payment);
            case 'BANK_TRANSFER':
                return await this.processBankTransferPayment(payment);
            default:
                return { success: false, errorMessage: 'Unsupported payment method' };
        }
    }

    // Process ACH payment
    static async processACHPayment(payment) {
        // Validate routing number (basic check)
        if (!this.validateRoutingNumber(payment.source_routing_number)) {
            return { success: false, errorMessage: 'Invalid routing number' };
        }

        // Simulate ACH processing delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Simulate 95% success rate for ACH
        const success = Math.random() > 0.05;
        
        if (success) {
            return { 
                success: true, 
                processingTime: '1-3 business days',
                transactionFee: 0.00
            };
        } else {
            return { 
                success: false, 
                errorMessage: 'ACH payment declined by bank' 
            };
        }
    }

    // Process wire payment
    static async processWirePayment(payment) {
        // Wire transfers typically have higher fees but faster processing
        const wireFee = 25.00;
        
        // Simulate wire processing
        await new Promise(resolve => setTimeout(resolve, 500));

        // Simulate 98% success rate for wire transfers
        const success = Math.random() > 0.02;
        
        if (success) {
            return { 
                success: true, 
                processingTime: 'Same business day',
                transactionFee: wireFee
            };
        } else {
            return { 
                success: false, 
                errorMessage: 'Wire transfer failed - insufficient funds' 
            };
        }
    }

    // Process debit card payment
    static async processDebitCardPayment(payment) {
        // Simulate real-time debit card processing
        await new Promise(resolve => setTimeout(resolve, 200));

        // Simulate 97% success rate for debit cards
        const success = Math.random() > 0.03;
        
        if (success) {
            return { 
                success: true, 
                processingTime: 'Immediate',
                transactionFee: 2.50
            };
        } else {
            return { 
                success: false, 
                errorMessage: 'Debit card payment declined' 
            };
        }
    }

    // Process bank transfer payment
    static async processBankTransferPayment(payment) {
        // Simulate bank transfer processing
        await new Promise(resolve => setTimeout(resolve, 800));

        // Simulate 96% success rate
        const success = Math.random() > 0.04;
        
        if (success) {
            return { 
                success: true, 
                processingTime: '1-2 business days',
                transactionFee: 0.00
            };
        } else {
            return { 
                success: false, 
                errorMessage: 'Bank transfer failed - account verification required' 
            };
        }
    }

    // Complete payment processing
    static async completePayment(paymentId, payment) {
        const client = await require('../database').getClient();
        
        try {
            await client.query('BEGIN');

            // Update payment status
            await client.query(
                'UPDATE payments SET payment_status = $1, processed_date = CURRENT_TIMESTAMP WHERE id = $2',
                ['COMPLETED', paymentId]
            );

            // Update account balance
            await client.query(
                'UPDATE credit_accounts SET current_balance = current_balance - $1, available_credit = available_credit + $1 WHERE id = $2',
                [payment.payment_amount, payment.account_id]
            );

            // Create transaction record
            const transactionId = require('./CreditTransactionModel').generateTransactionId();
            
            await client.query(`
                INSERT INTO credit_transactions (
                    account_id, customer_id, transaction_id, amount, transaction_type,
                    processing_status, description, reference_number, transaction_date, posting_date
                ) VALUES (
                    $1, $2, $3, $4, 'PAYMENT', 'SETTLED', $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
            `, [
                payment.account_id, payment.customer_id, transactionId, -payment.payment_amount,
                `Payment via ${payment.payment_method}`, payment.payment_reference
            ]);

            // Update minimum payment due if this covers it
            const currentMinimumDue = parseFloat(payment.minimum_payment_due);
            if (currentMinimumDue > 0) {
                const paymentAmount = parseFloat(payment.payment_amount);
                const newMinimumDue = Math.max(0, currentMinimumDue - paymentAmount);
                
                await client.query(
                    'UPDATE credit_accounts SET minimum_payment_due = $1 WHERE id = $2',
                    [newMinimumDue, payment.account_id]
                );
            }

            // If recurring payment, schedule next payment
            if (payment.is_recurring) {
                await this.scheduleNextRecurringPayment(client, payment);
            }

            await client.query('COMMIT');

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Schedule next recurring payment
    static async scheduleNextRecurringPayment(client, payment) {
        const currentDate = new Date(payment.scheduled_date);
        let nextDate;

        switch (payment.recurring_frequency) {
            case 'MONTHLY':
                nextDate = new Date(currentDate.setMonth(currentDate.getMonth() + 1));
                break;
            case 'WEEKLY':
                nextDate = new Date(currentDate.setDate(currentDate.getDate() + 7));
                break;
            case 'BIWEEKLY':
                nextDate = new Date(currentDate.setDate(currentDate.getDate() + 14));
                break;
            default:
                return; // Unknown frequency
        }

        // Check if next date is within recurring end date
        if (payment.recurring_end_date && nextDate > new Date(payment.recurring_end_date)) {
            return;
        }

        const nextPaymentReference = this.generatePaymentReference();

        await client.query(`
            INSERT INTO payments (
                account_id, customer_id, payment_reference, payment_amount, payment_method,
                payment_type, source_account_number, source_routing_number, source_account_type,
                source_account_name, scheduled_date, is_recurring, recurring_frequency,
                recurring_end_date, processing_priority, memo, confirmation_method, payment_status
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'SCHEDULED'
            )
        `, [
            payment.account_id, payment.customer_id, nextPaymentReference, payment.payment_amount,
            payment.payment_method, payment.payment_type, payment.source_account_number,
            payment.source_routing_number, payment.source_account_type, payment.source_account_name,
            nextDate, payment.is_recurring, payment.recurring_frequency, payment.recurring_end_date,
            payment.processing_priority, payment.memo, payment.confirmation_method
        ]);
    }

    // Update payment status
    static async updatePaymentStatus(paymentId, status, failureReason = null) {
        const updateQuery = `
            UPDATE payments 
            SET payment_status = $1, failure_reason = $2, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $3
        `;

        await query(updateQuery, [status, failureReason, paymentId]);
    }

    // Validate routing number (basic ABA format check)
    static validateRoutingNumber(routingNumber) {
        if (!routingNumber || routingNumber.length !== 9) {
            return false;
        }

        // Basic checksum validation for ABA routing numbers
        const digits = routingNumber.split('').map(Number);
        const checksum = (
            3 * (digits[0] + digits[3] + digits[6]) +
            7 * (digits[1] + digits[4] + digits[7]) +
            1 * (digits[2] + digits[5] + digits[8])
        ) % 10;

        return checksum === 0;
    }

    // Get payments with filters
    static async getPayments(filters = {}, pagination = {}) {
        const { page = 1, limit = 50, sortBy = 'scheduled_date', sortOrder = 'DESC' } = pagination;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        let params = [];
        let paramCounter = 0;

        if (filters.accountId) {
            paramCounter++;
            whereClause += ` AND p.account_id = $${paramCounter}`;
            params.push(filters.accountId);
        }

        if (filters.customerId) {
            paramCounter++;
            whereClause += ` AND p.customer_id = $${paramCounter}`;
            params.push(filters.customerId);
        }

        if (filters.status) {
            paramCounter++;
            whereClause += ` AND p.payment_status = $${paramCounter}`;
            params.push(filters.status);
        }

        if (filters.paymentMethod) {
            paramCounter++;
            whereClause += ` AND p.payment_method = $${paramCounter}`;
            params.push(filters.paymentMethod);
        }

        if (filters.startDate) {
            paramCounter++;
            whereClause += ` AND p.scheduled_date >= $${paramCounter}`;
            params.push(filters.startDate);
        }

        if (filters.endDate) {
            paramCounter++;
            whereClause += ` AND p.scheduled_date <= $${paramCounter}`;
            params.push(filters.endDate);
        }

        const countQuery = `
            SELECT COUNT(*) 
            FROM payments p 
            LEFT JOIN credit_accounts ca ON p.account_id = ca.id
            LEFT JOIN customers c ON p.customer_id = c.id
            ${whereClause}
        `;

        const selectQuery = `
            SELECT p.*, ca.account_number, c.first_name, c.last_name, c.email
            FROM payments p
            LEFT JOIN credit_accounts ca ON p.account_id = ca.id
            LEFT JOIN customers c ON p.customer_id = c.id
            ${whereClause}
            ORDER BY p.${sortBy} ${sortOrder}
            LIMIT $${paramCounter + 1} OFFSET $${paramCounter + 2}
        `;

        const [countResult, paymentsResult] = await Promise.all([
            query(countQuery, params),
            query(selectQuery, [...params, limit, offset])
        ]);

        return {
            payments: paymentsResult.rows,
            pagination: {
                page,
                limit,
                total: parseInt(countResult.rows[0].count),
                totalPages: Math.ceil(countResult.rows[0].count / limit)
            }
        };
    }

    // Get payment by ID
    static async getPaymentById(paymentId) {
        const selectQuery = `
            SELECT p.*, ca.account_number, c.first_name, c.last_name, c.email
            FROM payments p
            LEFT JOIN credit_accounts ca ON p.account_id = ca.id
            LEFT JOIN customers c ON p.customer_id = c.id
            WHERE p.id = $1
        `;

        const result = await query(selectQuery, [paymentId]);
        return result.rows[0] || null;
    }

    // Cancel a scheduled payment
    static async cancelPayment(paymentId, cancelReason = 'Customer request') {
        const getPaymentQuery = `
            SELECT payment_status FROM payments WHERE id = $1
        `;

        const paymentResult = await query(getPaymentQuery, [paymentId]);
        
        if (paymentResult.rows.length === 0) {
            throw new Error('Payment not found');
        }

        const paymentStatus = paymentResult.rows[0].payment_status;
        
        if (!['PENDING', 'SCHEDULED'].includes(paymentStatus)) {
            throw new Error('Cannot cancel payment in current status');
        }

        const updateQuery = `
            UPDATE payments 
            SET payment_status = 'CANCELLED', failure_reason = $1, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $2
        `;

        await query(updateQuery, [cancelReason, paymentId]);
        return { message: 'Payment cancelled successfully' };
    }

    // Process scheduled payments (to be called by scheduler)
    static async processScheduledPayments() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const getScheduledQuery = `
            SELECT id FROM payments 
            WHERE payment_status IN ('PENDING', 'SCHEDULED')
            AND scheduled_date <= $1
            ORDER BY scheduled_date ASC
        `;

        const scheduledResult = await query(getScheduledQuery, [today]);
        const results = [];

        for (const payment of scheduledResult.rows) {
            try {
                const result = await this.processPayment(payment.id);
                results.push({ paymentId: payment.id, success: true, result });
            } catch (error) {
                results.push({ paymentId: payment.id, success: false, error: error.message });
            }
        }

        return results;
    }

    // Calculate payment allocation (how payment amount should be distributed)
    static async calculatePaymentAllocation(accountId, paymentAmount) {
        const accountQuery = `
            SELECT current_balance, minimum_payment_due, past_due_amount,
                   interest_charged, fees_charged, credit_limit
            FROM credit_accounts
            WHERE id = $1
        `;

        const accountResult = await query(accountQuery, [accountId]);
        
        if (accountResult.rows.length === 0) {
            throw new Error('Account not found');
        }

        const account = accountResult.rows[0];
        let remainingPayment = parseFloat(paymentAmount);
        const allocation = {
            fees: 0,
            interest: 0,
            principal: 0,
            overpayment: 0
        };

        // 1. Apply to fees first
        const feesOwed = parseFloat(account.fees_charged) || 0;
        if (feesOwed > 0 && remainingPayment > 0) {
            const feesPayment = Math.min(feesOwed, remainingPayment);
            allocation.fees = feesPayment;
            remainingPayment -= feesPayment;
        }

        // 2. Apply to interest
        const interestOwed = parseFloat(account.interest_charged) || 0;
        if (interestOwed > 0 && remainingPayment > 0) {
            const interestPayment = Math.min(interestOwed, remainingPayment);
            allocation.interest = interestPayment;
            remainingPayment -= interestPayment;
        }

        // 3. Apply to principal
        const principalOwed = parseFloat(account.current_balance) - feesOwed - interestOwed;
        if (principalOwed > 0 && remainingPayment > 0) {
            const principalPayment = Math.min(principalOwed, remainingPayment);
            allocation.principal = principalPayment;
            remainingPayment -= principalPayment;
        }

        // 4. Any remaining is overpayment
        if (remainingPayment > 0) {
            allocation.overpayment = remainingPayment;
        }

        return allocation;
    }

    // Get payment history and analytics
    static async getPaymentAnalytics(accountId, period = '12 months') {
        const analyticsQuery = `
            SELECT 
                payment_method,
                COUNT(*) as payment_count,
                SUM(payment_amount) as total_amount,
                AVG(payment_amount) as average_amount,
                MIN(payment_amount) as min_amount,
                MAX(payment_amount) as max_amount
            FROM payments 
            WHERE account_id = $1 
            AND payment_status = 'COMPLETED'
            AND processed_date >= CURRENT_DATE - INTERVAL '${period}'
            GROUP BY payment_method
            ORDER BY total_amount DESC
        `;

        const monthlyQuery = `
            SELECT 
                DATE_TRUNC('month', processed_date) as month,
                COUNT(*) as payment_count,
                SUM(payment_amount) as total_amount
            FROM payments 
            WHERE account_id = $1 
            AND payment_status = 'COMPLETED'
            AND processed_date >= CURRENT_DATE - INTERVAL '${period}'
            GROUP BY DATE_TRUNC('month', processed_date)
            ORDER BY month DESC
        `;

        const [methodResult, monthlyResult] = await Promise.all([
            query(analyticsQuery, [accountId]),
            query(monthlyQuery, [accountId])
        ]);

        return {
            byPaymentMethod: methodResult.rows,
            byMonth: monthlyResult.rows
        };
    }
}

module.exports = PaymentModel;
