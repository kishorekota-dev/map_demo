jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../config', () => ({ security: { jwtSecret: 'synthetic-banking-token-scope-secret' } }));
jest.mock('../../database/repositories', () => ({}));
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../auth');
test.each([
  { purpose: 'quality_evaluation', aud: 'servicing-quality' },
  { purpose: 'quality_evaluation' },
  { aud: 'servicing-quality' },
  { aud: ['ordinary', 'servicing-quality'] },
])('banking rejects quality delegation before protected handlers (%j)', async claims => {
  const handler = jest.fn((_req, res) => res.json({ account: 'fixture' }));
  const app = express(); app.get('/accounts', authenticateToken, handler);
  const token = jwt.sign({ userId: 'operator', role: 'admin', type: 'access', ...claims }, 'synthetic-banking-token-scope-secret');
  const result = await request(app).get('/accounts').set('Authorization', `Bearer ${token}`).expect(403);
  expect(result.body.code).toBe('TOKEN_SCOPE_INVALID'); expect(handler).not.toHaveBeenCalled();
  const ordinary = jwt.sign({ userId: 'customer', type: 'access' }, 'synthetic-banking-token-scope-secret');
  await request(app).get('/accounts').set('Authorization', `Bearer ${ordinary}`).expect(200);
});

test.each([
  ['expired', () => jwt.sign({ userId: 'customer', type: 'access', exp: Math.floor(Date.now() / 1000) - 60 }, 'synthetic-banking-token-scope-secret'), 'TOKEN_EXPIRED'],
  ['forged', () => jwt.sign({ userId: 'customer', type: 'access' }, 'another-secret'), 'MALFORMED_TOKEN'],
])('an %s bearer token is a 401 so clients can refresh', async (_label, token, code) => {
  const app = express(); app.get('/accounts', authenticateToken, (_req, res) => res.json({}));
  const result = await request(app).get('/accounts').set('Authorization', `Bearer ${token()}`).expect(401);
  expect(result.body.code).toBe(code);
  expect(result.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
});

test('a refresh token cannot authenticate banking requests', async () => {
  const app = express(); app.get('/accounts', authenticateToken, (_req, res) => res.json({}));
  const refresh = jwt.sign({ userId: 'customer', type: 'refresh' }, 'synthetic-banking-token-scope-secret');
  await request(app).get('/accounts').set('Authorization', `Bearer ${refresh}`).expect(403);
});
