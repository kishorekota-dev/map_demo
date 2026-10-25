const { randomBytes } = require('crypto');
const fs = require('fs');
const path = require('path');
const proof = require('../mutationProof');
const { confirmationContext, matchesConfirmation } = require('../actionConfirmation');
const { RuntimePersistence } = require('../runtimePersistence');
const copies = ['services/ai-orchestrator/src/services/mutationProof.js', 'services/mcp-service/src/tools/mutationProof.js', 'services/banking-service/middleware/mutationProof.js', 'services/api-gateway/operations/mutationProof.js'];
const root = path.resolve(__dirname, '../../../../..');
describe('exact mutation confirmation contracts', () => {
  test('all independent service proof implementations remain identical', () => {
    const sources = copies.map(file => fs.readFileSync(path.join(root, file), 'utf8'));
    expect(new Set(sources).size).toBe(1);
  });
  test('signatures bind principal tenant key method path body scope and expiry', () => {
    const env = { SERVICING_SERVICE_TOKEN: randomBytes(32).toString('hex') };
    const binding = { scope: 'banking_http', principalId: 'customer', tenantId: 'enterprise', key: 'operation', method: 'POST', path: '/api/v1/transfers', body: { amount: 7, destination: 'account-b' } };
    const now = Date.now(); const token = proof.issueProof(binding, env, now);
    expect(proof.verifyProof(token, binding, env, now)).toBe(true);
    for (const changed of [{ principalId: 'other' }, { tenantId: 'other' }, { key: 'other' }, { method: 'PUT' }, { path: '/other' }, { body: { amount: 8 } }, { scope: 'servicing_case' }]) {
      expect(proof.verifyProof(token, { ...binding, ...changed }, env, now)).toBe(false);
    }
    expect(proof.verifyProof(token, binding, env, now + proof.TTL_MS)).toBe(false);
    expect(proof.verifyProof(token, binding, { SERVICING_SERVICE_TOKEN: randomBytes(32).toString('hex') }, now)).toBe(false);
    expect(() => proof.issueProof(binding, {})).toThrow('SERVICING_SERVICE_TOKEN');
    expect(proof.verifyProof('malformed', binding, env, now)).toBe(false);
  });
  test('prompt confirmation cannot authorize changed arguments tools route channel identity or interaction', () => {
    const state = { sessionId: 'session', userId: 'customer', tenantId: 'enterprise', interactionId: 'original', intent: 'transfer_funds', collectedData: { amount: 7 }, runtimeContext: { version: 7, channel: 'digital' } };
    const context = confirmationContext(state, ['banking_create_transfer']);
    expect(matchesConfirmation(context, structuredClone(state), ['banking_create_transfer'])).toBe(true);
    for (const changed of [{ userId: 'other' }, { interactionId: 'new' }, { tenantId: 'other' }, { collectedData: { amount: 8 } }, { runtimeContext: { version: 7, channel: 'ivr' } }, { channel: 'ava' }]) {
      expect(matchesConfirmation(context, { ...state, ...changed }, ['banking_create_transfer'])).toBe(false);
    }
    expect(matchesConfirmation(context, state, ['banking_block_card'])).toBe(false);
    expect(matchesConfirmation(context, state, ['banking_create_transfer'], 'handoff')).toBe(false);
    const noRoute = { ...state, runtimeContext: undefined, metadata: { channel: 'digital' } };
    expect(matchesConfirmation(confirmationContext(noRoute), { ...noRoute, metadata: { channel: 'ivr' } })).toBe(false);
  });
});
describe('mutation dispatch failure classification', () => {
  const previous = process.env.WORKFLOW_DURABLE_EXECUTION;
  beforeEach(() => { process.env.WORKFLOW_DURABLE_EXECUTION = 'false'; });
  afterAll(() => { if (previous === undefined) delete process.env.WORKFLOW_DURABLE_EXECUTION; else process.env.WORKFLOW_DURABLE_EXECUTION = previous; });
  const operation = { tenantId: 'enterprise', sessionId: 'session', interactionId: 'original', tool: 'banking_create_transfer', parameters: { amount: 7 }, runtimeContext: { confirmationVerified: true } };
  test('unconfirmed mutation never reaches the adapter', async () => {
    const invoke = jest.fn(); await expect(new RuntimePersistence().execute({ ...operation, runtimeContext: {} }, invoke)).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' }); expect(invoke).not.toHaveBeenCalled();
  });
  test.each([{ status: 400 }, { status: 503 }, { dispatched: false }])('definitive failure is not cached and a later explicit retry receives the same key', async failure => {
    const ledger = new RuntimePersistence(); const keys = [];
    const invoke = jest.fn(async context => { keys.push(context.idempotencyKey); if (keys.length === 1) throw Object.assign(new Error('Fixture rejection'), failure); return { success: true, data: { reference: 'fixture' } }; });
    await expect(ledger.execute(operation, invoke)).rejects.toMatchObject({ code: 'OPERATION_REJECTED', outcome: 'failed' });
    const success = await ledger.execute(operation, invoke); expect(keys[0]).toBe(success.operationId); expect(keys[1]).toBe(keys[0]); expect(invoke).toHaveBeenCalledTimes(2);
    expect(await ledger.execute(operation, invoke)).toEqual(success); expect(invoke).toHaveBeenCalledTimes(2);
  });
  test('an uncertain result never retries even when the response also supplies a 5xx status', async () => {
    const ledger = new RuntimePersistence(); const invoke = jest.fn(async () => ({ success: false, outcome: 'uncertain', status: 503 }));
    await expect(ledger.execute(operation, invoke)).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' });
    await expect(ledger.execute(operation, invoke)).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' }); expect(invoke).toHaveBeenCalledTimes(1);
  });
});
