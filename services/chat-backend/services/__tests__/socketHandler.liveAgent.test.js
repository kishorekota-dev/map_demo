const EventEmitter = require('events');
const { randomBytes } = require('crypto');
jest.mock('../logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
const SocketHandler = require('../socketHandler');

function harness(state = {}, tenantId = 'review-bank') {
  const session = { sessionId: 'session-live', userId: 'customer-1', metadata: { tenantId }, state: { ...state } };
  const io = { on: jest.fn(), to: jest.fn(() => ({ emit: jest.fn() })) };
  const chat = Object.assign(new EventEmitter(), {
    getConversationHistory: jest.fn(async () => [{ direction: 'incoming', content: 'password=top-secret Bearer private-credential 1234567890' }]),
    processMessage: jest.fn(async (sessionId, message) => ({ ...message, id: 'stored-customer', sessionId, direction: 'incoming' })),
    sendResponse: jest.fn(async (sessionId, response) => { const stored = { ...response, sessionId, id: 'stored-agent', direction: 'outgoing' }; chat.emit('responseReady', stored); return stored; })
  });
  const orchestrator = Object.assign(new EventEmitter(), { processMessage: jest.fn() });
  const sessions = Object.assign(new EventEmitter(), {
    getSession: jest.fn(async () => structuredClone(session)),
    updateSession: jest.fn(async (_id, updates) => { session.state = { ...session.state, ...updates.state }; return structuredClone(session); }),
    updateSessionState: jest.fn(async (_id, updates) => { session.state = { ...session.state, ...updates }; return structuredClone(session); }),
    incrementSessionStatistics: jest.fn(async () => {})
  });
  const handler = new SocketHandler(io, chat, orchestrator, sessions);
  const add = (id, agent = false, overrides = {}) => {
    const handlers = new Map(); const rooms = new Set([`session:${session.sessionId}`]);
    const socket = { id, on: jest.fn((event, fn) => handlers.set(event, fn)), emit: jest.fn(), join: jest.fn(async room => rooms.add(room)), leave: jest.fn(async room => rooms.delete(room)) };
    const client = { socket, isAuthenticated: true, userId: agent ? id : session.userId, principalId: agent ? id : session.userId, tenantId, isAgentPrincipal: agent, canRelayAgent: false, sessionId: session.sessionId, agentAssignments: new Map(), metadata: {}, ...overrides };
    handler.connectedClients.set(id, client); handler.setupIndividualSocketHandlers(socket);
    return { socket, client, event: (event, data) => handlers.get(event)(data) };
  };
  return { handler, session, io, chat, orchestrator, sessions, add };
}
const requested = () => ({ liveAgentRequestedAt: new Date().toISOString(), liveAgentQueue: 'support' });
const assigned = () => ({ ...requested(), liveAgentActive: true, liveAgentId: 'agent-7', assignedAgentId: 'agent-7', assignmentStatus: 'assigned' });
const eventCalls = (socket, event) => socket.emit.mock.calls.filter(([name]) => name === event);

test('agents cannot claim an arbitrary session or another tenant without a current request', async () => {
  const h = harness(); const agent = h.add('agent-7', true);
  await agent.event('agentAcceptLiveChat', { sessionId: h.session.sessionId });
  expect(eventCalls(agent.socket, 'sessionError')[0][1].error).toMatch(/not requested/);
  expect(h.sessions.updateSession).not.toHaveBeenCalled(); expect(h.chat.getConversationHistory).not.toHaveBeenCalled();
  h.session.state = requested(); agent.client.tenantId = 'other-bank';
  await agent.event('agentAcceptLiveChat', { sessionId: h.session.sessionId });
  expect(h.sessions.updateSession).not.toHaveBeenCalled(); expect(h.chat.getConversationHistory).not.toHaveBeenCalled();
});

test('customer requests are bounded and cannot bypass a pending confirmation/recovery', async () => {
  const h = harness({ pendingFeedback: { type: 'confirmation_required' } }); const owner = h.add('customer');
  await owner.event('requestLiveAgent', { queue: 'support' });
  expect(h.sessions.updateSessionState).not.toHaveBeenCalled();
  h.session.state = {};
  await owner.event('requestLiveAgent', { queue: 'x'.repeat(200) });
  expect(h.sessions.updateSessionState).not.toHaveBeenCalled();
  await owner.event('requestLiveAgent', { queue: 'support' });
  expect(h.session.state.liveAgentRequestedAt).toBeTruthy();
  expect(eventCalls(owner.socket, 'liveAgentQueued')).toHaveLength(1);
});

test('simultaneous accept requests have one winner and a single transcript disclosure', async () => {
  const h = harness(requested()); const a = h.add('agent-7', true); const b = h.add('agent-8', true);
  await Promise.all([a.event('agentAcceptLiveChat', { sessionId: h.session.sessionId }), b.event('agentAcceptLiveChat', { sessionId: h.session.sessionId })]);
  expect(h.sessions.updateSession).toHaveBeenCalledTimes(1);
  expect(h.chat.getConversationHistory).toHaveBeenCalledTimes(1);
  expect(eventCalls(a.socket, 'liveAgentStarted').length + eventCalls(b.socket, 'liveAgentStarted').length).toBe(1);
  const winner = eventCalls(a.socket, 'liveAgentStarted')[0][1];
  expect(JSON.stringify(winner.transferContext)).not.toMatch(/top-secret|private-credential|1234567890/);
});

test('existing dashboard assignment enables bidirectional stored messages without invoking AI', async () => {
  const h = harness(requested()); const owner = h.add('customer');
  const service = h.add('agent-ui-service', true, { canRelayAgent: true });
  await h.handler.handleAgentRequest(service.socket, { requestId: 'assign', type: 'assignAgent', data: { sessionId: h.session.sessionId, agentId: 'agent-7' } });
  expect(h.session.state).toMatchObject({ assignedAgentId: 'agent-7', liveAgentId: 'agent-7', liveAgentActive: true });
  await h.handler.handleJoinSession(service.socket, { sessionId: h.session.sessionId });
  await h.handler.handleSendMessage(owner.socket, { content: 'Please help with delivery' });
  expect(eventCalls(service.socket, 'newMessage')[0][1]).toMatchObject({ id: 'stored-customer', direction: 'incoming' });
  await h.handler.handleAgentRequest(service.socket, { requestId: 'reply', type: 'sendMessage', data: { sessionId: h.session.sessionId, agentId: 'agent-7', content: 'I can help' } });
  await new Promise(resolve => setImmediate(resolve));
  expect(eventCalls(owner.socket, 'newMessage').some(([, message]) => message.id === 'stored-agent')).toBe(true);
  expect(h.orchestrator.processMessage).not.toHaveBeenCalled();
  expect(eventCalls(owner.socket, 'messageReceived')[0][1]).toMatchObject({ messageId: 'stored-customer', status: 'stored' });
});

test('waiting customer messages persist for the assigned agent rather than triggering AI', async () => {
  const h = harness(requested()); const owner = h.add('customer');
  await h.handler.handleSendMessage(owner.socket, { content: 'Additional context while waiting' });
  expect(h.chat.processMessage).toHaveBeenCalledTimes(1); expect(h.orchestrator.processMessage).not.toHaveBeenCalled();
});

test('old assignments and stale rooms cannot read or inject messages after transfer/end', async () => {
  const h = harness(assigned()); const owner = h.add('customer'); const old = h.add('agent-7', true);
  await h.handler.handleAgentRequest(old.socket, { requestId: 'transfer', type: 'transferSession', data: { sessionId: h.session.sessionId, toAgentId: 'agent-8' } });
  expect(h.session.state).toMatchObject({ liveAgentId: 'agent-8', assignedAgentId: 'agent-8' });
  expect(old.socket.leave).toHaveBeenCalledWith(`session:${h.session.sessionId}`); expect(old.client.sessionId).toBeNull();
  old.client.sessionId = h.session.sessionId; // Simulate stale room/client routing state.
  old.socket.emit.mockClear();
  await h.handler.deliverMessage({ id: 'new-secret', sessionId: h.session.sessionId, content: 'Private next turn' });
  expect(eventCalls(old.socket, 'newMessage')).toHaveLength(0);
  await h.handler.handleSendMessage(old.socket, { content: 'Spoofed customer input' });
  expect(h.chat.processMessage).not.toHaveBeenCalled();
  await owner.event('endLiveChat', {});
  expect(h.session.state.liveAgentActive).toBe(false); expect(h.session.state.assignedAgentId).toBeNull();
});

test('expired socket identity is revoked before history or transcript delivery', async () => {
  const h = harness(assigned()); const old = h.add('agent-7', true, { authExpiresAt: Date.now() - 1 });
  await h.handler.handleAgentRequest(old.socket, { requestId: 'expired', type: 'getSessionHistory', data: { sessionId: h.session.sessionId } });
  expect(old.client.isAuthenticated).toBe(false); expect(old.socket.leave).toHaveBeenCalledWith('agents');
  expect(h.chat.getConversationHistory).not.toHaveBeenCalled();
  await h.handler.deliverMessage({ sessionId: h.session.sessionId, content: 'Private' });
  expect(eventCalls(old.socket, 'newMessage')).toHaveLength(0);
});

test('history authorization uses fresh assignment state and rechecks expiry after loading', async () => {
  const h = harness(assigned()); const old = h.add('agent-7', true);
  h.sessions.getSession.mockImplementation(async (_id, options) => ({ ...structuredClone(h.session), state: options?.refresh ? { ...assigned(), assignedAgentId: 'agent-8', liveAgentId: 'agent-8' } : assigned() }));
  await h.handler.handleAgentRequest(old.socket, { requestId: 'stale', type: 'getSessionHistory', data: { sessionId: h.session.sessionId } });
  expect(h.chat.getConversationHistory).not.toHaveBeenCalled();
  expect(old.socket.emit.mock.calls.find(([event]) => event === 'response')[1].success).toBe(false);
  h.sessions.getSession.mockImplementation(async () => structuredClone(h.session));
  h.chat.getConversationHistory.mockImplementationOnce(async () => { old.client.authExpiresAt = Date.now() - 1; return [{ content: 'Private transcript' }]; });
  old.socket.emit.mockClear();
  await h.handler.handleAgentRequest(old.socket, { requestId: 'expired-during-read', type: 'getSessionHistory', data: { sessionId: h.session.sessionId } });
  expect(old.socket.emit.mock.calls.find(([event]) => event === 'response')[1].success).toBe(false);
});

test('persistence failure emits no stored acknowledgment or message disclosure', async () => {
  const h = harness(assigned()); const owner = h.add('customer'); h.chat.processMessage.mockRejectedValueOnce(new Error('Unavailable'));
  await h.handler.handleSendMessage(owner.socket, { content: 'A message' });
  expect(eventCalls(owner.socket, 'messageReceived')).toHaveLength(0); expect(eventCalls(owner.socket, 'newMessage')).toHaveLength(0);
  expect(eventCalls(owner.socket, 'messageError')).toHaveLength(1);
});

test('production live assignment fails closed without durable coordination', async () => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  try { const h = harness(requested()); const agent = h.add('agent-7', true); await agent.event('agentAcceptLiveChat', { sessionId: h.session.sessionId }); expect(h.sessions.updateSession).not.toHaveBeenCalled(); expect(eventCalls(agent.socket, 'sessionError')[0][1].error).toMatch(/Durable/); }
  finally { process.env.NODE_ENV = previous; }
});

