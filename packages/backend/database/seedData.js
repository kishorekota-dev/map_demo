const { query, transaction } = require('./index');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Sample data arrays
const firstNames = [
    'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
    'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
    'Thomas', 'Sarah', 'Christopher', 'Karen', 'Charles', 'Nancy', 'Daniel', 'Lisa',
    'Matthew', 'Betty', 'Anthony', 'Helen', 'Mark', 'Sandra', 'Donald', 'Donna',
    'Steven', 'Carol', 'Paul', 'Ruth', 'Andrew', 'Sharon', 'Joshua', 'Michelle',
    'Kenneth', 'Laura', 'Kevin', 'Sarah', 'Brian', 'Kimberly', 'George', 'Deborah',
    'Timothy', 'Dorothy', 'Ronald', 'Lisa', 'Jason', 'Nancy', 'Edward', 'Karen',
    'Jeffrey', 'Betty', 'Ryan', 'Helen', 'Jacob', 'Sandra', 'Gary', 'Donna',
    'Nicholas', 'Carol', 'Eric', 'Ruth', 'Jonathan', 'Sharon', 'Stephen', 'Michelle',
    'Larry', 'Laura', 'Justin', 'Sarah', 'Scott', 'Kimberly', 'Brandon', 'Deborah'
];

const lastNames = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
    'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
    'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White',
    'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young',
    'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
    'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
    'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker',
    'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart', 'Morris', 'Morales', 'Murphy',
    'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper', 'Peterson', 'Bailey'
];

const cities = [
    'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia',
    'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville',
    'Fort Worth', 'Columbus', 'Charlotte', 'San Francisco', 'Indianapolis', 'Seattle',
    'Denver', 'Washington', 'Boston', 'El Paso', 'Nashville', 'Detroit', 'Oklahoma City',
    'Portland', 'Las Vegas', 'Memphis', 'Louisville', 'Baltimore', 'Milwaukee', 'Albuquerque',
    'Tucson', 'Fresno', 'Sacramento', 'Kansas City', 'Mesa', 'Virginia Beach', 'Atlanta',
    'Colorado Springs', 'Raleigh', 'Omaha', 'Miami', 'Oakland', 'Minneapolis', 'Tulsa',
    'Cleveland', 'Wichita', 'Arlington', 'New Orleans', 'Bakersfield', 'Tampa', 'Honolulu',
    'Aurora', 'Anaheim', 'Santa Ana', 'St. Louis', 'Riverside', 'Corpus Christi', 'Lexington'
];

const states = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

const merchants = [
    { name: 'Amazon', category: 'Online Retail' },
    { name: 'Walmart', category: 'Retail' },
    { name: 'Target', category: 'Retail' },
    { name: 'Starbucks', category: 'Coffee Shop' },
    { name: 'McDonalds', category: 'Fast Food' },
    { name: 'Shell', category: 'Gas Station' },
    { name: 'Chevron', category: 'Gas Station' },
    { name: 'Costco', category: 'Warehouse' },
    { name: 'Home Depot', category: 'Home Improvement' },
    { name: 'Best Buy', category: 'Electronics' },
    { name: 'Apple Store', category: 'Electronics' },
    { name: 'Whole Foods', category: 'Grocery' },
    { name: 'Safeway', category: 'Grocery' },
    { name: 'CVS Pharmacy', category: 'Pharmacy' },
    { name: 'Walgreens', category: 'Pharmacy' },
    { name: 'Netflix', category: 'Streaming' },
    { name: 'Spotify', category: 'Music' },
    { name: 'Uber', category: 'Transportation' },
    { name: 'Lyft', category: 'Transportation' },
    { name: 'Hotels.com', category: 'Travel' },
    { name: 'Airbnb', category: 'Travel' },
    { name: 'Delta Airlines', category: 'Airlines' },
    { name: 'United Airlines', category: 'Airlines' },
    { name: 'Marriott', category: 'Hotels' },
    { name: 'Hilton', category: 'Hotels' }
];

