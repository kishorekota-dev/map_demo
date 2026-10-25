#!/usr/bin/env node
const { Pool } = require('pg');
const { getJwtSecret } = require('../../config/security');
const config = require('../config');
const { runMigrations } = require('./migrate');
const { runSeeds } = require('./seed');

function enabled(env, key, fallback) {
  if (env[key] === undefined) return fallback;
  if (!['true', 'false'].includes(env[key])) throw new Error(`${key} must be true or false.`);
  return env[key] === 'true';
}
async function bootstrap(options = {}) {
  const env = options.env || process.env;
  getJwtSecret(env);
  const seed = enabled(env, 'BANKING_SEED_DEMO_DATA', false);
  const migrate = enabled(env, 'BANKING_RUN_MIGRATIONS', true);
  if (seed && env.NODE_ENV === 'production') throw new Error('BANKING_SEED_DEMO_DATA cannot be enabled in production.');
  const budget = Number(env.BANKING_DB_READY_TIMEOUT_MS || 30000);
  if (!Number.isInteger(budget) || budget < 1000 || budget > 300000) throw new Error('BANKING_DB_READY_TIMEOUT_MS must be an integer from 1000 to 300000.');
  const pool = new Pool({ ...(options.database || config.database), connectionTimeoutMillis: 1000, query_timeout: 1000 });
  const started = Date.now();
  let connected = false;
  try {
    while (!connected) {
      try { await pool.query('SELECT 1'); connected = true; }
      catch (error) {
        if (Date.now() - started >= budget) throw new Error(`Banking database was not ready within ${budget} ms: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }
  } finally { await pool.end(); }
  if (migrate) await runMigrations(options);
  if (seed) await runSeeds(options);
  return { migrationsEnabled: migrate, demoSeedingEnabled: seed };
}
if (require.main === module) bootstrap().then(() => console.log('Banking database bootstrap complete.')).catch(error => { console.error(`Banking startup blocked: ${error.message}`); process.exitCode = 1; });
module.exports = { bootstrap };
