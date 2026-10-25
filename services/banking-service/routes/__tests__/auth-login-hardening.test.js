const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createHash } = require('crypto');

jest.mock('../../database', () => ({ query: jest.fn() }));
jest.mock('../../middleware/auth', () => ({ authenticateToken: (req, res, next) => { req.user = { userId: 'user-1' }; next(); } }));
jest.mock('bcryptjs', () => ({ compare: jest.fn() }));

const db = require('../../database');
const bcrypt = require('bcryptjs');
const SECRET = 'login-hardening-test-secret';
const originalSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = SECRET;
const authRoutes = require('../auth');
const app = express();
app.use(express.json());
app.use('/auth', authRoutes);

afterAll(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

const digest = token => `sha256:${createHash('sha256').update(token).digest('hex')}`;
let user;
beforeEach(() => {
  jest.clearAllMocks();
  user = { user_id: 'user-1', username: 'customer', password_hash: 'stored-hash', is_active: true, is_locked: false, locked_until: null, failed_login_attempts: 0 };
  db.query.mockImplementation(async (sql) => {
    if (sql.includes('SELECT u.*')) return { rows: user ? [user] : [] };
    if (sql.includes('SELECT r.name')) return { rows: [{ name: 'CUSTOMER' }] };
    return { rows: [] };
  });
});
const calls = fragment => db.query.mock.calls.filter(([sql]) => sql.includes(fragment));

describe('login hardening', () => {
  test('an unknown username still performs a password comparison', async () => {
    user = null;
    bcrypt.compare.mockResolvedValue(false);
    const response = await request(app).post('/auth/login').send({ username: 'nobody', password: 'guess' }).expect(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(bcrypt.compare).toHaveBeenCalledWith('guess', expect.stringMatching(/^\$2a\$12\$/));
  });

  test('a wrong password does not reveal that an account is inactive or administratively locked', async () => {
    bcrypt.compare.mockResolvedValue(false);
    user.is_active = false;
    user.is_locked = true;
    const response = await request(app).post('/auth/login').send({ username: 'customer', password: 'guess' }).expect(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('each failure is counted and the configured threshold applies a temporary lock', async () => {
    bcrypt.compare.mockResolvedValue(false);
    await request(app).post('/auth/login').send({ username: 'customer', password: 'guess' }).expect(401);
    const [[sql, params]] = calls('failed_login_attempts = CASE');
    expect(sql).toMatch(/locked_until = CASE/);
    expect(params).toEqual(['user-1', 5, 15]);
  });

  test('a temporarily locked account is refused without evaluating the password', async () => {
    user.locked_until = new Date(Date.now() + 60000).toISOString();
    const response = await request(app).post('/auth/login').send({ username: 'customer', password: 'correct' }).expect(429);
    expect(response.body.error.code).toBe('ACCOUNT_TEMPORARILY_LOCKED');
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  test('an expired lock no longer blocks sign-in and success clears the lock', async () => {
    user.locked_until = new Date(Date.now() - 1000).toISOString();
    bcrypt.compare.mockResolvedValue(true);
    await request(app).post('/auth/login').send({ username: 'customer', password: 'correct' }).expect(200);
    expect(calls('locked_until = NULL')).toHaveLength(1);
  });

  test('non-string credentials are rejected before any lookup', async () => {
    await request(app).post('/auth/login').send({ username: { $ne: '' }, password: 'x' }).expect(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('expired role assignments do not grant roles or permissions', async () => {
    bcrypt.compare.mockResolvedValue(true);
    await request(app).post('/auth/login').send({ username: 'customer', password: 'correct' }).expect(200);
    expect(calls('SELECT r.name')[0][0]).toMatch(/ur\.expires_at IS NULL OR ur\.expires_at > NOW\(\)/);
    expect(calls('SELECT DISTINCT p.name')[0][0]).toMatch(/ur\.expires_at IS NULL OR ur\.expires_at > NOW\(\)/);
  });
});

describe('refresh token storage', () => {
  test('login stores a digest with the signed token expiry, never the raw token', async () => {
    bcrypt.compare.mockResolvedValue(true);
    const response = await request(app).post('/auth/login').send({ username: 'customer', password: 'correct' }).expect(200);
    const { refreshToken } = response.body.data.tokens;
    const [[, params]] = calls('INSERT INTO refresh_tokens');
    expect(params[1]).toBe(digest(refreshToken));
    expect(params).not.toContain(refreshToken);
    expect(params[2]).toBe(jwt.decode(refreshToken).exp);
  });

  test('refresh and logout match the stored digest', async () => {
    const refreshToken = jwt.sign({ userId: 'user-1', type: 'refresh' }, SECRET, { expiresIn: '1h' });
    db.query.mockImplementation(async (sql, params) => {
      if (sql.includes('SELECT * FROM refresh_tokens')) return { rows: params[0] === digest(refreshToken) ? [{ id: 1 }] : [] };
      if (sql.includes('SELECT * FROM users')) return { rows: [user] };
      return { rows: [] };
    });
    await request(app).post('/auth/refresh').send({ refreshToken }).expect(200);
    await request(app).post('/auth/logout').send({ refreshToken }).expect(200);
    expect(calls('UPDATE refresh_tokens SET revoked_at')[0][1]).toEqual([digest(refreshToken), 'user-1', refreshToken]);
  });

  test('refresh rejects tokens signed with another algorithm', async () => {
    const refreshToken = jwt.sign({ userId: 'user-1', type: 'refresh' }, SECRET, { algorithm: 'HS512' });
    await request(app).post('/auth/refresh').send({ refreshToken }).expect(401);
  });
});
