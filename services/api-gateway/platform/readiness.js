const axios = require('axios');
const { configurationChecks } = require('./configuration');
const DEPENDENCIES = [
  ['banking', 'BANKING_SERVICE_URL', 'http://localhost:3005', '/health/ready'],
  ['chat', 'CHAT_BACKEND_URL', 'http://localhost:3006', '/health'],
  ['orchestrator', 'AI_ORCHESTRATOR_URL', 'http://localhost:3007', '/health'],
  ['mcp', 'MCP_SERVICE_URL', 'http://localhost:3004', '/health'],
  ['nlu', 'NLU_SERVICE_URL', 'http://localhost:3003', '/health']
];
class PlatformReadiness {
  constructor({ configStore, operationsStore, env = process.env, redisStatus = () => ({ configured: false, connected: false }), request = axios.get }) {
    Object.assign(this, { configStore, operationsStore, env, redisStatus, request });
    this.cached = null; this.pending = null; this.probes = new Map();
  }
  async check() {
    if (this.cached && Date.now() - this.cached.at < 5000) return this.cached.value;
    if (!this.pending) this.pending = this.run().then(value => {
      this.cached = { at: Date.now(), value }; return value;
    }).finally(() => { this.pending = null; });
    return this.pending;
  }
  async run() {
    const checks = [];
    const probe = async (id, action, message) => {
      try {
        // Reuse a stuck probe rather than creating more blocked pool work on
        // every refresh. The response deadline also covers storage/pool waits.
        let work = this.probes.get(id);
        if (!work) {
          work = Promise.resolve().then(action);
          this.probes.set(id, work);
          const release = () => { if (this.probes.get(id) === work) this.probes.delete(id); };
          work.then(release, release);
        }
        let timer;
        try {
          await Promise.race([work, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Probe deadline exceeded')), 4000);
          })]);
        } finally { clearTimeout(timer); }
        checks.push({ id, status: 'passed', message });
      }
      catch { checks.push({ id, status: 'failed', message: `Check ${id} connectivity, migrations and permissions.` }); }
    };
    await Promise.all([
      probe('control_plane_storage', async () => {
        await this.configStore.read();
        if (this.configStore.pool) await this.configStore.pool.query('SELECT tenant_id,kind,id FROM servicing_control_plane_records LIMIT 0');
      }, 'Configuration storage is available.'),
      probe('operations_storage', async () => {
        await this.operationsStore.initialize();
        await this.operationsStore.pool.query('SELECT tenant_id,kind,id FROM servicing_operations_records LIMIT 0');
        await this.operationsStore.pool.query('SELECT kind,lease_id,status FROM servicing_operations_jobs LIMIT 0');
        await this.operationsStore.pool.query('SELECT seq,hash FROM servicing_operations_events LIMIT 0');
      }, 'Operational storage and schemas are available.'),
      ...DEPENDENCIES.map(([id, variable, fallback, endpoint]) => probe(id, async () => {
        const base = new URL(this.env[variable] || fallback);
        if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Invalid service endpoint');
        const response = await this.request(`${base.toString().replace(/\/$/, '')}${endpoint}`, {
          timeout: 2500, signal: AbortSignal.timeout(2500), maxRedirects: 0, maxContentLength: 64000, proxy: false
        });
        if (response.status !== 200 || !['healthy', 'ready', 'ok', 'up'].includes(response.data?.status)
          || response.data?.ready === false) throw new Error('Dependency unavailable');
      }, 'Service health endpoint is available.'))
    ]);
    const redis = this.redisStatus();
    checks.push({ id: 'rate_limit_storage', status: redis.configured && redis.connected ? 'passed' : 'failed', message: 'Shared rate limiting requires a connected Redis store.' });
    const productionChecks = configurationChecks(this.env);
    const runtimeReady = checks.every(check => check.status === 'passed');
    const configurationReady = productionChecks.every(check => check.status === 'passed');
    return { ready: runtimeReady && (this.env.NODE_ENV !== 'production' || configurationReady), runtimeReady, configurationReady,
      mode: this.env.NODE_ENV === 'production' ? 'production' : 'development', checkedAt: new Date().toISOString(),
      checks: checks.sort((a, b) => a.id.localeCompare(b.id)), productionChecks,
      qualification: 'Infrastructure and configuration checks only. Live provider behavior, load, restore objectives and customer acceptance require deployment qualification.' };
  }
}
module.exports = { PlatformReadiness, DEPENDENCIES };
