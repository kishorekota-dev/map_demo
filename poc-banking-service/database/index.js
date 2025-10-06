const { Pool } = require('pg');
const config = require('./config');

// Create connection pool
const pool = new Pool(config.database);

// Pool event handlers
pool.on('connect', () => {
  console.log('Database connection established');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

// Query helper with error handling
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', { text, error: error.message });
    throw error;
  }
};

// Transaction helper
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Get a client from the pool
const getClient = async () => {
  return await pool.connect();
};

// Health check
const healthCheck = async () => {
  try {
    const result = await query('SELECT NOW() as current_time, version() as db_version');
    return {
      status: 'healthy',
      timestamp: result.rows[0].current_time,
      version: result.rows[0].db_version,
      poolSize: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingClients: pool.waitingCount
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
};

// Graceful shutdown
const close = async () => {
  console.log('Closing database pool...');
  await pool.end();
  console.log('Database pool closed');
};

module.exports = {
  query,
  transaction,
  getClient,
  healthCheck,
  close,
  pool
};
