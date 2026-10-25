const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { OperationsStore } = require('../store');
const { createOperationsRouter } = require('..');
const { RolloutMonitor } = require('../rollout-monitor');
const { PostgresControlPlaneStore } = require('../../control-plane/postgres-store');
const { createControlPlaneRouter } = require('../../control-plane');

const databaseUrl = process.env.TEST_OPERATIONS_DATABASE_URL || process.env.TEST_CONTROL_PLANE_DATABASE_URL;
const SECRET = 'rollout-integration-jwt-secret';
const SERVICE = 'rollout-integration-service-secret';
(databaseUrl ? describe : describe.skip)('persisted outcomes through the real rollout observer', () => {
  let store; let configStore; let app; let server; let operations; let controlPlane; let monitor;
  const tenantId = `rollout-integration-${randomUUID()}`;
  const token = (role = 'admin') => jwt.sign({ userId: role === 'admin' ? 'operator-a' : 'customer-a', role, tenantId, type: 'access' }, SECRET, { expiresIn: '10m' });
  const api = (method, path, body, role = 'admin') => request(app)[method](path).set('Authorization', `Bearer ${token(role)}`).send(body);
  beforeAll(async () => {
    store = new OperationsStore({ databaseUrl, tenantId });
    configStore = new PostgresControlPlaneStore({ databaseUrl, tenantId });
    const env = { JWT_SECRET: SECRET, SERVICING_SERVICE_TOKEN: SERVICE, FULFILLMENT_WORKER_ENABLED: 'false', ROLLOUT_MONITOR_ENABLED: 'false' };
    app = express(); app.use(express.json());
    controlPlane = createControlPlaneRouter({ store: configStore, jwtSecret: SECRET, env });
    operations = createOperationsRouter({ store, configStore, jwtSecret: SECRET, env });
    app.use('/api/control-plane', controlPlane); app.use('/api/operations', operations);
    server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    monitor = new RolloutMonitor(store, configStore, { env: { ...env, CONTROL_PLANE_INTERNAL_URL: `http://127.0.0.1:${server.address().port}/api/control-plane` } });
  });
  afterAll(async () => {
    monitor?.stop();
    if (server) await new Promise((resolve) => server.close(resolve));
    try {
      await store.query('DELETE FROM servicing_operations_records WHERE tenant_id=$1', [tenantId]);
      await store.query('DELETE FROM servicing_operations_events WHERE tenant_id=$1', [tenantId]);
      await store.query('DELETE FROM servicing_operations_jobs WHERE tenant_id=$1', [tenantId]);
      await configStore.pool.query('DELETE FROM servicing_control_plane_state WHERE tenant_id=$1', [tenantId]);
    } finally { await Promise.all([operations?.close(), controlPlane?.close()]); }
  });
  test('filters persisted candidate outcomes, deduplicates within sessions, and atomically withdraws the failing canary', async () => {
    const initial = (await api('get', '/api/control-plane/state').expect(200)).body;
    const config = initial.draft; config.channels[0].name = 'Candidate servicing';
    await api('put', '/api/control-plane/draft', { revision: 1, config }).expect(200);
    await api('post', '/api/control-plane/publish', { revision: 2, note: 'Candidate for rollout monitor test' }).expect(200);
    await api('post', '/api/control-plane/studio/promote', { revision: 3, environment: 'production', version: 2, canaryPercent: 25, note: 'Start canary' }).expect(200);
    await api('put', '/api/control-plane/studio/rollout-policy', { revision: 4, policy: { enabled: true, minSamples: 3, maxFailureRate: 0.4, windowMinutes: 15 } }).expect(200);

    const defaults = { sessionId: 'session-one', interactionId: 'shared-message-id', version: 2, channel: 'digital', intent: 'balance_inquiry', stage: 'conversation', outcome: 'failed', environment: 'production', cohort: 'canary' };
    const record = (overrides) => api('post', '/api/operations/runtime/events', { ...defaults, ...overrides }, 'customer').set('X-Servicing-Service-Token', SERVICE).expect(201);
    await api('post', '/api/operations/runtime/events', defaults, 'customer').expect(403);
    await api('post', '/api/control-plane/runtime/rollout/observe', { environment: 'production', candidateVersion: 2, sampleCount: 100, failureCount: 100, windowStart: new Date(Date.now() - 15 * 60000).toISOString(), windowEnd: new Date().toISOString() }, 'customer').expect(403);

    // These measurements must not contribute to production candidate outcomes.
    await record({ sessionId: 'stable-session', cohort: 'stable' });
    await record({ sessionId: 'development-session', environment: 'development' });
    await record({ sessionId: 'old-release-session', version: 1 });
    await record({ sessionId: 'tool-stage-session', stage: 'tool' });
    await record({ sessionId: 'denied-session', outcome: 'policy_denied' });
    await record({});
    await record({ outcome: 'succeeded' }); // same session/message: latest wins
    await record({ sessionId: 'session-two' }); // same message ID, different session
    await monitor.runOnce();
    expect((await configStore.read()).studio.environments.find((entry) => entry.id === 'production').candidateVersion).toBe(2);

    await record({ sessionId: 'session-three', interactionId: 'uncertain-message', outcome: 'reconciliation_required' });
    await monitor.runOnce();
    const state = await configStore.read();
    expect(state.studio.environments.find((entry) => entry.id === 'production')).toMatchObject({ stableVersion: 1, candidateVersion: null, canaryPercent: 0 });
    expect(state.releases.map((entry) => entry.version)).toEqual([1, 2]);
    const promotions = await configStore.listRecords('promotions', { limit: 50 });
    const rollback = promotions.items.find((entry) => entry.automatic);
    expect(rollback).toMatchObject({ environment: 'production', version: 1, reason: 'failure_rate_exceeded', observation: { sampleCount: 3, failureCount: 2, candidateVersion: 2 } });
    expect(state.audit.filter((event) => event.action === 'studio.environment.auto_rolled_back')).toHaveLength(1);
    await monitor.runOnce();
    expect((await configStore.read()).revision).toBe(state.revision);
  });
});
