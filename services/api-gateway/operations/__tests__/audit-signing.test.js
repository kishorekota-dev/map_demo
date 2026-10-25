const { generateKeyPairSync, randomBytes, verify } = require('crypto');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createOperationsRouter } = require('..');

test('audit signing configuration is environment-only and malformed keys fail startup safely', () => {
  const store = { tenantId: 'fixture' };
  expect(() => createOperationsRouter({ store, env: { AUDIT_SIGNING_KEY_FILE: '/unused' } })).toThrow('AUDIT_SIGNING_KEY environment variable');
  const invalid = randomBytes(32).toString('hex');
  let message;
  try { createOperationsRouter({ store, env: { AUDIT_SIGNING_KEY: invalid } }); } catch (error) { message = error.message; }
  expect(message).toBe('AUDIT_SIGNING_KEY must configure a valid RSA private key.');
  expect(message.includes(invalid)).toBe(false);
});

test('an authorized evidence export is verifiably signed without disclosing the private key', async () => {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const signingKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const authKey = randomBytes(32).toString('hex');
  const store = { tenantId: 'fixture', query: jest.fn(async () => ({ rows: [] })) };
  const router = createOperationsRouter({ store, jwtSecret: authKey, env: { AUDIT_SIGNING_KEY: signingKey } });
  const app = express(); app.use('/operations', router);
  await request(app).get('/operations/audit/export').expect(401);
  const token = jwt.sign({ userId: 'operator', role: 'admin', tenantId: 'fixture', type: 'access' }, authKey, { expiresIn: '5m' });
  const result = await request(app).get('/operations/audit/export').set('Authorization', `Bearer ${token}`).expect(200);
  expect(result.body.signatureAlgorithm).toBe('RSA-SHA256');
  expect(verify('sha256', Buffer.from(result.body.payload), keys.publicKey, Buffer.from(result.body.signature, 'base64'))).toBe(true);
  expect(JSON.stringify(result.body).includes(signingKey)).toBe(false);
});
