const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { OperationsStore } = require('../store');
const { authenticate, authorize, actorHash } = require('../auth');
const { mountUsageRoutes, validateCostModel } = require('../usage');
const SECRET = 'usage-test-jwt-secret';
const databaseUrl = process.env.TEST_OPERATIONS_DATABASE_URL || process.env.TEST_CONTROL_PLANE_DATABASE_URL;

test('unit rates require unique dimensions and valid prices', () => {
  const body = { revision: 0, currency: 'USD', rates: [{ provider: 'provider', service: 'generation', metric: 'input_tokens', unitPrice: 0.000003 }] };
  expect(() => validateCostModel(body)).not.toThrow();
  expect(() => validateCostModel({ ...body, rates: [...body.rates, ...body.rates] })).toThrow('unique');
  expect(() => validateCostModel({ ...body, rates: [{ ...body.rates[0], unitPrice: -1 }] })).toThrow('unitPrice');
});

(databaseUrl ? describe : describe.skip)('measured usage and prospective pricing in PostgreSQL', () => {
  let store; let app;
  const call = (method, url, body, role = 'admin', actor = 'operator-a') => request(app)[method](url)
    .set('Authorization', `Bearer ${jwt.sign({ userId: actor, role, tenantId: store.tenantId, type: 'access' }, SECRET, { expiresIn: '10m' })}`).send(body);
  const ingest = (body, actor = 'customer-a') => call('post', '/runtime/usage', body, 'customer', actor).set('X-Servicing-Service-Token', 'trusted-service');
  const measurement = (eventId, extras = {}) => ({ eventId, sessionId: 'session-one', interactionId: 'interaction-one', provider: 'test_provider', service: 'generation', metric: 'input_tokens', units: 100, channel: 'digital', version: 1, ...extras });
  const rates = (unitPrice = 0.01) => [{ provider: 'test_provider', service: 'generation', metric: 'input_tokens', unitPrice }];
  beforeEach(async () => {
    store = new OperationsStore({ databaseUrl, tenantId: `usage-test-${randomUUID()}` });
    app = express(); app.use(express.json()); app.use(authenticate(SECRET, store.tenantId));
    mountUsageRoutes(app, { store, route: (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next), authorize,
      runtime: (req, res, next) => req.get('X-Servicing-Service-Token') === 'trusted-service' ? next() : res.status(403).json({ error: 'Trusted runtime required' }),
      fingerprintActor: (req) => actorHash(req.principal.actor, SECRET) });
    app.use((error, req, res, next) => res.status(error.status || 503).json({ error: error.message }));
  });
  afterEach(async () => {
    try {
      await store.query('DELETE FROM servicing_operations_records WHERE tenant_id=$1', [store.tenantId]);
      await store.query('DELETE FROM servicing_operations_events WHERE tenant_id=$1', [store.tenantId]);
    } finally { await store.close(); }
  });
  test('requires trusted runtime plus customer identity and admin permission for price configuration', async () => {
    await request(app).post('/runtime/usage').set('X-Servicing-Service-Token', 'trusted-service').send(measurement('one')).expect(401);
    await call('post', '/runtime/usage', measurement('one'), 'customer').expect(403);
    await call('put', '/cost-model', { revision: 0, currency: 'USD', rates: rates() }, 'customer').expect(403);
    await call('put', '/cost-model', { revision: 0, currency: 'USD', rates: rates() }).expect(200);
    await call('put', '/cost-model', { revision: 0, currency: 'USD', rates: rates() }).expect(409);
  });
  test('deduplicates measurements without repricing and marks missing rates explicitly', async () => {
    const unpriced = (await ingest(measurement('unpriced-one')).expect(201)).body;
    expect(unpriced).toMatchObject({ pricingStatus: 'unpriced', cost: null, currency: null, unitPrice: null });
    await call('put', '/cost-model', { revision: 0, currency: 'USD', rates: rates(0.01) }).expect(200);
    expect((await ingest(measurement('unpriced-one')).expect(200)).body).toMatchObject({ replayed: true, cost: null });
    await ingest(measurement('unpriced-one', { units: 101 })).expect(409);
    await ingest(measurement('unpriced-one'), 'customer-b').expect(409);
    const priced = (await ingest(measurement('priced-two')).expect(201)).body;
    expect(priced).toMatchObject({ cost: 1, currency: 'USD', unitPrice: 0.01, modelRevision: 1 });
    await call('put', '/cost-model', { revision: 1, currency: 'USD', rates: rates(0.02) }).expect(200);
    expect((await ingest(measurement('priced-two')).expect(200)).body.cost).toBe(1);
    expect((await ingest(measurement('priced-three')).expect(201)).body.cost).toBe(2);
    const summary = (await call('get', '/costs').expect(200)).body;
    expect(summary).toMatchObject({ pricedCost: 3, pricedRecords: 2, unpricedRecords: 1, totalRecords: 3, coverage: 'partial', costPerCompletedInteraction: null });
  });
  test('calculates cost per distinct successful interaction and never combines currencies', async () => {
    await call('put', '/cost-model', { revision: 0, currency: 'USD', rates: rates(0.000003) }).expect(200);
    await ingest(measurement('usd-one', { units: 1000 })).expect(201);
    await store.transaction(async (tx) => {
      for (let i = 0; i < 2; i += 1) await tx.event({ type: 'runtime.execution', stage: 'conversation', outcome: 'succeeded', sessionId: 'session-one', interactionId: 'interaction-one' });
      await tx.event({ type: 'runtime.execution', stage: 'conversation', outcome: 'succeeded', sessionId: 'session-two', interactionId: 'interaction-one' });
      await tx.event({ type: 'runtime.execution', stage: 'conversation', outcome: 'policy_denied', sessionId: 'session-one', interactionId: 'failed-interaction' });
      await tx.event({ type: 'runtime.execution', stage: 'conversation', outcome: 'succeeded', interactionId: 'missing-session-ignored' });
    });
    expect((await call('get', '/costs').expect(200)).body).toMatchObject({ currency: 'USD', pricedCost: 0.003, completedInteractions: 2, costPerCompletedInteraction: 0.0015, coverage: 'complete' });
    await call('put', '/cost-model', { revision: 1, currency: 'EUR', rates: rates(0.02) }).expect(200);
    await ingest(measurement('eur-two')).expect(201);
    const mixed = (await call('get', '/costs').expect(200)).body;
    expect(mixed).toMatchObject({ currency: null, pricedCost: null, costPerCompletedInteraction: null });
    expect(mixed.byCurrency).toEqual(expect.arrayContaining([{ currency: 'USD', pricedCost: 0.003, pricedRecords: 1 }, { currency: 'EUR', pricedCost: 2, pricedRecords: 1 }]));
  });
  test('concurrent exact events record one measurement', async () => {
    const results = await Promise.all([ingest(measurement('same-event')), ingest(measurement('same-event'))]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 201]);
    expect((await call('get', '/costs')).body.totalRecords).toBe(1);
    await ingest(measurement('invalid', { units: -1 })).expect(400);
    await call('get', '/costs?days=999').expect(400);
  });
});
