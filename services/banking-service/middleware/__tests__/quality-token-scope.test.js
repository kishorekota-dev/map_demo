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
