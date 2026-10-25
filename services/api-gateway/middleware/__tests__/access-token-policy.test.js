jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const secret = 'gateway-access-policy-synthetic-secret';
const original = { secret: process.env.JWT_SECRET, tenant: process.env.DEPLOYMENT_TENANT_ID };
process.env.JWT_SECRET = secret;
const { authMiddleware, optionalAuth, verifyToken } = require('../auth');
process.env.DEPLOYMENT_TENANT_ID = 'policy-tenant';
afterAll(() => {
  if (original.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original.secret;
  if (original.tenant === undefined) delete process.env.DEPLOYMENT_TENANT_ID; else process.env.DEPLOYMENT_TENANT_ID = original.tenant;
});

const app = express();
app.get('/protected', authMiddleware, (req, res) => res.json({ userId: req.userId }));
app.get('/optional', optionalAuth, (req, res) => res.json({ userId: req.userId || null }));
const sign = (claims, options = {}) => jwt.sign({ userId: 'customer-1', type: 'access', tenantId: 'policy-tenant', ...claims }, secret, options);

test('a deployment access token authenticates', async () => {
  await request(app).get('/protected').set('Authorization', `Bearer ${sign({})}`).expect(200, { userId: 'customer-1' });
  await request(app).get('/protected').set('Authorization', `Bearer ${sign({ tenantId: undefined })}`).expect(200);
  expect(verifyToken(sign({})).valid).toBe(true);
});

test.each([
  ['a long-lived refresh token', () => sign({ type: 'refresh' })],
  ['another tenant', () => sign({ tenantId: 'other-tenant' })],
  ['no subject', () => sign({ userId: undefined })],
  ['a non-HS256 algorithm', () => sign({}, { algorithm: 'HS512' })],
])('rejects %s', async (_label, token) => {
  const result = await request(app).get('/protected').set('Authorization', `Bearer ${token()}`);
  expect(result.status).toBe(401);
  expect(verifyToken(token()).valid).toBe(false);
  // Optional authentication ignores the token rather than trusting it.
  await request(app).get('/optional').set('Authorization', `Bearer ${token()}`).expect(200, { userId: null });
});
