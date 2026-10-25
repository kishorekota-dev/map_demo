jest.mock('axios', () => ({ post: jest.fn() }));
const axios = require('axios');
const HandoffService = require('../handoffService');
const { randomUUID } = require('crypto');
const tenant = `handoff-test-${randomUUID()}`;
function manager() {
  const session = { sessionId: 'session', userId: 'customer', metadata: { tenantId: tenant, channel: 'digital', version: 7 },
    state: { currentStep: 'request_confirmation', pendingFeedback: { type: 'confirmation_required' } } };
  return { session, getSession: jest.fn(async () => session), updateSession: jest.fn(async (_id, update) => Object.assign(session, update)) };
}
describe('authenticated one-time channel handoff', () => {
  const prior = process.env.HANDOFF_STORAGE;
  beforeEach(() => { process.env.HANDOFF_STORAGE = 'memory'; axios.post.mockImplementation(async (_url, body) => ({ data: { updated: true, channel: body.channel } })); });
  afterAll(() => { if (prior === undefined) delete process.env.HANDOFF_STORAGE; else process.env.HANDOFF_STORAGE = prior; });
  test('binds user/tenant, consumes once and preserves pending state', async () => {
    const sessions = manager(); const service = new HandoffService(sessions);
    const principal = { userId: 'customer', tenantId: tenant };
    const grant = await service.issue(principal, 'session', 'ivr');
    await expect(service.resume({ userId: 'intruder', tenantId: tenant }, grant.grant, 'jwt', grant.targetChannel)).rejects.toMatchObject({ status: 409 });
    const result = await service.resume(principal, grant.grant, 'jwt', grant.targetChannel);
    expect(result).toMatchObject({ channel: 'ivr', session: { confirmationPending: true } });
    expect(sessions.session.state.pendingFeedback).toEqual({ type: 'confirmation_required' });
    expect(sessions.session.metadata).toMatchObject({ version: 7, channel: 'ivr' });
    await expect(service.resume(principal, grant.grant, 'jwt', grant.targetChannel)).rejects.toMatchObject({ status: 409 });
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect([...service.memory.keys()][0]).not.toBe(grant.grant);
  });
  test('wrong destination cannot consume a valid grant', async () => {
    const sessions = manager(); const service = new HandoffService(sessions); const principal = { userId: 'customer', tenantId: tenant };
    const grant = await service.issue(principal, 'session', 'ava');
    await expect(service.resume(principal, grant.grant, 'jwt', 'ivr')).rejects.toMatchObject({ status: 409 });
    await expect(service.resume(principal, grant.grant, 'jwt', 'ava')).resolves.toMatchObject({ channel: 'ava' });
  });
  test.each([{ workflowRecoveryRequired: true }, { liveAgentActive: true, liveAgentId: 'agent' }])('does not transfer an interrupted request or active live chat', async state => {
    const sessions = manager(); sessions.session.state = state; const service = new HandoffService(sessions);
    await expect(service.issue({ userId: 'customer', tenantId: tenant }, 'session', 'ava')).rejects.toMatchObject({ status: 409 });
  });
  test('expired grants and foreign sessions fail without changing channel', async () => {
    const sessions = manager(); const service = new HandoffService(sessions); const principal = { userId: 'customer', tenantId: tenant };
    await expect(service.issue({ ...principal, tenantId: 'foreign' }, 'session', 'ava')).rejects.toMatchObject({ status: 403 });
    const grant = await service.issue(principal, 'session', 'ava');
    [...service.memory.values()][0].expires_at = new Date(0);
    await expect(service.resume(principal, grant.grant, 'jwt', grant.targetChannel)).rejects.toMatchObject({ status: 409 });
    expect(sessions.updateSession).not.toHaveBeenCalled();
  });
});
const postgres = process.env.RUNTIME_TEST_DATABASE_URL ? describe : describe.skip;
postgres('durable grant replay protection across workers', () => {
  let pool; const prior = process.env.HANDOFF_STORAGE;
  beforeAll(() => { process.env.HANDOFF_STORAGE = 'postgres'; pool = new (require('pg').Pool)({ connectionString: process.env.RUNTIME_TEST_DATABASE_URL }); });
  afterAll(async () => { await pool.query('DELETE FROM servicing_resume_grants WHERE tenant_id=$1', [tenant]); await pool.end();
    if (prior === undefined) delete process.env.HANDOFF_STORAGE; else process.env.HANDOFF_STORAGE = prior; });
  test('database grants enforce expiry and tenant boundaries before destination dispatch', async () => {
    const sessions = manager(); const service = new HandoffService(sessions, pool); await service.initialize();
    const principal = { userId: 'customer', tenantId: tenant }; const issued = await service.issue(principal, 'session', 'ava');
    axios.post.mockClear();
    await expect(service.resume({ ...principal, tenantId: 'foreign' }, issued.grant, 'jwt', 'ava')).rejects.toMatchObject({ status: 409 });
    await pool.query("UPDATE servicing_resume_grants SET expires_at=now()-interval '1 second' WHERE tenant_id=$1", [tenant]);
    await expect(service.resume(principal, issued.grant, 'jwt', 'ava')).rejects.toMatchObject({ status: 409 });
    expect(axios.post).not.toHaveBeenCalled();
  });
  test('only one of simultaneous resumes can consume the grant', async () => {
    const sessions = manager(); const a = new HandoffService(sessions, pool); const b = new HandoffService(sessions, pool);
    await a.initialize(); await b.initialize(); axios.post.mockClear(); axios.post.mockImplementation(async (_url, body) => ({ data: { updated: true, channel: body.channel } }));
    const principal = { userId: 'customer', tenantId: tenant }; const issued = await a.issue(principal, 'session', 'ava');
    const results = await Promise.allSettled([a.resume(principal, issued.grant, 'jwt', issued.targetChannel), b.resume(principal, issued.grant, 'jwt', issued.targetChannel)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(axios.post).toHaveBeenCalledTimes(1);
    await expect(new HandoffService(sessions, pool).resume(principal, issued.grant, 'jwt', issued.targetChannel)).rejects.toMatchObject({ status: 409 });
  });
});
