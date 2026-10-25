const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createControlPlaneRouter } = require('..');
const { ControlPlaneStore } = require('../store');
const { defaultConfig, validateConfig } = require('../config');
const { simulateUtterance } = require('../studio');
const { fingerprint } = require('../studio-model');
const { recognize } = require('../recognition');

const SECRET = 'llm-profile-governance-test-key';
function setup() {
  const store = new ControlPlaneStore({ file: null, tenantId: 'llm-test' });
  const app = express(); app.use(express.json());
  app.use(createControlPlaneRouter({ store, jwtSecret: SECRET }));
  return (method, url, body, actor = 'author') => request(app)[method](url)
    .set('Authorization', `Bearer ${jwt.sign({ userId: actor, role: 'admin', tenantId: 'llm-test', type: 'access' }, SECRET, { expiresIn: '10m' })}`).send(body);
}

describe('governed model profiles', () => {
  test('new deployment starts with disabled example profiles; historical configurations remain valid', () => {
    const config = defaultConfig();
    expect(validateConfig(config)).toEqual([]);
    expect(config.llm).toMatchObject({ enabled: false, profiles: [{ id: 'local-qwen', providerId: 'mac-qwen', model: 'qwen3.5:latest' }] });
    delete config.llm; delete config.prompts.recognitionSystem;
    expect(validateConfig(config)).toEqual([]);
  });

  test.each([
    ['top-level credential', (c) => { c.llm.apiKey = 'must-not-be-published'; }],
    ['profile endpoint', (c) => { c.llm.profiles[0].baseUrl = 'http://mac-studio.local:11434'; }],
    ['URL model', (c) => { c.llm.profiles[0].model = 'https://models.example/model'; }],
    ['invalid provider', (c) => { c.llm.profiles[0].providerId = '../provider'; }],
    ['duplicate profile', (c) => { c.llm.profiles.push({ ...c.llm.profiles[0] }); }],
    ['null profile', (c) => { c.llm.profiles.push(null); }],
    ['null routing', (c) => { c.llm.routing = null; }],
    ['unknown task', (c) => { c.llm.routing.execute = 'local-qwen'; }],
    ['unknown profile', (c) => { c.llm.routing.extraction = 'missing'; }],
    ['missing override', (c) => { c.intents[0].llmProfileId = 'missing'; }],
    ['missing profiles', (c) => { c.llm = { enabled: true, profiles: [], routing: {} }; }],
    ['empty routes', (c) => { c.llm.enabled = true; c.llm.routing = {}; }],
    ['temperature below bound', (c) => { c.llm.profiles[0].temperature = -0.1; }],
    ['temperature above bound', (c) => { c.llm.profiles[0].temperature = 2.1; }],
    ['fractional token count', (c) => { c.llm.profiles[0].maxOutputTokens = 2.5; }],
    ['token count above bound', (c) => { c.llm.profiles[0].maxOutputTokens = 8193; }],
    ['deadline below bound', (c) => { c.llm.profiles[0].timeoutMs = 999; }],
    ['deadline above bound', (c) => { c.llm.profiles[0].timeoutMs = 120001; }],
    ['blank recognition prompt', (c) => { c.prompts.recognitionSystem = ' '; }],
    ['oversized recognition prompt', (c) => { c.prompts.recognitionSystem = 'x'.repeat(16001); }]
  ])('rejects %s without throwing on malformed JSON values', (name, alter) => {
    const config = defaultConfig(); alter(config);
    expect(validateConfig(config).length).toBeGreaterThan(0);
  });

  test('model recognition requires an enabled task profile, and legacy intent overrides need a declared profile', () => {
    const config = defaultConfig(); config.recognition.strategy = 'llm';
    expect(validateConfig(config).join(' ')).toContain('recognition task profile');
    config.llm.enabled = true;
    expect(validateConfig(config)).toEqual([]);
    delete config.llm.routing.recognition;
    expect(validateConfig(config).join(' ')).toContain('recognition task profile');
    config.recognition.strategy = 'lexical'; config.intents[0].llmProfileId = 'local-qwen';
    config.llm.routing = {};
    expect(validateConfig(config)).toEqual([]);
    delete config.llm;
    expect(validateConfig(config).join(' ')).toContain('requires an llm profile');
  });

  test('simulation identifies configured task models but does not test provider execution', () => {
    const config = defaultConfig(); config.llm.enabled = true; config.recognition.strategy = 'llm';
    config.llm.profiles.push({ ...config.llm.profiles[0], id: 'intent-model', providerId: 'vertex-gemini', model: 'gemini-example' });
    config.intents.find((entry) => entry.id === 'balance_inquiry').llmProfileId = 'intent-model';
    expect(validateConfig(config)).toEqual([]);
    const result = simulateUtterance(config, { utterance: 'How much cash do I have left?', channel: 'digital' }, 2);
    expect(result).toMatchObject({ intent: 'balance_inquiry', scope: 'contract_simulation', externalProviderExecuted: false, modelProfilesTested: false, recognition: { source: 'lexical_fallback' }, configuredModelProfiles: {
      generation: { profileId: 'intent-model', providerId: 'vertex-gemini' },
      extraction: { profileId: 'local-qwen', providerId: 'mac-qwen' },
      recognition: { profileId: 'local-qwen', providerId: 'mac-qwen' }
    } });
    config.llm.enabled = false; config.recognition.strategy = 'lexical';
    expect(simulateUtterance(config, { utterance: 'check balance' }, 2).configuredModelProfiles).toEqual({});
  });

  test('the vendored recognition implementation shares model candidate validation with the runtime', () => {
    const runtime = require('../../../ai-orchestrator/src/services/recognition');
    const config = defaultConfig(); config.llm.enabled = true; config.recognition.strategy = 'llm';
    const candidates = { candidates: [null, { intent: 'not_published', confidence: 1 }, { intent: 'help', confidence: 0.99 }, { intent: 'help', confidence: 0.2 }] };
    expect(recognize(config, 'customer request', candidates)).toMatchObject({ intent: 'help', confidence: 0.99, source: 'llm' });
    expect(recognize(config, 'customer request', candidates)).toEqual(runtime.recognize(config, 'customer request', candidates));
    expect(recognize(config, 'purple giraffe')).toEqual(runtime.recognize(config, 'purple giraffe'));
  });

  test('profile edits invalidate both exact-release gates and leave prior published model settings pinned', async () => {
    const call = setup(); let revision = 1;
    const config = defaultConfig(); config.llm.enabled = true;
    const suite = { id: 'model-contract', name: 'Routing contract', cases: [{ id: 'balance', utterance: 'check balance', channel: 'digital', expectedIntent: 'balance_inquiry', expectedAction: 'automated' }] };
    const mutate = async (method, url, body, actor) => {
      const result = await call(method, url, { revision, ...body }, actor).expect(200);
      revision = result.body.revision; return result.body;
    };
    await mutate('put', '/draft', { config });
    expect((await call('post', '/simulate', { channel: 'digital', intent: 'balance_inquiry' }).expect(200)).body).toMatchObject({ scope: 'contract_simulation', modelProfilesTested: false, configuredModelProfiles: { generation: { profileId: 'local-qwen' } } });
    await mutate('put', '/studio/suites/model-contract', { suite });
    await mutate('put', '/studio/governance', { governance: { requireEvaluationForPublish: true, requireIndependentApproval: true, requiredSuiteIds: [suite.id] } });
    const evaluated = await mutate('post', '/studio/evaluations', { suiteId: suite.id, source: 'draft' });
    expect(evaluated.evaluations[0]).toMatchObject({ passed: true, fingerprint: fingerprint(config), modelProfilesTested: false });
    await mutate('post', '/studio/approvals', { note: 'Profile settings reviewed' }, 'reviewer');
    await mutate('post', '/publish', { note: 'Publish configured model routes' });
    const publishedConfig = structuredClone(config);
    config.llm.profiles[0].model = 'another-qwen-model';
    expect(fingerprint(config)).not.toBe(fingerprint(publishedConfig));
    await mutate('put', '/draft', { config });
    const staleEvaluation = await call('post', '/publish', { revision, note: 'Old evaluation is stale' }).expect(409);
    expect(staleEvaluation.body.error).toContain('passing evaluation');
    await mutate('post', '/studio/evaluations', { suiteId: suite.id, source: 'draft' });
    const staleApproval = await call('post', '/publish', { revision, note: 'Old approval is stale' }).expect(409);
    expect(staleApproval.body.error).toContain('independent approval');
    expect((await call('get', '/runtime/config?version=2').expect(200)).body.config).toEqual(publishedConfig);
    expect((await call('get', '/runtime/config?version=1').expect(200)).body.config.llm.enabled).toBe(false);
    await mutate('post', '/studio/approvals', { note: 'New exact profile reviewed' }, 'reviewer');
    await mutate('post', '/publish', { note: 'Publish changed model' });
    expect((await call('get', '/runtime/config?version=3').expect(200)).body.config.llm).toEqual(config.llm);
  });
});
