const { Pool } = require('pg');
const config = require('../config');

// Migrations, seeding and reset share one connection-scoped deployment lock.
async function withLockedClient(options, action) {
  const pool = options.pool || new Pool(options.database || config.database);
  let client;
  let locked = false;
  try {
    client = await pool.connect();
    await client.query('SELECT pg_advisory_lock($1)', [72424103]);
    locked = true;
    return await action(client);
  } finally {
    try {
      if (client) {
        try { if (locked) await client.query('SELECT pg_advisory_unlock($1)', [72424103]); }
        finally { client.release(); }
      }
    } finally { if (!options.pool) await pool.end(); }
  }
}

module.exports = { withLockedClient };
