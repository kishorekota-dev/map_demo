const { query } = require('../database');
const CustomerModel = require('../models/CustomerModel');
const CreditAccountModel = require('../models/CreditAccountModel');
const PaymentModel = require('../models/PaymentModel');

/**
 * Enterprise Banking Data Seeder
 * Generates realistic banking data following BIAN standards
 */
class EnterpriseDataSeeder {

    static async seedAll() {
        console.log('🏦 Starting Enterprise Banking Data Seeding...');
        
        try {
            // Clear existing data (in correct order due to foreign keys)
            await this.clearExistingData();
            
            // Seed in dependency order
            await this.seedCreditCardProducts();
            await this.seedCustomers(500); // Increased for enterprise scale
            await this.seedCreditAccounts();
            await this.seedCreditCards();
            await this.seedTransactions();
            await this.seedPayments();
            await this.seedCustomerDocuments();
            
            console.log('✅ Enterprise Banking Data Seeding completed successfully!');
            
            // Display summary
            await this.displayDataSummary();
            
        } catch (error) {
            console.error('❌ Data seeding failed:', error);
            throw error;
        }
    }

    static async clearExistingData() {
        console.log('🧹 Clearing existing data...');
        
        const tables = [
            'payments',
            'transaction_authorizations', 
            'credit_transactions',
            'customer_documents',
            'credit_cards',
            'credit_accounts',
            'customers',
            'credit_card_products'
        ];

        for (const table of tables) {
            await query(`DELETE FROM ${table}`);
            console.log(`   Cleared ${table}`);
        }
    }

    static async seedCreditCardProducts() {
        console.log('💳 Seeding credit card products...');
        
        const products = [
            {
                name: 'Enterprise Platinum Business Card',
                product_code: 'EPBC001',
                product_type: 'BUSINESS',
                annual_fee: 295.00,
                apr_range_min: 14.99,
                apr_range_max: 24.99,
                credit_limit_min: 5000,
                credit_limit_max: 100000,
                rewards_program: 'Business Points Plus',
                benefits: JSON.stringify([
                    'Airport lounge access',
                    'Travel insurance',
                    '3x points on business purchases',
                    '24/7 concierge service',
                    'Expense management tools'
                ]),
                foreign_transaction_fee: 0.00,
                balance_transfer_fee: 3.00,
                cash_advance_fee: 5.00,
                late_payment_fee: 35.00,
                overlimit_fee: 25.00,
                is_active: true
            },
            {
                name: 'Rewards Mastercard',
                product_code: 'RMC001',
                product_type: 'PERSONAL',
                annual_fee: 0.00,
                apr_range_min: 16.99,
                apr_range_max: 26.99,
                credit_limit_min: 1000,
                credit_limit_max: 25000,
                rewards_program: 'Cashback Rewards',
                benefits: JSON.stringify([
                    '1.5% cashback on all purchases',
                    'No annual fee',
                    'Fraud protection',
                    'Mobile app access'
                ]),
                foreign_transaction_fee: 2.50,
                balance_transfer_fee: 3.00,
                cash_advance_fee: 5.00,
                late_payment_fee: 25.00,
                overlimit_fee: 25.00,
                is_active: true
            },
            {
                name: 'Premium Travel Visa',
                product_code: 'PTV001', 
                product_type: 'PERSONAL',
                annual_fee: 450.00,
                apr_range_min: 13.99,
                apr_range_max: 21.99,
                credit_limit_min: 10000,
                credit_limit_max: 50000,
                rewards_program: 'Travel Miles Premium',
                benefits: JSON.stringify([
                    'Priority boarding',
                    'Free checked bags',
                    '5x miles on travel',
                    '2x miles on dining',
                    'Global entry fee credit'
                ]),
                foreign_transaction_fee: 0.00,
                balance_transfer_fee: 3.00,
                cash_advance_fee: 5.00,
                late_payment_fee: 35.00,
                overlimit_fee: 25.00,
                is_active: true
            },
            {
                name: 'Student Starter Card',
                product_code: 'SSC001',
                product_type: 'STUDENT',
                annual_fee: 0.00,
                apr_range_min: 19.99,
                apr_range_max: 29.99,
                credit_limit_min: 500,
                credit_limit_max: 5000,
                rewards_program: 'Student Rewards',
                benefits: JSON.stringify([
                    'Build credit history',
                    'No annual fee',
                    'Financial education resources',
                    'Automatic account reviews for limit increases'
                ]),
                foreign_transaction_fee: 3.00,
                balance_transfer_fee: 3.00,
                cash_advance_fee: 5.00,
                late_payment_fee: 25.00,
                overlimit_fee: 0.00,
                is_active: true
            }
        ];

        for (const product of products) {
            const insertQuery = `
                INSERT INTO credit_card_products (
                    product_name, product_code, product_type, annual_fee, apr_range_min, apr_range_max,
                    credit_limit_min, credit_limit_max, rewards_program, benefits, foreign_transaction_fee,
                    balance_transfer_fee, cash_advance_fee, late_payment_fee, overlimit_fee, is_active
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            `;

            await query(insertQuery, [
                product.name, product.product_code, product.product_type, product.annual_fee,
                product.apr_range_min, product.apr_range_max, product.credit_limit_min, product.credit_limit_max,
                product.rewards_program, product.benefits, product.foreign_transaction_fee,
                product.balance_transfer_fee, product.cash_advance_fee, product.late_payment_fee,
                product.overlimit_fee, product.is_active
            ]);
        }

        console.log(`   Created ${products.length} credit card products`);
    }

