const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'customer_db',
  user: process.env.DB_USER || 'banking_user',
  password: process.env.DB_PASSWORD || 'banking_pass_2024',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  
  transaction: async (callback) => {
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
  },
  
  healthCheck: async () => {
    try {
      const result = await pool.query('SELECT NOW() as current_time, version()');
      return {
        status: 'connected',
        currentTime: result.rows[0].current_time,
        version: result.rows[0].version
      };
    } catch (error) {
      throw new Error(`Database health check failed: ${error.message}`);
    }
  },
  
  close: () => pool.end()
};
