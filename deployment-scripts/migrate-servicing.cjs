#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { readEnvironment } = require('./lib/environment.cjs');
const ROOT = path.resolve(__dirname, '..');
const loadPool = () => require(require.resolve('pg', { paths: [ROOT, path.join(ROOT, 'services/api-gateway')] })).Pool;
const components = {
  'control-plane': ['CONTROL_PLANE_DATABASE_URL', ['services/api-gateway/control-plane/schema.sql']],
  operations: ['OPERATIONS_DATABASE_URL', ['services/api-gateway/operations/schema.sql']],
  workflow: ['WORKFLOW_DATABASE_URL', ['services/ai-orchestrator/migrations/V0__ai_model_tables.sql', 'services/ai-orchestrator/migrations/V1__servicing_tool_operations.sql', 'services/ai-orchestrator/migrations/V2__servicing_graph_checkpoints.sql']],
  handoff: ['HANDOFF_DATABASE_URL', ['V1__create_chat_sessions_table.sql', 'V2__create_chat_messages_table.sql', 'V3__create_updated_at_trigger.sql', 'V4__create_indexes_for_queries.sql', 'V5__create_session_statistics_view.sql', 'V6__servicing_resume_grants.sql'].map(file => `services/chat-backend/migrations/${file}`)]
};
async function migrateComponent(name, env, Pool) {
  const [variable, files] = components[name];
  let parsed;
  try { parsed = new URL(env[variable]); } catch { throw new Error(`${name}: configure ${variable}.`); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error(`${name}: ${variable} must be PostgreSQL.`);
  const scripts = files.map(file => fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const pool = new Pool({ connectionString: env[variable], max: 1, connectionTimeoutMillis: 10000, statement_timeout: 60000 });
  pool.on('error', () => {});
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '30s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`servicing-deployment-migration:${name}`]);
    for (const sql of scripts) await client.query(sql);
    await client.query('COMMIT');
    return { component: name, status: 'applied' };
  } catch {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw new Error(`${name}: migration failed; inspect database availability, permissions and schema compatibility using the migration owner.`);
  } finally { client?.release(); await pool.end(); }
}
async function main(args = process.argv.slice(2)) {
  let env = process.env; let selected = Object.keys(components);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env' && args[i + 1]) env = { ...process.env, ...readEnvironment(args[++i]) };
    else if (args[i] === '--component' && components[args[i + 1]]) selected = [args[++i]];
    else if (args[i] === '--help') { console.log('Usage: migrate-servicing.cjs [--env FILE] [--component control-plane|operations|workflow|handoff]\nExplicitly applies canonical servicing SQL with transaction/advisory locks. Databases and banking migrations must be provisioned separately; workflow/handoff components include AI/chat base tables. Use a migration-owner credential.'); return; }
    else throw new Error('Unknown or incomplete migration option. Use --help.');
  }
  // Resolve only after options are validated; no connection is made by imports.
  const Pool = loadPool();
  for (const name of selected) console.log(JSON.stringify(await migrateComponent(name, env, Pool)));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { components, migrateComponent, loadPool, main };
