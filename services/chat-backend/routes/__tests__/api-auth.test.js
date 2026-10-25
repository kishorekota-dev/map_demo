const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

jest.mock('../../services/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  auth: jest.fn()
}));

const apiRoutes = require('../api');
const JWT_SECRET = 'dev-jwt-secret-change-me-in-production-2024';

const createApp = (session, serviceOverrides = {}) => {
  const app = express();
  app.use(express.json());
  app.locals.services = {
    sessionManager: {
      getSession: jest.fn().mockResolvedValue(session),
      updateSessionState: jest.fn()
    },
    chatService: {},
    agentOrchestrator: {},
    ...serviceOverrides
  };
  app.use('/api', apiRoutes);
  return app;
};

describe('chat REST authorization', () => {
  test('protects the private process endpoint and rejects foreign sessions', async () => {
    const app = createApp({ sessionId: 's1', userId: 'someone-else' });
    const payload = { sessionInfo: { sessionId: 's1' }, message: { content: 'hello' } };
    expect((await request(app).post('/api/process').send(payload)).status).toBe(401);
    expect((await request(app).post('/api/process').set('Authorization', `Bearer ${jwt.sign({ userId: 'user-a' }, JWT_SECRET)}`).send(payload)).status).toBe(403);
  });

  test('rejects refresh tokens on the chat data plane', async () => {
    const response = await request(createApp({ sessionId: 's1', userId: 'user-a' })).get('/api/sessions/s1')
      .set('Authorization', `Bearer ${jwt.sign({ userId: 'user-a', type: 'refresh' }, JWT_SECRET)}`);
    expect(response.status).toBe(401);
  });

  test('requires a bearer token for session data', async () => {
    const response = await request(createApp({ sessionId: 's1', userId: 'user-a' }))
      .get('/api/sessions/s1');

    expect(response.status).toBe(401);
  });

  test('rejects access to another user session', async () => {
    const token = jwt.sign({ userId: 'user-a' }, JWT_SECRET);
    const response = await request(createApp({ sessionId: 's1', userId: 'user-b' }))
      .get('/api/sessions/s1')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  test('passes authenticated context to the orchestrator and persists workflow updates', async () => {
    const token = jwt.sign({ userId: 'user-a' }, JWT_SECRET);
    const session = {
      sessionId: 's1',
      userId: 'user-a',
      state: { conversationStage: 'active' }
    };
    const message = { id: 'm1', content: 'transfer $20' };
    const sessionManager = {
      getSession: jest.fn().mockResolvedValue(session),
      updateSessionState: jest.fn().mockResolvedValue(session)
    };
    const chatService = {
      processMessage: jest.fn().mockResolvedValue(message),
      sendResponse: jest.fn().mockResolvedValue({ id: 'r1', content: 'Confirm?' })
    };
    const conversationContextUpdates = {
      pendingFeedback: { type: 'confirmation', operation: 'transfer' }
    };
    const agentOrchestrator = {
      processMessage: jest.fn().mockResolvedValue({
        finalResponse: {
          content: 'Confirm?',
          type: 'text',
          confidence: 1,
          source: 'ai-orchestrator',
          metadata: { intent: 'transfer_funds', requiresUserResponse: true }
        },
        processingTime: 15,
        agentsInvolved: ['banking'],
        conversationContextUpdates
      })
    };

    const response = await request(createApp(session, {
      sessionManager,
      chatService,
      agentOrchestrator
    }))
      .post('/api/sessions/s1/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'transfer $20' });

    expect(response.status).toBe(200);
    expect(agentOrchestrator.processMessage).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        id: 'm1',
        sessionId: 's1',
        userId: 'user-a',
        authToken: token
      }),
      expect.objectContaining({
        conversationStage: 'active',
        userId: 'user-a',
        authToken: token
      })
    );
    expect(sessionManager.updateSessionState).toHaveBeenCalledWith(
      's1',
      conversationContextUpdates
    );
    expect(chatService.sendResponse).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        confidence: 1,
        metadata: expect.objectContaining({ intent: 'transfer_funds' })
      }),
      expect.objectContaining({
        agentType: 'ai-orchestrator',
        confidence: 1,
        processingTime: 15
      })
    );
    expect(response.body.agentResult).toEqual(expect.objectContaining({
      intent: 'transfer_funds',
      confidence: 1,
      source: 'ai-orchestrator',
      metadata: expect.objectContaining({ intent: 'transfer_funds' }),
      finalResponse: expect.objectContaining({ content: 'Confirm?' })
    }));
  });

  test('uses an escalation source as the response intent with its low confidence', async () => {
    const token = jwt.sign({ userId: 'user-a' }, JWT_SECRET);
    const session = { sessionId: 's1', userId: 'user-a', state: {} };
    const chatService = {
      processMessage: jest.fn().mockResolvedValue({ id: 'm1', content: 'help' }),
      sendResponse: jest.fn(async (sessionId, finalResponse, agentInfo) => ({
        id: 'r1',
        sessionId,
        content: finalResponse.content,
        metadata: finalResponse.metadata,
        agentInfo
      }))
    };
    const agentOrchestrator = {
      processMessage: jest.fn().mockResolvedValue({
        finalResponse: {
          content: 'Connecting you to support.',
          type: 'text',
          confidence: 0.3,
          source: 'human-escalation',
          metadata: { escalationRequired: true }
        },
        processingTime: 20,
        agentsInvolved: ['human-escalation'],
        conversationContextUpdates: { escalationRequired: true }
      })
    };

    const response = await request(createApp(session, {
      sessionManager: {
        getSession: jest.fn().mockResolvedValue(session),
        updateSessionState: jest.fn()
      },
      chatService,
      agentOrchestrator
    }))
      .post('/api/sessions/s1/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'help' });

    expect(response.status).toBe(200);
    expect(response.body.response).toEqual(expect.objectContaining({
      metadata: expect.objectContaining({ intent: 'human_escalation' }),
      agentInfo: expect.objectContaining({ confidence: 0.3 })
    }));
    expect(response.body.agentResult).toEqual(expect.objectContaining({
      intent: 'human_escalation',
      confidence: 0.3
    }));
  });
});

 test('explicit recovery checks owner, uses fresh JWT, and restores pending feedback before delivery', async () => {
    const token = jwt.sign({ userId: 'user-a' }, JWT_SECRET);
    const updates = { pendingFeedback: { type: 'confirmation_required', intent: 'transfer_funds' }, lockedIntent: 'transfer_funds' };
    const agentOrchestrator = { recoverWorkflow: jest.fn(async () => ({ finalResponse: { content: 'Confirm?', metadata: { intent: 'transfer_funds' } }, conversationContextUpdates: updates })) };
    const sessionManager = { getSession: jest.fn(async () => ({ sessionId: 's1', userId: 'user-a', state: {} })), updateSessionState: jest.fn() };
    const chatService = { sendResponse: jest.fn(async () => ({ id: 'reply', content: 'Confirm?' })) };
    const app = createApp(null,{ agentOrchestrator,sessionManager,chatService });
    expect((await request(app).post('/api/chat/recover').send({ sessionId: 's1' })).status).toBe(401);
    expect((await request(app).post('/api/chat/recover').set('Authorization', `Bearer ${jwt.sign({ userId: 'foreign' },JWT_SECRET)}`).send({ sessionId: 's1' })).status).toBe(403);
    expect((await request(app).post('/api/chat/recover').set('Authorization', `Bearer ${token}`).send({ sessionId: 's1', version: 99, intent: 'help' })).status).toBe(200);
    expect(agentOrchestrator.recoverWorkflow).toHaveBeenCalledWith('s1',token,undefined);
    expect(sessionManager.updateSessionState).toHaveBeenCalledWith('s1',updates);
    expect(sessionManager.updateSessionState.mock.invocationCallOrder[1]).toBeLessThan(chatService.sendResponse.mock.invocationCallOrder[0]);
    expect(sessionManager.updateSessionState).toHaveBeenLastCalledWith('s1',{ workflowRecoveryRequired: false });
  });

 test('scoped evaluation credentials cannot recover customer sessions or mint chat tokens', async () => {
    const app = createApp({ sessionId: 's1', userId: 'user-a' });
    app.use('/auth',require('../auth').router);
    for (const claim of [{ purpose: 'quality_evaluation' },{ aud: 'servicing-quality' },{ aud: ['servicing-quality'] }]) {
      const token = jwt.sign({ userId: 'user-a', type: 'access', ...claim },JWT_SECRET,{ expiresIn: '5m' });
      expect((await request(app).post('/api/chat/recover').set('Authorization', `Bearer ${token}`).send({ sessionId: 's1' })).status).toBe(401);
      expect((await request(app).post('/auth/refresh').send({ token })).status).toBe(401);
    }
  });

 test('ordinary message delivery is marked before AI dispatch and remains recoverable if persistence fails', async () => {
    const token = jwt.sign({ userId: 'user-a' },JWT_SECRET);
    const session = { sessionId: 's1', userId: 'user-a', state: {} };
    const sessionManager = { getSession: jest.fn(async () => session), updateSessionState: jest.fn(async (_id,updates) => Object.assign(session.state,updates)) };
    const agentOrchestrator = { processMessage: jest.fn(async () => ({ finalResponse: { content: 'Confirm?', metadata: { intent: 'transfer_funds' } },
      conversationContextUpdates: { pendingFeedback: { type: 'confirmation_required', intent: 'transfer_funds' } } })) };
    const chatService = { processMessage: jest.fn(async () => ({ id: 'original-message' })), sendResponse: jest.fn(async () => { throw new Error('transcript unavailable'); }) };
    const app = createApp(session,{ sessionManager,agentOrchestrator,chatService });
    expect((await request(app).post('/api/chat/message').set('Authorization', `Bearer ${token}`).send({ sessionId: 's1', message: 'transfer' })).status).toBe(500);
    expect(session.state.workflowRecoveryRequired).toBe(true);
    expect(sessionManager.updateSessionState.mock.invocationCallOrder[0]).toBeLessThan(agentOrchestrator.processMessage.mock.invocationCallOrder[0]);
    expect(agentOrchestrator.processMessage).toHaveBeenCalledTimes(1);
  });

 test('advanced recovery clears stale chat confirmation without submitting a new message', async () => {
    const token = jwt.sign({ userId: 'user-a' },JWT_SECRET);
    const session = { sessionId: 's1', userId: 'user-a', state: { pendingFeedback: { type: 'confirmation_required' }, lockedIntent: 'transfer_funds' } };
    const sessionManager = { getSession: jest.fn(async () => session), updateSessionState: jest.fn(async (_id,updates) => Object.assign(session.state,updates)) };
    const agentOrchestrator = { recoverWorkflow: jest.fn(async () => { throw Object.assign(new Error('advanced'),{ status: 409 }); }) };
    const response = await request(createApp(session,{ sessionManager,agentOrchestrator })).post('/api/chat/recover').set('Authorization', `Bearer ${token}`).send({ sessionId: 's1' });
    expect(response.status).toBe(409);
    expect(session.state).toMatchObject({ workflowRecoveryRequired: false, pendingFeedback: null, lockedIntent: null });
    expect(response.body.error).toMatch(/Check its outcome/);
  });

 test('initial dispatch outage can exit recovery after authoritative absence without replaying the message', async () => {
    const token = jwt.sign({ userId: 'user-a' },JWT_SECRET);
    const session = { sessionId: 'never-dispatched', userId: 'user-a', state: {} };
    const sessionManager = { getSession: jest.fn(async () => session), updateSessionState: jest.fn(async (_id,updates) => Object.assign(session.state,updates)) };
    const agentOrchestrator = {
      processMessage: jest.fn(async () => ({ finalResponse: { content: 'Request interrupted', metadata: { policyCode: 'workflow_recovery_required' } }, conversationContextUpdates: { workflowRecoveryRequired: true } })),
      recoverWorkflow: jest.fn(async () => { throw Object.assign(new Error('no original session'),{ status: 404, upstreamCode: 'WORKFLOW_SESSION_NOT_FOUND' }); })
    };
    const chatService = { processMessage: jest.fn(async () => ({ id: 'original-message' })), sendResponse: jest.fn(async () => ({ id: 'reply' })) };
    const app = createApp(session,{ sessionManager,agentOrchestrator,chatService });
    expect((await request(app).post('/api/chat/message').set('Authorization', `Bearer ${token}`).send({ sessionId: session.sessionId, message: 'transfer' })).status).toBe(200);
    expect(session.state.workflowRecoveryRequired).toBe(true);
    const recovered = await request(app).post('/api/chat/recover').set('Authorization', `Bearer ${token}`).send({ sessionId: session.sessionId });
    expect(recovered.status).toBe(409);
    expect(recovered.body.error).toMatch(/Check its outcome/);
    expect(session.state).toMatchObject({ workflowRecoveryRequired: false, pendingFeedback: null, lockedIntent: null });
    expect(agentOrchestrator.processMessage).toHaveBeenCalledTimes(1);
    expect(chatService.processMessage).toHaveBeenCalledTimes(1);
    expect(agentOrchestrator.recoverWorkflow).toHaveBeenCalledTimes(1);
  });
 test.each([403,404])('untrusted or forbidden recovery response %s preserves the delivery marker', async status => {
    const token = jwt.sign({ userId: 'user-a' },JWT_SECRET);
    const session = { sessionId: 's1', userId: 'user-a', state: { workflowRecoveryRequired: true } };
    const sessionManager = { getSession: jest.fn(async () => session), updateSessionState: jest.fn(async (_id,updates) => Object.assign(session.state,updates)) };
    const agentOrchestrator = { recoverWorkflow: jest.fn(async () => { throw Object.assign(new Error('upstream denied or unknown route'),{ status }); }) };
    const response = await request(createApp(session,{ sessionManager,agentOrchestrator })).post('/api/chat/recover').set('Authorization', `Bearer ${token}`).send({ sessionId: 's1' });
    expect(response.status).toBe(503);
    expect(session.state.workflowRecoveryRequired).toBe(true);
  });
