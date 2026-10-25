const http = require('http');
const express = require('express');
const request = require('supertest');

describe('service proxy', () => {
  let downstream;
  let downstreamUrl;
  let createServiceProxy;
  let serviceRegistry;

  beforeAll(async () => {
    downstream = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          method: req.method,
          path: req.url,
          body: raw ? JSON.parse(raw) : null,
          requestId: req.headers['x-request-id'],
          userId: req.headers['x-user-id'],
          serviceToken: req.headers['x-servicing-service-token']
        }));
      });
    });

    await new Promise((resolve) => downstream.listen(0, '127.0.0.1', resolve));
    downstreamUrl = `http://127.0.0.1:${downstream.address().port}`;

    process.env.CHAT_BACKEND_URL = downstreamUrl;
    jest.resetModules();
    ({ createServiceProxy } = require('../proxy'));
    serviceRegistry = require('../../services/serviceRegistry').getInstance();
    serviceRegistry.register('chat-backend', downstreamUrl, {
      healthCheckPath: '/health'
    });
    serviceRegistry.register('nlu', downstreamUrl, {
      healthCheckPath: '/health'
    });
  });

  afterAll(async () => {
    serviceRegistry.cleanup();
    await new Promise((resolve) => downstream.close(resolve));
  });

  test('forwards parsed JSON bodies and authenticated user context', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.id = 'request-123';
      req.startTime = Date.now();
      req.user = { userId: 'user-42', role: 'customer' };
      req.userId = 'user-42';
      req.userRole = 'customer';
      next();
    });
    app.use('/api/chat', createServiceProxy({
      serviceName: 'chat-backend',
      pathRewrite: { '^/api/chat': '/api/chat' }
    }));

    const response = await request(app)
      .post('/api/chat/message')
      .send({ message: 'hello', sessionId: 'session-1' })
      .expect(200);

    expect(response.body).toMatchObject({
      method: 'POST',
      path: '/api/chat/message',
      body: { message: 'hello', sessionId: 'session-1' },
      requestId: 'request-123',
      userId: 'user-42'
    });
  });

  test('preserves the mounted NLU API prefix when no rewrite is configured', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.id = 'nlu-request-123';
      req.startTime = Date.now();
      next();
    });
    app.use('/api/nlu', createServiceProxy({
      serviceName: 'nlu'
    }));

    const response = await request(app)
      .post('/api/nlu/analyze')
      .send({ user_input: 'show my balance' })
      .expect(200);

    expect(response.body).toMatchObject({
      method: 'POST',
      path: '/api/nlu/analyze',
      body: { user_input: 'show my balance' },
      requestId: 'nlu-request-123'
    });
  });
  test('injects trusted service tokens only for internal NLU/MCP targets', async () => {
    const previous = process.env.SERVICING_SERVICE_TOKEN;
    process.env.SERVICING_SERVICE_TOKEN = 'trusted-server-secret';
    try {
      for (const target of ['nlu','mcp','nlp','chat-backend','banking']) {
        serviceRegistry.register(target, downstreamUrl, { healthCheckPath: '/health' });
        const app = express(); app.use((req, res, next) => { req.startTime = Date.now(); next(); });
        app.use('/api', createServiceProxy({ serviceName: target }));
        const response = await request(app).get('/api/probe').set('X-Servicing-Service-Token','forged-browser-value').expect(200);
        expect(response.body.serviceToken).toBe(['nlu','mcp','nlp'].includes(target) ? 'trusted-server-secret' : undefined);
      }
    } finally { if (previous === undefined) delete process.env.SERVICING_SERVICE_TOKEN; else process.env.SERVICING_SERVICE_TOKEN = previous; }
  });

});

// The HTTP proxy must overwrite, rather than trust, caller service credentials.