// Utility functions
const randomElement = (array) => array[Math.floor(Math.random() * array.length)];
const randomNumber = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min, max, decimals = 2) => parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
const randomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
const randomEmail = (firstName, lastName) => `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${randomElement(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'company.com'])}`;
const randomPhone = () => `${randomNumber(200, 999)}-${randomNumber(100, 999)}-${randomNumber(1000, 9999)}`;
const randomSSN = () => `${randomNumber(100, 999)}-${randomNumber(10, 99)}-${randomNumber(1000, 9999)}`;
const randomZip = () => randomNumber(10000, 99999).toString();

// Generate synthetic data
const generateUsers = async (count = 1000) => {
    console.log(`🚀 Generating ${count} users...`);
    const users = [];
    const hashedPassword = await bcrypt.hash('password123', 12); // Default password for all users
    
    // Create admin users first
    const adminUsers = [
        { role: 'SUPER_ADMIN', count: 1 },
        { role: 'ADMIN', count: 2 },
        { role: 'MANAGER', count: 5 },
        { role: 'AGENT', count: 20 }
    ];
    
    let userCount = 0;
    
    // Generate admin users
    for (const { role, count: roleCount } of adminUsers) {
        for (let i = 0; i < roleCount; i++) {
            const firstName = randomElement(firstNames);
            const lastName = randomElement(lastNames);
            
            users.push({
                id: uuidv4(),
                email: `${role.toLowerCase()}.${firstName.toLowerCase()}.${lastName.toLowerCase()}@company.com`,
                password_hash: hashedPassword,
                first_name: firstName,
                last_name: lastName,
                phone: randomPhone(),
                date_of_birth: randomDate(new Date(1950, 0, 1), new Date(1990, 11, 31)),
                ssn: randomSSN(),
                address_line1: `${randomNumber(1, 9999)} ${randomElement(['Main', 'First', 'Second', 'Park', 'Oak', 'Pine', 'Maple'])} ${randomElement(['St', 'Ave', 'Blvd', 'Dr', 'Ln'])}`,
                city: randomElement(cities),
                state: randomElement(states),
                zip_code: randomZip(),
                country: 'US',
                role: role,
                status: 'ACTIVE',
                email_verified: true,
                phone_verified: true
            });
            userCount++;
        }
    }
    
    // Generate customer users
    const remainingCount = count - userCount;
    for (let i = 0; i < remainingCount; i++) {
        const firstName = randomElement(firstNames);
        const lastName = randomElement(lastNames);
        
        users.push({
            id: uuidv4(),
            email: randomEmail(firstName, lastName),
            password_hash: hashedPassword,
            first_name: firstName,
            last_name: lastName,
            phone: randomPhone(),
            date_of_birth: randomDate(new Date(1950, 0, 1), new Date(2000, 11, 31)),
            ssn: randomSSN(),
            address_line1: `${randomNumber(1, 9999)} ${randomElement(['Main', 'First', 'Second', 'Park', 'Oak', 'Pine', 'Maple'])} ${randomElement(['St', 'Ave', 'Blvd', 'Dr', 'Ln'])}`,
            city: randomElement(cities),
            state: randomElement(states),
            zip_code: randomZip(),
            country: 'US',
            role: 'CUSTOMER',
            status: randomElement(['ACTIVE', 'ACTIVE', 'ACTIVE', 'INACTIVE']), // 75% active
            email_verified: Math.random() > 0.1, // 90% verified
            phone_verified: Math.random() > 0.2   // 80% verified
        });
    }
    
    return users;
};

