const { Pool } = require('pg');
const config = require('./config');
const { AsyncLocalStorage } = require('async_hooks');
const transactionContext = new AsyncLocalStorage();

// Create connection pool
const pool = new Pool(config.database);

// Pool event handlers
pool.on('connect', () => {
  console.log('Database connection established');
});

pool.on('error', () => {
  console.error('Unexpected database pool error');
  // Don't exit process - let the application handle connection errors
});

// Query helper with error handling
const query = async (text, params) => {
  const start = Date.now();
  try {
    const context = transactionContext.getStore();
    if (context && !context.active) throw new Error('Banking transaction is no longer active');
    const res = await (context?.client || pool).query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query failed');
    throw error;
  }
};

// Transaction helper
const transaction = async (callback) => {
  const current = transactionContext.getStore();
  if (current) {
    if (!current.active) throw new Error('Banking transaction is no longer active');
    return callback(current.client);
  }
  const client = await pool.connect();
  const context = { active: true };
  const guarded = Object.create(client);
  guarded.query = (...args) => {
    if (!context.active) throw new Error('Banking transaction is no longer active');
    return client.query(...args);
  };
  guarded.release = () => { throw new Error('The owning banking transaction releases its connection'); };
  context.client = guarded;
  let committing = false;
  let destroy = false;
  try {
    await client.query('BEGIN');
    const result = await transactionContext.run(context, () => callback(guarded));
    context.active = false;
    committing = true;
    await client.query('COMMIT');
    return result;
  } catch (error) {
    context.active = false;
    await client.query('ROLLBACK').catch(() => { destroy = true; });
    if (committing) error.transactionOutcome = 'uncertain';
    throw error;
  } finally {
    context.active = false;
    client.release(destroy);
  }
};

// Get a client from the pool
const getClient = async () => {
  const context = transactionContext.getStore();
  if (context) {
    if (!context.active) throw new Error('Banking transaction is no longer active');
    throw new Error('Banking mutations must use the owning transaction query or transaction callback');
  }
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
      error: 'Banking database is unavailable'
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
