const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { createControlPlaneRouter } = require('..');
const { ControlPlaneStore } = require('../store');
const { PostgresControlPlaneStore } = require('../postgres-store');
const { defaultConfig, validateConfig } = require('../config');
const { recognize } = require('../recognition');
const { fingerprint } = require('../studio-model');
const KEY = 'studio-integration-signing-key';
function setup(store = new ControlPlaneStore({ file: null, tenantId: 'studio-tenant' }), env = process.env) {
  const app = express(); app.use(express.json()); app.use(createControlPlaneRouter({ store, jwtSecret: KEY, env }));
  const call = (method, url, body, actor = 'editor-a', role = 'admin') => {
    const token = jwt.sign({ userId: actor, role, tenantId: store.tenantId, type: 'access' }, KEY, { expiresIn: '10m' });
    return request(app)[method](url).set('Authorization', `Bearer ${token}`).send(body);
  };
  return { call, store, app };
}
const suite = { id: 'balance-regression', name: 'Balance regression', description: 'Contract tests', cases: [{ id: 'balance', utterance: 'check balance', channel: 'digital', expectedIntent: 'balance_inquiry', expectedAction: 'automated', expectedTools: ['banking_get_accounts', 'banking_get_balance'], requiredFields: [] }] };
const document = (id, overrides = {}) => ({ id, title: 'Replacement policy', content: 'Replacement cards arrive in five working days.', source: 'https://help.example/card-replacement', allowedRoles: ['customer'], expiresAt: null, status: 'published', ...overrides });

