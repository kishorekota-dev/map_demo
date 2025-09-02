const { testConnection, initializeDatabase, query, transaction } = require('./index');
const { generateSyntheticData } = require('./seedData');

// Insert data in batches to avoid memory issues
const insertInBatches = async (tableName, data, batchSize = 100) => {
    if (data.length === 0) return;
    
    console.log(`📥 Inserting ${data.length} records into ${tableName}...`);
    
    const columns = Object.keys(data[0]);
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    const insertQuery = `
        INSERT INTO ${tableName} (${columns.join(', ')}) 
        VALUES (${placeholders})
        ON CONFLICT DO NOTHING
    `;
    
    for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        const queries = batch.map(record => ({
            text: insertQuery,
            params: columns.map(col => record[col])
        }));
        
        try {
            await transaction(queries);
            console.log(`  ✅ Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(data.length / batchSize)}`);
        } catch (error) {
            console.error(`  ❌ Error inserting batch ${Math.floor(i / batchSize) + 1}:`, error.message);
            throw error;
        }
    }
    
    console.log(`✅ Successfully inserted all ${data.length} records into ${tableName}`);
};

// Clean existing data (for development/testing)
const cleanDatabase = async () => {
    console.log('🧹 Cleaning existing data...');
    
    const tables = [
        'audit_logs',
        'user_sessions',
        'fraud_cases',
        'disputes',
        'balance_transfers',
        'transactions',
        'cards',
        'accounts',
        'users'
    ];
    
    for (const table of tables) {
        try {
            await query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
            console.log(`  ✅ Cleaned ${table}`);
        } catch (error) {
            console.error(`  ❌ Error cleaning ${table}:`, error.message);
        }
    }
    
    console.log('✅ Database cleaned successfully');
};

// Main seeding function
const seedDatabase = async (userCount = 1000, cleanFirst = true) => {
    try {
        console.log('🌱 Starting database seeding process...');
        console.log(`📊 Target: ${userCount} users with complete records`);
        
        // Test database connection
        const connected = await testConnection();
        if (!connected) {
            throw new Error('Database connection failed');
        }
        
        // Clean database if requested
        if (cleanFirst) {
            await cleanDatabase();
        }
        
        // Generate synthetic data
        const data = await generateSyntheticData(userCount);
        
        // Insert data in order (respecting foreign key constraints)
        await insertInBatches('users', data.users);
        await insertInBatches('accounts', data.accounts);
        await insertInBatches('cards', data.cards);
        await insertInBatches('transactions', data.transactions);
        await insertInBatches('balance_transfers', data.balanceTransfers);
        await insertInBatches('disputes', data.disputes);
        await insertInBatches('fraud_cases', data.fraudCases);
        
        // Verify data insertion
        console.log('🔍 Verifying data insertion...');
        const counts = {};
        const tables = ['users', 'accounts', 'cards', 'transactions', 'balance_transfers', 'disputes', 'fraud_cases'];
        
        for (const table of tables) {
            const result = await query(`SELECT COUNT(*) as count FROM ${table}`);
            counts[table] = parseInt(result.rows[0].count);
            console.log(`  📊 ${table}: ${counts[table]} records`);
        }
        
        // Create summary
        console.log('\n🎉 Database seeding completed successfully!');
        console.log('📊 Final Summary:');
        console.log(`  👥 Users: ${counts.users}`);
        console.log(`  🏦 Accounts: ${counts.accounts}`);
        console.log(`  💳 Cards: ${counts.cards}`);
        console.log(`  💰 Transactions: ${counts.transactions}`);
        console.log(`  🔄 Balance Transfers: ${counts.balance_transfers}`);
        console.log(`  ⚖️ Disputes: ${counts.disputes}`);
        console.log(`  🚨 Fraud Cases: ${counts.fraud_cases}`);
        
        // Create sample login credentials
        console.log('\n🔑 Sample Login Credentials:');
        console.log('  Super Admin: super_admin.john.smith@company.com / password123');
        console.log('  Admin: admin.mary.johnson@company.com / password123');
        console.log('  Manager: manager.robert.williams@company.com / password123');
        console.log('  Agent: agent.patricia.brown@company.com / password123');
        console.log('  Customer: (any customer email) / password123');
        
        return counts;
        
    } catch (error) {
        console.error('❌ Database seeding failed:', error);
        throw error;
    }
};

// Initialize database schema and seed data
const initializeAndSeed = async (userCount = 1000) => {
    try {
        console.log('🚀 Initializing database and seeding data...');
        
        // Initialize schema
        const schemaInitialized = await initializeDatabase();
        if (!schemaInitialized) {
            throw new Error('Database schema initialization failed');
        }
        
        // Seed data
        const counts = await seedDatabase(userCount, true);
        
        console.log('\n✅ Database initialization and seeding completed successfully!');
        return counts;
        
    } catch (error) {
        console.error('❌ Database initialization and seeding failed:', error);
        process.exit(1);
    }
};

// Command line interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const userCount = args[0] ? parseInt(args[0]) : 1000;
    const action = args[1] || 'init-and-seed';
    
    console.log(`🎯 Action: ${action}`);
    console.log(`👥 User count: ${userCount}`);
    
    switch (action) {
        case 'init':
            initializeDatabase()
                .then(() => process.exit(0))
                .catch(() => process.exit(1));
            break;
        case 'seed':
            seedDatabase(userCount, true)
                .then(() => process.exit(0))
                .catch(() => process.exit(1));
            break;
        case 'clean':
            cleanDatabase()
                .then(() => process.exit(0))
                .catch(() => process.exit(1));
            break;
        case 'init-and-seed':
        default:
            initializeAndSeed(userCount)
                .then(() => process.exit(0))
                .catch(() => process.exit(1));
            break;
    }
}

module.exports = {
    seedDatabase,
    cleanDatabase,
    initializeAndSeed,
    insertInBatches
};
