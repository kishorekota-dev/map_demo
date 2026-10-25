const request = require('supertest');
const auth = require('../internalServiceAuth');
const token = '6fa3a9de1ff748b79a088abbb24890c1';
const previous = { ...process.env };
let service;
beforeAll(() => {
  process.env.INTERNAL_SERVICE_AUTH_REQUIRED = 'true';
  process.env.SERVICING_SERVICE_TOKEN = token;
  service = require('../../server');
});
afterAll(() => { process.env = previous; });
test('production rejects missing, short and placeholder service credentials at startup', () => {
  for (const secret of [undefined, 'short', 'a'.repeat(40), 'local-servicing-service-token-change-me', 'replace-me-with-a-real-32-byte-secret']) {
    expect(() => auth.validateConfiguration({ NODE_ENV: 'production', SERVICING_SERVICE_TOKEN: secret })).toThrow('SERVICING_SERVICE_TOKEN');
  }
  expect(() => auth.validateConfiguration({ NODE_ENV: 'production', SERVICING_SERVICE_TOKEN: token })).not.toThrow();
  expect(auth.authorized({ headers: {} }, { NODE_ENV: 'development' })).toBe(true);
});
test('HTTP routes require a trusted header; query and customer bearer tokens do not grant service access', async () => {
  await request(service.app).get('/api/nlu/intents/available').expect(401);
  await request(service.app).get('/api/nlu/intents/available?token=' + token).set('Authorization', 'Bearer ' + token).expect(401);
  await request(service.app).get('/api/nlu/intents/available').set('X-Servicing-Service-Token', 'wrong').expect(401);
  await request(service.app).get('/api/nlu/intents/available').set('X-Servicing-Service-Token', token).expect(200);
});
test('public liveness discloses no provider, customer, tool or connection details', async () => {
  const response = await request(service.app).get('/health').expect(200);
  expect(Object.keys(response.body).sort()).toEqual(['service','status','timestamp','uptime','version']);
});
test('credential rotation is evaluated on each request', async () => {
  process.env.SERVICING_SERVICE_TOKEN = token + 'rotated';
  await request(service.app).get('/api/nlu/intents/available').set('X-Servicing-Service-Token', token).expect(401);
  await request(service.app).get('/api/nlu/intents/available').set('X-Servicing-Service-Token', token + 'rotated').expect(200);
  process.env.SERVICING_SERVICE_TOKEN = token;
});