describe('provider-neutral control-plane studio', () => {
  test('custom intents inherit contract floors and generic bases cannot acquire banking tools', () => {
    const config = defaultConfig();
    const generic = { ...config.intents.find((entry) => entry.id === 'help'), id: 'mortgage_callback', baseIntent: 'service_request', name: 'Mortgage callback', patterns: ['mortgage callback'], requiredData: ['callbackNumber'] };
    config.intents.push(generic);
    config.journeys[4].intents.push(generic.id);
    expect(validateConfig(config)).toEqual([]);
    generic.tools = ['banking_create_transfer'];
    expect(validateConfig(config).join(' ')).toContain('registered tools');
    generic.tools = [];
    generic.baseIntent = 'transfer_funds';
    expect(validateConfig(config).join(' ')).toContain('confirmation');
    config.intents[0].baseIntent = 'service_request';
    expect(validateConfig(config).join(' ')).toContain('canonical intent');
  });
  test('vendor recognition exactly matches runtime for lexical, ambiguous and external cases', () => {
    const runtime = require('../../../ai-orchestrator/src/services/recognition');
    const config = defaultConfig();
    config.recognition = { strategy: 'lexical', confidenceThreshold: 0.65, ambiguityMargin: 0.12, ambiguityAction: 'clarify', synonyms: {} };
    for (const utterance of ['How much cash do I have left?', 'temporarily freeze the plastic', 'move fifty dollars between accounts', 'replace card', 'purple giraffe']) {
      expect(recognize(config, utterance)).toEqual(runtime.recognize(config, utterance));
    }
    config.recognition.strategy = 'external';
    expect(recognize(config, 'purple giraffe', { candidates: [{ intent: 'help', confidence: 0.92 }] })).toEqual(runtime.recognize(config, 'purple giraffe', { candidates: [{ intent: 'help', confidence: 0.92 }] }));
    const malformed = { candidates: [null, 3, 'help', { intent: 'help', confidence: 0.99 }, { intent: 'help', confidence: 0.2 }] };
    expect(recognize(config, 'purple giraffe', malformed)).toMatchObject({ intent: 'help', confidence: 0.99 });
    expect(recognize(config, 'purple giraffe', malformed)).toEqual(runtime.recognize(config, 'purple giraffe', malformed));
  });
  test('custom alias and generic routes share the runtime validation and fulfillment contract', () => {
    const { validateSnapshot, resolvePublishedRoute } = require('../../../ai-orchestrator/src/services/controlPlaneRuntime');
    const { resolveDecision } = require('../config');
    const config = defaultConfig();
    for (const [id, base] of [['mortgage_payment', 'transfer_funds'], ['delivery_case', 'service_request'], ['help_article', 'knowledge_search']]) {
      const prototype = config.intents.find((entry) => entry.id === base) || config.intents.find((entry) => entry.id === 'help');
      config.intents.push({ ...structuredClone(prototype), id, baseIntent: base });
    }
    expect(validateConfig(config)).toEqual([]);
    expect(() => validateSnapshot({ version: 2, config })).not.toThrow();
    for (const intent of ['mortgage_payment', 'delivery_case', 'help_article']) {
      expect(resolveDecision(config, { channel: 'digital', intent }, 2)).toEqual(resolvePublishedRoute({ version: 2, config }, 'digital', intent));
    }
    config.intents.find((entry) => entry.id === 'mortgage_payment').tools = [];
    expect(resolveDecision(config, { channel: 'digital', intent: 'mortgage_payment' }, 2)).toMatchObject({ action: 'disabled', reason: 'fulfillment_disabled' });
  });
  test('typed field contracts and response wording are configurable without arbitrary schema keys', () => {
    const config = defaultConfig();
    config.prompts.clarificationText = 'Which servicing request can we help with?';
    const intent = config.intents.find((entry) => entry.id === 'transfer_funds');
    intent.confirmationMessage = 'Please review this requested transfer.';
    intent.fieldSchemas = { amount: { type: 'number', min: 10, max: 1000 }, fromAccountId: { type: 'string', minLength: 2, maxLength: 100 } };
    expect(validateConfig(config)).toEqual([]);
    intent.fieldSchemas.amount.enum = ['not a number'];
    expect(validateConfig(config).join(' ')).toContain('enum must match');
    delete intent.fieldSchemas.amount.enum;
    intent.fieldSchemas.authToken = { type: 'string' };
    expect(validateConfig(config).join(' ')).toContain('not a declared entity');
  });
  test('semantic release diff ignores identity-array reorder and pinpoints changed policy fields', async () => {
    const { call } = setup(); const config = defaultConfig();
    config.intents.reverse(); config.channels[0].mode = 'human';
    await call('put', '/draft', { revision: 1, config }).expect(200);
    const result = (await call('get', '/studio/diff?fromVersion=1&toVersion=draft').expect(200)).body;
    expect(result.totalChanges).toBe(1);
    expect(result.changes).toEqual([{ path: 'channels[digital].mode', kind: 'changed', before: 'automated', after: 'human' }]);
    await call('get', '/studio/diff?fromVersion=999').expect(404);
  });
  test('only trusted recent canary observations trigger atomic rollback after the configured threshold', async () => {
    const { call, app, store } = setup(undefined, { SERVICING_SERVICE_TOKEN: 'trusted-rollout-monitor' });
    const config = defaultConfig(); config.channels[0].name = 'Candidate';
    await call('put', '/draft', { revision: 1, config }).expect(200);
    await call('post', '/publish', { revision: 2, note: 'Canary release' }).expect(200);
    await call('post', '/studio/promote', { revision: 3, environment: 'production', version: 2, canaryPercent: 25, note: 'Staged rollout' }).expect(200);
    await call('put', '/studio/rollout-policy', { revision: 4, policy: { enabled: true, minSamples: 20, maxFailureRate: 0.2, windowMinutes: 15 } }).expect(200);
    const observation = { environment: 'production', candidateVersion: 2, sampleCount: 20, failureCount: 5, windowStart: new Date(Date.now() - 15 * 60000).toISOString(), windowEnd: new Date().toISOString() };
    await call('post', '/runtime/rollout/observe', observation).expect(403);
    const observe = (body) => request(app).post('/runtime/rollout/observe').set('X-Servicing-Service-Token', 'trusted-rollout-monitor').send(body);
    expect((await observe({ ...observation, sampleCount: 10, failureCount: 5 }).expect(200)).body).toMatchObject({ rolledBack: false, reason: 'insufficient_samples' });
    expect((await store.read()).revision).toBe(5);
    await observe({ ...observation, windowEnd: '2000-01-01T00:00:00Z' }).expect(400);
    const result = (await observe(observation).expect(200)).body;
    expect(result).toMatchObject({ rolledBack: true, revision: 6, environment: { id: 'production', stableVersion: 1, candidateVersion: null } });
    await observe(observation).expect(409);
    const studio = (await call('get', '/studio/state')).body;
    expect(studio.promotions.find((entry) => entry.automatic)).toMatchObject({ reason: 'failure_rate_exceeded', observation: { failureRate: 0.25 } });
  });
  test('evaluation gate binds the exact config and current suite, with side-effect-free multi-turn results', async () => {
    const { call } = setup(); let revision = 1;
    const definition = structuredClone(suite);
    definition.cases[0].steps = [{ utterance: 'yes', expectedIntent: 'balance_inquiry', expectedAction: 'automated', continueIntent: true }];
    const created = await call('put', '/studio/suites/balance-regression', { revision, suite: definition }).expect(200); revision = created.body.revision;
    const governance = { requireEvaluationForPublish: true, requireIndependentApproval: false, requiredSuiteIds: [suite.id] };
    revision = (await call('put', '/studio/governance', { revision, governance }).expect(200)).body.revision;
    await call('post', '/publish', { revision, note: 'Must be evaluated' }).expect(409);
    const evaluated = (await call('post', '/studio/evaluations', { revision, suiteId: suite.id, source: 'draft' }).expect(200)).body; revision = evaluated.revision;
    expect(evaluated.evaluations[0]).toMatchObject({ passed: true, passedCases: 1, totalCases: 1, scope: 'contract_simulation' });
    expect(evaluated.evaluations[0].results).toBeUndefined();
    const detailed = (await call('get', `/studio/evaluations/${evaluated.evaluations[0].id}`).expect(200)).body;
    expect(detailed.results[0].steps).toHaveLength(2);
    expect(detailed.results[0].steps[1].actual.recognition.source).toBe('continuation');
    expect(detailed.results[0].steps[0].actual.externalProviderExecuted).toBe(false);
    revision = (await call('post', '/publish', { revision, note: 'Regression passed' }).expect(200)).body.revision;
    const config = defaultConfig(); config.intents[0].systemPrompt += '\nA revised prompt.';
    revision = (await call('put', '/draft', { revision, config }).expect(200)).body.revision;
    await call('post', '/publish', { revision, note: 'Stale test cannot pass' }).expect(409);
    expect((await call('get', '/studio/state')).body.configDigest).toBe(fingerprint(config));
  });
  test('a changed suite invalidates a formerly passing evaluation', async () => {
    const { call } = setup();
    await call('put', `/studio/suites/${suite.id}`, { revision: 1, suite }).expect(200);
    await call('post', '/studio/evaluations', { revision: 2, suiteId: suite.id, source: 'draft' }).expect(200);
    const changed = { ...suite, cases: [{ ...suite.cases[0], expectedIntent: 'help' }] };
    await call('put', `/studio/suites/${suite.id}`, { revision: 3, suite: changed }).expect(200);
    await call('put', '/studio/governance', { revision: 4, governance: { requireEvaluationForPublish: true, requireIndependentApproval: false, requiredSuiteIds: [suite.id] } }).expect(200);
    await call('post', '/publish', { revision: 5, note: 'Old test is stale' }).expect(409);
  });
  test('independent approval is digest-bound and cannot be self-approved', async () => {
    const { call } = setup(); const config = defaultConfig();
    await call('put', '/draft', { revision: 1, config }).expect(200);
    await call('put', '/studio/governance', { revision: 2, governance: { requireEvaluationForPublish: false, requireIndependentApproval: true, requiredSuiteIds: [] } }).expect(200);
    await call('post', '/studio/approvals', { revision: 3, note: 'Self approve' }).expect(409);
    await call('post', '/publish', { revision: 3, note: 'No independent approval' }).expect(409);
    const approval = (await call('post', '/studio/approvals', { revision: 3, note: 'Independently reviewed' }, 'reviewer-b').expect(200)).body;
    expect(approval.approvals[0]).toMatchObject({ approvedBy: 'reviewer-b', authoredBy: 'editor-a', fingerprint: fingerprint(config) });
    await call('post', '/publish', { revision: 4, note: 'Publish reviewed configuration' }, 'reviewer-b').expect(200);
    await call('post', '/studio/promote', { revision: 5, environment: 'production', version: 2, note: 'Promote reviewed release' }, 'reviewer-b').expect(200);
    config.intents[0].name = 'Changed after approval';
    await call('put', '/draft', { revision: 6, config }).expect(200);
    await call('post', '/publish', { revision: 7, note: 'Stale approval' }).expect(409);
  });
  test('environments promote independently and choose deterministic authenticated canary cohorts', async () => {
    const { call } = setup(); const config = defaultConfig(); config.channels[0].name = 'Candidate digital';
    await call('put', '/draft', { revision: 1, config }).expect(200);
    await call('post', '/publish', { revision: 2, note: 'New candidate' }).expect(200);
    expect((await call('get', '/runtime/config?environment=production', undefined, 'customer-a', 'customer')).body.version).toBe(1);
    await call('post', '/studio/promote', { revision: 3, environment: 'production', version: 2, canaryPercent: 50, note: 'Half cohort' }).expect(200);
    const assigned = await Promise.all(Array.from({ length: 20 }, (_, index) => call('get', '/runtime/config?environment=production', undefined, `customer-${index}`, 'customer')));
    expect(new Set(assigned.map((response) => response.body.version))).toEqual(new Set([1, 2]));
    const again = await call('get', '/runtime/config?environment=production', undefined, 'customer-0', 'customer');
    expect(again.body.version).toBe(assigned[0].body.version);
    await call('post', '/studio/promote', { revision: 4, environment: 'production', version: 2, note: 'Full rollout' }).expect(200);
    expect((await call('get', '/runtime/config?environment=production')).body.version).toBe(2);
    await call('post', '/studio/promote', { revision: 5, environment: 'production', version: 1, note: 'Roll back deployment' }).expect(200);
    expect((await call('get', '/runtime/config?environment=production')).body.version).toBe(1);
    expect((await call('get', '/state')).body.releases).toHaveLength(2);
    expect((await call('get', '/studio/state')).body.promotions).toHaveLength(3);
  });
  test('knowledge retrieval filters roles and expiry before ranking and retains published content during draft edits', async () => {
    const { call } = setup();
    const docs = [document('public-guide'), document('restricted-guide', { allowedRoles: ['fraud_team'], content: 'Replacement top secret fraud investigation.' }), document('expired-guide', { expiresAt: '2000-01-01T00:00:00Z' }), document('draft-guide', { status: 'draft' })];
    await call('post', '/studio/knowledge/import', { revision: 1, documents: docs }).expect(200);
    const search = await call('post', '/runtime/knowledge/search', { query: 'replacement' }, 'customer-a', 'customer').expect(200);
    expect(search.body.matches.map((entry) => entry.id)).toEqual(['public-guide']);
    expect(search.body.matches[0]).toMatchObject({ source: 'https://help.example/card-replacement', version: 1 });
    await call('put', '/studio/knowledge/public-guide', { revision: 2, document: document('public-guide', { status: 'draft', content: 'Unreleased replacement terms.' }) }).expect(200);
    expect((await call('post', '/runtime/knowledge/search', { query: 'replacement' }, 'customer-a', 'customer')).body.matches[0].content).toContain('five working days');
    await call('put', '/studio/knowledge/public-guide', { revision: 3, document: document('public-guide', { status: 'archived' }) }).expect(200);
    expect((await call('post', '/runtime/knowledge/search', { query: 'replacement' }, 'customer-a', 'customer')).body.matches).toEqual([]);
    expect((await call('get', '/studio/knowledge/public-guide/versions')).body.total).toBe(3);
    await call('post', '/studio/knowledge/import', { revision: 4, documents: [document('admin-needed')] }, 'editor-c', 'control_plane_editor').expect(403);
    await call('post', '/studio/knowledge/import', { revision: 4, documents: [document('unsafe-source', { source: ' javascript:alert(1)' })] }).expect(400);
  });
  test('pagination is bounded and operator state never includes studio record payloads', async () => {
    const { call, store } = setup();
    await store.update(1, 'system', 'test.seed', async (state, records) => {
      for (let i = 0; i < 60; i += 1) await records.put('evaluations', `evaluation-${String(i).padStart(2, '0')}`, { id: `evaluation-${String(i).padStart(2, '0')}`, passed: true, results: ['full detail'], createdAt: new Date(1000 + i).toISOString() });
    });
    const studio = (await call('get', '/studio/state')).body;
    expect(studio.evaluations).toHaveLength(50); expect(studio.pagination.evaluations.total).toBe(60);
    expect(studio.evaluations[0].results).toBeUndefined();
    expect((await call('get', '/studio/evaluations?offset=50&limit=10')).body.items).toHaveLength(10);
    await call('get', '/studio/evaluations?limit=500').expect(400);
    expect((await call('get', '/state')).body.studioRecords).toBeUndefined();
    await call('get', '/studio/state', undefined, 'customer-a', 'customer').expect(403);
  });
});

