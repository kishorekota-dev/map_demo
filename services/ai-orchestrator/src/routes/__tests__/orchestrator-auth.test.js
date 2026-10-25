const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
const routes = require('../orchestrator.routes');

const SECRET = 'test-orchestrator-access-secret';
const token = (claims = {}) => jwt.sign({ userId: 'customer', type: 'access', tenantId: 'default-enterprise', ...claims }, SECRET, { expiresIn: '15m' });
function appFor(session) {
  const app = express();
  app.use(express.json());
  app.locals.sessionManager = { getSession: jest.fn(async () => session), completeSession: jest.fn() };
  app.locals.workflowService = { processMessage: jest.fn(async () => ({ type: 'complete' })), processHumanFeedback: jest.fn() };
  app.use('/api/orchestrator', routes);
  return app;
}

describe('orchestrator verifies identity at the service boundary', () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalTenant = process.env.DEPLOYMENT_TENANT_ID;
  beforeAll(() => { process.env.JWT_SECRET = SECRET; process.env.DEPLOYMENT_TENANT_ID = 'default-enterprise'; });
  afterAll(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret;
    if (originalTenant === undefined) delete process.env.DEPLOYMENT_TENANT_ID; else process.env.DEPLOYMENT_TENANT_ID = originalTenant;
  });

  test.each([
    ['get', '/session/s'], ['delete', '/session/s'], ['get', '/user/customer/sessions'],
    ['post', '/process'], ['post', '/feedback'], ['post', '/session'], ['post', '/session/s/recover']
  ])('requires JWT on %s %s', async (method, path) => {
    expect((await request(appFor(null))[method](`/api/orchestrator${path}`).send({})).status).toBe(401);
  });

  test.each([
    [{ type: 'refresh' }, 401], [{ tenantId: 'other-enterprise' }, 403]
  ])('rejects wrong token type and tenant', async (claims, status) => {
    const result = await request(appFor(null)).post('/api/orchestrator/process').set('Authorization', `Bearer ${token(claims)}`)
      .send({ sessionId: 's', intent: 'help', question: 'help' });
    expect(result.status).toBe(status);
  });

  test.each(['get', 'delete'])('rejects another owner on parameterized %s route', async method => {
    const app = appFor({ sessionId: 's', userId: 'someone-else' });
    const result = await request(app)[method]('/api/orchestrator/session/s').set('Authorization', `Bearer ${token()}`);
    expect(result.status).toBe(403);
    expect(app.locals.sessionManager.completeSession).not.toHaveBeenCalled();
  });

  test('rejects forged body identity and feedback against another tenant', async () => {
    let app = appFor(null);
    expect((await request(app).post('/api/orchestrator/process').set('Authorization', `Bearer ${token()}`)
      .send({ sessionId: 's', intent: 'help', question: 'help', userId: 'victim' })).status).toBe(403);
    app = appFor({ sessionId: 's', userId: 'customer', metadata: { tenantId: 'other-enterprise' } });
    expect((await request(app).post('/api/orchestrator/feedback').set('Authorization', `Bearer ${token()}`)
      .send({ sessionId: 's', response: 'yes', confirmed: true })).status).toBe(403);
    expect(app.locals.workflowService.processHumanFeedback).not.toHaveBeenCalled();
  });

  test('binds user and tenant from JWT, drops injected snapshots and normalizes channel', async () => {
    const app = appFor(null);
    const signed = token();
    const result = await request(app).post('/api/orchestrator/process').set('Authorization', `Bearer ${signed}`)
      .send({ sessionId: 's', intent: 'help', question: 'help', resumePublished: true,
        metadata: { channel: 'AVA', tenantId: 'victim', controlPlane: { version: 999, config: {} } } });
    expect(result.status).toBe(200);
    expect(app.locals.workflowService.processMessage).toHaveBeenCalledWith({
      sessionId: 's', intent: 'help', question: 'help', userId: 'customer', authToken: signed,
      metadata: { channel: 'ava', tenantId: 'default-enterprise' }
    });
  });

  test('operator context requires explicit permission and excludes raw customer values', async () => {
    const app = appFor({ sessionId: 's', userId: 'customer', intent: 'transfer_funds', status: 'waiting_human_input', currentStep: 'request_confirmation',
      collectedData: { fromAccountId: 'sensitive-account' }, requiredData: [], metadata: { tenantId: 'default-enterprise', channel: 'digital', evidenceIds: ['e-1'], caseId: 'c-1' } });
    app.locals.workflowService.persistence = { listOperations: jest.fn(async () => [{ operationId: 'op-1', status: 'reconciliation_required', tool: 'banking_create_transfer' }]) };
    const denied = await request(app).get('/api/orchestrator/session/s/context').set('Authorization', `Bearer ${token({ userId: 'operator', roles: ['control_plane_operator'] })}`);
    expect(denied.status).toBe(403);
    const allowed = await request(app).get('/api/orchestrator/session/s/context').set('Authorization', `Bearer ${token({ userId: 'operator', roles: ['control_plane_operator'], permissions: ['servicing:context:read'] })}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body).toMatchObject({ collectedFields: ['fromAccountId'], confirmationPending: true, evidenceIds: ['e-1'], unresolvedOperations: [{ operationId: 'op-1', status: 'reconciliation_required', tool: 'banking_create_transfer' }] });
    expect(JSON.stringify(allowed.body)).not.toContain('sensitive-account');
  });

  test('customer JWT alone cannot forge a trusted channel handoff or reconcile financial operations', async () => {
    const app = appFor({ sessionId: 's', userId: 'customer' });
    expect((await request(app).post('/api/orchestrator/session/s/channel').set('Authorization', `Bearer ${token()}`).send({ channel: 'ivr' })).status).toBe(403);
    expect((await request(app).get('/api/orchestrator/operations').set('Authorization', `Bearer ${token()}`)).status).toBe(403);
    expect((await request(app).post('/api/orchestrator/operations/op/reconcile').set('Authorization', `Bearer ${token()}`).send({ outcome: 'completed', reference: 'external-ref', note: 'Verified in downstream ledger.' })).status).toBe(403);
  });
});

 test('recovery accepts only session owner and ignores supplied snapshot/checkpoint selectors', async () => {
    const previous = process.env.JWT_SECRET; process.env.JWT_SECRET = SECRET;
    try {
      const app = appFor({ sessionId: 's', userId: 'customer' });
      app.locals.workflowService.recoverMessage = jest.fn(async () => ({ type: 'complete' }));
      expect((await request(app).post('/api/orchestrator/session/s/recover').set('Authorization', `Bearer ${token({ userId: 'intruder' })}`).send({})).status).toBe(403);
      const signed = token();
      const response = await request(app).post('/api/orchestrator/session/s/recover').set('Authorization', `Bearer ${signed}`)
        .send({ threadId: 'foreign', checkpointId: 'older', version: 999, metadata: { controlPlane: {} } });
      expect(response.status).toBe(200);
      expect(app.locals.workflowService.recoverMessage).toHaveBeenCalledWith({ sessionId: 's', userId: 'customer', tenantId: 'default-enterprise', authToken: signed });
    } finally { if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; }
  });

 test('recovery exposes an explicit absent-session code without executing a replacement request', async () => {
    const previous = process.env.JWT_SECRET; process.env.JWT_SECRET = SECRET;
    try {
      const app = appFor(null);
      app.locals.workflowService.recoverMessage = jest.fn(async () => { throw Object.assign(new Error('No original workflow session was found'),{ status: 404, code: 'WORKFLOW_SESSION_NOT_FOUND' }); });
      const response = await request(app).post('/api/orchestrator/session/missing/recover').set('Authorization', `Bearer ${token()}`).send({});
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('WORKFLOW_SESSION_NOT_FOUND');
      expect(app.locals.workflowService.processMessage).not.toHaveBeenCalled();
    } finally { if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; }
  });