const generateAccounts = (users) => {
    console.log('🏦 Generating accounts...');
    const accounts = [];
    const customerUsers = users.filter(user => user.role === 'CUSTOMER');
    
    customerUsers.forEach(user => {
        const creditLimit = randomFloat(1000, 50000, 2);
        const currentBalance = randomFloat(0, creditLimit * 0.8, 2);
        const availableCredit = creditLimit - currentBalance;
        
        accounts.push({
            id: uuidv4(),
            user_id: user.id,
            account_number: `4${randomNumber(100000000000000, 999999999999999)}`, // 16 digit account number
            account_type: 'CREDIT',
            status: randomElement(['ACTIVE', 'ACTIVE', 'ACTIVE', 'INACTIVE']), // 75% active
            credit_limit: creditLimit,
            current_balance: currentBalance,
            available_credit: availableCredit,
            minimum_payment: Math.max(25, currentBalance * 0.02), // 2% minimum or $25
            payment_due_date: randomDate(new Date(), new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
            interest_rate: randomFloat(0.1299, 0.2999, 4), // 12.99% to 29.99%
            late_fee: randomFloat(25, 39, 2),
            overlimit_fee: randomFloat(29, 39, 2),
            last_statement_date: randomDate(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), new Date()),
            next_statement_date: randomDate(new Date(), new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
        });
    });
    
    return accounts;
};

const generateCards = (accounts, users) => {
    console.log('💳 Generating cards...');
    const cards = [];
    
    accounts.forEach(account => {
        const user = users.find(u => u.id === account.user_id);
        const numCards = randomNumber(1, 3); // 1-3 cards per account
        
        for (let i = 0; i < numCards; i++) {
            const cardBrand = randomElement(['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER']);
            let cardPrefix;
            
            switch (cardBrand) {
                case 'VISA': cardPrefix = '4'; break;
                case 'MASTERCARD': cardPrefix = '5'; break;
                case 'AMEX': cardPrefix = '37'; break;
                case 'DISCOVER': cardPrefix = '6'; break;
            }
            
            const cardNumber = cardBrand === 'AMEX' 
                ? `${cardPrefix}${randomNumber(10000000000000, 99999999999999)}` // 15 digits for AMEX
                : `${cardPrefix}${randomNumber(100000000000000, 999999999999999)}`; // 16 digits for others
            
            cards.push({
                id: uuidv4(),
                account_id: account.id,
                user_id: user.id,
                card_number: cardNumber,
                card_type: 'CREDIT',
                card_brand: cardBrand,
                expiry_month: randomNumber(1, 12),
                expiry_year: randomNumber(2025, 2030),
                cvv: cardBrand === 'AMEX' ? randomNumber(1000, 9999).toString() : randomNumber(100, 999).toString(),
                status: randomElement(['ACTIVE', 'ACTIVE', 'ACTIVE', 'BLOCKED']), // 75% active
                is_primary: i === 0, // First card is primary
                daily_limit: randomFloat(500, 2000, 2),
                monthly_limit: randomFloat(5000, 20000, 2),
                international_enabled: Math.random() > 0.3, // 70% enabled
                contactless_enabled: Math.random() > 0.2,  // 80% enabled
                online_enabled: Math.random() > 0.1,       // 90% enabled
                last_used: Math.random() > 0.5 ? randomDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), new Date()) : null
            });
        }
    });
    
    return cards;
};

const generateTransactions = (accounts, cards, users) => {
    console.log('💰 Generating transactions...');
    const transactions = [];
    const customerUsers = users.filter(user => user.role === 'CUSTOMER');
    
    // Generate 10-50 transactions per customer
    customerUsers.forEach(user => {
        const userAccounts = accounts.filter(account => account.user_id === user.id);
        const userCards = cards.filter(card => card.user_id === user.id);
        
        const numTransactions = randomNumber(10, 50);
        
        for (let i = 0; i < numTransactions; i++) {
            const account = randomElement(userAccounts);
            const card = randomElement(userCards.filter(c => c.account_id === account.id));
            const merchant = randomElement(merchants);
            const transactionType = randomElement(['PURCHASE', 'PURCHASE', 'PURCHASE', 'PURCHASE', 'PAYMENT', 'FEE']);
            
            let amount;
            switch (transactionType) {
                case 'PURCHASE':
                    amount = randomFloat(5, 500, 2);
                    break;
                case 'PAYMENT':
                    amount = -randomFloat(50, 1000, 2); // Negative for payments
                    break;
                case 'FEE':
                    amount = randomFloat(25, 39, 2);
                    break;
                default:
                    amount = randomFloat(10, 200, 2);
            }
            
            const createdAt = randomDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), new Date());
            
            transactions.push({
                id: uuidv4(),
                account_id: account.id,
                card_id: card ? card.id : null,
                user_id: user.id,
                transaction_id: `TXN${Date.now()}${randomNumber(1000, 9999)}`,
                amount: amount,
                currency: 'USD',
                transaction_type: transactionType,
                status: randomElement(['COMPLETED', 'COMPLETED', 'COMPLETED', 'PENDING', 'FAILED']),
                merchant_name: transactionType === 'PURCHASE' ? merchant.name : null,
                merchant_category: transactionType === 'PURCHASE' ? merchant.category : null,
                merchant_id: transactionType === 'PURCHASE' ? `MID${randomNumber(100000, 999999)}` : null,
                description: transactionType === 'PURCHASE' ? `Purchase at ${merchant.name}` : 
                           transactionType === 'PAYMENT' ? 'Payment received' : 
                           transactionType === 'FEE' ? 'Late payment fee' : 'Transaction',
                authorization_code: randomNumber(100000, 999999).toString(),
                reference_number: `REF${randomNumber(10000000, 99999999)}`,
                location_city: randomElement(cities),
                location_state: randomElement(states),
                location_country: 'US',
                is_international: Math.random() > 0.9, // 10% international
                is_online: Math.random() > 0.4,        // 60% online
                processing_fee: transactionType === 'PURCHASE' && Math.random() > 0.8 ? randomFloat(0.50, 2.99, 2) : 0,
                exchange_rate: 1.0,
                original_amount: amount,
                original_currency: 'USD',
                created_at: createdAt,
                processed_at: new Date(createdAt.getTime() + randomNumber(1000, 300000)), // 1 second to 5 minutes later
                settled_at: new Date(createdAt.getTime() + randomNumber(3600000, 259200000)), // 1 hour to 3 days later
                fraud_score: randomFloat(0, 1, 2),
                risk_level: randomElement(['LOW', 'LOW', 'LOW', 'MEDIUM', 'HIGH'])
            });
        }
    });
    
    return transactions;
};

