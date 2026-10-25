const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const { isDeepStrictEqual } = require('util');
const { clone, object, defaultConfig, validateConfig } = require('./config');
const { memoryRecords } = require('./records');

class ControlPlaneError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function initialState(tenantId, tenantName) {
  const config = defaultConfig();
  const now = new Date().toISOString();
  const published = { version: 1, config: clone(config), publishedAt: now, publishedBy: 'system', note: 'Initial servicing configuration' };
  return {
    schemaVersion: 1,
    tenant: { id: tenantId, name: tenantName },
    revision: 1,
    draft: config,
    published,
    releases: [clone(published)],
    audit: [],
    workItems: []
  };
}

function validateState(state, tenantId) {
  if (!object(state) || state.schemaVersion !== 1 || state.tenant?.id !== tenantId || !Number.isInteger(state.revision) || state.revision < 1 || !Array.isArray(state.audit) || !Array.isArray(state.workItems) || !Array.isArray(state.releases) || !state.releases.length || validateConfig(state.draft).length || validateConfig(state.published?.config).length
    || state.releases.some((release, index) => !object(release) || release.version !== index + 1 || validateConfig(release.config).length)
    || !isDeepStrictEqual(clone(state.published), clone(state.releases.at(-1)))
    || state.audit.some((entry) => !object(entry) || !Number.isInteger(entry.revision) || entry.revision < 2 || entry.revision > state.revision)
    || state.workItems.some((item) => !object(item) || !['queued', 'in_progress', 'waiting', 'completed', 'failed', 'cancelled'].includes(item.status) || !Array.isArray(item.history))) {
    throw new Error('Invalid control-plane state or deployment tenant mismatch. Restore a valid backup before serving requests.');
  }
  return state;
}

/** Single-writer deployment store. A database adapter is required for replicas. */
class ControlPlaneStore {
  constructor(options = {}) {
    this.tenantId = options.tenantId || process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise';
    this.tenantName = options.tenantName || process.env.DEPLOYMENT_TENANT_NAME || 'Enterprise servicing';
    this.file = options.file === null ? null : options.file || process.env.CONTROL_PLANE_DATA_FILE || path.join(__dirname, '../data/control-plane.json');
    this.storageKind = this.file ? 'file' : 'memory';
    if (process.env.NODE_ENV === 'production' && (!this.file || !process.env.CONTROL_PLANE_DATA_FILE || process.env.CONTROL_PLANE_SINGLE_WRITER !== 'true')) {
      this.configurationError = 'Production control plane requires CONTROL_PLANE_DATA_FILE on persistent storage and CONTROL_PLANE_SINGLE_WRITER=true.';
    }
    this.pending = Promise.resolve();
    this.state = null;
  }

  async initialize() {
    if (this.configurationError) throw new Error(this.configurationError);
    if (this.state) return;
    let state;
    try {
      state = this.file ? JSON.parse(await fs.readFile(this.file, 'utf8')) : initialState(this.tenantId, this.tenantName);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      state = initialState(this.tenantId, this.tenantName);
      await this.persist(state);
    }
    this.state = validateState(state, this.tenantId);
  }

  async persist(state) {
    if (!this.file) return;
    const directory = path.dirname(this.file);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    let handle;
    try {
      handle = await fs.open(temporary, 'wx', 0o600);
      await handle.writeFile(JSON.stringify(state, null, 2));
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rename(temporary, this.file);
      const parent = await fs.open(directory, 'r');
      try { await parent.sync(); } finally { await parent.close(); }
    } finally {
      if (handle) await handle.close();
      await fs.unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    }
  }

  serialize(operation) {
    const result = this.pending.then(async () => {
      await this.initialize();
      return operation();
    });
    this.pending = result.catch(() => {});
    return result;
  }

  read() {
    return this.serialize(() => clone(this.state));
  }

  getRecord(kind, id) { return this.serialize(() => memoryRecords(this.state).get(kind, id)); }
  listRecords(kind, options) { return this.serialize(() => memoryRecords(this.state).list(kind, options)); }
  searchKnowledge(...args) { return this.serialize(() => memoryRecords(this.state).searchKnowledge(...args)); }

  update(revision, actor, action, mutate, details = {}) {
    return this.serialize(async () => {
      if (!Number.isInteger(revision) || revision < 1) throw new ControlPlaneError(400, 'A positive integer revision is required.');
      if (revision !== this.state.revision) throw new ControlPlaneError(409, 'Configuration changed. Refresh and review the latest state before trying again.', { revision: this.state.revision });
      const next = clone(this.state);
      await mutate(next, memoryRecords(next));
      next.revision += 1;
      next.audit.push({
        id: randomUUID(), timestamp: new Date().toISOString(), actor, action,
        tenantId: this.tenantId, revision: next.revision, ...details
      });
      await this.persist(next);
      this.state = next;
      return clone(next);
    });
  }
}

module.exports = { ControlPlaneStore, ControlPlaneError, initialState, validateState };
