const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../database', () => ({ query: jest.fn() }));
jest.mock('../../middleware/auth', () => ({ authenticateToken: (req, res, next) => next() }));
jest.mock('bcryptjs', () => ({ compare: jest.fn(async () => true) }));

const db = require('../../database');
const originalSecret = process.env.JWT_SECRET;
const originalTenant = process.env.DEPLOYMENT_TENANT_ID;
process.env.JWT_SECRET = 'identity-claims-test-secret';
process.env.DEPLOYMENT_TENANT_ID = 'servicing-test';
const authRoutes = require('../auth');
const app = express();
app.use(express.json());
app.use('/auth', authRoutes);

describe('signed operator authorization claims', () => {
  let roles;
  beforeEach(() => {
    roles = [{ name: 'CONTROL_PLANE_EDITOR' }];
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT r.name')) return { rows: roles };
      if (sql.includes('SELECT DISTINCT p.name')) return { rows: [] };
      if (sql.includes('SELECT * FROM refresh_tokens')) return { rows: [{ token: 'stored' }] };
      if (sql.includes('SELECT u.*') || sql.includes('SELECT * FROM users')) {
        return { rows: [{ user_id: 'operator-1', username: 'operator', is_active: true, is_locked: false }] };
      }
      return { rows: [] };
    });
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    if (originalTenant === undefined) delete process.env.DEPLOYMENT_TENANT_ID;
    else process.env.DEPLOYMENT_TENANT_ID = originalTenant;
  });

  test('login signs database roles and deployment tenant, ignoring supplied privileges', async () => {
    const response = await request(app).post('/auth/login').send({
      username: 'operator', password: 'test-password', roles: ['admin'], tenantId: 'foreign'
    }).expect(200);
    const claims = jwt.verify(response.body.data.tokens.accessToken, 'identity-claims-test-secret');
    expect(claims).toMatchObject({
      userId: 'operator-1', type: 'access', tenantId: 'servicing-test',
      roles: ['control_plane_editor'], role: 'control_plane_editor'
    });
  });

  test('refresh re-reads roles so a removed admin role is not renewed', async () => {
    roles = [{ name: 'CONTROL_PLANE_VIEWER' }];
    const refreshToken = jwt.sign({ userId: 'operator-1', type: 'refresh', roles: ['admin'] }, 'identity-claims-test-secret');
    const response = await request(app).post('/auth/refresh').send({ refreshToken }).expect(200);
    expect(jwt.verify(response.body.data.accessToken, 'identity-claims-test-secret')).toMatchObject({
      roles: ['control_plane_viewer'], tenantId: 'servicing-test', type: 'access'
    });
  });
});
