#!/usr/bin/env node
const readline = require('readline');
const config = require('../config');
const { withLockedClient } = require('./maintenance');
const TABLES = ['banking_mutation_results', 'banking_demo_seed_history', 'disputes', 'fraud_alerts', 'transfers', 'cards', 'transactions', 'accounts',
  'customer_relationships', 'customer_contacts', 'customer_preferences', 'audit_logs', 'refresh_tokens', 'user_roles',
  'role_permissions', 'permissions', 'roles', 'users', 'customers', 'flyway_schema_history'];

async function resetDatabase(options = {}) {
  const env = options.env || process.env;
  if (env.NODE_ENV === 'production') throw new Error('Banking database reset is disabled in production.');
  if (env.BANKING_ALLOW_DATABASE_RESET !== 'true' || !options.confirmed) throw new Error('Reset requires BANKING_ALLOW_DATABASE_RESET=true and explicit confirmation on a disposable database.');
  return withLockedClient(options, async client => {
    await client.query('BEGIN');
    try {
      for (const table of TABLES) await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
      for (const name of ['update_updated_at_column', 'generate_account_number', 'generate_reference_number', 'generate_case_number']) await client.query(`DROP FUNCTION IF EXISTS ${name}() CASCADE`);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  });
}
async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.BANKING_ALLOW_DATABASE_RESET !== 'true') throw new Error('Reset is blocked. Set BANKING_ALLOW_DATABASE_RESET=true only for a disposable non-production database.');
  if (process.argv.slice(2).some(argument => argument !== '--yes')) throw new Error('Only --yes is supported; the explicit reset environment guard is still required.');
  let confirmed = process.argv.includes('--yes');
  if (!confirmed) {
    const input = readline.createInterface({ input: process.stdin, output: process.stdout });
    try { confirmed = (await new Promise(resolve => input.question(`Drop all banking tables in ${config.database.database} at ${config.database.host}:${config.database.port}? Type yes: `, resolve))).trim().toLowerCase() === 'yes'; }
    finally { input.close(); }
  }
  if (!confirmed) { console.log('Reset cancelled.'); return; }
  await resetDatabase({ confirmed });
  console.log('Banking tables and functions reset. Run migrations before any optional demo seeding.');
}
if (require.main === module) main().catch(() => { console.error('Banking database reset failed. Verify the explicit reset guards and database configuration.'); process.exitCode = 1; });
module.exports = { resetDatabase };