const databaseUrl = process.env.TEST_CONTROL_PLANE_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('normalized PostgreSQL studio records', () => {
  let store; let call;
  beforeAll(() => { store = new PostgresControlPlaneStore({ databaseUrl, tenantId: `studio-test-${randomUUID()}` }); ({ call } = setup(store)); });
  afterAll(async () => { if (store) { await store.pool.query('DELETE FROM servicing_control_plane_state WHERE tenant_id=$1', [store.tenantId]); await store.close(); } });
  test('stores documents and evaluations separately, retrieves role-safe citations, and rolls back failed imports', async () => {
    await call('post', '/studio/knowledge/import', { revision: 1, documents: [document('published-policy'), document('restricted-policy', { allowedRoles: ['admin'] })] }).expect(200);
    await call('put', `/studio/suites/${suite.id}`, { revision: 2, suite }).expect(200);
    await call('post', '/studio/evaluations', { revision: 3, suiteId: suite.id, source: 'draft' }).expect(200);
    const state = await store.read();
    expect(state.studioRecords).toBeUndefined();
    const count = await store.pool.query('SELECT count(*)::int AS count FROM servicing_control_plane_records WHERE tenant_id=$1', [store.tenantId]);
    expect(count.rows[0].count).toBeGreaterThanOrEqual(8);
    const found = await call('post', '/runtime/knowledge/search', { query: 'replacement' }, 'customer-a', 'customer').expect(200);
    expect(found.body.matches.map((entry) => entry.id)).toEqual(['published-policy']);
    await expect(store.update(4, 'admin-a', 'failed_import', async (next, records) => {
      await records.put('knowledge', 'must-rollback', { id: 'must-rollback' });
      throw new Error('Connector document rejected');
    })).rejects.toThrow('Connector document rejected');
    expect(await store.getRecord('knowledge', 'must-rollback')).toBeNull();
    expect((await store.read()).revision).toBe(4);
  }, 20000);
});
