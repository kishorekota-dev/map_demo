const { randomUUID } = require('crypto');
const { spawn } = require('child_process');
const path = require('path');
const { PostgresCheckpointer } = require('../postgresCheckpointer');
const { CheckpointerManager, graphThreadId } = require('../checkpointer');

test('production defaults to durable checkpoints and rejects accidental memory fallback', () => {
  const manager = new CheckpointerManager({ env: { NODE_ENV: 'production' } });
  expect(manager.getStats()).toMatchObject({ enabled: true, durable: true, type: 'PostgresCheckpointer' });
  expect(() => new CheckpointerManager({ env: { NODE_ENV: 'production', CHECKPOINT_BACKEND: 'memory' } })).toThrow('require PostgreSQL');
  expect(() => new CheckpointerManager({ env: { NODE_ENV: 'production', CHECKPOINT_ENABLED: 'false' } })).toThrow('require PostgreSQL');
  expect(new CheckpointerManager({ env: { NODE_ENV: 'test' } }).getStats().durable).toBe(false);
  expect(graphThreadId({ tenantId: 't', userId: 'u', sessionId: 's', runId: 'r' }))
    .not.toBe(graphThreadId({ tenantId: 't', userId: 'other', sessionId: 's', runId: 'r' }));
});
const database = process.env.RUNTIME_TEST_DATABASE_URL ? describe : describe.skip;
database('PostgreSQL graph checkpoints and real process recovery', () => {
  let pool, saver;
  const tenant = `graph-test-${randomUUID()}`;
  beforeAll(async () => {
    pool = new (require('pg').Pool)({ connectionString: process.env.RUNTIME_TEST_DATABASE_URL });
    saver = new PostgresCheckpointer({ pool, tenantId: tenant, env: { CHECKPOINT_SCHEMA_AUTO_MIGRATE: 'true' } });
    await saver.initialize();
    await pool.query('CREATE TABLE IF NOT EXISTS servicing_restart_test_effects(tenant_id TEXT,thread_id TEXT)');
    const previous = process.env.WORKFLOW_DURABLE_EXECUTION;
    process.env.WORKFLOW_DURABLE_EXECUTION = 'true';
    try { await new (require('../../services/runtimePersistence').RuntimePersistence)(pool).initialize(); }
    finally { if (previous === undefined) delete process.env.WORKFLOW_DURABLE_EXECUTION; else process.env.WORKFLOW_DURABLE_EXECUTION = previous; }
  });
  afterAll(async () => {
    for (const table of ['servicing_graph_writes','servicing_graph_checkpoints','servicing_tool_operations','servicing_restart_test_effects']) await pool.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [tenant]);
    await pool.end();
  });
  const checkpoint = id => ({ v: 4, id, ts: new Date().toISOString(), channel_values: { message: 'preserved', nested: { version: 7 } }, channel_versions: {}, versions_seen: {} });
  test('typed snapshots, parent history and pending task writes survive new saver instances', async () => {
    let config = { configurable: { thread_id: 'typed', checkpoint_ns: '' } };
    config = await saver.put(config, checkpoint('001'), { source: 'input', step: -1, parents: {} });
    await saver.putWrites(config, [['result', { ok: true }], ['__error__', 'first']], 'task');
    await saver.putWrites(config, [['result', { ok: false }], ['__error__', 'latest']], 'task');
    const next = await saver.put(config, checkpoint('002'), { source: 'loop', step: 0, parents: {} });
    const restarted = new PostgresCheckpointer({ pool, tenantId: tenant, env: { CHECKPOINT_SCHEMA_AUTO_MIGRATE: 'false' } });
    const loaded = await restarted.getTuple(config);
    expect(loaded.checkpoint.channel_values).toEqual({ message: 'preserved', nested: { version: 7 } });
    expect(loaded.pendingWrites).toEqual(expect.arrayContaining([['task','result',{ ok: true }],['task','__error__','latest']]));
    expect((await restarted.getTuple(next)).parentConfig).toEqual(config);
    const history = []; for await (const item of restarted.list({ configurable: { thread_id: 'typed' } }, { filter: { source: 'input' }, before: next })) history.push(item.checkpoint.id);
    expect(history).toEqual(['001']);
    const foreign = new PostgresCheckpointer({ pool, tenantId: tenant + '-foreign', env: { CHECKPOINT_SCHEMA_AUTO_MIGRATE: 'false' } });
    expect(await foreign.getTuple(config)).toBeUndefined();
    expect(await saver.getTuple({ configurable: { ...config.configurable, checkpoint_ns: 'other' } })).toBeUndefined();
    await saver.deleteThread('typed'); expect(await saver.getTuple(config)).toBeUndefined();
  });
  test('production verify-only schema mode performs no implicit creation', async () => {
    const schema = 'checkpoint_empty_' + randomUUID().replaceAll('-','');
    await pool.query(`CREATE SCHEMA ${schema}`);
    const isolated = new (require('pg').Pool)({ connectionString: process.env.RUNTIME_TEST_DATABASE_URL, options: `-c search_path=${schema}` });
    try { await expect(new PostgresCheckpointer({ pool: isolated, env: { NODE_ENV: 'production' } }).initialize()).rejects.toMatchObject({ code: '42P01' }); }
    finally { await isolated.end(); await pool.query(`DROP SCHEMA ${schema}`); }
  });
  function run(thread, scenario, phase) {
    return new Promise((resolve,reject) => {
      const child = spawn(process.execPath, [path.join(__dirname,'fixtures/recovery-worker.cjs'),tenant,thread,scenario,phase], {
        env: { ...process.env, WORKFLOW_DURABLE_EXECUTION: 'true', WORKFLOW_SCHEMA_AUTO_MIGRATE: 'false' }, stdio: ['ignore','pipe','pipe']
      });
      let output = '', errors = ''; const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Restart fixture timed out: '+errors)); },15000);
      child.stdout.on('data', bytes => output += bytes); child.stderr.on('data', bytes => errors += bytes);
      child.on('error',reject); child.on('exit',(code,signal) => { clearTimeout(timeout); resolve({ code,signal, result: output ? JSON.parse(output) : null, errors }); });
    });
  }
  test.each(['checkpointed','acknowledged'])('SIGKILL %s effect resumes in a new process without duplicate dispatch', async scenario => {
    const thread = randomUUID();
    expect(await run(thread,scenario,'start')).toMatchObject({ signal: 'SIGKILL' });
    const recovered = await run(thread,scenario,'recover');
    expect(recovered).toMatchObject({ code: 0, result: { done: true, runtimeContext: { version: 7 }, result: { success: true } } });
    expect((await pool.query('SELECT count(*) FROM servicing_restart_test_effects WHERE tenant_id=$1 AND thread_id=$2',[tenant,thread])).rows[0].count).toBe('1');
    const records = (await pool.query('SELECT context FROM servicing_tool_operations WHERE tenant_id=$1 AND session_id=$2',[tenant,thread])).rows;
    expect(records[0].context).toMatchObject({ version: 7, confirmationVerified: true });
    const snapshots = await pool.query('SELECT checkpoint,metadata FROM servicing_graph_checkpoints WHERE tenant_id=$1 AND thread_id=$2',[tenant,thread]);
    expect(snapshots.rows.map(row => row.checkpoint.toString()+row.metadata.toString()).join('')).not.toMatch(/old-credential|fresh-credential/);
  },20000);
  test('SIGKILL after dispatch before acknowledgement requires reconciliation and never dispatches again', async () => {
    const thread = randomUUID();
    expect(await run(thread,'uncertain','start')).toMatchObject({ signal: 'SIGKILL' });
    expect(await run(thread,'uncertain','recover')).toMatchObject({ code: 2, result: { error: 'RECONCILIATION_REQUIRED' } });
    expect((await pool.query('SELECT count(*) FROM servicing_restart_test_effects WHERE tenant_id=$1 AND thread_id=$2',[tenant,thread])).rows[0].count).toBe('1');
  },20000);
});
