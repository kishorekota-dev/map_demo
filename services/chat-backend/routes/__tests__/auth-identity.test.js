const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
jest.mock('axios');
jest.mock('../../services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), auth: jest.fn() }));
const axios = require('axios');
const { router } = require('../auth');
const app = express(); app.use(express.json()); app.use('/auth', router);
let previous;
beforeEach(() => {
    previous = { JWT_SECRET: process.env.JWT_SECRET, NODE_ENV: process.env.NODE_ENV, DEPLOYMENT_TENANT_ID: process.env.DEPLOYMENT_TENANT_ID };
    process.env.JWT_SECRET = randomBytes(32).toString('hex'); process.env.NODE_ENV = 'production'; process.env.DEPLOYMENT_TENANT_ID = 'identity-fixture';
    jest.clearAllMocks();
});
afterEach(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
const sign = extras => jwt.sign({ userId: 'verified-agent', tenantId: 'identity-fixture', type: 'access', role: 'agent', ...extras }, process.env.JWT_SECRET, { expiresIn: '5m' });

test('credential login preserves verified bank access identity and roles instead of minting profile claims', async () => {
    const token = sign();
    axios.post.mockResolvedValueOnce({ data: { data: { user: { userId: 'untrusted-response-profile' }, tokens: { accessToken: token } } } });
    const response = await request(app).post('/auth/token').send({ userId: 'browser-hint', credentials: { username: 'fixture', password: randomBytes(32).toString('hex') }, sessionData: { requestedRole: 'admin' } });
    expect(response.status).toBe(200); expect(response.body.token === token).toBe(true); expect(response.body.userId).toBe('verified-agent');
    const validated = await request(app).post('/auth/validate').send({ token });
    expect(validated.status).toBe(200); expect(validated.body).toMatchObject({ valid: true, userId: 'verified-agent', roles: ['agent'] });
    expect(validated.body).not.toHaveProperty('sessionData');
});

test('production cannot enable development identity minting or refresh with a flag', async () => {
    process.env.ALLOW_INSECURE_AUTH = 'true';
    try {
        expect((await request(app).post('/auth/token').send({ userId: 'browser-hint' })).status).toBe(401);
        expect((await request(app).post('/auth/refresh').send({ token: sign() })).status).toBe(403);
    } finally { delete process.env.ALLOW_INSECURE_AUTH; }
});

test('validation rejects refresh, foreign tenant, no expiry and missing server identity', async () => {
    for (const extras of [{ type: 'refresh' }, { tenantId: 'another' }]) expect((await request(app).post('/auth/validate').send({ token: sign(extras) })).status).toBe(401);
    const timeless = jwt.sign({ userId: 'verified-agent', type: 'access' }, process.env.JWT_SECRET);
    expect((await request(app).post('/auth/validate').send({ token: timeless })).status).toBe(401);
    const token = sign(); delete process.env.JWT_SECRET;
    expect((await request(app).post('/auth/validate').send({ token })).status).toBe(503);
});
