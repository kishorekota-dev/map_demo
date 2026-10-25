const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { createOperationsRouter } = require('..');
const { OperationsStore } = require('../store');
const { OUTCOME_EVENT_LIMIT } = require('../outcomeAnalytics');
const secret = 'outcome-routes-fixture-key';
function fixture(store, options = {}) {
  const router = createOperationsRouter({ store, jwtSecret: secret, env: { NODE_ENV: 'test', JWT_SECRET: secret }, ...options });
  const app = express(); app.use(express.json()); app.use('/operations', router);
  const auth = (role = 'control_plane_viewer', tenantId = store.tenantId) => `Bearer ${jwt.sign({ userId: 'reviewer', roles: [role], tenantId, type: 'access' }, secret)}`;
  return { router, auth, get: path => request(app).get(`/operations${path}`), app };
}
test('outcome queries enforce role/tenant boundaries, strict window input and a bounded complete dataset', async () => {
  const store = { tenantId: 'outcome-fixture', query: jest.fn(async () => ({ rows: [] })) };
  const { get, auth } = fixture(store);
  await get('/analytics/outcomes').expect(401);
  await get('/analytics/outcomes').set('Authorization', auth('customer')).expect(403);
  await get('/analytics/outcomes').set('Authorization', auth('control_plane_viewer', 'another')).expect(403);
  for (const days of ['0', '366', '2.5', 'nope']) await get(`/analytics/outcomes?days=${days}`).set('Authorization', auth()).expect(400);
  await get('/analytics/outcomes?days[]=2').set('Authorization', auth()).expect(400);
  expect(store.query).not.toHaveBeenCalled();
  const result = await get('/analytics/outcomes?days=10').set('Authorization', auth()).expect(200);
  expect(result.body).toMatchObject({ windowDays: 10, eventCount: 0, interactions: 0, firstContactResolutionRate: null, containmentRate: null });
  const [sql, args] = store.query.mock.calls[0];
  expect(sql).toContain("document->>'interactionId'");
  expect(sql).toContain('ORDER BY created_at,seq LIMIT $4');
  expect(args).toEqual(['outcome-fixture', expect.any(String), expect.any(String), OUTCOME_EVENT_LIMIT + 1]);
  store.query.mockResolvedValue({ rows: Array(OUTCOME_EVENT_LIMIT + 1).fill({}) });
  const tooLarge = await get('/analytics/outcomes').set('Authorization', auth()).expect(422);
  expect(tooLarge.body).not.toHaveProperty('completionRate');
});
test('connector sync rejects the entire sensitive/invalid batch before invoking control-plane import', async () => {
  const documents = [{ id: 'safe', title: 'Public help', content: 'A sufficiently detailed public servicing guide.', source: 'Approved support manual', allowedRoles: ['customer'] }];
  const store = { tenantId: 'knowledge-fixture', get: jest.fn(async () => ({ enabled: true, kind: 'knowledge' })),
    transaction: jest.fn(async fn => fn({ event: jest.fn() })) };
  const provider = jest.fn(async () => ({ status: 200, data: { documents } }));
  const importFetch = jest.fn(async () => ({ ok: true, json: async () => ({ revision: 2 }) }));
  const { app, auth } = fixture(store, { request: provider, fetch: importFetch });
  const sync = () => request(app).post('/operations/connections/source/sync').set('Authorization', auth('control_plane_admin')).send({ revision: 1 });
  await sync().expect(200);
  expect(JSON.parse(importFetch.mock.calls[0][1].body).documents[0]).toMatchObject({ id: 'safe', status: 'draft' });
  importFetch.mockClear(); store.transaction.mockClear();
  documents.push({ ...documents[0], id: 'private', content: 'Private customer email is someone@example.invalid.' });
  await sync().expect(422);
  expect(importFetch).not.toHaveBeenCalled(); expect(store.transaction).not.toHaveBeenCalled();
  documents[1] = { ...documents[0] };
  await sync().expect(422);
  expect(importFetch).not.toHaveBeenCalled();
});
const databaseUrl = process.env.TEST_OPERATIONS_DATABASE_URL || process.env.TEST_CONTROL_PLANE_DATABASE_URL;
(databaseUrl ? test : test.skip)('actual PostgreSQL outcome query respects tenant, interaction IDs, stages and observation cutoff', async () => {
  const tenant = `outcomes-${randomUUID()}`;
  const other = `${tenant}-other`;
  const store = new OperationsStore({ databaseUrl, tenantId: tenant });
  await store.initialize(); const { get, auth, router } = fixture(store);
  const insert = (scope, document, at) => store.query('INSERT INTO servicing_operations_events(tenant_id,id,document,previous_hash,hash,created_at) VALUES($1,$2,$3,$4,$5,$6)',
    [scope, randomUUID(), JSON.stringify(document), '0'.repeat(64), 'fixture-hash', at]);
  const event = { type: 'runtime.execution', stage: 'conversation', sessionId: 's', actorHash: 'actor', channel: 'digital', outcome: 'succeeded' };
  try {
    const older = new Date(Date.now() - 10 * 86400000).toISOString();
    await insert(tenant, { ...event, interactionId: 'one' }, older);
    await insert(tenant, { ...event, interactionId: 'two', outcome: 'failed' }, older);
    await insert(tenant, { ...event, interactionId: 'three', stage: 'recognition' }, older);
    await insert(tenant, { ...event, interactionId: 'future' }, new Date(Date.now() + 86400000).toISOString());
    await insert(other, { type: 'case.created', sessionId: 's', actorHash: 'actor' }, older);
    const result = await get('/analytics/outcomes').set('Authorization', auth()).expect(200);
    expect(result.body).toMatchObject({ interactions: 2, sessions: 1, eventCount: 2, completed: 1, completionRate: 0.5, firstContactResolved: 1 });
  } finally {
    await store.query('DELETE FROM servicing_operations_events WHERE tenant_id=ANY($1)', [[tenant, other]]);
    await router.close();
  }
});
