jest.mock('axios');
const axios = require('axios');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { authenticate } = require('../../middleware/auth');
const routes = require('../routes');
const secret = 'synthetic-llm-route-access-secret';
const token = role => jwt.sign({ userId: `user-${role}`, role, type: 'access', tenantId: 'default-enterprise' }, secret);
function app() { const server = express(); server.use(express.json()); server.use('/llm', authenticate, routes); return server; }
describe('authenticated provider management endpoints', () => {
  const previous = {};
  beforeAll(() => {
    for (const key of ['JWT_SECRET', 'LLM_PROVIDERS_JSON', 'LLM_PROVIDERS_FILE', 'DEPLOYMENT_TENANT_ID']) previous[key] = process.env[key];
    process.env.JWT_SECRET = secret; process.env.DEPLOYMENT_TENANT_ID = 'default-enterprise'; delete process.env.LLM_PROVIDERS_FILE;
    process.env.LLM_PROVIDERS_JSON = JSON.stringify({ providers: [{ id: 'fixture', type: 'ollama', enabled: true, baseUrl: 'http://never-contact.invalid:11434', allowedModels: ['fixture-model'] }] });
  });
  afterAll(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  beforeEach(() => axios.request.mockReset());
  test('customers cannot discover infrastructure or execute tests; viewers can inspect sanitized references only', async () => {
    expect((await request(app()).get('/llm/providers')).status).toBe(401);
    expect((await request(app()).get('/llm/providers').set('Authorization', `Bearer ${token('customer')}`)).status).toBe(403);
    const result = await request(app()).get('/llm/providers').set('Authorization', `Bearer ${token('control_plane_viewer')}`);
    expect(result.status).toBe(200); expect(result.body.providers[0]).toMatchObject({ id: 'fixture', type: 'ollama', configured: true });
    expect(JSON.stringify(result.body)).not.toContain('never-contact');
    expect((await request(app()).post('/llm/test').set('Authorization', `Bearer ${token('control_plane_viewer')}`).send({ providerId: 'fixture', model: 'fixture-model' })).status).toBe(403);
    expect(axios.request).not.toHaveBeenCalled();
  });
  test('editor tests use only fixed synthetic messages and return normalized measurements', async () => {
    axios.request.mockResolvedValue({ data: { done: true, message: { content: 'READY' }, prompt_eval_count: 4, eval_count: 1 } });
    const result = await request(app()).post('/llm/test').set('Authorization', `Bearer ${token('control_plane_editor')}`).send({ providerId: 'fixture', model: 'fixture-model' });
    expect(result.status).toBe(200); expect(result.body).toMatchObject({ ok: true, text: 'READY', usage: { inputTokens: 4, outputTokens: 1 } });
    const sent = axios.request.mock.calls[0][0];
    expect(sent.data.messages[1].content).toBe('Synthetic model connectivity test.');
    expect(sent.headers.Authorization).toBeUndefined();
    expect((await request(app()).post('/llm/test').set('Authorization', `Bearer ${token('control_plane_editor')}`)
      .send({ providerId: 'fixture', model: 'fixture-model', prompt: 'customer input' })).status).toBe(400);
    expect(axios.request).toHaveBeenCalledTimes(1);
  });
  test('provider errors are sanitized and never echo transport headers or backend responses', async () => {
    axios.request.mockRejectedValue(new Error('Authorization: Bearer secret-with-private-url'));
    const result = await request(app()).post('/llm/test').set('Authorization', `Bearer ${token('control_plane_admin')}`).send({ providerId: 'fixture', model: 'fixture-model' });
    expect(result.body).toMatchObject({ ok: false, error: { code: 'LLM_PROVIDER_ERROR' } });
    expect(JSON.stringify(result.body)).not.toMatch(/secret-with-private-url|Authorization/);
  });
  test('production disables connectivity tests before provider dispatch while retaining safe metadata discovery', async () => {
    const previousEnvironment = process.env.NODE_ENV; const previousRegistry = process.env.LLM_PROVIDERS_JSON;
    process.env.NODE_ENV = 'production';
    process.env.LLM_PROVIDERS_JSON = JSON.stringify({ providers: [{ id: 'fixture', type: 'ollama', enabled: true, baseUrl: 'https://fixture.example.invalid', allowedModels: ['fixture-model'] }] });
    try {
      const result = await request(app()).post('/llm/test').set('Authorization', `Bearer ${token('control_plane_admin')}`).send({ providerId: 'fixture', model: 'fixture-model' });
      expect(result.status).toBe(403); expect(result.body.error.code).toBe('LLM_TEST_DISABLED');
      await request(app()).get('/llm/providers').set('Authorization', `Bearer ${token('control_plane_viewer')}`).expect(200);
      expect(axios.request).not.toHaveBeenCalled();
    } finally { if (previousEnvironment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnvironment; process.env.LLM_PROVIDERS_JSON = previousRegistry; }
  });

});
