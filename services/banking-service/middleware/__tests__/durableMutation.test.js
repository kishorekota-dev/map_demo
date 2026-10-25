const { Pool } = require('pg');
const express = require('express');
const request = require('supertest');
const { randomBytes } = require('crypto');
const { readFileSync } = require('fs');
const path = require('path');
const { issueProof, TTL_MS } = require('../mutationProof');
const suite = process.env.BANKING_TEST_DATABASE_URL ? describe : describe.skip;
suite('durable banking mutations on disposable PostgreSQL', () => {
  let admin, db, guard, app, databaseName, release, started;
  const priorToken = process.env.SERVICING_SERVICE_TOKEN;
  const calls = [];
  beforeAll(async () => {
    const url = new URL(process.env.BANKING_TEST_DATABASE_URL);
    if (url.pathname !== '/banking_test') throw new Error('A disposable banking_test database is required');
    admin = new Pool({ connectionString: url.toString() });
    databaseName = `banking_test_guard_${process.pid}_${Date.now()}`;
    await admin.query(`CREATE DATABASE ${databaseName}`);
    url.pathname = `/${databaseName}`;
    jest.doMock('../../database/config', () => ({ database: { connectionString: url.toString() } }));
    db = require('../../database');
    guard = require('../durableMutation');
    await db.query(readFileSync(path.join(__dirname, '../../database/migrations/V10__durable_mutation_results.sql'), 'utf8'));
    await db.query('CREATE TABLE test_effects (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)');
    await db.query('INSERT INTO test_effects VALUES (1,0)');
    app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.user = { userId: req.get('X-Test-Principal') || 'customer-a', tenantId: 'test-enterprise' }; next(); });
    app.get('/status/:key', guard.mutationStatus);
    app.post('/mutate', guard.durableMutation, async (req, res, next) => {
      calls.push(req.body);
      try {
        await db.transaction(async client => { await client.query('UPDATE test_effects SET value=value+1 WHERE id=1'); });
        if (req.body.wait) { started(); await new Promise(resolve => { release = resolve; }); }
        if (req.body.fail) return res.status(req.body.fail).json({ success: false, error: 'Fixture rejection' });
        if (req.body.nonJson) return res.send('Unsupported fixture response');
        return res.status(201).json({ success: true, reference: 'fixture-result', value: (await db.query('SELECT value FROM test_effects WHERE id=1')).rows[0].value });
      } catch (error) { return next(error); }
    });
    app.use((_error, _req, res, _next) => res.status(503).json({ success: false, error: 'Fixture unavailable' }));
  });
  beforeEach(async () => { process.env.SERVICING_SERVICE_TOKEN = randomBytes(32).toString('hex'); calls.length = 0; await db.query('TRUNCATE banking_mutation_results'); await db.query('UPDATE test_effects SET value=0'); });
  afterAll(async () => { if (db) await db.close(); if (admin) { await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`); await admin.end(); } if (priorToken === undefined) delete process.env.SERVICING_SERVICE_TOKEN; else process.env.SERVICING_SERVICE_TOKEN = priorToken; });
  const proof = (key, body, extra = {}, now = Date.now()) => issueProof({ scope: 'banking_http', principalId: 'customer-a', tenantId: 'test-enterprise', key, method: 'POST', path: '/mutate', body, ...extra }, process.env, now);
  const post = (key, body, token = proof(key, body), principal = 'customer-a') => request(app).post('/mutate').set('X-Test-Principal', principal).set('Idempotency-Key', key).set('X-Servicing-Confirmation', token).send(body);
  const effects = async () => (await db.query('SELECT value FROM test_effects WHERE id=1')).rows[0].value;
  test('requires caller key and original request proof before any dispatch', async () => {
    expect((await request(app).post('/mutate').send({ amount: 1 })).status).toBe(400);
    expect((await post('one', { amount: 1 }, '')).status).toBe(403);
    for (const change of [{ principalId: 'other' }, { tenantId: 'other' }, { key: 'other' }, { method: 'PUT' }, { path: '/other' }, { body: { amount: 2 } }]) {
      expect((await post('one', { amount: 1 }, proof('one', { amount: 1 }, change))).status).toBe(403);
    }
    expect((await post('one', { amount: 1 }, proof('one', { amount: 1 }, {}, Date.now() - TTL_MS - 1))).status).toBe(403);
    expect(calls).toHaveLength(0); expect(await effects()).toBe(0);
  });
  test('concurrent duplicates commit one effect and replay identical status and body without a fresh proof', async () => {
    const replies = await Promise.all([post('same', { amount: 1 }), post('same', { amount: 1 })]);
    expect(replies.map(reply => reply.status)).toEqual([201,201]); expect(replies[0].text).toBe(replies[1].text);
    const replay = await post('same', { amount: 1 }, ''); expect(replay.status).toBe(201); expect(replay.text).toBe(replies[0].text);
    expect((await post('same', { amount: 2 })).status).toBe(409);
    expect((await post('same', { amount: 1 }, '', 'customer-b')).status).toBe(403);
    expect(calls).toHaveLength(1); expect(await effects()).toBe(1);
    const status = await request(app).get('/status/same'); expect(status.status).toBe(200); expect(status.body).toMatchObject({ outcome: 'completed', responseStatus: 201, result: replies[0].body });
    expect((await request(app).get('/status/same').set('X-Test-Principal', 'customer-b')).status).toBe(404);
  });
  test.each([400,503])('HTTP %s rolls back all repository writes and is not cached', async code => {
    const failed = await post('retryable', { fail: code }); expect(failed.status).toBe(code); expect(failed.body.outcome).toBe('failed');
    expect(await effects()).toBe(0); expect((await db.query('SELECT * FROM banking_mutation_results')).rowCount).toBe(0);
    expect((await post('retryable', { fail: code })).status).toBe(code); expect(calls).toHaveLength(2); expect(await effects()).toBe(0);
    expect((await post('retryable', { amount: 1 })).status).toBe(201); expect(await effects()).toBe(1);
  });
  test('untrusted database errors never expose arbitrary status messages or metadata', async () => {
    const spy = jest.spyOn(db, 'transaction').mockRejectedValueOnce(Object.assign(new Error('Untrusted fixture detail'), { status: 403, code: 'untrusted_fixture' }));
    const response = await post('unavailable', { amount: 1 }); spy.mockRestore();
    expect(response.status).toBe(503); expect(response.body).toEqual({ success: false, outcome: 'failed', code: 'BANKING_UNAVAILABLE', error: 'Banking mutation is unavailable' });
    expect(calls).toHaveLength(0); expect(await effects()).toBe(0);
  });
  test('unsupported non JSON response fails closed and rolls back', async () => {
    expect((await post('unsupported', { nonJson: true })).status).toBe(503); expect(await effects()).toBe(0);
    expect((await request(app).get('/status/unsupported')).body).toMatchObject({ authoritative: true, found: false });
  });
  test('reconciliation distinguishes in flight, committed, and authoritative absence', async () => {
    const ready = new Promise(resolve => { started = resolve; });
    const pending = post('pending', { wait: true }).then(result => result); await ready;
    expect((await request(app).get('/status/pending')).status).toBe(202);
    release(); expect((await pending).status).toBe(201);
    expect((await request(app).get('/status/pending')).body.outcome).toBe('completed');
    expect((await request(app).get('/status/absent')).body).toMatchObject({ outcome: 'failed', authoritative: true, found: false });
  });
  test('lost commit acknowledgement returns uncertain and durable lookup recovers the one committed effect', async () => {
    const acquire = db.pool.connect.bind(db.pool);
    const spy = jest.spyOn(db.pool, 'connect').mockImplementationOnce(async () => {
      const client = await acquire(); const wrapped = Object.create(client);
      wrapped.query = async (...args) => { const result = await client.query(...args); if (args[0] === 'COMMIT') throw Object.assign(new Error('Fixture lost acknowledgement'), { code: 'ECONNRESET' }); return result; };
      wrapped.release = client.release.bind(client); return wrapped;
    });
    const uncertain = await post('lost', { amount: 1 }); spy.mockRestore();
    expect(uncertain.status).toBe(202); expect(uncertain.body).toMatchObject({ outcome: 'uncertain', reconciliationReference: 'lost' });
    const lookup = await request(app).get('/status/lost'); expect(lookup.body).toMatchObject({ outcome: 'completed', responseStatus: 201 });
    const replay = await post('lost', { amount: 1 }, ''); expect(replay.status).toBe(201); expect(replay.body).toEqual(lookup.body.result);
    expect(calls).toHaveLength(1); expect(await effects()).toBe(1);
  });
});