const database = process.env.RUNTIME_TEST_DATABASE_URL;
(database ? test : test.skip)('independent handler instances serialize PostgreSQL claims before disclosing context', async () => {
  const { Pool } = require('pg'); const pool = new Pool({ connectionString: database });
  const schema = `live_review_${randomBytes(8).toString('hex')}`;
  try {
    await pool.query(`CREATE SCHEMA ${schema}`); await pool.query(`CREATE TABLE ${schema}.sessions (id text PRIMARY KEY, document jsonb NOT NULL)`);
    const original = { sessionId: 'shared-live', userId: 'customer-1', metadata: { tenantId: 'review-bank' }, state: requested() };
    await pool.query(`INSERT INTO ${schema}.sessions VALUES($1,$2)`, [original.sessionId, JSON.stringify(original)]);
    let Independent; jest.isolateModules(() => { Independent = require('../socketHandler'); });
    const handlers = [SocketHandler, Independent].map(Type => {
      const manager = Object.assign(new EventEmitter(), { databaseService: {}, getSession: async id => (await pool.query(`SELECT document FROM ${schema}.sessions WHERE id=$1`, [id])).rows[0]?.document,
        updateSession: async (id, updates) => { const current = (await pool.query(`SELECT document FROM ${schema}.sessions WHERE id=$1`, [id])).rows[0].document; current.state = { ...current.state, ...updates.state }; await pool.query(`UPDATE ${schema}.sessions SET document=$2 WHERE id=$1`, [id, JSON.stringify(current)]); return current; } });
      const handler = new Type({ on() {}, to: () => ({ emit() {} }) }, new EventEmitter(), new EventEmitter(), manager);
      handler.handoffService.initialize = async () => {}; handler.handoffService.pool = pool; return handler;
    });
    const claims = await Promise.allSettled(handlers.map((handler, i) => handler.claimLiveSession({ isAuthenticated: true, tenantId: 'review-bank', principalId: `agent-${i}` }, original.sessionId, `agent-${i}`)));
    expect(claims.filter(item => item.status === 'fulfilled')).toHaveLength(1); expect(claims.filter(item => item.status === 'rejected')).toHaveLength(1);
    expect((await pool.query(`SELECT document FROM ${schema}.sessions`)).rows[0].document.state.liveAgentActive).toBe(true);
  } finally { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); }
});

