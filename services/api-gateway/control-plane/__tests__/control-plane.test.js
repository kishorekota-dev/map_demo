const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { createControlPlaneRouter } = require('..');
const { ControlPlaneStore } = require('../store');
const { defaultConfig, validateConfig, resolveDecision, INTENT_CATALOG } = require('../config');

const SECRET = 'control-plane-integration-test-secret';
const token = (claims = {}) => jwt.sign({ userId: 'operator-a', role: 'admin', tenantId: 'tenant-a', type: 'access', ...claims }, SECRET, { expiresIn: '10m' });
function appFor(store = new ControlPlaneStore({ file: null, tenantId: 'tenant-a' })) {
  const app = express();
  app.use(express.json());
  app.use('/api/control-plane', createControlPlaneRouter({ store, jwtSecret: SECRET }));
  return app;
}
const base = '/api/control-plane';
const get = (app, url, claims) => request(app).get(base + url).set('Authorization', `Bearer ${token(claims)}`);
const post = (app, url, body, claims) => request(app).post(base + url).set('Authorization', `Bearer ${token(claims)}`).send(body);
const put = (app, body, claims) => request(app).put(base + '/draft').set('Authorization', `Bearer ${token(claims)}`).send(body);
const patch = (app, id, body, claims) => request(app).patch(base + '/work-items/' + id).set('Authorization', `Bearer ${token(claims)}`).send(body);

describe('control-plane authorization and isolation', () => {
  test('rejects missing, expired, refresh and unsigned credentials', async () => {
    const app = appFor();
    await request(app).get(base + '/state').expect(401);
    await get(app, '/state', { type: 'refresh' }).expect(401);
    await get(app, '/state', { userId: null }).expect(401);
    await request(app).get(base + '/state').set('Authorization', 'Bearer broken').expect(401);
    const expired = jwt.sign({ userId: 'operator-a', role: 'admin', exp: 1 }, SECRET);
    await request(app).get(base + '/state').set('Authorization', `Bearer ${expired}`).expect(401);
  });
  test('enforces signed roles and tenant over spoofed body/header values', async () => {
    const app = appFor();
    await get(app, '/state', { role: 'customer' }).set('X-Role', 'admin').expect(403);
    await post(app, '/publish', { revision: 1, note: 'spoof', role: 'admin' }, { role: 'customer' }).expect(403);
    await get(app, '/state', { tenantId: 'tenant-b' }).set('X-Tenant-ID', 'tenant-a').expect(403);
    await post(app, '/runtime/resolve', { channel: 'digital', intent: 'balance_inquiry', tenantId: 'tenant-a' }, { role: 'customer', tenantId: 'tenant-b' }).expect(403);
    const admin = await get(app, '/state', { role: undefined, roles: ['ADMIN'] }).expect(200);
    expect(admin.body.permissions).toMatchObject({ canEdit: true, canPublish: true, canOperate: true });
  });
  test('separates customer runtime, view, edit, publish and fulfillment access', async () => {
    const app = appFor();
    const config = defaultConfig();
    await get(app, '/runtime/config', { role: 'customer' }).expect(200);
    await get(app, '/state', { role: 'control_plane_viewer' }).expect(200);
    await put(app, { revision: 1, config }, { role: 'control_plane_viewer' }).expect(403);
    await put(app, { revision: 1, config }, { role: 'control_plane_editor' }).expect(200);
    await post(app, '/publish', { revision: 2, note: 'reviewed' }, { role: 'control_plane_editor' }).expect(403);
    await post(app, '/work-items', {}, { role: 'control_plane_editor' }).expect(403);
    await put(app, { revision: 2, config }, { role: 'control_plane_operator' }).expect(403);
  });
  test('does not use fallback JWT secrets when configuration is absent', async () => {
    const saved = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      const app = express();
      app.use(createControlPlaneRouter({ store: new ControlPlaneStore({ file: null }) }));
      await request(app).get('/state').expect(503);
    } finally { if (saved !== undefined) process.env.JWT_SECRET = saved; }
  });
});

