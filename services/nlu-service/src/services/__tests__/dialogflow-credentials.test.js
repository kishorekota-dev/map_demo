const { generateKeyPairSync, randomBytes } = require('crypto');
const { clientOptions, safeProviderResult } = require('../dialogflow-credentials');

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
});
const credentials = JSON.stringify({
  type: 'service_account', client_email: 'fixture@fixture-project.iam.gserviceaccount.com',
  private_key: privateKey,
  // SDK credential options are selected explicitly, never copied wholesale.
  token_uri: 'http://127.0.0.1:9/unsupported'
});
const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  jest.resetModules();
  jest.dontMock('../../config/config');
  jest.dontMock('@google-cloud/dialogflow');
});

test('requires server JSON rather than ambient file/default credentials', () => {
  const env = { GOOGLE_APPLICATION_CREDENTIALS: '/unread/fixture.json', DIALOGFLOW_KEY_FILENAME: '/unread/other.json' };
  expect(() => clientOptions({ projectId: 'fixture-project' }, env)).toThrow('DIALOGFLOW_CREDENTIALS_JSON');
});

test('passes only explicit SDK credential fields, never token endpoints or key paths', () => {
  const result = clientOptions({ projectId: 'fixture-project' }, { DIALOGFLOW_CREDENTIALS_JSON: credentials });
  expect(Object.keys(result).sort()).toEqual(['credentials', 'projectId']);
  expect(Object.keys(result.credentials).sort()).toEqual(['client_email', 'private_key']);
  expect(result.credentials.private_key === privateKey).toBe(true);
});

test.each(['invalid-json', JSON.stringify({ type: 'service_account', private_key: 'invalid-key' }), '[]'])('invalid credential structure fails without echoing its value (%#)', raw => {
  let error;
  try { clientOptions({ projectId: 'fixture-project' }, { DIALOGFLOW_CREDENTIALS_JSON: raw }); }
  catch (caught) { error = caught; }
  expect(Boolean(error)).toBe(true);
  expect(error.message.includes(raw)).toBe(false);
});

function loadService({ enabled = true, env = 'development', implementation = () => ({}) } = {}) {
  jest.resetModules();
  jest.doMock('../../config/config', () => ({ env, dialogflow: { enabled, projectId: 'fixture-project', languageCode: 'en-US' } }));
  const constructor = jest.fn(implementation);
  jest.doMock('@google-cloud/dialogflow', () => ({ SessionsClient: constructor }));
  const service = require('../dialogflow.service');
  return { service, constructor };
}

test('enabled missing credentials fail module initialization before constructing an SDK client', () => {
  delete process.env.DIALOGFLOW_CREDENTIALS_JSON;
  expect(() => loadService()).toThrow('DIALOGFLOW_CREDENTIALS_JSON');
});

test('enabled explicit credentials initialize without files or live calls and status describes configuration', () => {
  process.env.DIALOGFLOW_CREDENTIALS_JSON = credentials;
  const { service, constructor } = loadService();
  expect(constructor).toHaveBeenCalledTimes(1);
  expect(Object.keys(constructor.mock.calls[0][0]).sort()).toEqual(['credentials', 'projectId']);
  expect(service.getServiceStatus().status).toBe('configured');
});

test('SDK initialization errors fail closed without disclosing provider error data', () => {
  process.env.DIALOGFLOW_CREDENTIALS_JSON = credentials;
  const sensitive = randomBytes(24).toString('hex');
  let error;
  try { loadService({ implementation: () => { throw new Error(sensitive); } }); }
  catch (caught) { error = caught; }
  expect(error.code).toBe('DIALOGFLOW_UNAVAILABLE');
  expect(error.message.includes(sensitive)).toBe(false);
});

test('real provider errors do not become mock intent responses', async () => {
  process.env.DIALOGFLOW_CREDENTIALS_JSON = credentials;
  const sensitive = randomBytes(24).toString('hex');
  const { service } = loadService({ implementation: () => ({
    projectAgentSessionPath: () => 'projects/fixture-project/agent/sessions/fixture',
    detectIntent: jest.fn().mockRejectedValue(new Error(sensitive))
  }) });
  const mock = jest.spyOn(service, 'detectIntentMock');
  await expect(service.detectIntent('fixture input')).rejects.toMatchObject({ code: 'DIALOGFLOW_UNAVAILABLE', status: 503 });
  expect(mock).not.toHaveBeenCalled();
});

test('disabled production provider never constructs a client or serves mock output', async () => {
  const { service, constructor } = loadService({ enabled: false, env: 'production' });
  await expect(service.detectIntent('fixture input')).rejects.toMatchObject({ code: 'DIALOGFLOW_UNAVAILABLE', status: 503 });
  await expect(service.detectIntentMock('fixture input')).rejects.toMatchObject({ code: 'DIALOGFLOW_UNAVAILABLE' });
  expect(constructor).not.toHaveBeenCalled();
});

test('disabled development provider retains explicit demo behavior without SDK authentication', async () => {
  const { service, constructor } = loadService({ enabled: false });
  const result = await service.detectIntent('balance', 'fixture');
  expect(typeof result.intent).toBe('string');
  expect(constructor).not.toHaveBeenCalled();
});

test('nested provider output cannot echo configured credentials', () => {
  const sensitive = randomBytes(24).toString('hex');
  const result = safeProviderResult({ nested: [{ text: `prefix ${sensitive}` }], [sensitive]: 'fixture' }, [sensitive]);
  expect(JSON.stringify(result).includes(sensitive)).toBe(false);
  expect(result.nested[0].text).toBe('prefix [REDACTED]');
});

test('provider output redaction is bounded for cyclic or excessively deep responses', () => {
  const cyclic = {};
  cyclic.child = cyclic;
  expect(() => safeProviderResult(cyclic, [])).toThrow('Dialogflow provider is unavailable.');
});

test('production HTTP provider wrapper and combined analysis reject disabled mock execution', async () => {
  jest.resetModules();
  jest.doMock('../../config/config', () => {
    const config = jest.requireActual('../../config/config');
    return { ...config, env: 'production', dialogflow: { ...config.dialogflow, enabled: false } };
  });
  const express = require('express');
  const request = require('supertest');
  const app = express();
  app.use(express.json());
  app.use('/api/nlu', require('../../routes/nlu.routes'));
  const response = await request(app).post('/api/nlu/dialogflow').send({ message: 'balance' }).expect(503);
  expect(response.body).toEqual({ success: false, error: 'Dialogflow provider is unavailable.' });
  await request(app).post('/api/nlu/analyze').send({ user_input: 'balance' }).expect(503);
  // Deterministic intent hints remain available to the normal runtime.
  const local = await request(app).post('/api/nlu/intents').send({ message: 'what is my account balance?' }).expect(200);
  expect(local.body.success).toBe(true);
});
