const { RuntimePersistence } = require('../runtimePersistence');
const { randomUUID } = require('crypto');
describe('operation ledger', () => {
  const prior = process.env.WORKFLOW_DURABLE_EXECUTION;
  beforeEach(() => { process.env.WORKFLOW_DURABLE_EXECUTION = 'false'; });
  afterAll(() => { if (prior === undefined) delete process.env.WORKFLOW_DURABLE_EXECUTION; else process.env.WORKFLOW_DURABLE_EXECUTION = prior; });
  test('same operation returns recorded result once; changed arguments conflict', async () => {
    const ledger = new RuntimePersistence();
    const invoke = jest.fn(async () => ({ success: true, data: { reference: 'T1' } }));
    const operation = { tenantId: 't', sessionId: 's', interactionId: 'i', runtimeContext: { confirmationVerified: true }, tool: 'banking_create_transfer', parameters: { amount: 7, authToken: 'secret' } };
    const first = await ledger.execute(operation, invoke);
    expect(await ledger.execute({ ...operation, parameters: { amount: 7, authToken: 'refreshed' } }, invoke)).toEqual(first);
    await expect(ledger.execute({ ...operation, parameters: { amount: 9 } }, invoke)).rejects.toMatchObject({ code: 'OPERATION_CONFLICT' });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  test('ambiguous dispatch cannot be blindly retried', async () => {
    const ledger = new RuntimePersistence();
    const invoke = jest.fn(async () => { throw new Error('timeout after dispatch'); });
    const operation = { tenantId: 't', sessionId: 's', interactionId: 'i', runtimeContext: { confirmationVerified: true }, tool: 'banking_block_card', parameters: { cardId: 'c' } };
    await expect(ledger.execute(operation, invoke)).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' });
    await expect(ledger.execute(operation, invoke)).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  test('operator reconciliation requires evidence and never retries a failed original key', async () => {
    const ledger = new RuntimePersistence(); const operation = { tenantId: 't', sessionId: 's', interactionId: 'i', runtimeContext: { confirmationVerified: true }, tool: 'banking_block_card', parameters: {} };
    let id;
    try { await ledger.execute(operation, async () => { throw new Error('unknown'); }); } catch (error) { id = error.operationId; }
    await expect(ledger.reconcile('foreign', id, { outcome: 'failed', reference: 'BANK-7', note: 'Verified absent at provider.', actor: 'admin' })).rejects.toMatchObject({ status: 409 });
    await expect(ledger.reconcile('t', id, { outcome: 'failed', reference: '', note: 'bad', actor: 'admin' })).rejects.toMatchObject({ status: 400 });
    expect(await ledger.reconcile('t', id, { outcome: 'failed', reference: 'BANK-7', note: 'Verified absent at provider.', actor: 'admin' })).toMatchObject({ status: 'failed', resolution: { actor: 'admin', reference: 'BANK-7' } });
    const invoke = jest.fn(); await expect(ledger.execute(operation, invoke)).rejects.toMatchObject({ code: 'OPERATION_FAILED' }); expect(invoke).not.toHaveBeenCalled();
  });
});

const postgres = process.env.RUNTIME_TEST_DATABASE_URL ? describe : describe.skip;
postgres('real PostgreSQL coordination and recovery', () => {
  let pool;
  const tenant = `runtime-test-${randomUUID()}`;
  const previous = process.env.WORKFLOW_DURABLE_EXECUTION;
  beforeAll(() => { process.env.WORKFLOW_DURABLE_EXECUTION = 'true'; pool = new (require('pg').Pool)({ connectionString: process.env.RUNTIME_TEST_DATABASE_URL }); });
  afterAll(async () => { await pool.query('DELETE FROM servicing_tool_operations WHERE tenant_id=$1', [tenant]); await pool.end();
    if (previous === undefined) delete process.env.WORKFLOW_DURABLE_EXECUTION; else process.env.WORKFLOW_DURABLE_EXECUTION = previous; });
  test('two instances serialize a session and replay persisted success after restart', async () => {
    const first = new RuntimePersistence(pool); const second = new RuntimePersistence(pool);
    await first.initialize(); await second.initialize();
    const calls = [];
    const operation = { tenantId: tenant, sessionId: 'same', interactionId: 'request', tool: 'banking_create_transfer', parameters: { amount: 10 },
      runtimeContext: { version: 7, intent: 'transfer_funds', channel: 'ava', environment: 'production', cohort: 'canary', confirmationRequired: true, confirmationVerified: true, authToken: 'never-persist' } };
    const invoke = jest.fn(async () => { calls.push('start'); await new Promise(resolve => setTimeout(resolve, 30)); calls.push('end'); return { success: true, data: { reference: 'external-1' } }; });
    const results = await Promise.all([first, second].map(ledger => ledger.runSession(tenant, 'same', () => ledger.execute(operation, invoke))));
    expect(invoke).toHaveBeenCalledTimes(1); expect(calls).toEqual(['start', 'end']);
    expect(results.map(result => result.operationId)).toEqual([results[0].operationId, results[0].operationId]);
    const restarted = new RuntimePersistence(pool);
    expect(await restarted.execute(operation, invoke)).toEqual(results[0]);
    expect(invoke).toHaveBeenCalledTimes(1);
    const recorded = await restarted.listOperations(tenant, { sessionId: 'same' });
    expect(recorded[0].context).toEqual({ version: 7, intent: 'transfer_funds', channel: 'ava', environment: 'production', cohort: 'canary', confirmationRequired: true, confirmationVerified: true });
  });
  test('a persisted dispatch without acknowledgement requires reconciliation after restart', async () => {
    const ledger = new RuntimePersistence(pool); const operation = { tenantId: tenant, sessionId: 'uncertain', interactionId: 'request', runtimeContext: { confirmationVerified: true }, tool: 'banking_create_transfer', parameters: { amount: 10 } };
    await expect(ledger.execute(operation, async () => { throw new Error('connection lost after commit'); })).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' });
    const invoke = jest.fn();
    await expect(new RuntimePersistence(pool).execute(operation, invoke)).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' });
    expect(invoke).not.toHaveBeenCalled();
  });
});
