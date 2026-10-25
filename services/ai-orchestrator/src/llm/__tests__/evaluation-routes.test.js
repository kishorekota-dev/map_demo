const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { randomUUID, createHash } = require('crypto');
const { authenticate } = require('../../middleware/auth');
const { createEvaluationRouter, extractionMessages } = require('../evaluation-routes');
const { ProviderRegistry } = require('../registry');
const { LlmError } = require('../errors');
const { defaultConfig } = require('../../../../api-gateway/control-plane/config');
const secret = 'synthetic-evaluation-route-secret';
const serviceToken = 'synthetic-evaluation-internal-service';
const runId = randomUUID();
const env = { JWT_SECRET: secret, SERVICING_SERVICE_TOKEN: serviceToken };
const token = overrides => jwt.sign({ userId: 'authorized-editor', tenantId: 'default-enterprise', roles: ['control_plane_editor'], type: 'access', purpose: 'quality_evaluation', runId, aud: 'servicing-quality', ...overrides }, secret, { expiresIn: '3m' });
const body = () => ({ runId, caseId: 'fixture_case', providerId: 'fixture', request: { model: 'fixture-model', temperature: 0, maxOutputTokens: 32, timeoutMs: 1000, format: 'text', messages: [{ role: 'system', content: 'Reply READY.' }, { role: 'user', content: 'Synthetic probe.' }] } });
function app(registry, environment = env) {
  const server = express(); server.use(express.json()); server.use('/api/orchestrator/llm', authenticate, createEvaluationRouter({ registry, env: environment }));
  server.get('/api/orchestrator/llm/providers', authenticate, (_req, res) => res.json({ providers: [] }));
  server.post('/api/orchestrator/process', authenticate, (_req, res) => res.json({ processed: true }));
  return server;
}
const invoke = (server, payload = body(), bearer = token(), trusted = serviceToken) => request(server).post('/api/orchestrator/llm/evaluate').set('Authorization', `Bearer ${bearer}`).set('X-Servicing-Service-Token', trusted).send(payload);
describe('scoped internal synthetic model evaluation', () => {
  const previous = {};
  beforeAll(() => { for (const key of ['JWT_SECRET', 'DEPLOYMENT_TENANT_ID']) previous[key] = process.env[key]; process.env.JWT_SECRET = secret; process.env.DEPLOYMENT_TENANT_ID = 'default-enterprise'; });
  afterAll(() => { for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  test('requires editor delegation and trusted service identity together', async () => {
    const registry = { generate: jest.fn() }; const server = app(registry);
    await request(server).post('/api/orchestrator/llm/evaluate').send(body()).expect(401);
    await invoke(server, body(), token(), '').expect(403);
    await invoke(server, body(), token({ purpose: undefined, aud: undefined })).expect(403);
    await invoke(server, body(), token({ roles: ['customer'] })).expect(403);
    await invoke(server, { ...body(), runId: randomUUID() }).expect(403);
    await invoke(server, body(), token({ tenantId: 'other-tenant' })).expect(403);
    expect(registry.generate).not.toHaveBeenCalled();
  });
  test('delegated tokens cannot be reused on workflow or provider-management endpoints', async () => {
    const server = app({ generate: jest.fn() });
    await request(server).get('/api/orchestrator/llm/providers').set('Authorization', `Bearer ${token()}`).expect(403);
    await request(server).post('/api/orchestrator/process').set('Authorization', `Bearer ${token()}`).send({}).expect(403);
    await invoke(server, body(), token({ aud: 'wrong-audience' })).expect(403);
  });
  test('production refuses synthetic evaluation even with valid editor delegation and service identity', async () => {
    const registry = { generate: jest.fn() };
    const result = await invoke(app(registry, { ...env, NODE_ENV: 'production' })).expect(403);
    expect(result.body.error.code).toBe('LLM_EVALUATION_DISABLED');
    expect(registry.generate).not.toHaveBeenCalled();
  });
  test('bounded pinned request is executed once and prompt evidence is returned', async () => {
    const registry = { generate: jest.fn(async (providerId, input) => ({ providerId, model: input.model, text: 'READY', usage: { totalTokens: 5 }, latencyMs: 2 })) };
    const result = await invoke(app(registry)).expect(200);
    expect(registry.generate).toHaveBeenCalledTimes(1); expect(registry.generate).toHaveBeenCalledWith('fixture', body().request);
    expect(result.body.promptFingerprint).toBe(createHash('sha256').update(JSON.stringify({ messages: body().request.messages, format: 'text' })).digest('hex'));
    expect(result.body.usage.totalTokens).toBe(5);
  });
  test('unknown provider registry never attempts a network call or cloud fallback', async () => {
    const http = { request: jest.fn() }; const registry = new ProviderRegistry({ providers: [] }, { env: {}, http });
    const result = await invoke(app(registry)).expect(503);
    expect(result.body.error.code).toBe('LLM_PROVIDER_UNAVAILABLE'); expect(http.request).not.toHaveBeenCalled();
  });
  test('rejects arbitrary URL fields, excessive deadlines and message roles before generation', async () => {
    const registry = { generate: jest.fn() }; const server = app(registry);
    await invoke(server, { ...body(), endpoint: 'http://untrusted.invalid' }).expect(400);
    const deadline = body(); deadline.request.timeoutMs = 120001; await invoke(server, deadline).expect(400);
    const messages = body(); messages.request.messages[0].role = 'assistant'; await invoke(server, messages).expect(400);
    const long = body(); long.request.messages[1].content = 'x'.repeat(64001); await invoke(server, long).expect(400);
    expect(registry.generate).not.toHaveBeenCalled();
  });
  test('canonical extraction uses pinned instructions, intent schema and JSON format without invoking workflow/tools', async () => {
    const config = defaultConfig(); const intent = config.intents.find(item => item.id === 'transfer_funds');
    const extraction = { intent, prompts: { extractionSystem: 'Pinned extraction system.', extractionInstructions: 'Pinned schema instructions.' }, input: 'Synthetic transfer of 25.' };
    const messages = extractionMessages(extraction);
    expect(messages[0].content).toBe('Pinned extraction system.\nReturn only JSON matching the supplied field schema. Do not execute actions or invent missing values.');
    expect(messages[1].content).toContain('Pinned schema instructions.\nGoal:');
    expect(messages[1].content).toContain('Latest user input:\nSynthetic transfer of 25.');
    expect(messages[1].content).toContain('Required fields: fromAccountId, toAccountId, amount.');
    const registry = { generate: jest.fn(async (providerId, input) => ({ providerId, model: input.model, text: '{"collectedData":{"amount":25},"missingFields":["fromAccountId","toAccountId"],"notes":[]}', usage: {} })) };
    await invoke(app(registry), { ...body(), extraction }).expect(200);
    expect(registry.generate.mock.calls[0][1]).toMatchObject({ messages, format: 'json' });
  });
  test('provider failures are sanitized and never retried', async () => {
    const registry = { generate: jest.fn().mockRejectedValue(new Error('credential-and-internal-url')) };
    const result = await invoke(app(registry)).expect(503);
    expect(JSON.stringify(result.body)).not.toContain('credential-and-internal-url'); expect(registry.generate).toHaveBeenCalledTimes(1);
    registry.generate.mockRejectedValueOnce(new LlmError('LLM_TIMEOUT', 'The configured model provider timed out.'));
    expect((await invoke(app(registry))).body.error.code).toBe('LLM_TIMEOUT');
  });
});
