const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { randomBytes, randomUUID, createHmac, createHash } = require('crypto');
jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('../../services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), auth: jest.fn() }));
jest.mock('../../../ai-orchestrator/src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
const axios = require('axios');
const HandoffService = require('../../services/handoffService');
const { OperationsStore } = require('../../../api-gateway/operations/store');
const { ConnectorCatalog } = require('../../../api-gateway/operations/connectorCatalog');
const { receiveWebhook } = require('../../../api-gateway/operations/webhooks');
const { defaultConfig } = require('../../../api-gateway/control-plane/config');

(process.env.RUNTIME_TEST_DATABASE_URL ? describe : describe.skip)('Digital / AVA / durable voice channel switching API with PostgreSQL grants', () => {
  let pool; let store; let chat; let orchestrator; let sessions; let workflow; let handoffs;
  const originalEnv = { JWT_SECRET: process.env.JWT_SECRET, DEPLOYMENT_TENANT_ID: process.env.DEPLOYMENT_TENANT_ID,
    SERVICING_SERVICE_TOKEN: process.env.SERVICING_SERVICE_TOKEN, HANDOFF_STORAGE: process.env.HANDOFF_STORAGE };
  const tenant = `channel-api-${randomUUID()}`;
  const signingKey = randomBytes(32).toString('hex');
  const providerKey = randomBytes(32).toString('hex');
  const owner = 'customer';
  const sessionId = randomUUID();
  const publicUrl = 'https://voice.example.com/api/operations/webhooks/voice-fixture';
  const auth = (claims = {}) => `Bearer ${jwt.sign({ userId: owner, tenantId: tenant, type: 'access', ...claims }, signingKey, { expiresIn: '5m' })}`;
  let catalog; let env;
  beforeAll(async () => {
    process.env.JWT_SECRET = signingKey; process.env.DEPLOYMENT_TENANT_ID = tenant;
    process.env.SERVICING_SERVICE_TOKEN = randomBytes(32).toString('hex'); process.env.HANDOFF_STORAGE = 'postgres';
    pool = new (require('pg').Pool)({ connectionString: process.env.RUNTIME_TEST_DATABASE_URL });
    store = new OperationsStore({ databaseUrl: process.env.RUNTIME_TEST_DATABASE_URL, tenantId: tenant });
    const pinned = { version: 7, environment: 'production', cohort: 'baseline', config: defaultConfig() };
    Object.assign(pinned.config.channels.find(channel => channel.id === 'ivr'), { enabled: true, mode: 'automated' });
    const conversation = { sessionId, userId: owner, isActive: true, intent: 'transfer_funds', currentStep: 'request_confirmation',
      metadata: { tenantId: tenant, channel: 'digital', version: 7, controlPlane: pinned,
        runtimeContext: { version: 7, channel: 'digital', intent: 'transfer_funds' } },
      state: { currentStep: 'request_confirmation', lockedIntent: 'transfer_funds', pendingFeedback: { type: 'confirmation_required', intent: 'transfer_funds' } } };
    sessions = { conversation, getSession: jest.fn(async id => id === sessionId ? conversation : null),
      updateSession: jest.fn(async (_id, patch) => Object.assign(conversation, patch)) };
    workflow = { persistence: { runSession: async (_tenant, _id, action) => action() }, processMessage: jest.fn() };
    orchestrator = express(); orchestrator.use(express.json());
    orchestrator.locals.sessionManager = sessions; orchestrator.locals.workflowService = workflow;
    orchestrator.use('/api/orchestrator', require('../../../ai-orchestrator/src/routes/orchestrator.routes'));
    axios.post.mockImplementation(async (url, body, options) => {
      const response = await request(orchestrator).post(new URL(url).pathname).set(options.headers).send(body);
      if (response.status !== 200) throw Object.assign(new Error('Destination rejected transfer'), { response: { status: response.status } });
      return { data: response.body };
    });
    handoffs = new HandoffService(sessions, pool); await handoffs.initialize();
    chat = express(); chat.use(express.json());
    chat.locals.services = { sessionManager: sessions, handoffService: handoffs, agentOrchestrator: { processMessage: jest.fn() }, chatService: { getConversationHistory: async () => [{ content: 'Existing request', sessionId }] } };
    chat.use('/api', require('../api'));
    env = { SERVICING_SERVICE_TOKEN: process.env.SERVICING_SERVICE_TOKEN, JWT_SECRET: signingKey, CONNECTOR_SECRET_CHANNEL_VOICE: providerKey, CONNECTOR_ALLOWED_HOSTS: 'voice.example.com' };
    const definition = { id: 'voice-fixture', name: 'Voice fixture', kind: 'voice', baseUrl: 'https://voice.example.com',
      webhookSecretRef: 'env:CONNECTOR_SECRET_CHANNEL_VOICE', webhookPublicUrl: publicUrl };
    catalog = new ConnectorCatalog([definition], env);
    await store.transaction(tx => tx.put('connection', definition.id, { ...definition, enabled: true }));
  });
  afterAll(async () => {
    await pool.query('DELETE FROM servicing_resume_grants WHERE tenant_id=$1', [tenant]);
    for (const table of ['servicing_operations_records', 'servicing_operations_events', 'servicing_operations_jobs'])
      await store.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [tenant]);
    await store.close(); await pool.end();
    for (const [name, value] of Object.entries(originalEnv)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  });
  const post = (path, body, token = auth()) => request(chat).post(`/api${path}`).set('Authorization', token).send(body);
  const fetchChat = async (url, options) => {
    let operation = request(chat)[options.method.toLowerCase()](new URL(url).pathname).set(options.headers);
    if (options.body) operation = operation.send(JSON.parse(options.body));
    const result = await operation;
    return { ok: result.status >= 200 && result.status < 300, json: async () => result.body };
  };
  function voice(body, eventId = randomUUID(), token = auth()) {
    const timestamp = String(Math.floor(Date.now() / 1000)); const rawBody = Buffer.from(JSON.stringify(body));
    const headers = { Authorization: token, 'X-Servicing-Timestamp': timestamp, 'X-Servicing-Event-Id': eventId,
      'X-Servicing-Signature': createHmac('sha256', providerKey).update(`${timestamp}.${eventId}.${publicUrl}.`).update(rawBody).digest('hex') };
    return receiveWebhook({ params: { id: 'voice-fixture' }, originalUrl: new URL(publicUrl).pathname, body, rawBody, get: name => headers[name] },
      store, { env, connectorCatalog: catalog, fetch: fetchChat });
  }
  test('switches one owned, pinned conversation across Digital, AVA and IVR and returns without tool execution', async () => {
    expect((await post(`/sessions/${sessionId}/handoff`, { targetChannel: 'ava' }, auth({ userId: 'another-customer' }))).status).toBe(403);
    const issued = await post(`/sessions/${sessionId}/handoff`, { targetChannel: 'ava' }); expect(issued.status).toBe(200);
    expect((await post('/sessions/resume', { grant: issued.body.grant, targetChannel: 'ivr' })).status).toBe(409);
    expect((await post('/sessions/resume', { grant: issued.body.grant, targetChannel: 'ava' })).body).toMatchObject({ sessionId, channel: 'ava' });
    expect((await post('/sessions/resume', { grant: issued.body.grant, targetChannel: 'ava' })).status).toBe(409);
    const toVoice = await post(`/sessions/${sessionId}/handoff`, { targetChannel: 'ivr' });
    const started = await voice({ type: 'voice.start', callId: 'call-one', resumeGrant: toVoice.body.grant });
    expect(started.sessionId).toBe(sessionId); expect(sessions.conversation.metadata.channel).toBe('ivr');
    expect(sessions.conversation.metadata.controlPlane.version).toBe(7);
    expect((await post(`/sessions/${sessionId}/messages`, { content: 'yes', metadata: { channel: 'ivr' } })).status).toBe(403);
    expect(sessions.conversation.metadata.runtimeContext).toMatchObject({ channel: 'ivr', version: 7, intent: 'transfer_funds' });
    const backEvent = randomUUID(); const body = { type: 'voice.handoff', callId: 'call-one', targetChannel: 'digital' };
    const back = await voice(body, backEvent); const transfer = back.actions.find(action => action.type === 'resume_session');
    expect(transfer.targetChannel).toBe('digital');
    const replay = await voice(body, backEvent); expect(replay.actions.some(action => 'grant' in action)).toBe(false);
    const receipt = await store.get('webhook', createHash('sha256').update(`voice-fixture:${backEvent}`).digest('hex'));
    expect(JSON.stringify(receipt).includes(transfer.grant)).toBe(false);
    expect((await post('/sessions/resume', { grant: transfer.grant, targetChannel: 'digital' })).body).toMatchObject({ sessionId, channel: 'digital' });
    expect(sessions.conversation.state).toMatchObject({ lockedIntent: 'transfer_funds', pendingFeedback: { type: 'confirmation_required' } });
    const history = await request(chat).get(`/api/sessions/${sessionId}/history`).set('Authorization', auth());
    expect(history.body.history[0].content).toBe('Existing request');
    expect(workflow.processMessage).not.toHaveBeenCalled();
    await expect(voice({ type: 'voice.turn', callId: 'call-one', utterance: 'yes' })).rejects.toMatchObject({ status: 409 });
  });
  test('a target disabled in the pinned release cannot change channel or release', async () => {
    const config = sessions.conversation.metadata.controlPlane.config;
    const target = config.channels.find(channel => channel.id === 'ava'); const enabled = target.enabled; target.enabled = false;
    const before = sessions.conversation.metadata.channel;
    try {
      const issued = await post(`/sessions/${sessionId}/handoff`, { targetChannel: 'ava' });
      expect((await post('/sessions/resume', { grant: issued.body.grant, targetChannel: 'ava' })).status).toBe(409);
      expect(sessions.conversation.metadata.channel).toBe(before);
      expect(sessions.conversation.metadata.controlPlane.version).toBe(7);
    } finally { target.enabled = enabled; }
  });
  test('an older active call cannot submit input after a customer resumes in AVA', async () => {
    const toVoice = await post(`/sessions/${sessionId}/handoff`, { targetChannel: 'ivr' });
    await voice({ type: 'voice.start', callId: 'call-two', resumeGrant: toVoice.body.grant });
    const toAva = await post(`/sessions/${sessionId}/handoff`, { targetChannel: 'ava' });
    await post('/sessions/resume', { grant: toAva.body.grant, targetChannel: 'ava' });
    await expect(voice({ type: 'voice.turn', callId: 'call-two', utterance: 'yes' })).rejects.toMatchObject({ status: 409 });
    const staleBrowser = await post(`/sessions/${sessionId}/messages`, { content: 'yes', metadata: { channel: 'digital' } });
    expect(staleBrowser.status).toBe(409); expect(workflow.processMessage).not.toHaveBeenCalled();
    const anonymous = await request(chat).post('/api/sessions/resume').send({ grant: toAva.body.grant, targetChannel: 'ava' });
    expect(anonymous.status).toBe(401);
  });
});
