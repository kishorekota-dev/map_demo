const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'credit_card_enterprise',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 20, // maximum number of clients in the pool
    idleTimeoutMillis: 30000, // how long a client is allowed to remain idle
    connectionTimeoutMillis: 2000, // how long to try to connect before timing out
};

// Create connection pool
const pool = new Pool(dbConfig);

// Test database connection
const testConnection = async () => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        console.log('✅ Database connected successfully:', result.rows[0].now);
        client.release();
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    }
};

// Initialize database schema
const initializeDatabase = async () => {
    try {
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        const client = await pool.connect();
        await client.query(schema);
        console.log('✅ Database schema initialized successfully');
        client.release();
        return true;
    } catch (error) {
        console.error('❌ Database schema initialization failed:', error.message);
        return false;
    }
};

// Execute a query with parameters
const query = async (text, params = []) => {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        
        // Log slow queries (> 100ms)
        if (duration > 100) {
            console.warn(`🐌 Slow query detected (${duration}ms):`, text);
        }
        
        return result;
    } catch (error) {
        console.error('❌ Database query error:', error.message);
        console.error('Query:', text);
        console.error('Params:', params);
        throw error;
    }
};

// Get a client from the pool for transactions
const getClient = async () => {
    try {
        const client = await pool.connect();
        return client;
    } catch (error) {
        console.error('❌ Failed to get database client:', error.message);
        throw error;
    }
};

// Execute multiple queries in a transaction
const transaction = async (queries) => {
    const client = await getClient();
    
    try {
        await client.query('BEGIN');
        
        const results = [];
        for (const { text, params } of queries) {
            const result = await client.query(text, params);
            results.push(result);
        }
        
        await client.query('COMMIT');
        return results;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Transaction failed:', error.message);
        throw error;
    } finally {
        client.release();
    }
};

// Graceful shutdown
const closePool = async () => {
    try {
        await pool.end();
        console.log('✅ Database pool closed');
    } catch (error) {
        console.error('❌ Error closing database pool:', error.message);
    }
};

// Handle process termination
process.on('SIGINT', async () => {
    console.log('📡 Received SIGINT, closing database connections...');
    await closePool();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('📡 Received SIGTERM, closing database connections...');
    await closePool();
    process.exit(0);
});

// Database utility functions
const buildWhereClause = (filters = {}) => {
    const conditions = [];
    const values = [];
    let paramCounter = 1;

    Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            if (Array.isArray(value)) {
                const placeholders = value.map(() => `$${paramCounter++}`).join(', ');
                conditions.push(`${key} IN (${placeholders})`);
                values.push(...value);
            } else if (typeof value === 'string' && value.includes('%')) {
                conditions.push(`${key} ILIKE $${paramCounter++}`);
                values.push(value);
            } else {
                conditions.push(`${key} = $${paramCounter++}`);
                values.push(value);
            }
        }
    });

    return {
        whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
        values,
        paramCounter
    };
};

const buildPagination = (page = 1, limit = 20) => {
    const offset = (page - 1) * limit;
    return {
        limit: Math.min(limit, 100), // Maximum 100 records per page
        offset: Math.max(offset, 0),
        limitClause: `LIMIT ${limit} OFFSET ${offset}`
    };
};

const buildOrderBy = (sortBy = 'created_at', sortOrder = 'DESC') => {
    const validSortOrders = ['ASC', 'DESC'];
    const order = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
    return `ORDER BY ${sortBy} ${order}`;
};

module.exports = {
    pool,
    query,
    getClient,
    transaction,
    testConnection,
    initializeDatabase,
    closePool,
    buildWhereClause,
    buildPagination,
    buildOrderBy
};
