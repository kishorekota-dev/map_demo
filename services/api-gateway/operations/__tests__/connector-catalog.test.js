const { randomBytes, createHmac } = require('crypto');
const { mkdtempSync, writeFileSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { ConnectorCatalog, loadConnectorCatalog } = require('../connectorCatalog');
const { resolveSecret } = require('../connectors');
const { createOperationsRouter } = require('..');
const { receiveWebhook } = require('../webhooks');

const definition = { id: 'reference', name: 'Reference fixture', kind: 'case', baseUrl: 'https://api.example.com',
  credentialRef: 'env:CONNECTOR_SECRET_REFERENCE', webhookSecretRef: 'env:CONNECTOR_SECRET_REFERENCE',
  webhookPublicUrl: 'https://example.com/api/operations/webhooks/reference' };
const env = { NODE_ENV: 'test', CONNECTOR_ALLOWED_HOSTS: 'api.example.com', CONNECTOR_SECRET_REFERENCE: randomBytes(32).toString('hex') };

test('startup validates declarations, transport policy and environment references without making provider calls', () => {
  const catalog = new ConnectorCatalog([definition], env);
  expect(catalog.list()).toEqual([definition]);
  const renamed = new ConnectorCatalog([{ ...definition, name: 'Renamed deployment label' }], env);
  expect(renamed.bind(definition).definitionDigest).toBe(catalog.bind(definition).definitionDigest);
  expect(() => new ConnectorCatalog([definition, definition], env)).toThrow('duplicate');
  expect(() => new ConnectorCatalog([definition], { ...env, CONNECTOR_SECRET_REFERENCE: undefined })).toThrow('unavailable');
  expect(() => new ConnectorCatalog([{ ...definition, credentialRef: 'file:provider' }], env)).toThrow('env:');
  expect(() => resolveSecret('file:provider', { CONNECTOR_SECRET_ROOT: '/tmp' })).toThrow('env:');
  expect(() => new ConnectorCatalog([{ ...definition, baseUrl: 'http://api.example.com' }], { ...env, NODE_ENV: 'production' })).toThrow('HTTPS');
  expect(() => new ConnectorCatalog([{ ...definition, webhookPublicUrl: 'https://example.com/another' }], env)).toThrow('public URL');
});

test('the optional startup file must be valid bounded JSON and cannot supply credential values', () => {
  const folder = mkdtempSync(join(tmpdir(), 'connector-catalog-'));
  const file = join(folder, 'connectors.json');
  try {
    writeFileSync(file, JSON.stringify({ connectors: [definition] }));
    expect(loadConnectorCatalog({ ...env, CONNECTORS_CONFIG_PATH: file }).list()).toEqual([definition]);
    writeFileSync(file, 'invalid JSON');
    expect(() => loadConnectorCatalog({ ...env, CONNECTORS_CONFIG_PATH: file })).toThrow('valid JSON');
    writeFileSync(file, JSON.stringify({ connectors: [{ ...definition, credential: 'forbidden' }] }));
    expect(() => loadConnectorCatalog({ ...env, CONNECTORS_CONFIG_PATH: file })).toThrow('definition');
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('only declared bindings can be enabled; authenticated operators can change operational settings', async () => {
  const signingKey = randomBytes(32).toString('hex');
  const values = new Map();
  const tx = { get: async (_kind, id) => values.get(id), put: jest.fn(async (_kind, id, body) => { const value = { ...body, id, revision: 1 }; values.set(id, value); return value; }), event: jest.fn() };
  const store = { tenantId: 'fixture', get: tx.get, transaction: fn => fn(tx) };
  const transport = jest.fn();
  const router = createOperationsRouter({ store, jwtSecret: signingKey, env, connectorDefinitions: [definition], request: transport });
  const app = express(); app.use(express.json()); app.use('/api/operations', router);
  const auth = role => `Bearer ${jwt.sign({ userId: 'operator', role, tenantId: 'fixture', type: 'access' }, signingKey, { expiresIn: '5m' })}`;
  const body = { name: 'Operations name', kind: 'case', enabled: true, timeoutMs: 2000 };
  await request(app).get('/api/operations/connections/catalog').expect(401);
  await request(app).get('/api/operations/connections/catalog').set('Authorization', auth('customer')).expect(403);
  const catalog = await request(app).get('/api/operations/connections/catalog').set('Authorization', auth('admin')).expect(200);
  expect(JSON.stringify(catalog.body).includes(env.CONNECTOR_SECRET_REFERENCE)).toBe(false);
  const put = (id, payload) => request(app).put(`/api/operations/connections/${id}`).set('Authorization', auth('admin')).send(payload);
  await put('undeclared', body).expect(400);
  await put('reference', { ...body, baseUrl: 'https://other.example.com' }).expect(400);
  await put('reference', { ...body, credentialRef: 'env:CONNECTOR_SECRET_OTHER' }).expect(400);
  await put('reference', { ...body, credential: 'forbidden' }).expect(400);
  expect(tx.put).not.toHaveBeenCalled();
  const saved = await put('reference', body).expect(200);
  expect(saved.body).toMatchObject({ ...definition, name: body.name, enabled: true, timeoutMs: 2000 });
  values.get('reference').baseUrl = 'https://other.example.com';
  await request(app).post('/api/operations/connections/reference/test').set('Authorization', auth('admin')).send({}).expect(409);
  expect(transport).not.toHaveBeenCalled();
});

test('webhook verification binds the signature to the configured exact public URL and path', async () => {
  const catalog = new ConnectorCatalog([definition], env);
  const store = { get: async () => ({ ...definition, enabled: true }) };
  const rawBody = Buffer.from('[]');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const eventId = 'url-binding';
  const signature = url => createHmac('sha256', env.CONNECTOR_SECRET_REFERENCE).update(`${timestamp}.${eventId}.${url}.`).update(rawBody).digest('hex');
  const input = (url, originalUrl = '/api/operations/webhooks/reference') => ({ params: { id: 'reference' }, body: [], originalUrl, rawBody,
    get: key => ({ 'X-Servicing-Timestamp': timestamp, 'X-Servicing-Event-Id': eventId, 'X-Servicing-Signature': signature(url) })[key] });
  await expect(receiveWebhook(input('https://example.com/other'), store, { env, connectorCatalog: catalog })).rejects.toMatchObject({ status: 401 });
  await expect(receiveWebhook(input(definition.webhookPublicUrl, '/api/operations/webhooks/reference?extra=1'), store, { env, connectorCatalog: catalog })).rejects.toMatchObject({ status: 401 });
  // A valid signature reaches event validation rather than being rejected as unauthenticated.
  await expect(receiveWebhook(input(definition.webhookPublicUrl), store, { env, connectorCatalog: catalog })).rejects.toMatchObject({ status: 400 });
});
