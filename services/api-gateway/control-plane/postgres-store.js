const { readFileSync } = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { clone } = require('./config');
const { ControlPlaneError, initialState, validateState } = require('./store');
const { postgresRecords } = require('./records');

const SCHEMA = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

/** PostgreSQL adapter: tenant-scoped row locks serialize writes across replicas. */
class PostgresControlPlaneStore {
  constructor(options = {}) {
    this.tenantId = options.tenantId || process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise';
    this.tenantName = options.tenantName || process.env.DEPLOYMENT_TENANT_NAME || 'Enterprise servicing';
    this.storageKind = 'postgres';
    this.pool = options.pool || new (require('pg').Pool)({
      connectionString: options.databaseUrl || process.env.CONTROL_PLANE_DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 10000
    });
    this.manageSchema = options.manageSchema ?? process.env.CONTROL_PLANE_MANAGE_SCHEMA !== 'false';
    this.ready = null;
    this.pool.on?.('error', (error) => {
      // Log codes only: connection strings and credentials never enter logs.
      console.error('Control-plane database connection failed:', error.code || 'database_unavailable');
    });
  }

  async initialize() {
    if (!this.ready) {
      this.ready = this.prepare().catch((error) => {
        this.ready = null;
        throw error;
      });
    }
    return this.ready;
  }

  async prepare() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (this.manageSchema) {
        // Multiple new replicas may initialize together. Serialize DDL, including
        // PostgreSQL's underlying type creation for CREATE TABLE IF NOT EXISTS.
        await client.query('SELECT pg_advisory_xact_lock(714935, 1)');
        await client.query(SCHEMA);
      }
      const state = initialState(this.tenantId, this.tenantName);
      await client.query(
        'INSERT INTO servicing_control_plane_state (tenant_id, revision, state) VALUES ($1, $2, $3::jsonb) ON CONFLICT (tenant_id) DO NOTHING',
        [this.tenantId, state.revision, JSON.stringify(state)]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async read() {
    await this.initialize();
    const result = await this.pool.query('SELECT state FROM servicing_control_plane_state WHERE tenant_id = $1', [this.tenantId]);
    if (result.rows.length !== 1) throw new Error('Control-plane deployment state was not found.');
    return clone(validateState(result.rows[0].state, this.tenantId));
  }

  async getRecord(kind, id) { await this.initialize(); return postgresRecords(this.pool, this.tenantId).get(kind, id); }
  async listRecords(kind, options) { await this.initialize(); return postgresRecords(this.pool, this.tenantId).list(kind, options); }
  async searchKnowledge(...args) { await this.initialize(); return postgresRecords(this.pool, this.tenantId).searchKnowledge(...args); }

  async update(revision, actor, action, mutate, details = {}) {
    if (!Number.isInteger(revision) || revision < 1) throw new ControlPlaneError(400, 'A positive integer revision is required.');
    await this.initialize();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT revision, state FROM servicing_control_plane_state WHERE tenant_id = $1 FOR UPDATE', [this.tenantId]);
      if (result.rows.length !== 1) throw new Error('Control-plane deployment state was not found.');
      const stored = result.rows[0];
      const next = clone(validateState(stored.state, this.tenantId));
      if (Number(stored.revision) !== next.revision) throw new Error('Control-plane state revision is inconsistent.');
      if (revision !== next.revision) throw new ControlPlaneError(409, 'Configuration changed. Refresh and review the latest state before trying again.', { revision: next.revision });
      await mutate(next, postgresRecords(client, this.tenantId));
      next.revision += 1;
      next.audit.push({ id: randomUUID(), timestamp: new Date().toISOString(), actor, action, tenantId: this.tenantId, revision: next.revision, ...details });
      const updated = await client.query(
        'UPDATE servicing_control_plane_state SET revision = $2, state = $3::jsonb, updated_at = NOW() WHERE tenant_id = $1 AND revision = $4',
        [this.tenantId, next.revision, JSON.stringify(next), revision]
      );
      if (updated.rowCount !== 1) throw new ControlPlaneError(409, 'Configuration changed during the update. Refresh and try again.');
      await client.query('COMMIT');
      return clone(next);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async close() { await this.pool.end(); }
}

module.exports = { PostgresControlPlaneStore };