const generateBalanceTransfers = (accounts, users) => {
    console.log('🔄 Generating balance transfers...');
    const transfers = [];
    const customerUsers = users.filter(user => user.role === 'CUSTOMER');
    
    // Generate 0-3 balance transfers per customer (not all customers will have transfers)
    customerUsers.forEach(user => {
        const userAccounts = accounts.filter(account => account.user_id === user.id);
        if (userAccounts.length === 0) return;
        
        const numTransfers = Math.random() > 0.7 ? randomNumber(1, 3) : 0; // 30% chance of having transfers
        
        for (let i = 0; i < numTransfers; i++) {
            const fromAccount = randomElement(userAccounts);
            const toAccount = randomElement(accounts.filter(acc => acc.id !== fromAccount.id));
            
            const amount = randomFloat(100, 5000, 2);
            const fee = amount * 0.03; // 3% fee
            
            transfers.push({
                id: uuidv4(),
                from_account_id: fromAccount.id,
                to_account_id: toAccount.id,
                user_id: user.id,
                transfer_id: `BT${Date.now()}${randomNumber(1000, 9999)}`,
                amount: amount,
                fee: fee,
                promotional_rate: Math.random() > 0.5 ? randomFloat(0.0099, 0.0599, 4) : null, // 50% chance of promo rate
                promotional_period_months: Math.random() > 0.5 ? randomNumber(6, 18) : null,
                status: randomElement(['COMPLETED', 'COMPLETED', 'PENDING', 'APPROVED', 'REJECTED']),
                reason: randomElement(['Debt consolidation', 'Lower interest rate', 'Emergency funds', 'Credit optimization']),
                requested_date: randomDate(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), new Date()),
                approved_date: Math.random() > 0.3 ? randomDate(new Date(Date.now() - 50 * 24 * 60 * 60 * 1000), new Date()) : null,
                completed_date: Math.random() > 0.4 ? randomDate(new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), new Date()) : null,
                notes: 'System generated balance transfer'
            });
        }
    });
    
    return transfers;
};

const generateDisputes = (transactions, users) => {
    console.log('⚖️ Generating disputes...');
    const disputes = [];
    
    // Generate disputes for ~5% of transactions
    const eligibleTransactions = transactions.filter(t => t.status === 'COMPLETED' && t.amount > 0);
    const numDisputes = Math.floor(eligibleTransactions.length * 0.05);
    
    for (let i = 0; i < numDisputes; i++) {
        const transaction = randomElement(eligibleTransactions);
        const user = users.find(u => u.id === transaction.user_id);
        
        const disputeType = randomElement(['UNAUTHORIZED', 'BILLING_ERROR', 'PRODUCT_SERVICE', 'DUPLICATE_CHARGE', 'CREDIT_NOT_PROCESSED']);
        
        disputes.push({
            id: uuidv4(),
            transaction_id: transaction.id,
            user_id: user.id,
            dispute_id: `DSP${Date.now()}${randomNumber(1000, 9999)}`,
            dispute_type: disputeType,
            status: randomElement(['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED']),
            amount: transaction.amount,
            reason: `Dispute for ${disputeType.toLowerCase().replace('_', ' ')}`,
            description: `Customer disputes transaction at ${transaction.merchant_name}`,
            temporary_credit: Math.random() > 0.5,
            temporary_credit_amount: Math.random() > 0.5 ? transaction.amount : 0,
            resolved_at: Math.random() > 0.4 ? randomDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), new Date()) : null,
            priority: randomElement(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
        });
    }
    
    return disputes;
};