    static async seedCustomers(count = 500) {
        console.log(`👥 Seeding ${count} customers...`);
        
        const customerTypes = ['INDIVIDUAL', 'BUSINESS', 'JOINT'];
        const kycStatuses = ['PENDING', 'IN_PROGRESS', 'VERIFIED', 'REJECTED'];
        const employmentTypes = ['FULL_TIME', 'PART_TIME', 'SELF_EMPLOYED', 'RETIRED', 'STUDENT', 'UNEMPLOYED'];
        const incomeRanges = ['0-25000', '25000-50000', '50000-75000', '75000-100000', '100000-150000', '150000+'];
        
        // Common first and last names for realistic data
        const firstNames = [
            'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
            'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
            'Thomas', 'Sarah', 'Christopher', 'Karen', 'Charles', 'Nancy', 'Daniel', 'Lisa',
            'Matthew', 'Betty', 'Anthony', 'Helen', 'Mark', 'Sandra', 'Donald', 'Donna',
            'Steven', 'Carol', 'Paul', 'Ruth', 'Andrew', 'Sharon', 'Joshua', 'Michelle'
        ];
        
        const lastNames = [
            'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
            'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
            'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White',
            'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young',
            'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores'
        ];

        const states = [
            'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
            'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
            'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
            'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
            'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
        ];

        for (let i = 0; i < count; i++) {
            const customerType = this.randomChoice(customerTypes);
            const firstName = this.randomChoice(firstNames);
            const lastName = this.randomChoice(lastNames);
            const birthDate = this.randomDate(new Date(1950, 0, 1), new Date(2000, 0, 1));
            
            const customerData = {
                customerType,
                title: this.randomChoice(['Mr', 'Mrs', 'Ms', 'Dr']),
                firstName,
                lastName,
                fullName: `${firstName} ${lastName}`,
                dateOfBirth: birthDate,
                placeOfBirth: `${this.randomChoice(['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'])}, ${this.randomChoice(states)}`,
                
                // Contact information
                email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${Math.floor(Math.random() * 999)}@email.com`,
                phoneNumber: this.generatePhoneNumber(),
                alternatePhoneNumber: Math.random() > 0.7 ? this.generatePhoneNumber() : null,
                
                // Address
                addressLine1: `${Math.floor(Math.random() * 9999) + 1} ${this.randomChoice(['Main', 'Oak', 'Park', 'Pine', 'Maple', 'Cedar', 'Elm', 'Washington', 'Lake', 'Hill'])} ${this.randomChoice(['St', 'Ave', 'Blvd', 'Dr', 'Ln', 'Rd'])}`,
                addressLine2: Math.random() > 0.8 ? `Apt ${Math.floor(Math.random() * 999) + 1}` : null,
                city: this.randomChoice(['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose']),
                state: this.randomChoice(states),
                zipCode: this.generateZipCode(),
                country: 'USA',
                
                // Identification
                ssn: this.generateSSN(),
                driversLicenseNumber: this.generateDriversLicense(),
                driversLicenseState: this.randomChoice(states),
                passportNumber: Math.random() > 0.6 ? this.generatePassportNumber() : null,
                
                // Employment and income
                employmentStatus: this.randomChoice(employmentTypes),
                employer: Math.random() > 0.2 ? this.generateEmployer() : null,
                jobTitle: Math.random() > 0.2 ? this.generateJobTitle() : null,
                workPhoneNumber: Math.random() > 0.5 ? this.generatePhoneNumber() : null,
                annualIncome: this.randomChoice(incomeRanges),
                
                // Banking relationship
                kycStatus: this.randomChoice(kycStatus, [0.1, 0.1, 0.75, 0.05]), // Most customers verified
                riskRating: this.randomChoice(['LOW', 'MEDIUM', 'HIGH'], [0.7, 0.25, 0.05]),
                customerSince: this.randomDate(new Date(2015, 0, 1), new Date()),
                preferredLanguage: 'EN',
                marketingOptIn: Math.random() > 0.3,
                
                // Business customers additional info
                businessName: customerType === 'BUSINESS' ? this.generateBusinessName() : null,
                businessType: customerType === 'BUSINESS' ? this.randomChoice(['LLC', 'Corporation', 'Partnership', 'Sole Proprietorship']) : null,
                ein: customerType === 'BUSINESS' ? this.generateEIN() : null,
                businessPhone: customerType === 'BUSINESS' ? this.generatePhoneNumber() : null,
                yearsInBusiness: customerType === 'BUSINESS' ? Math.floor(Math.random() * 25) + 1 : null
            };

            await CustomerModel.createCustomer(customerData);

            if ((i + 1) % 50 === 0) {
                console.log(`   Created ${i + 1} customers...`);
            }
        }

        console.log(`   ✅ Created ${count} customers successfully`);
    }

    static async seedCreditAccounts() {
        console.log('💼 Seeding credit accounts...');
        
        // Get all customers and products
        const customersResult = await query('SELECT id, customer_type FROM customers ORDER BY id');
        const productsResult = await query('SELECT id, product_code, credit_limit_min, credit_limit_max, apr_range_min, apr_range_max FROM credit_card_products WHERE is_active = true');
        
        const customers = customersResult.rows;
        const products = productsResult.rows;
        
        let accountsCreated = 0;

        for (const customer of customers) {
            // 80% of customers get an account
            if (Math.random() > 0.8) continue;

            // Business customers more likely to get business products
            let eligibleProducts = products;
            if (customer.customer_type === 'BUSINESS') {
                const businessProducts = products.filter(p => p.product_code.includes('EPBC'));
                eligibleProducts = businessProducts.length > 0 ? businessProducts : products;
            }

            const product = this.randomChoice(eligibleProducts);
            
            // Calculate credit limit based on product range
            const creditLimit = Math.floor(
                Math.random() * (product.credit_limit_max - product.credit_limit_min) + product.credit_limit_min
            );

            // Calculate APR within product range
            const apr = (Math.random() * (product.apr_range_max - product.apr_range_min) + product.apr_range_min).toFixed(2);

            const accountData = {
                customerId: customer.id,
                productId: product.id,
                creditLimit,
                currentAPR: parseFloat(apr),
                paymentDueDate: Math.floor(Math.random() * 28) + 1, // Day of month 1-28
                statementDate: Math.floor(Math.random() * 28) + 1,
                accountStatus: this.randomChoice(['ACTIVE', 'SUSPENDED', 'CLOSED'], [0.9, 0.08, 0.02])
            };

            await CreditAccountModel.createAccount(accountData);
            accountsCreated++;
        }

        console.log(`   ✅ Created ${accountsCreated} credit accounts`);
    }

    static async seedCreditCards() {
        console.log('💳 Seeding credit cards...');
        
        const accountsResult = await query(`
            SELECT ca.id as account_id, ca.customer_id, ca.credit_limit, ccp.product_name
            FROM credit_accounts ca 
            JOIN credit_card_products ccp ON ca.product_id = ccp.id
            WHERE ca.account_status = 'ACTIVE'
        `);

        const accounts = accountsResult.rows;
        let cardsCreated = 0;

        for (const account of accounts) {
            // Each account gets 1-2 cards (primary + optional additional)
            const numCards = Math.random() > 0.7 ? 2 : 1;

            for (let i = 0; i < numCards; i++) {
                const cardData = {
                    accountId: account.account_id,
                    customerId: account.customer_id,
                    cardNumber: this.generateCardNumber(),
                    cardType: i === 0 ? 'PRIMARY' : 'ADDITIONAL',
                    embossedName: 'ACCOUNT HOLDER', // Would normally be customer name
                    expirationDate: this.generateExpirationDate(),
                    cardStatus: this.randomChoice(['ACTIVE', 'BLOCKED', 'EXPIRED'], [0.9, 0.05, 0.05]),
                    pinSet: Math.random() > 0.1, // 90% have PIN set
                    internationalUsageEnabled: Math.random() > 0.3, // 70% enabled
                    onlineUsageEnabled: Math.random() > 0.1, // 90% enabled
                    contactlessEnabled: Math.random() > 0.2, // 80% enabled
                    dailyAtmLimit: Math.floor(Math.random() * 1000) + 500, // $500-$1500
                    dailyPurchaseLimit: Math.floor(Math.random() * 5000) + 2000 // $2000-$7000
                };

                const insertQuery = `
                    INSERT INTO credit_cards (
                        account_id, customer_id, card_number, card_type, embossed_name,
                        expiration_date, card_status, pin_set, international_usage_enabled,
                        online_usage_enabled, contactless_enabled, daily_atm_limit, daily_purchase_limit
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                `;

                await query(insertQuery, [
                    cardData.accountId, cardData.customerId, cardData.cardNumber, cardData.cardType,
                    cardData.embossedName, cardData.expirationDate, cardData.cardStatus, cardData.pinSet,
                    cardData.internationalUsageEnabled, cardData.onlineUsageEnabled, cardData.contactlessEnabled,
                    cardData.dailyAtmLimit, cardData.dailyPurchaseLimit
                ]);

                cardsCreated++;
            }
        }

        console.log(`   ✅ Created ${cardsCreated} credit cards`);
    }

    static async seedTransactions() {
        console.log('💰 Seeding credit transactions...');
        
        const cardsResult = await query(`
            SELECT cc.id as card_id, cc.account_id, cc.customer_id, ca.credit_limit
            FROM credit_cards cc
            JOIN credit_accounts ca ON cc.account_id = ca.id
            WHERE cc.card_status = 'ACTIVE' AND ca.account_status = 'ACTIVE'
        `);

        const cards = cardsResult.rows;
        let transactionsCreated = 0;

        const merchantCategories = [
            { code: '5411', description: 'Grocery Stores, Supermarkets' },
            { code: '5541', description: 'Service Stations' },
            { code: '5812', description: 'Eating Places, Restaurants' },
            { code: '5311', description: 'Department Stores' },
            { code: '5999', description: 'Miscellaneous Retail' },
            { code: '5912', description: 'Drug Stores and Pharmacies' },
            { code: '4111', description: 'Transportation - Suburban and Local Commuter Passenger, Including Ferries' },
            { code: '5651', description: 'Family Clothing Stores' },
            { code: '5732', description: 'Electronics Stores' },
            { code: '5533', description: 'Automotive Parts and Accessories Stores' }
        ];

        for (const card of cards) {
            // Generate 5-50 transactions per card over the last 6 months
            const numTransactions = Math.floor(Math.random() * 45) + 5;

            for (let i = 0; i < numTransactions; i++) {
                const amount = (Math.random() * 500 + 10).toFixed(2); // $10-$510
                const transactionDate = this.randomDate(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000), new Date());
                const merchant = this.randomChoice(merchantCategories);
                
                const transactionData = {
                    accountId: card.account_id,
                    cardId: card.card_id,
                    customerId: card.customer_id,
                    amount: parseFloat(amount),
                    currency: 'USD',
                    transactionType: 'PURCHASE',
                    transactionSubtype: 'CARD_PRESENT',
                    
                    // Merchant information
                    merchantName: this.generateMerchantName(merchant.description),
                    merchantId: this.generateMerchantId(),
                    merchantCategoryCode: merchant.code,
                    merchantCategoryDescription: merchant.description,
                    merchantAddress: {
                        street: `${Math.floor(Math.random() * 9999) + 1} Main St`,
                        city: this.randomChoice(['New York', 'Los Angeles', 'Chicago', 'Houston']),
                        state: this.randomChoice(['NY', 'CA', 'IL', 'TX']),
                        zip: this.generateZipCode()
                    },
                    
                    // Transaction processing
                    authorizationCode: Math.floor(Math.random() * 999999).toString().padStart(6, '0'),
                    processingStatus: 'SETTLED',
                    
                    // Location and channel
                    transactionChannel: this.randomChoice(['POS', 'ONLINE', 'ATM'], [0.6, 0.35, 0.05]),
                    posEntryMode: 'CHIP',
                    cardPresent: true,
                    cardholderPresent: true,
                    locationCity: this.randomChoice(['New York', 'Los Angeles', 'Chicago', 'Houston']),
                    locationState: this.randomChoice(['NY', 'CA', 'IL', 'TX']),
                    locationCountry: 'USA',
                    terminalId: this.generateTerminalId(),
                    
                    // Risk and fraud
                    fraudScore: Math.random() * 0.3, // Most transactions low risk
                    riskLevel: 'LOW',
                    fraudIndicators: []
                };

                const insertQuery = `
                    INSERT INTO credit_transactions (
                        account_id, card_id, customer_id, transaction_id, retrieval_reference_number,
                        amount, currency, transaction_type, transaction_subtype, processing_status,
                        merchant_name, merchant_id, merchant_category_code, merchant_category_description,
                        merchant_address, transaction_channel, pos_entry_mode, card_present,
                        cardholder_present, location_city, location_state, location_country,
                        terminal_id, is_international, fraud_score, risk_level, fraud_indicators,
                        authorization_code, transaction_date, posting_date
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                        $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
                    )
                `;

                const values = [
                    transactionData.accountId, transactionData.cardId, transactionData.customerId,
                    `TXN${Date.now()}${Math.floor(Math.random() * 999999)}`,
                    Math.floor(Math.random() * 999999999999).toString().padStart(12, '0'),
                    transactionData.amount, transactionData.currency, transactionData.transactionType,
                    transactionData.transactionSubtype, transactionData.processingStatus,
                    transactionData.merchantName, transactionData.merchantId, transactionData.merchantCategoryCode,
                    transactionData.merchantCategoryDescription, JSON.stringify(transactionData.merchantAddress),
                    transactionData.transactionChannel, transactionData.posEntryMode, transactionData.cardPresent,
                    transactionData.cardholderPresent, transactionData.locationCity, transactionData.locationState,
                    transactionData.locationCountry, transactionData.terminalId, false,
                    transactionData.fraudScore, transactionData.riskLevel, JSON.stringify(transactionData.fraudIndicators),
                    transactionData.authorizationCode, transactionDate, transactionDate
                ];

                await query(insertQuery, values);
                transactionsCreated++;
            }
        }

        // Update account balances based on transactions
        await this.updateAccountBalances();

        console.log(`   ✅ Created ${transactionsCreated} transactions`);
    }

    static async updateAccountBalances() {
        const updateQuery = `
            UPDATE credit_accounts 
            SET current_balance = (
                SELECT COALESCE(SUM(amount), 0)
                FROM credit_transactions 
                WHERE account_id = credit_accounts.id 
                AND processing_status = 'SETTLED'
            ),
            available_credit = credit_limit - (
                SELECT COALESCE(SUM(amount), 0)
                FROM credit_transactions 
                WHERE account_id = credit_accounts.id 
                AND processing_status = 'SETTLED'
            )
        `;

        await query(updateQuery);
    }

    static async seedPayments() {
        console.log('💸 Seeding payments...');
        
        const accountsResult = await query(`
            SELECT id, customer_id, current_balance, minimum_payment_due
            FROM credit_accounts 
            WHERE account_status = 'ACTIVE' AND current_balance > 0
        `);

        const accounts = accountsResult.rows;
        let paymentsCreated = 0;

        for (const account of accounts) {
            // 70% of accounts with balance have made payments
            if (Math.random() > 0.7) continue;

            // Generate 1-5 payments over last 6 months
            const numPayments = Math.floor(Math.random() * 5) + 1;

            for (let i = 0; i < numPayments; i++) {
                const paymentAmount = Math.min(
                    (Math.random() * account.current_balance * 0.5 + 50).toFixed(2),
                    account.current_balance
                );

                const paymentData = {
                    accountId: account.id,
                    customerId: account.customer_id,
                    paymentAmount: parseFloat(paymentAmount),
                    paymentMethod: this.randomChoice(['ACH', 'DEBIT_CARD', 'BANK_TRANSFER'], [0.6, 0.25, 0.15]),
                    paymentType: this.randomChoice(['MINIMUM', 'FULL_BALANCE', 'CUSTOM'], [0.4, 0.3, 0.3]),
                    sourceAccountNumber: this.generateAccountNumber(),
                    sourceRoutingNumber: this.generateRoutingNumber(),
                    sourceAccountType: 'CHECKING',
                    sourceAccountName: 'Personal Checking',
                    scheduledDate: this.randomDate(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000), new Date()),
                    isRecurring: Math.random() > 0.8, // 20% recurring
                    processingPriority: 'STANDARD',
                    confirmationMethod: 'EMAIL'
                };

                const insertQuery = `
                    INSERT INTO payments (
                        account_id, customer_id, payment_reference, payment_amount, payment_method,
                        payment_type, source_account_number, source_routing_number, source_account_type,
                        source_account_name, scheduled_date, is_recurring, processing_priority,
                        confirmation_method, payment_status, processed_date
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'COMPLETED', $11
                    )
                `;

                await query(insertQuery, [
                    paymentData.accountId, paymentData.customerId,
                    `PAY${Date.now()}${Math.floor(Math.random() * 999999)}`,
                    paymentData.paymentAmount, paymentData.paymentMethod, paymentData.paymentType,
                    paymentData.sourceAccountNumber, paymentData.sourceRoutingNumber, paymentData.sourceAccountType,
                    paymentData.sourceAccountName, paymentData.scheduledDate, paymentData.isRecurring,
                    paymentData.processingPriority, paymentData.confirmationMethod
                ]);

                paymentsCreated++;
            }
        }

        console.log(`   ✅ Created ${paymentsCreated} payments`);
    }

    static async seedCustomerDocuments() {
        console.log('📄 Seeding customer documents...');
        
        const customersResult = await query('SELECT id FROM customers ORDER BY id');
        const customers = customersResult.rows;
        
        const documentTypes = [
            'DRIVERS_LICENSE', 'PASSPORT', 'UTILITY_BILL', 'BANK_STATEMENT',
            'TAX_RETURN', 'EMPLOYMENT_VERIFICATION', 'PROOF_OF_INCOME'
        ];

        let documentsCreated = 0;

        for (const customer of customers) {
            // Each customer has 2-5 documents
            const numDocs = Math.floor(Math.random() * 4) + 2;
            const selectedTypes = this.shuffleArray([...documentTypes]).slice(0, numDocs);

            for (const docType of selectedTypes) {
                const documentData = {
                    customerId: customer.id,
                    documentType: docType,
                    documentNumber: this.generateDocumentNumber(docType),
                    issueDate: this.randomDate(new Date(2020, 0, 1), new Date()),
                    expirationDate: this.randomDate(new Date(), new Date(2030, 0, 1)),
                    issuingAuthority: this.getIssuingAuthority(docType),
                    verificationStatus: this.randomChoice(['PENDING', 'VERIFIED', 'REJECTED'], [0.1, 0.85, 0.05]),
                    fileLocation: `/documents/${customer.id}/${docType.toLowerCase()}_${Date.now()}.pdf`,
                    uploadedDate: this.randomDate(new Date(2023, 0, 1), new Date())
                };

                const insertQuery = `
                    INSERT INTO customer_documents (
                        customer_id, document_type, document_number, issue_date, expiration_date,
                        issuing_authority, verification_status, file_location, uploaded_date
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `;

                await query(insertQuery, [
                    documentData.customerId, documentData.documentType, documentData.documentNumber,
                    documentData.issueDate, documentData.expirationDate, documentData.issuingAuthority,
                    documentData.verificationStatus, documentData.fileLocation, documentData.uploadedDate
                ]);

                documentsCreated++;
            }
        }

        console.log(`   ✅ Created ${documentsCreated} customer documents`);
    }

    static async displayDataSummary() {
        console.log('\n📊 Data Summary:');
        
        const summaryQueries = [
            { label: 'Customers', query: 'SELECT COUNT(*) FROM customers' },
            { label: 'Credit Products', query: 'SELECT COUNT(*) FROM credit_card_products' },
            { label: 'Credit Accounts', query: 'SELECT COUNT(*) FROM credit_accounts' },
            { label: 'Credit Cards', query: 'SELECT COUNT(*) FROM credit_cards' },
            { label: 'Transactions', query: 'SELECT COUNT(*) FROM credit_transactions' },
            { label: 'Payments', query: 'SELECT COUNT(*) FROM payments' },
            { label: 'Documents', query: 'SELECT COUNT(*) FROM customer_documents' }
        ];

        for (const { label, query: summaryQuery } of summaryQueries) {
            const result = await query(summaryQuery);
            console.log(`   ${label}: ${result.rows[0].count}`);
        }

        // Display balance information
        const balanceResult = await query(`
            SELECT 
                SUM(current_balance) as total_balance,
                SUM(credit_limit) as total_credit_limit,
                AVG(current_balance) as avg_balance
            FROM credit_accounts 
            WHERE account_status = 'ACTIVE'
        `);

        const balanceInfo = balanceResult.rows[0];
        console.log(`   Total Credit Extended: $${parseFloat(balanceInfo.total_credit_limit).toLocaleString()}`);
        console.log(`   Total Outstanding Balance: $${parseFloat(balanceInfo.total_balance).toLocaleString()}`);
        console.log(`   Average Account Balance: $${parseFloat(balanceInfo.avg_balance).toLocaleString()}`);
    }

    // Utility functions for generating realistic data
    static randomChoice(array, weights = null) {
        if (weights) {
            const random = Math.random();
            let cumulativeWeight = 0;
            for (let i = 0; i < weights.length; i++) {
                cumulativeWeight += weights[i];
                if (random <= cumulativeWeight) {
                    return array[i];
                }
            }
        }
        return array[Math.floor(Math.random() * array.length)];
    }

    static randomDate(start, end) {
        return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    }

    static generatePhoneNumber() {
        const areaCode = Math.floor(Math.random() * 700) + 200;
        const exchange = Math.floor(Math.random() * 700) + 200;
        const number = Math.floor(Math.random() * 9000) + 1000;
        return `${areaCode}-${exchange}-${number}`;
    }

    static generateZipCode() {
        return Math.floor(Math.random() * 90000) + 10000;
    }

    static generateSSN() {
        const area = Math.floor(Math.random() * 700) + 100;
        const group = Math.floor(Math.random() * 90) + 10;
        const serial = Math.floor(Math.random() * 9000) + 1000;
        return `${area}-${group}-${serial}`;
    }

    static generateEIN() {
        const prefix = Math.floor(Math.random() * 90) + 10;
        const suffix = Math.floor(Math.random() * 9000000) + 1000000;
        return `${prefix}-${suffix}`;
    }

    static generateDriversLicense() {
        return `DL${Math.floor(Math.random() * 900000000) + 100000000}`;
    }

    static generatePassportNumber() {
        return `${Math.floor(Math.random() * 900000000) + 100000000}`;
    }

    static generateCardNumber() {
        // Generate realistic credit card number (starts with 4 for Visa)
        const prefix = '4';
        let number = prefix;
        for (let i = 0; i < 15; i++) {
            number += Math.floor(Math.random() * 10);
        }
        return number;
    }

    static generateExpirationDate() {
        const month = Math.floor(Math.random() * 12) + 1;
        const year = new Date().getFullYear() + Math.floor(Math.random() * 5) + 1;
        return `${month.toString().padStart(2, '0')}/${year}`;
    }

    static generateAccountNumber() {
        return Math.floor(Math.random() * 9000000000) + 1000000000;
    }

    static generateRoutingNumber() {
        // Generate valid ABA routing number
        const routingNumbers = [
            '021000021', '011401533', '061000052', '026009593', '111000025',
            '122000247', '124003116', '091300010', '051000017', '053000196'
        ];
        return this.randomChoice(routingNumbers);
    }

    static generateEmployer() {
        const companies = [
            'Microsoft Corporation', 'Apple Inc', 'Amazon.com Inc', 'Alphabet Inc',
            'Tesla Inc', 'Meta Platforms Inc', 'Berkshire Hathaway', 'NVIDIA Corporation',
            'Johnson & Johnson', 'JPMorgan Chase & Co', 'Visa Inc', 'Walmart Inc',
            'Procter & Gamble', 'Mastercard Inc', 'Home Depot Inc', 'Bank of America'
        ];
        return this.randomChoice(companies);
    }

    static generateJobTitle() {
        const titles = [
            'Software Engineer', 'Marketing Manager', 'Sales Representative', 'Financial Analyst',
            'Operations Manager', 'Customer Service Representative', 'Project Manager', 'Data Analyst',
            'Human Resources Specialist', 'Accountant', 'Business Analyst', 'Product Manager',
            'Administrative Assistant', 'IT Specialist', 'Consultant', 'Teacher'
        ];
        return this.randomChoice(titles);
    }

    static generateBusinessName() {
        const prefixes = ['Advanced', 'Global', 'Premier', 'Elite', 'Strategic', 'Dynamic'];
        const suffixes = ['Solutions', 'Systems', 'Technologies', 'Enterprises', 'Group', 'Associates'];
        return `${this.randomChoice(prefixes)} ${this.randomChoice(suffixes)} LLC`;
    }

    static generateMerchantName(category) {
        const names = {
            'Grocery': ['FreshMart', 'QuickStop', 'SuperSaver', 'Corner Market'],
            'Restaurant': ['Pizza Palace', 'Burger House', 'Cafe Central', 'Food Court'],
            'Gas': ['Shell', 'BP', 'Exxon', 'Chevron'],
            'Department': ['MegaStore', 'ShopMart', 'RetailMax', 'BargainHub'],
            'Default': ['MerchantCorp', 'Business Solutions', 'Service Center', 'Trade Post']
        };

        const categoryKey = Object.keys(names).find(key => category.includes(key)) || 'Default';
        return this.randomChoice(names[categoryKey]);
    }

    static generateMerchantId() {
        return `MID${Math.floor(Math.random() * 900000) + 100000}`;
    }

    static generateTerminalId() {
        return `TRM${Math.floor(Math.random() * 90000) + 10000}`;
    }

    static generateDocumentNumber(type) {
        switch (type) {
            case 'DRIVERS_LICENSE':
                return `DL${Math.floor(Math.random() * 900000000) + 100000000}`;
            case 'PASSPORT':
                return `${Math.floor(Math.random() * 900000000) + 100000000}`;
            default:
                return `DOC${Math.floor(Math.random() * 900000000) + 100000000}`;
        }
    }

    static getIssuingAuthority(type) {
        const authorities = {
            'DRIVERS_LICENSE': 'Department of Motor Vehicles',
            'PASSPORT': 'U.S. Department of State',
            'UTILITY_BILL': 'Utility Company',
            'BANK_STATEMENT': 'Financial Institution',
            'TAX_RETURN': 'Internal Revenue Service',
            'EMPLOYMENT_VERIFICATION': 'Human Resources Department',
            'PROOF_OF_INCOME': 'Employer'
        };
        return authorities[type] || 'Government Agency';
    }

    static shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
}

module.exports = EnterpriseDataSeeder;
