jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const secret = 'scope-boundary-synthetic-test-secret';
const original = process.env.JWT_SECRET;
process.env.JWT_SECRET = secret;
const { authMiddleware, optionalAuth, verifyToken } = require('../auth');
if (original === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original;
const { authenticate } = require('../../operations/auth');
const { createControlPlaneRouter } = require('../../control-plane');
const { ControlPlaneStore } = require('../../control-plane/store');
const token = extras => jwt.sign({ userId: 'operator', role: 'admin', tenantId: 'scope-tenant', type: 'access', ...extras }, secret);
test.each([
  { purpose: 'quality_evaluation', aud: 'servicing-quality', runId: randomUUID() },
  { purpose: 'quality_evaluation' },
  { aud: 'servicing-quality' },
  { aud: ['other-audience', 'servicing-quality'] },
])('special-purpose tokens cannot become CP, operations or legacy gateway sessions (%j)', async claims => {
  const app = express();
  app.use('/cp', createControlPlaneRouter({ store: new ControlPlaneStore({ file: null, tenantId: 'scope-tenant' }), jwtSecret: secret }));
  app.get('/operations', authenticate(secret, 'scope-tenant'), (_req, res) => res.json({ authenticated: true }));
  app.get('/legacy', authMiddleware, (_req, res) => res.json({ authenticated: true }));
  app.get('/optional', optionalAuth, (_req, res) => res.json({ authenticated: true }));
  const bearer = token(claims);
  await request(app).get('/cp/state').set('Authorization', `Bearer ${bearer}`).expect(401);
  await request(app).get('/operations').set('Authorization', `Bearer ${bearer}`).expect(401);
  await request(app).get('/legacy').set('Authorization', `Bearer ${bearer}`).expect(403);
  await request(app).get('/optional').set('Authorization', `Bearer ${bearer}`).expect(403);
  expect(verifyToken(bearer).valid).toBe(false);
  await request(app).get('/operations').set('Authorization', `Bearer ${token({})}`).expect(200);
});
