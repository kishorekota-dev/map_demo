const { createHash } = require('crypto');
const KeyedMutex = require('../utils/keyedMutex');
const { AsyncLocalStorage } = require('async_hooks');
const context = new AsyncLocalStorage();
const mutation = tool => !/^banking_get_/.test(tool);
const digest = value => createHash('sha256').update(value).digest('hex');
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => !['authToken', 'authorization'].includes(key)).map(key => [key, stable(value[key])]));
  return value;
}
class RuntimePersistence {
  constructor(pool = null) { this.pool = pool; this.ready = null; this.local = new KeyedMutex(); this.memory = new Map(); }
  enabled() { return process.env.WORKFLOW_DURABLE_EXECUTION === 'true' || (process.env.WORKFLOW_DURABLE_EXECUTION !== 'false' && process.env.NODE_ENV === 'production'); }
  async initialize() {
    if (!this.enabled()) return;
    if (!this.ready) this.ready = (async () => {
      if (!this.pool) {
        const { Pool } = require('pg');
        const config = require('../../config').database;
        const connectionString = process.env.WORKFLOW_DATABASE_URL;
        this.pool = new Pool(connectionString ? { connectionString, max: 12 } : {
          host: config.host, port: config.port, database: config.database, user: config.username, password: config.password, max: 12,
          ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : false
        });
      }
      if (process.env.WORKFLOW_SCHEMA_AUTO_MIGRATE === 'false') {
        await this.pool.query('SELECT operation_id,resolution,context FROM servicing_tool_operations LIMIT 0');
        return;
      }
      const migration = await this.pool.connect();
      try {
        await migration.query('BEGIN');
        await migration.query("SELECT pg_advisory_xact_lock(hashtextextended('servicing-runtime-schema', 0))");
        await migration.query(`CREATE TABLE IF NOT EXISTS servicing_tool_operations (
        operation_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, session_id TEXT NOT NULL, tool TEXT NOT NULL,
        request_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('dispatched','succeeded','reconciliation_required')),
        result JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
        await migration.query('ALTER TABLE servicing_tool_operations ADD COLUMN IF NOT EXISTS resolution JSONB');
        await migration.query('ALTER TABLE servicing_tool_operations ADD COLUMN IF NOT EXISTS context JSONB');
        await migration.query('ALTER TABLE servicing_tool_operations DROP CONSTRAINT IF EXISTS servicing_tool_operations_status_check');
        await migration.query("ALTER TABLE servicing_tool_operations ADD CONSTRAINT servicing_tool_operations_status_check CHECK(status IN ('dispatched','succeeded','reconciliation_required','failed'))");
        await migration.query('COMMIT');
      } catch (error) { await migration.query('ROLLBACK'); throw error; }
      finally { migration.release(); }
    })().catch(error => { this.ready = null; throw error; });
    await this.ready;
  }
  async runSession(tenant, sessionId, callback) {
    if (!this.enabled()) return this.local.runExclusive(`${tenant}:${sessionId}`, callback);
    await this.initialize();
    const client = await this.pool.connect();
    let lockLost = false;
    const onError = () => { lockLost = true; };
    client.on('error', onError);
    try {
      await client.query("SET lock_timeout TO '15s'");
      await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [`servicing:${tenant}:${sessionId}`]);
      return await context.run({ lockValid: () => !lockLost, client }, callback);
    } finally {
      if (!lockLost) await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [`servicing:${tenant}:${sessionId}`]).catch(() => { lockLost = true; });
      client.removeListener('error', onError);
      client.release(lockLost);
    }
  }
  async execute({ tenantId, sessionId, interactionId, tool, parameters, runtimeContext = {} }, invoke) {
    if (!mutation(tool)) return invoke();
    if (!interactionId) throw new Error('A durable interaction identifier is required for side effects');
    const executionContext = Object.fromEntries(['version', 'intent', 'channel', 'environment', 'cohort', 'confirmationRequired', 'confirmationVerified']
      .filter(key => ['string', 'number', 'boolean'].includes(typeof runtimeContext[key])).map(key => [key, runtimeContext[key]]));
    if (executionContext.confirmationRequired === true && executionContext.confirmationVerified !== true) throw Object.assign(new Error('Verified confirmation is required before dispatch'), { code: 'CONFIRMATION_REQUIRED' });
    if (context.getStore()?.lockValid() === false) throw new Error('Session coordination lost; action blocked');
    const operationId = digest(`${tenantId}:${sessionId}:${interactionId}:${tool}`);
    const requestHash = digest(JSON.stringify(stable(parameters)));
    const durable = this.enabled();
    let database;
    let prior;
    if (durable) {
      await this.initialize();
      database = context.getStore()?.client || this.pool;
      const inserted = await database.query(`INSERT INTO servicing_tool_operations(operation_id,tenant_id,session_id,tool,request_hash,status,context)
        VALUES($1,$2,$3,$4,$5,'dispatched',$6) ON CONFLICT DO NOTHING RETURNING operation_id`, [operationId, tenantId, sessionId, tool, requestHash, JSON.stringify(executionContext)]);
      if (!inserted.rowCount) prior = (await database.query('SELECT * FROM servicing_tool_operations WHERE operation_id=$1', [operationId])).rows[0];
    } else {
      prior = this.memory.get(operationId);
      if (!prior) this.memory.set(operationId, { operation_id: operationId, tenant_id: tenantId, session_id: sessionId, tool, request_hash: requestHash, status: 'dispatched', context: executionContext, created_at: new Date().toISOString() });
    }
    if (prior) {
      if (prior.request_hash !== requestHash) throw Object.assign(new Error('Operation key conflicts with different action inputs'), { code: 'OPERATION_CONFLICT', operationId });
      if (prior.status === 'succeeded') return { ...prior.result, operationId, replayed: true };
      if (prior.status === 'failed') throw Object.assign(new Error('This operation was reconciled as failed. Repeating the original operation is blocked.'), { code: 'OPERATION_FAILED', operationId });
      throw Object.assign(new Error('The previous action outcome requires reconciliation; it will not be repeated.'), { code: 'RECONCILIATION_REQUIRED', operationId });
    }
    try {
      const result = await invoke();
      if (result?.success === false || result?.isError === true) throw new Error('Adapter did not confirm successful completion');
      const safeResult = stable(result);
      if (durable) await database.query("UPDATE servicing_tool_operations SET status='succeeded',result=$2,updated_at=now() WHERE operation_id=$1", [operationId, JSON.stringify(safeResult)]);
      else this.memory.set(operationId, { ...this.memory.get(operationId), status: 'succeeded', result: safeResult });
      return { ...result, operationId };
    } catch (error) {
      // Once dispatched, even a timeout or failed acknowledgement may conceal
      // a committed external effect. Never retry it on another transport.
      if (durable) await database.query("UPDATE servicing_tool_operations SET status='reconciliation_required',updated_at=now() WHERE operation_id=$1", [operationId]).catch(() => {});
      else this.memory.set(operationId, { ...this.memory.get(operationId), status: 'reconciliation_required' });
      throw Object.assign(new Error('Action outcome is uncertain and requires reconciliation before retry.'), { code: 'RECONCILIATION_REQUIRED', operationId, cause: error });
    }
  }

  publicOperation(row) {
    return { operationId: row.operation_id, sessionId: row.session_id, tool: row.tool, status: row.status,
      createdAt: row.created_at, updatedAt: row.updated_at, resolution: row.resolution || null, context: row.context || {} };
  }
  async listOperations(tenantId, { status, sessionId } = {}) {
    let rows;
    if (this.enabled()) {
      await this.initialize();
      rows = (await this.pool.query(`SELECT operation_id,session_id,tool,status,created_at,updated_at,resolution,context FROM servicing_tool_operations
        WHERE tenant_id=$1 AND ($2::text IS NULL OR status=$2) AND ($3::text IS NULL OR session_id=$3) ORDER BY created_at DESC LIMIT 100`, [tenantId, status || null, sessionId || null])).rows;
    } else rows = [...this.memory.values()].filter(row => row.tenant_id === tenantId && (!status || row.status === status) && (!sessionId || row.session_id === sessionId));
    return rows.map(row => this.publicOperation(row));
  }
  async reconcile(tenantId, operationId, { outcome, reference, note, actor }) {
    if (!['completed', 'failed'].includes(outcome) || typeof reference !== 'string' || reference.trim().length < 3 || reference.length > 200
      || typeof note !== 'string' || note.trim().length < 10 || note.length > 1000) throw Object.assign(new Error('Outcome, external evidence reference and explanatory note are required'), { status: 400 });
    const resolution = { outcome, reference, note, actor, resolvedAt: new Date().toISOString() };
    const status = outcome === 'completed' ? 'succeeded' : 'failed';
    const result = { success: outcome === 'completed', reconciled: true, reference };
    let row;
    if (this.enabled()) {
      await this.initialize();
      row = (await this.pool.query(`UPDATE servicing_tool_operations SET status=$3,resolution=$4,result=$5,updated_at=now()
        WHERE operation_id=$1 AND tenant_id=$2 AND (status='reconciliation_required' OR (status='dispatched' AND created_at<now()-interval '30 minutes')) RETURNING *`,
      [operationId, tenantId, status, JSON.stringify(resolution), JSON.stringify(result)])).rows[0];
    } else {
      const current = this.memory.get(operationId);
      if (current?.tenant_id === tenantId && current.status === 'reconciliation_required') { Object.assign(current, { status, resolution, result }); row = current; }
    }
    if (!row) throw Object.assign(new Error('Operation is not eligible for reconciliation or is not accessible'), { status: 409 });
    return this.publicOperation(row);
  }
}
module.exports = { RuntimePersistence, mutation, stable };