const generateFraudCases = (transactions, users) => {
    console.log('🚨 Generating fraud cases...');
    const fraudCases = [];
    
    // Generate fraud cases for ~2% of transactions
    const suspiciousTransactions = transactions.filter(t => t.fraud_score > 0.7 || t.risk_level === 'HIGH');
    const numFraudCases = Math.floor(transactions.length * 0.02);
    
    for (let i = 0; i < numFraudCases; i++) {
        const transaction = randomElement(suspiciousTransactions.length > 0 ? suspiciousTransactions : transactions);
        const user = users.find(u => u.id === transaction.user_id);
        
        const caseType = randomElement(['CARD_FRAUD', 'IDENTITY_THEFT', 'ACCOUNT_TAKEOVER', 'SUSPICIOUS_ACTIVITY']);
        
        fraudCases.push({
            id: uuidv4(),
            user_id: user.id,
            transaction_id: transaction.id,
            case_id: `FRD${Date.now()}${randomNumber(1000, 9999)}`,
            case_type: caseType,
            status: randomElement(['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED', 'FALSE_POSITIVE']),
            severity: randomElement(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
            fraud_score: randomFloat(0.5, 1.0, 2),
            amount_involved: transaction.amount,
            description: `Potential ${caseType.toLowerCase().replace('_', ' ')} detected`,
            investigation_notes: 'Automated fraud detection system flagged this transaction',
            resolved_at: Math.random() > 0.6 ? randomDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), new Date()) : null,
            risk_indicators: JSON.stringify({
                unusual_location: Math.random() > 0.5,
                unusual_amount: Math.random() > 0.7,
                unusual_time: Math.random() > 0.6,
                velocity_check: Math.random() > 0.4
            }),
            evidence: JSON.stringify({
                ip_address: `${randomNumber(1, 255)}.${randomNumber(1, 255)}.${randomNumber(1, 255)}.${randomNumber(1, 255)}`,
                device_fingerprint: uuidv4(),
                location_match: Math.random() > 0.3
            })
        });
    }
    
    return fraudCases;
};

// Main function to generate all data
const generateSyntheticData = async (userCount = 1000) => {
    try {
        console.log('🎲 Starting synthetic data generation...');
        console.log(`📊 Target: ${userCount} users with related records`);
        
        // Generate all data
        const users = await generateUsers(userCount);
        const accounts = generateAccounts(users);
        const cards = generateCards(accounts, users);
        const transactions = generateTransactions(accounts, cards, users);
        const balanceTransfers = generateBalanceTransfers(accounts, users);
        const disputes = generateDisputes(transactions, users);
        const fraudCases = generateFraudCases(transactions, users);
        
        console.log('📈 Data generation summary:');
        console.log(`  👥 Users: ${users.length}`);
        console.log(`  🏦 Accounts: ${accounts.length}`);
        console.log(`  💳 Cards: ${cards.length}`);
        console.log(`  💰 Transactions: ${transactions.length}`);
        console.log(`  🔄 Balance Transfers: ${balanceTransfers.length}`);
        console.log(`  ⚖️ Disputes: ${disputes.length}`);
        console.log(`  🚨 Fraud Cases: ${fraudCases.length}`);
        
        return {
            users,
            accounts,
            cards,
            transactions,
            balanceTransfers,
            disputes,
            fraudCases
        };
    } catch (error) {
        console.error('❌ Error generating synthetic data:', error);
        throw error;
    }
};

module.exports = {
    generateSyntheticData,
    generateUsers,
    generateAccounts,
    generateCards,
    generateTransactions,
    generateBalanceTransfers,
    generateDisputes,
    generateFraudCases
};
