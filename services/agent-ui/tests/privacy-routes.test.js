const express = require('express');
const request = require('supertest');
jest.mock('../services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), queue: jest.fn() }));
const queueRoutes = require('../routes/queue');
const agentRoutes = require('../routes/agents');

test('queue detail APIs omit customer identity, arbitrary reasons and nested metadata', async () => {
    const entry = { queueId: 'queue-one', sessionId: 'session-one', intent: 'general_inquiry', priority: 'high', queuedAt: new Date(), customerId: 'private-customer', customerName: 'Private name', customerData: { transcript: 'Private transcript' }, escalationReason: 'Private issue', metadata: { token: 'private' } };
    const app = express(); app.set('queueService', { chatQueue: new Map([['queue-one', entry]]), getPriorityQueuePosition: () => 1 }); app.use('/queue', queueRoutes);
    const response = await request(app).get('/queue/items/queue-one');
    expect(response.status).toBe(200); expect(response.body.item).toMatchObject({ sessionId: 'session-one', intent: 'general_inquiry' });
    for (const key of ['customerId', 'customerName', 'customerData', 'escalationReason', 'metadata']) expect(response.body.item).not.toHaveProperty(key);
});

test('an agent cannot read or modify another agent through the REST API', async () => {
    const service = { getAgent: jest.fn(), updateAgentStatus: jest.fn() };
    const app = express(); app.use(express.json()); app.set('agentService', service);
    app.use((req, _res, next) => { req.agentAuth = { type: 'agent', userId: 'agent-one' }; next(); }); app.use('/agents', agentRoutes);
    expect((await request(app).get('/agents/agent-two')).status).toBe(403);
    expect((await request(app).patch('/agents/agent-two/status').send({ status: 'available' })).status).toBe(403);
    expect(service.getAgent).not.toHaveBeenCalled(); expect(service.updateAgentStatus).not.toHaveBeenCalled();
    service.getAgent.mockReturnValue({ agentId: 'agent-one', currentChats: new Set(), chatHistory: [{ sessionId: 'session-one', customerName: 'Private name', customerId: 'private-customer', escalationReason: 'Private issue' }] });
    const owned = await request(app).get('/agents/agent-one');
    expect(owned.status).toBe(200);
    for (const key of ['customerName', 'customerId', 'escalationReason']) expect(owned.body.agent.chatHistory[0]).not.toHaveProperty(key);
});