test('an expired queued request requires explicit renewal or cancel and never silently resumes AI', async () => {
  const h = harness({ ...requested(), liveAgentRequestedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString() }); const owner = h.add('customer');
  await h.handler.handleSendMessage(owner.socket, { content: 'Continue my request' });
  expect(h.orchestrator.processMessage).not.toHaveBeenCalled(); expect(h.chat.processMessage).not.toHaveBeenCalled();
  await owner.event('endLiveChat', {});
  expect(h.session.state.liveAgentRequestedAt).toBeNull();
});

test('one trusted dashboard relay receives only its active assignments across multiple sessions', async () => {
  const h = harness(assigned()); const service = h.add('agent-ui-service', true, { canRelayAgent: true, sessionId: 'another-session', agentAssignments: new Map([[h.session.sessionId, 'agent-7']]) });
  await h.handler.deliverMessage({ sessionId: h.session.sessionId, id: 'older-session-message', content: 'Assigned context' });
  expect(eventCalls(service.socket, 'newMessage')).toHaveLength(1);
  h.session.state = { ...h.session.state, liveAgentId: 'agent-8', assignedAgentId: 'agent-8' };
  await h.handler.deliverMessage({ sessionId: h.session.sessionId, content: 'Transferred context' });
  expect(eventCalls(service.socket, 'newMessage')).toHaveLength(1);
  expect(service.client.agentAssignments.has(h.session.sessionId)).toBe(false);
});

