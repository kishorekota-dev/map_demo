const socketIo = require('socket.io');
jest.mock('socket.io');
jest.mock('../services/logger', () => Object.fromEntries(['info', 'warn', 'error', 'debug', 'socket'].map(key => [key, jest.fn()])));
jest.mock('../services/authClient', () => ({ validateAgentToken: jest.fn() }));
const SocketManager = require('../services/socketManager');
const { validateAgentToken } = require('../services/authClient');

function fixture() {
    const target = { emit: jest.fn(), except: jest.fn().mockReturnThis() };
    const io = { on: jest.fn(), to: jest.fn(() => target), sockets: { sockets: new Map() } };
    socketIo.mockReturnValue(io);
    const manager = new SocketManager({});
    manager.on('agentRegistered', async () => true);
    const add = async (id, agentId = id) => {
        const events = new Map();
        const socket = { id, on: (event, handler) => events.set(event, handler), emit: jest.fn(), join: jest.fn(), leave: jest.fn(), disconnect: jest.fn() };
        io.sockets.sockets.set(id, socket); manager.handleAgentConnection(socket);
        await manager.registerAgent(socket, agentId, { role: 'admin', name: 'Profile hint' }, { roles: ['agent'], expiresAt: Date.now() + 60000 });
        return { socket, agent: manager.connectedAgents.get(id), event: (event, data) => events.get(event)(data) };
    };
    return { manager, io, target, add };
}
afterEach(() => { jest.clearAllMocks(); });

test('customer identity and browser profile hints cannot grant agent privileges', async () => {
    const h = fixture(); const a = await h.add('socket-one');
    expect(a.agent.role).toBe('agent'); expect(a.agent).not.toHaveProperty('token');
    validateAgentToken.mockResolvedValueOnce({ valid: false });
    await a.event('authenticate', { agentId: 'customer', token: 'invalid-fixture', agentInfo: { role: 'admin' } });
    expect(a.socket.disconnect).toHaveBeenCalledWith(true);
    clearTimeout(a.agent.expiryTimer);
});

test('unaccepted offers and queue broadcasts disclose routing metadata only', async () => {
    const h = fixture(); const a = await h.add('agent-one');
    await h.manager.sendChatAssignment(a.agent.agentId, { sessionId: 'session-one', queueId: 'queue-one', intent: 'general_inquiry', customerName: 'Private name', customerId: 'private-customer', customerData: { transcript: 'Private conversation' }, escalationReason: 'Private issue', requirements: { transcript: 'Private conversation' } });
    const offer = a.socket.emit.mock.calls.find(([event]) => event === 'chatAssignment')[1];
    for (const key of ['customerId', 'customerName', 'customerData', 'escalationReason', 'requirements']) expect(offer).not.toHaveProperty(key);
    expect(offer).toMatchObject({ sessionId: 'session-one', intent: 'general_inquiry' });
    h.manager.broadcastToAgents('systemNotification', { sessionId: 'session-one', content: 'Private conversation', customerData: { name: 'Private name' } });
    expect(a.socket.emit.mock.calls.at(-1)[1]).not.toHaveProperty('content');
    clearTimeout(a.agent.expiryTimer);
});

test('room membership does not authorize history, typing, customer info or messages after transfer', async () => {
    const h = fixture(); const old = await h.add('agent-old'); const current = await h.add('agent-current');
    h.manager.updateSessionAssignment('session-one', old.agent.agentId);
    h.manager.on('getChatHistory', async ({ agentId }) => { if (h.manager.sessionAssignments.get('session-one') !== agentId) throw new Error('Access denied'); return { messages: ['Assigned transcript'] }; });
    expect((await h.manager.getChatHistory(old.agent.agentId, { sessionId: 'session-one' })).messages).toHaveLength(1);
    h.manager.updateSessionAssignment('session-one', current.agent.agentId);
    old.agent.activeChats.add('session-one'); // Stale local room state must not authorize delivery.
    old.socket.emit.mockClear(); current.socket.emit.mockClear();
    await h.manager.sendMessageToChatRoom('session-one', { id: 'message-one', content: 'Assigned transcript' });
    expect(old.socket.emit).not.toHaveBeenCalled(); expect(current.socket.emit).toHaveBeenCalledWith('messageReceived', expect.objectContaining({ messageId: 'message-one' }));
    await expect(h.manager.getChatHistory(old.agent.agentId, { sessionId: 'session-one' })).rejects.toThrow('Access denied');
    await expect(h.manager.getCustomerInfo(old.agent.agentId, { sessionId: 'session-one', customerId: 'customer-one' })).rejects.toThrow('Assigned session required');
    await old.event('typing', { sessionId: 'session-one', isTyping: true });
    expect(h.target.emit.mock.calls.some(([event]) => event === 'agentTyping')).toBe(false);
    for (const a of [old, current]) clearTimeout(a.agent.expiryTimer);
});

test('expiry revokes active rooms and prevents queued history disclosure after an await', async () => {
    const h = fixture(); const a = await h.add('agent-one');
    h.manager.updateSessionAssignment('session-one', a.agent.agentId);
    h.manager.on('getChatHistory', async () => { a.agent.expiresAt = Date.now() - 1; return { messages: ['Private transcript'] }; });
    await expect(h.manager.getChatHistory(a.agent.agentId, { sessionId: 'session-one' })).rejects.toThrow('Agent authentication required');
    expect(a.socket.leave).toHaveBeenCalledWith('chat_session-one'); expect(a.socket.disconnect).toHaveBeenCalledWith(true);
    expect(h.manager.connectedAgents.has(a.socket.id)).toBe(false);
    await h.manager.sendMessageToChatRoom('session-one', { id: 'message-one', content: 'Private transcript' });
    expect(a.socket.emit.mock.calls.some(([event]) => event === 'messageReceived')).toBe(false);
});

test('acceptance returns canonical assigned customer context rather than request fields', async () => {
    const h = fixture(); const a = await h.add('agent-one');
    h.manager.on('acceptChat', async () => ({ sessionId: 'session-one', customerId: 'customer-one', customerName: 'Canonical customer' }));
    await a.event('acceptChat', { sessionId: 'session-one', customerName: 'Forged profile' });
    const accepted = a.socket.emit.mock.calls.find(([event]) => event === 'chatAccepted')[1];
    expect(accepted.customerName).toBe('Canonical customer'); expect(h.manager.isAssigned(a.agent, 'session-one')).toBe(true);
    clearTimeout(a.agent.expiryTimer);
});

test('browser agentId hints cannot change the canonical history or customer-info actor', async () => {
    const h = fixture(); const a = await h.add('agent-one'); h.manager.updateSessionAssignment('session-one', a.agent.agentId);
    const history = jest.fn(async () => ({ messages: [] })); const customer = jest.fn(async () => ({}));
    h.manager.on('getChatHistory', history); h.manager.on('getCustomerInfo', customer);
    await h.manager.getChatHistory(a.agent.agentId, { sessionId: 'session-one', agentId: 'another-agent' });
    await h.manager.getCustomerInfo(a.agent.agentId, { sessionId: 'session-one', agentId: 'another-agent' });
    expect(history.mock.calls[0][0].historyRequest.agentId).toBe(a.agent.agentId);
    expect(customer.mock.calls[0][0].agentId).toBe(a.agent.agentId);
    clearTimeout(a.agent.expiryTimer);
});
