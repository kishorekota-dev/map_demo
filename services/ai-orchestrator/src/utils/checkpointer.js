const { MemorySaver } = require('@langchain/langgraph');
const { createHash } = require('crypto');
const { PostgresCheckpointer } = require('./postgresCheckpointer');

class CheckpointerManager {
  constructor({ env = process.env, pool } = {}) {
    this.enabled = env.CHECKPOINT_ENABLED !== 'false';
    this.backend = env.CHECKPOINT_BACKEND || (env.NODE_ENV === 'production' ? 'postgres' : 'memory');
    if (!['postgres','memory'].includes(this.backend)) throw new Error('CHECKPOINT_BACKEND must be postgres or memory');
    if (env.NODE_ENV === 'production' && (!this.enabled || this.backend !== 'postgres')) throw new Error('Production graph checkpoints require PostgreSQL');
    this.checkpointer = !this.enabled ? null : this.backend === 'postgres' ? new PostgresCheckpointer({ env, pool, tenantId: env.DEPLOYMENT_TENANT_ID }) : new MemorySaver();
  }
  async initialize() { await this.checkpointer?.initialize?.(); }
  getCheckpointer() { return this.checkpointer; }
  isEnabled() { return this.enabled; }
  getStats() { return { enabled: this.enabled, type: !this.enabled ? 'disabled' : this.backend === 'postgres' ? 'PostgresCheckpointer' : 'MemorySaver', durable: this.enabled && this.backend === 'postgres' }; }
  async getCheckpoint(threadId) { return this.checkpointer ? (await this.checkpointer.get({ configurable: { thread_id: threadId } })) ?? null : null; }
  async clearCheckpoint(threadId) { await this.checkpointer?.deleteThread(threadId); }
  async getCheckpointHistory(threadId, limit = 10) {
    const history = []; if (!this.checkpointer) return history;
    for await (const entry of this.checkpointer.list({ configurable: { thread_id: threadId, checkpoint_ns: '' } }, { limit: Math.min(100,Math.max(1,limit)) })) history.push(entry);
    return history;
  }
  async healthCheck() {
    if (this.backend === 'postgres' && this.enabled) { await this.initialize(); await this.checkpointer.pool.query('SELECT 1'); }
    return this.getStats();
  }
  async close() { await this.checkpointer?.close?.(); }
}
function graphThreadId({ tenantId, userId, sessionId, runId }) {
  if (![tenantId,userId,sessionId,runId].every(value => typeof value === 'string' && value)) throw new Error('Graph execution identity is incomplete');
  return 'servicing:' + createHash('sha256').update(JSON.stringify([tenantId,userId,sessionId,runId])).digest('hex');
}
let instance;
function getCheckpointer() { return instance ??= new CheckpointerManager(); }
module.exports = { CheckpointerManager, getCheckpointer, graphThreadId };