test('credential login uses the bank-issued JWT identity and expiry rather than caller userId', async () => {
  const jwt = require('jsonwebtoken'); const previous = process.env.JWT_SECRET; const previousTenant = process.env.DEPLOYMENT_TENANT_ID; process.env.JWT_SECRET = 'live-review-auth-secret'; process.env.DEPLOYMENT_TENANT_ID = 'review-bank';
  try {
    const h = harness(); const owner = h.add('customer');
    const token = jwt.sign({ userId: 'bank-verified-owner', tenantId: 'review-bank', type: 'access' }, process.env.JWT_SECRET, { expiresIn: 60 });
    h.handler.validateUserCredentials = jest.fn(async () => ({ valid: true, authToken: token, userId: 'spoofed-owner' }));
    await h.handler.handleAuthentication(owner.socket, { credentials: { username: 'owner', password: 'fixture', userId: 'spoofed-owner' } });
    expect(owner.client.userId).toBe('bank-verified-owner'); expect(owner.client.authExpiresAt).toBeGreaterThan(Date.now()); expect(owner.client.sessionId).toBeNull();
    h.handler.revokeSocketAccess(owner.client);
  } finally { if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; if (previousTenant === undefined) delete process.env.DEPLOYMENT_TENANT_ID; else process.env.DEPLOYMENT_TENANT_ID = previousTenant; }
});
