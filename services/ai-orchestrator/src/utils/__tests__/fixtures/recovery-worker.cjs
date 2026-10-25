// Child process used only by restart tests; effects are SQL fixtures, never bank/model calls.
const { StateGraph, END } = require('@langchain/langgraph');
const { Pool } = require('pg');
const { PostgresCheckpointer } = require('../../postgresCheckpointer');
const { RuntimePersistence } = require('../../../services/runtimePersistence');
const [tenant, thread, scenario, phase] = process.argv.slice(2);
const pool = new Pool({ connectionString: process.env.RUNTIME_TEST_DATABASE_URL });
const saver = new PostgresCheckpointer({ pool, tenantId: tenant, env: { CHECKPOINT_SCHEMA_AUTO_MIGRATE: 'false' } });
const ledger = new RuntimePersistence(pool);
const crash = () => process.kill(process.pid, 'SIGKILL');
(async () => {
  const graph = new StateGraph({ channels: { tenantId: null, sessionId: null, interactionId: null, runtimeContext: null, result: null, done: null } });
  graph.addNode('effect', async state => {
    const result = await ledger.execute({ tenantId: state.tenantId, sessionId: state.sessionId, interactionId: state.interactionId,
      tool: 'banking_create_transfer', parameters: { amount: 10, authToken: phase === 'start' ? 'old-credential' : 'fresh-credential' }, runtimeContext: state.runtimeContext }, async () => {
      await pool.query('INSERT INTO servicing_restart_test_effects(tenant_id,thread_id) VALUES($1,$2)', [tenant,thread]);
      if (scenario === 'uncertain' && phase === 'start') crash();
      return { success: true, data: { reference: 'fixture-reference' } };
    });
    if (scenario === 'acknowledged' && phase === 'start') crash();
    return { ...state, result };
  });
  graph.addNode('response', state => {
    if (scenario === 'checkpointed' && phase === 'start') crash();
    return { ...state, done: true };
  });
  graph.setEntryPoint('effect'); graph.addEdge('effect','response'); graph.addEdge('response',END);
  const compiled = graph.compile({ checkpointer: saver });
  const result = await ledger.runSession(tenant, thread, () => compiled.invoke(phase === 'start' ? {
    tenantId: tenant, sessionId: thread, interactionId: 'original-interaction', runtimeContext: { version: 7, intent: 'transfer_funds', channel: 'digital', confirmationRequired: true, confirmationVerified: true }
  } : null, { configurable: { thread_id: thread }, durability: 'sync' }));
  process.stdout.write(JSON.stringify(result));
})().catch(error => { process.stdout.write(JSON.stringify({ error: error.code || error.message })); process.exitCode = 2; })
  .finally(() => pool.end());
