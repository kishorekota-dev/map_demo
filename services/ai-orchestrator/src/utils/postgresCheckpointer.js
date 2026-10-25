const { BaseCheckpointSaver } = require('@langchain/langgraph');
const { createRequire } = require('module');
// Resolve the exact checkpoint contract shipped with the installed graph version.
const { WRITES_IDX_MAP } = createRequire(require.resolve('@langchain/langgraph'))('@langchain/langgraph-checkpoint');
const fs = require('fs');
const path = require('path');
const { pgOptions } = require('../models/tls');
const schemaSql = fs.readFileSync(path.resolve(__dirname, '../../migrations/V2__servicing_graph_checkpoints.sql'), 'utf8');

function identifier(value, field, empty = false) {
  if (typeof value !== 'string' || (!empty && !value) || value.length > 512 || value.includes('\0')) throw new Error(`Invalid checkpoint ${field}`);
  return value;
}
function location(config) {
  return { thread: identifier(config?.configurable?.thread_id, 'thread'), ns: identifier(config?.configurable?.checkpoint_ns ?? '', 'namespace', true),
    id: config?.configurable?.checkpoint_id ? identifier(config.configurable.checkpoint_id, 'id') : null };
}

class PostgresCheckpointer extends BaseCheckpointSaver {
  constructor({ pool, tenantId = process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise', env = process.env } = {}) {
    super(); this.pool = pool; this.ownsPool = !pool; this.tenantId = identifier(tenantId, 'tenant'); this.env = env; this.ready = null;
  }
  async initialize() {
    if (!this.ready) this.ready = (async () => {
      if (!this.pool) {
        const config = require('../../config').database;
        this.pool = new (require('pg').Pool)({ ...pgOptions(this.env.CHECKPOINT_DATABASE_URL || this.env.WORKFLOW_DATABASE_URL,
          { host: config.host, port: config.port, database: config.database, user: config.username, password: config.password }, this.env), max: 6 });
      }
      const auto = this.env.CHECKPOINT_SCHEMA_AUTO_MIGRATE === 'true' || (this.env.CHECKPOINT_SCHEMA_AUTO_MIGRATE !== 'false' && this.env.NODE_ENV !== 'production');
      if (auto) {
        const client = await this.pool.connect();
        try { await client.query('BEGIN'); await client.query("SELECT pg_advisory_xact_lock(hashtextextended('servicing-graph-schema',0))"); await client.query(schemaSql); await client.query('COMMIT'); }
        catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      }
      await this.pool.query('SELECT tenant_id,thread_id,checkpoint_ns,checkpoint_id,parent_checkpoint_id,checkpoint_type,checkpoint,metadata_type,metadata,metadata_index FROM servicing_graph_checkpoints LIMIT 0');
      await this.pool.query('SELECT tenant_id,thread_id,checkpoint_ns,checkpoint_id,task_id,write_index,task_path,channel,value_type,value FROM servicing_graph_writes LIMIT 0');
    })().catch(error => { this.ready = null; throw error; });
    return this.ready;
  }
  async encode(value) {
    const [type, bytes] = await this.serde.dumpsTyped(value);
    if (bytes.byteLength > 8 * 1024 * 1024) throw new Error('Graph checkpoint exceeds the 8 MiB storage limit');
    return [type, Buffer.from(bytes)];
  }
  async getTuple(config) {
    await this.initialize(); const { thread, ns, id } = location(config);
    const params = [this.tenantId, thread, ns]; if (id) params.push(id);
    const { rows } = await this.pool.query(`SELECT * FROM servicing_graph_checkpoints WHERE tenant_id=$1 AND thread_id=$2 AND checkpoint_ns=$3 ${id ? 'AND checkpoint_id=$4' : ''} ORDER BY checkpoint_id DESC LIMIT 1`, params);
    return rows[0] ? this.tuple(rows[0]) : undefined;
  }
  async tuple(row) {
    const configurable = { thread_id: row.thread_id, checkpoint_ns: row.checkpoint_ns, checkpoint_id: row.checkpoint_id };
    const { rows } = await this.pool.query('SELECT task_id,channel,value_type,value FROM servicing_graph_writes WHERE tenant_id=$1 AND thread_id=$2 AND checkpoint_ns=$3 AND checkpoint_id=$4 ORDER BY task_path,task_id,write_index', [this.tenantId,row.thread_id,row.checkpoint_ns,row.checkpoint_id]);
    return { config: { configurable }, checkpoint: await this.serde.loadsTyped(row.checkpoint_type, row.checkpoint),
      metadata: await this.serde.loadsTyped(row.metadata_type, row.metadata),
      pendingWrites: await Promise.all(rows.map(async write => [write.task_id,write.channel,await this.serde.loadsTyped(write.value_type,write.value)])),
      ...(row.parent_checkpoint_id ? { parentConfig: { configurable: { ...configurable, checkpoint_id: row.parent_checkpoint_id } } } : {}) };
  }
  async *list(config, { before, limit = 100, filter } = {}) {
    await this.initialize(); const { thread, ns, id } = location(config);
    const params = [this.tenantId,thread,ns]; const extra = [];
    if (id) { params.push(id); extra.push(`checkpoint_id=$${params.length}`); }
    if (before?.configurable?.checkpoint_id) { params.push(identifier(before.configurable.checkpoint_id,'before')); extra.push(`checkpoint_id<$${params.length}`); }
    if (filter) { params.push(JSON.stringify(filter)); extra.push(`metadata_index @> $${params.length}::jsonb`); }
    params.push(Math.min(1000, Math.max(0, Number.isSafeInteger(limit) ? limit : 100)));
    const { rows } = await this.pool.query(`SELECT * FROM servicing_graph_checkpoints WHERE tenant_id=$1 AND thread_id=$2 AND checkpoint_ns=$3 ${extra.map(term => 'AND '+term).join(' ')} ORDER BY checkpoint_id DESC LIMIT $${params.length}`,params);
    for (const row of rows) yield await this.tuple(row);
  }
  async put(config, checkpoint, metadata) {
    await this.initialize(); const { thread, ns, id: parent } = location(config); const id = identifier(checkpoint.id,'id');
    const [checkpointType, bytes] = await this.encode(checkpoint); const [metadataType, metadataBytes] = await this.encode(metadata);
    await this.pool.query(`INSERT INTO servicing_graph_checkpoints(tenant_id,thread_id,checkpoint_ns,checkpoint_id,parent_checkpoint_id,checkpoint_type,checkpoint,metadata_type,metadata,metadata_index)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(tenant_id,thread_id,checkpoint_ns,checkpoint_id) DO NOTHING`,
    [this.tenantId,thread,ns,id,parent,checkpointType,bytes,metadataType,metadataBytes,JSON.stringify(metadata)]);
    return { configurable: { thread_id: thread, checkpoint_ns: ns, checkpoint_id: id } };
  }
  async putWrites(config, writes, taskId, taskPath = '') {
    await this.initialize(); const { thread, ns, id } = location(config); if (!id) throw new Error('Checkpoint ID required for task writes');
    identifier(taskId,'task'); const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (let index = 0; index < writes.length; index++) {
        const [channel, value] = writes[index]; const [type, bytes] = await this.encode(value);
        const writeIndex = WRITES_IDX_MAP[channel] ?? index;
        await client.query(`INSERT INTO servicing_graph_writes(tenant_id,thread_id,checkpoint_ns,checkpoint_id,task_id,write_index,task_path,channel,value_type,value)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(tenant_id,thread_id,checkpoint_ns,checkpoint_id,task_id,write_index)
          ${writeIndex < 0 ? 'DO UPDATE SET channel=EXCLUDED.channel,value_type=EXCLUDED.value_type,value=EXCLUDED.value' : 'DO NOTHING'}`,
        [this.tenantId,thread,ns,id,taskId,writeIndex,taskPath,channel,type,bytes]);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async deleteThread(threadId) {
    await this.initialize(); identifier(threadId,'thread'); const client = await this.pool.connect();
    try { await client.query('BEGIN'); for (const table of ['servicing_graph_writes','servicing_graph_checkpoints']) await client.query(`DELETE FROM ${table} WHERE tenant_id=$1 AND thread_id=$2`, [this.tenantId,threadId]); await client.query('COMMIT'); }
    catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async close() { if (this.ownsPool && this.pool) await this.pool.end(); }
}
module.exports = { PostgresCheckpointer, schemaSql };
