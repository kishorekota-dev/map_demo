const http = require('http');
const express = require('express');
const request = require('supertest');
const listen = (server, host) => new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, host, resolve); });
const close = server => new Promise(resolve => server.close(resolve));
// Containers without IPv6 cannot bind ::1; the IPv6 isolation case is then skipped, not passed.
const hasIpv6Loopback = Object.values(require('os').networkInterfaces()).flat().some(entry => entry?.internal && entry.family === 'IPv6' && entry.address === '::1');

test('automatic fixtures bind the exact loopback the client uses and close afterward', async () => {
  let boundAddress;
  const server = http.createServer((_req, res) => { boundAddress = server.address().address; res.end('fixture'); });
  const testRequest = request(server).get('/');
  await testRequest.expect(200, 'fixture');
  expect(boundAddress).toBe('127.0.0.1');
  expect(testRequest.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  expect(server.listening).toBe(false);
});

test('deferred binding preserves POST bodies, query strings and callback assertions', async () => {
  const app = express(); app.use(express.json());
  app.post('/fixture', (req, res) => res.json({ body: req.body, query: req.query }));
  const testRequest = request(app).post('/fixture?existing=one').query({ additional: 'two' }).send({ value: 'synthetic' });
  await new Promise((resolve, reject) => testRequest.expect(200, { body: { value: 'synthetic' }, query: { existing: 'one', additional: 'two' } }, error => error ? reject(error) : resolve()));
  expect(testRequest._server.listening).toBe(false);
});

test('explicitly listening servers retain ownership and stay open after the request', async () => {
  const server = http.createServer((_req, res) => res.end('external-fixture'));
  await listen(server, '127.0.0.1');
  try {
    await request(server).get('/').expect(200, 'external-fixture');
    expect(server.listening).toBe(true);
  } finally { await close(server); }
});

(hasIpv6Loopback ? test : test.skip)('an IPv6-specific listener on the same port cannot receive automatic fixture requests', async () => {
  const other = http.createServer((_req, res) => res.end('unrelated-listener'));
  await listen(other, '::1');
  const fixture = http.createServer((_req, res) => res.end('owned-fixture'));
  const originalListen = fixture.listen;
  fixture.listen = function samePort(_port, host) { return originalListen.call(this, other.address().port, host); };
  try {
    await request(fixture).get('/').expect(200, 'owned-fixture');
    expect(fixture.listening).toBe(false);
  } finally { if (fixture.listening) await close(fixture); await close(other); }
});

test('listener startup failures reach the request callback without dispatching', async () => {
  const fixture = http.createServer();
  fixture.listen = function rejectedListen() { process.nextTick(() => this.emit('error', Object.assign(new Error('Synthetic bind failure'), { code: 'EADDRINUSE' }))); return this; };
  await expect(request(fixture).get('/')).rejects.toMatchObject({ code: 'EADDRINUSE' });
  expect(fixture.listening).toBe(false);
});
