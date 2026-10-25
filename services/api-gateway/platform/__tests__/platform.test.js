const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createPlatformRouter } = require('..');
const { ControlPlaneStore } = require('../../control-plane/store');
const { defaultConfig } = require('../../control-plane/config');
const { catalog, previewPackage } = require('../solutions');
const { assertProductionConfiguration, configurationChecks } = require('../configuration');
const { PlatformReadiness } = require('../readiness');
const secret = 'synthetic-platform-test-secret-0123456789';
const env = { NODE_ENV: 'production', JWT_SECRET: secret, SERVICING_SERVICE_TOKEN: 'synthetic-internal-test-secret-abcdef12345',
  CONTROL_PLANE_ENABLED: 'true', CONTROL_PLANE_DATABASE_URL: 'postgres://fixture.invalid/servicing', REDIS_URL: 'redis://fixture.invalid:6379',
  WORKFLOW_DURABLE_EXECUTION: 'true', HANDOFF_STORAGE: 'postgres', ALLOWED_ORIGINS: 'https://servicing.example.com' };
const token = (role = 'control_plane_editor', tenant = 'fixture') => jwt.sign({ userId: 'editor', roles: [role], tenantId: tenant, type: 'access' }, secret, { expiresIn: '5m' });
function fixture() {
  const store = new ControlPlaneStore({ file: null, tenantId: 'fixture' });
  const app = express(); app.use(express.json());
  app.use('/api/platform', createPlatformRouter({ configStore: store, env: { JWT_SECRET: secret }, readiness: { check: async () => ({ ready: false }) } }));
  return { app, store };
}
const call = (app, path, role) => request(app).post(`/api/platform${path}`).set('Authorization', `Bearer ${token(role)}`);
describe('governed reusable solution packages', () => {
  test('all built-in solutions validate through the actual servicing constraints', () => {
    for (const solution of catalog()) expect(previewPackage(defaultConfig(), solution).digest).toMatch(/^[a-f0-9]{64}$/);
  });
  test('preview is read-only; applying a reviewed package changes only the draft and records provenance', async () => {
    const { app, store } = fixture();
    const before = await store.read();
    const preview = await call(app, '/solutions/preview').send({ catalogId: 'service-desk' });
    expect(preview.status).toBe(200); expect(preview.body.diff.totalChanges).toBeGreaterThan(0);
    expect((await store.read()).revision).toBe(before.revision);
    const result = await call(app, '/solutions/apply').send({ catalogId: 'service-desk', revision: preview.body.revision,
      digest: preview.body.digest, baseFingerprint: preview.body.baseFingerprint, overwrite: false, note: 'Reviewed synthetic service desk' });
    expect(result.status).toBe(200); expect(result.body.published).toBe(false);
    const after = await store.read();
    expect(after.draft.intents.find(intent => intent.id === 'helpdesk_request')).toMatchObject({ baseIntent: 'service_request', needsConfirmation: true });
    expect(after.published).toEqual(before.published); expect(after.audit.at(-1)).toMatchObject({ action: 'solution.applied', solutionId: 'service-desk', packageDigest: preview.body.digest });
  });
  test('package authorship is preserved by the existing independent approval and publication gates', async () => {
    const { app, store } = fixture();
    const { createControlPlaneRouter } = require('../../control-plane');
    const { ensureStudio } = require('../../control-plane/studio-model');
    const control = createControlPlaneRouter({ store, jwtSecret: secret });
    app.use('/api/control-plane', control);
    try {
      await store.update(1, 'owner', 'governance.updated', current => {
        ensureStudio(current).governance.requireIndependentApproval = true;
      });
      const preview = (await call(app, '/solutions/preview', 'control_plane_admin').send({ catalogId: 'service-desk' })).body;
      const applied = await call(app, '/solutions/apply', 'control_plane_admin').send({ catalogId: 'service-desk', revision: preview.revision,
        digest: preview.digest, baseFingerprint: preview.baseFingerprint, overwrite: false, note: 'Independent package review required' });
      expect(applied.status).toBe(200);
      const self = path => request(app).post('/api/control-plane' + path).set('Authorization', `Bearer ${token('control_plane_admin')}`);
      expect((await self('/studio/approvals').send({ revision: applied.body.revision, note: 'Self approval rejected' })).status).toBe(409);
      expect((await self('/publish').send({ revision: applied.body.revision, note: 'Unapproved publication rejected' })).status).toBe(409);
      const reviewer = jwt.sign({ userId: 'reviewer', roles: ['control_plane_admin'], tenantId: 'fixture', type: 'access' }, secret, { expiresIn: '5m' });
      const approved = await request(app).post('/api/control-plane/studio/approvals').set('Authorization', `Bearer ${reviewer}`)
        .send({ revision: applied.body.revision, note: 'Independently reviewed solution content' });
      expect(approved.status).toBe(200);
      const published = await self('/publish').send({ revision: approved.body.revision, note: 'Publish independently reviewed package' });
      expect(published.status).toBe(200); expect(published.body.published.authoredBy).toBe('editor');
    } finally { await control.close(); }
  });
  test('modified packages, stale revisions and replacement conflicts cannot bypass review', async () => {
    const { app, store } = fixture();
    const config = (await store.read()).draft; config.intents[0].name = 'Changed name';
    await store.update(1, 'owner', 'draft.saved', state => { state.draft = config; });
    const preview = (await call(app, '/solutions/preview').send({ catalogId: 'banking-servicing' })).body;
    expect(preview.conflicts.length).toBeGreaterThan(0);
    const body = { catalogId: 'banking-servicing', revision: preview.revision, digest: preview.digest, baseFingerprint: preview.baseFingerprint, overwrite: false, note: 'Review' };
    expect((await call(app, '/solutions/apply').send(body)).status).toBe(409);
    expect((await call(app, '/solutions/apply').send({ ...body, overwrite: true, digest: 'forged' })).status).toBe(409);
    expect((await call(app, '/solutions/apply').send({ ...body, overwrite: true, revision: 1 })).status).toBe(409);
    expect((await call(app, '/solutions/apply').send({ ...body, overwrite: true })).status).toBe(200);
  });
  test('unknown tools, removed required financial fields, secrets, duplicate IDs and executable extensions are rejected', () => {
    const make = configuration => ({ schemaVersion: 1, manifest: { id: 'synthetic', name: 'Synthetic', version: '1.0.0', description: 'Synthetic contract' }, configuration });
    const transfer = defaultConfig().intents.find(intent => intent.id === 'transfer_funds');
    for (const configuration of [
      { intents: [{ ...transfer, tools: ['execute_arbitrary_api'] }] },
      { intents: [{ ...transfer, requiredData: [] }] },
      { prompts: { apiKey: 'should-never-be-accepted' } },
      { intents: [transfer, transfer] }, { scripts: ['execute()'] },
      { llm: { enabled: true, profiles: [{ baseUrl: 'http://injected.invalid' }] } }
    ]) expect(() => previewPackage(defaultConfig(), make(configuration))).toThrow();
  });
  test('signed tenant roles govern catalog, export, preview and apply', async () => {
    const { app } = fixture();
    expect((await request(app).get('/api/platform/catalog')).status).toBe(401);
    expect((await request(app).get('/api/platform/catalog').set('Authorization', `Bearer ${token('customer')}`)).status).toBe(403);
    expect((await request(app).get('/api/platform/catalog').set('Authorization', `Bearer ${token('control_plane_admin', 'other')}`)).status).toBe(403);
    expect((await call(app, '/solutions/preview', 'control_plane_viewer').send({ catalogId: 'service-desk' })).status).toBe(403);
    const exported = await request(app).get('/api/platform/solutions/export').set('Authorization', `Bearer ${token('control_plane_viewer')}`);
    expect(exported.status).toBe(200); expect(previewPackage(defaultConfig(), exported.body.package).diff.totalChanges).toBe(0);
  });
});
describe('production configuration and dependency readiness', () => {
  test('production rejects development defaults without echoing credentials or URLs', () => {
    expect(() => assertProductionConfiguration(env)).not.toThrow();
    expect(() => assertProductionConfiguration({ NODE_ENV: 'production', JWT_SECRET: 'dev-jwt-secret', SERVICING_SERVICE_TOKEN: 'sensitive-value' })).toThrow(/Production configuration failed/);
    const report = JSON.stringify(configurationChecks({ ...env, JWT_SECRET: 'sensitive-value' }));
    expect(report).not.toMatch(/sensitive-value|fixture.invalid/);
  });
  test.each(['JWT_SECRET', 'SERVICING_SERVICE_TOKEN', 'CONTROL_PLANE_DATABASE_URL', 'REDIS_URL', 'ALLOWED_ORIGINS'])(
    'missing %s fails production startup', key => expect(() => assertProductionConfiguration({ ...env, [key]: '' })).toThrow());
  test('readiness verifies storage and every dependency, caches concurrent requests and sanitizes failures', async () => {
    const configStore = { read: jest.fn(async () => ({})), pool: { query: jest.fn(async () => ({})) } };
    const operationsStore = { initialize: jest.fn(async () => {}), pool: { query: jest.fn(async () => ({})) } };
    const http = jest.fn(async () => ({ status: 200, data: { status: 'healthy' } }));
    const readiness = new PlatformReadiness({ configStore, operationsStore, env, request: http, redisStatus: () => ({ configured: true, connected: true }) });
    const reports = await Promise.all([readiness.check(), readiness.check()]);
    expect(reports[0].ready).toBe(true); expect(http).toHaveBeenCalledTimes(5);
    readiness.cached = null;
    http.mockRejectedValue(new Error('postgres://credential:secret@private-host'));
    const failed = await readiness.check(); expect(failed.ready).toBe(false); expect(JSON.stringify(failed)).not.toMatch(/credential|private-host/);
    expect(failed.checks.filter(check => check.status === 'failed')).toHaveLength(5);
  });
  test('HTML success responses and missing operational schema never report ready', async () => {
    const readiness = new PlatformReadiness({ configStore: { read: async () => ({}) },
      operationsStore: { initialize: async () => { throw new Error('Missing schema'); } }, env,
      request: async () => ({ status: 200, data: '<html>not a health contract</html>' }), redisStatus: () => ({ configured: true, connected: true }) });
    const result = await readiness.check(); expect(result.ready).toBe(false);
    expect(result.checks.filter(check => check.status === 'failed')).toHaveLength(6);
  });
  test('storage response deadlines stay bounded and repeated checks reuse a blocked probe', async () => {
    jest.useFakeTimers();
    try {
      const read = jest.fn(() => new Promise(() => {}));
      const readiness = new PlatformReadiness({ configStore: { read },
        operationsStore: { initialize: async () => {}, pool: { query: async () => ({}) } }, env,
        request: async () => ({ status: 200, data: { status: 'healthy' } }), redisStatus: () => ({ configured: true, connected: true }) });
      let pending = readiness.check();
      await jest.advanceTimersByTimeAsync(4001);
      expect((await pending).checks.find(check => check.id === 'control_plane_storage').status).toBe('failed');
      readiness.cached = null;
      pending = readiness.check();
      await jest.advanceTimersByTimeAsync(4001);
      expect((await pending).ready).toBe(false);
      expect(read).toHaveBeenCalledTimes(1);
    } finally { jest.useRealTimers(); }
  });
  test('package contract errors include repairable validation messages for the console', async () => {
    const { app } = fixture();
    const solution = catalog()[0];
    solution.configuration.intents.find(intent => intent.id === 'transfer_funds').requiredData = [];
    const result = await call(app, '/solutions/preview').send({ package: solution });
    expect(result.status).toBe(400);
    expect(result.body.errors.length).toBeGreaterThan(0);
    expect(result.body.errors).toEqual(result.body.details.errors);
  });
  test('public health contains only probe state while detailed readiness requires an operator', async () => {
    const app = express(); app.locals.platformReadiness = { check: async () => ({ ready: false, checkedAt: 'now', checks: [{ id: 'private-detail' }] }) };
    app.use('/health', require('../../routes/health'));
    expect((await request(app).get('/health/live')).status).toBe(200);
    const result = await request(app).get('/health/ready'); expect(result.status).toBe(503); expect(result.body).toEqual({ ready: false, checkedAt: 'now' });
  });
});