describe('configuration governance and deterministic runtime', () => {
  test('keeps drafts separate, publishes immutable versions and rolls back as a new release', async () => {
    const app = appFor();
    const original = (await get(app, '/state')).body;
    const config = structuredClone(original.draft);
    config.channels[0].mode = 'human';
    config.intents[0].systemPrompt = 'A new reviewed assistant prompt.';
    const saved = (await put(app, { revision: original.revision, config }).expect(200)).body;
    expect(saved.revision).toBe(2);
    expect(saved.published.config).toEqual(original.published.config);
    expect(saved.audit[0]).toMatchObject({ actor: 'operator-a', tenantId: 'tenant-a', action: 'draft.updated' });
    const draftDecision = await post(app, '/simulate', { channel: 'digital', intent: 'balance_inquiry' }).expect(200);
    expect(draftDecision.body).toMatchObject({ action: 'human', version: null, source: 'draft' });
    const liveDecision = await post(app, '/runtime/resolve', { channel: 'digital', intent: 'balance_inquiry' }, { role: 'customer' }).expect(200);
    expect(liveDecision.body).toMatchObject({ action: 'automated', version: 1 });
    const published = (await post(app, '/publish', { revision: 2, note: 'Reviewed servicing change' }).expect(200)).body;
    expect(published.published.version).toBe(2);
    expect(published.releases[0]).toEqual(original.releases[0]);
    expect((await post(app, '/runtime/resolve', { channel: 'digital', intent: 'balance_inquiry' })).body.action).toBe('human');
    expect((await get(app, '/runtime/config?version=1')).body.config).toEqual(original.published.config);
    const restored = (await post(app, '/rollback', { revision: 3, version: 1, note: 'Restore previous channel policy' }).expect(200)).body;
    expect(restored.published).toMatchObject({ version: 3, restoredFrom: 1 });
    expect(restored.published.config).toEqual(original.published.config);
    expect(restored.releases[1].config.channels[0].mode).toBe('human');
    expect((await post(app, '/runtime/resolve', { channel: 'digital', intent: 'balance_inquiry', version: 2 })).body.action).toBe('human');
  });
  test('rejects concurrent lost updates and records only successful changes', async () => {
    const app = appFor();
    const a = defaultConfig(); const b = defaultConfig();
    a.channels[0].name = 'First editor'; b.channels[0].name = 'Second editor';
    const responses = await Promise.all([put(app, { revision: 1, config: a }), put(app, { revision: 1, config: b })]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const state = (await get(app, '/state')).body;
    expect(state.revision).toBe(2);
    expect(state.audit).toHaveLength(1);
    await post(app, '/publish', { revision: 1, note: 'Stale' }).expect(409);
  });
  test('enforces channel, intent and journey stops with stable queue decisions', async () => {
    const app = appFor(); const config = defaultConfig();
    config.intents.find((intent) => intent.id === 'balance_inquiry').enabled = false;
    config.journeys.find((journey) => journey.id === 'payments').enabled = false;
    config.journeys.find((journey) => journey.id === 'cards').fulfillment = 'human';
    await put(app, { revision: 1, config }).expect(200);
    await post(app, '/publish', { revision: 2, note: 'Policy gates' }).expect(200);
    for (const [channel, intent, action, reason] of [
      ['ivr', 'balance_inquiry', 'disabled', 'channel_disabled'],
      ['digital', 'balance_inquiry', 'disabled', 'intent_disabled'],
      ['digital', 'transfer_funds', 'disabled', 'journey_disabled'],
      ['ava', 'card_management', 'human', 'journey_requires_human'],
      ['digital', 'unrecognized_intent', 'disabled', 'intent_disabled']
    ]) {
      expect((await post(app, '/runtime/resolve', { channel, intent }).expect(200)).body).toMatchObject({ action, reason, version: 2 });
    }
    await post(app, '/runtime/resolve', { channel: 'fax', intent: 'help' }).expect(400);
    await get(app, '/runtime/config?version=99').expect(404);
    await get(app, '/runtime/config?version=NaN').expect(400);
  });
  test('requires a note and rejects invalid configuration without changing state', async () => {
    const app = appFor(); const config = defaultConfig();
    config.channels[0].queue = 'missing';
    const validation = await post(app, '/validate', { config }).expect(200);
    expect(validation.body.valid).toBe(false);
    await put(app, { revision: 1, config }).expect(400);
    await post(app, '/publish', { revision: 1 }).expect(400);
    expect((await get(app, '/state')).body.revision).toBe(1);
  });
  test('returns validation errors for malformed nested types without storage errors', async () => {
    const app = appFor();
    for (const value of [null, 1, true, [], { toString: 3 }]) {
      const config = defaultConfig();
      config.journeys[0].intents = [value];
      config.journeys[0].channels = [value];
      const response = await post(app, '/validate', { config }).expect(200);
      expect(response.body.valid).toBe(false);
      await put(app, { revision: 1, config }).expect(400);
      await patch(app, 'invalid', { revision: 1, status: value }).expect(400);
    }
    expect((await get(app, '/state')).body.revision).toBe(1);
  });
});

describe('complete intent catalog and guardrails', () => {
  test('simulation and workflow runtime use identical routing decisions for all canonical intents', () => {
    const { resolvePublishedRoute } = require('../../../ai-orchestrator/src/services/controlPlaneRuntime');
    const variants = [defaultConfig(), defaultConfig(), defaultConfig(), defaultConfig(), defaultConfig()];
    variants[1].channels[0].mode = 'human';
    variants[1].intents[0].enabled = false;
    variants[2].journeys[1].enabled = false;
    variants[2].journeys[2].fulfillment = 'human';
    variants[3].intents.forEach((intent) => { intent.tools = []; });
    variants[4].intents.find((intent) => intent.id === 'verify_transaction').tools = ['banking_get_fraud_alert'];
    for (const config of variants) for (const channel of ['digital', 'ava', 'ivr']) for (const intent of [...INTENT_CATALOG.map((entry) => entry.id), 'unknown']) {
      expect(resolveDecision(config, { channel, intent }, 7)).toEqual(resolvePublishedRoute({ version: 7, config }, channel, intent));
    }
  });
  test('matches canonical IDs, tool contracts and system prompts in the established architecture', () => {
    const config = require('../../../ai-orchestrator/config/intentConfig');
    const prompts = Object.assign({}, ...['account', 'transaction', 'card', 'security', 'support'].map((name) => require(`../../../ai-orchestrator/src/prompts/templates/${name}`)));
    expect(INTENT_CATALOG.map((intent) => intent.id).sort()).toEqual(config.getAllIntents().sort());
    for (const intent of INTENT_CATALOG) {
      expect(intent.tools).toEqual(config.getToolsForIntent(intent.id));
      expect(intent.requiredData).toEqual(config.getRequiredDataForIntent(intent.id));
      expect(intent.needsConfirmation).toBe(config.needsConfirmation(intent.id));
      expect(intent.systemPrompt).toBe(prompts[config.INTENT_PROMPTS[intent.id].systemPromptTemplate]);
    }
    expect(validateConfig(defaultConfig())).toEqual([]);
  });
  test.each([
    [(config) => { config.intents.find((intent) => intent.id === 'transfer_funds').needsConfirmation = false; }, 'confirmation'],
    [(config) => { config.intents.find((intent) => intent.id === 'transfer_funds').requiredData = []; }, 'required'],
    [(config) => { config.intents[0].tools.push('banking_transfer'); }, 'registered'],
    [(config) => { config.intents[0].userPromptTemplate = '{{authToken}}'; }, 'placeholder'],
    [(config) => { config.intents[0].userPromptTemplate = '${process.env.SECRET}'; }, 'placeholder'],
    [(config) => { config.intents.pop(); }, 'Every canonical'],
    [(config) => { config.journeys[1].intents.push('balance_inquiry'); }, 'duplicates'],
    [(config) => { config.journeys[0].slaMinutes = 0; }, 'slaMinutes'],
    [(config) => { config.channels[0].enabled = 'false'; }, 'boolean'],
    [(config) => { config.intents[0].requiredData.push('authToken'); }, 'unsupported'],
    [(config) => { config.prompts.extractionSystem = ''; }, 'extractionSystem'],
    [(config) => { config.prompts.extractionInstructions = 'a'.repeat(16001); }, 'extractionInstructions'],
    [(config) => { config.credentials = { key: 'secret' }; }, 'not supported']
  ])('rejects unsafe catalog/config changes', (mutate, match) => {
    const config = defaultConfig(); mutate(config);
    expect(validateConfig(config).join(' ')).toContain(match);
  });
});

describe('fulfillment lifecycle', () => {
  const input = { revision: 1, journeyId: 'accounts', channel: 'digital', reference: 'CASE-101', summary: 'Customer requires follow-up', idempotencyKey: 'case-101-created' };
  test('deduplicates retries, binds queue/SLA/release and enforces completion notes and terminal states', async () => {
    const app = appFor();
    const created = (await post(app, '/work-items', input, { role: 'control_plane_operator' }).expect(201)).body;
    const item = created.workItems[0];
    expect(item).toMatchObject({ status: 'queued', queue: 'general_servicing', slaMinutes: 60, version: 1, createdBy: 'operator-a' });
    expect(Date.parse(item.dueAt) - Date.parse(item.createdAt)).toBe(3600000);
    const retried = (await post(app, '/work-items', input).expect(200)).body;
    expect(retried.workItems).toHaveLength(1);
    expect(retried.revision).toBe(2);
    await post(app, '/work-items', { ...input, summary: 'Changed request' }).expect(409);
    await patch(app, item.id, { revision: 2, status: 'completed', note: 'Skipped' }).expect(409);
    const active = (await patch(app, item.id, { revision: 2, status: 'in_progress' }).expect(200)).body;
    expect(active.workItems[0].assignee).toBe('operator-a');
    await patch(app, item.id, { revision: 3, status: 'completed' }).expect(400);
    const done = (await patch(app, item.id, { revision: 3, status: 'completed', note: 'Resolved in the servicing system' }).expect(200)).body;
    expect(done.workItems[0].history).toHaveLength(3);
    await patch(app, item.id, { revision: 4, status: 'in_progress' }).expect(409);
    expect((await get(app, '/state')).body.audit.map((event) => event.action)).toEqual(['work_item.created', 'work_item.updated', 'work_item.updated']);
  });
  test('concurrent retries create one work item', async () => {
    const app = appFor();
    const responses = await Promise.all([post(app, '/work-items', input), post(app, '/work-items', input)]);
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect((await post(app, '/work-items', input).expect(200)).body.workItems).toHaveLength(1);
  });
  test('rechecks the idempotency key under the write lock after an optimistic lookup race', async () => {
    const store = new ControlPlaneStore({ file: null, tenantId: 'tenant-a' });
    const original = await store.read();
    const app = appFor(store);
    await post(app, '/work-items', input).expect(201);
    jest.spyOn(store, 'read').mockResolvedValueOnce(original);
    await post(app, '/work-items', { ...input, revision: 2 }).expect(409);
    expect((await store.read()).workItems).toHaveLength(1);
    expect((await store.read()).revision).toBe(2);
  });
});

describe('persistent state integrity', () => {
  let directory;
  beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'control-plane-')); });
  afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });
  test('restores published configuration, audit and work across a store restart', async () => {
    const file = path.join(directory, 'state.json');
    const app = appFor(new ControlPlaneStore({ file, tenantId: 'tenant-a' }));
    const config = defaultConfig(); config.intents[0].name = 'Reviewed balance assistance';
    await put(app, { revision: 1, config }).expect(200);
    await post(app, '/publish', { revision: 2, note: 'Approved release' }).expect(200);
    const restored = (await get(appFor(new ControlPlaneStore({ file, tenantId: 'tenant-a' })), '/state').expect(200)).body;
    expect(restored.published.config.intents[0].name).toBe('Reviewed balance assistance');
    expect(restored.audit).toHaveLength(2);
    expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
  });
  test('fails closed on corrupt storage or tenant mismatch', async () => {
    const file = path.join(directory, 'state.json');
    await fs.writeFile(file, '{broken');
    await get(appFor(new ControlPlaneStore({ file, tenantId: 'tenant-a' })), '/state').expect(503);
    expect(await fs.readFile(file, 'utf8')).toBe('{broken');
    await fs.unlink(file);
    await new ControlPlaneStore({ file, tenantId: 'tenant-b' }).read();
    await get(appFor(new ControlPlaneStore({ file, tenantId: 'tenant-a' })), '/state').expect(503);
  });
  test('does not acknowledge failed writes or advance revision', async () => {
    const store = new ControlPlaneStore({ file: null, tenantId: 'tenant-a' });
    await store.read();
    store.persist = jest.fn().mockRejectedValue(new Error('disk full'));
    await put(appFor(store), { revision: 1, config: defaultConfig() }).expect(503);
    expect((await store.read()).revision).toBe(1);
    expect((await store.read()).audit).toHaveLength(0);
  });
  test('fails closed when release metadata is corrupt despite valid configuration', async () => {
    const file = path.join(directory, 'state.json');
    const original = await new ControlPlaneStore({ file, tenantId: 'tenant-a' }).read();
    original.published.version = '1';
    await fs.writeFile(file, JSON.stringify(original));
    await get(appFor(new ControlPlaneStore({ file, tenantId: 'tenant-a' })), '/state').expect(503);
    expect(JSON.parse(await fs.readFile(file, 'utf8')).published.version).toBe('1');
  });
});
