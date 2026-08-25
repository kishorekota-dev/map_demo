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
