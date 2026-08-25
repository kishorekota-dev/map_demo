const EventEmitter = require('events');
const jwt = require('jsonwebtoken');

jest.mock('../logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

const SocketHandler = require('../socketHandler');

const JWT_SECRET = 'socket-agent-authorization-test-secret';

function createHarness(session = null) {
    const roomEmit = jest.fn();
    const io = {
        on: jest.fn(),
        to: jest.fn(() => ({ emit: roomEmit }))
    };
    const chatService = Object.assign(new EventEmitter(), {
        getConversationHistory: jest.fn(() => []),
        getMessageHistory: jest.fn(async () => []),
        sendResponse: jest.fn(async () => ({ id: 'response-1' }))
    });
    const agentOrchestrator = new EventEmitter();
    const sessionManager = Object.assign(new EventEmitter(), {
        getSession: jest.fn(async () => session),
        updateSession: jest.fn(async () => session)
    });
    const socket = {
        id: 'socket-1',
        handshake: {
            auth: {},
            headers: {},
            address: '127.0.0.1'
        },
        join: jest.fn(async () => undefined),
        leave: jest.fn(async () => undefined),
        emit: jest.fn()
    };
    const handler = new SocketHandler(io, chatService, agentOrchestrator, sessionManager);

    return { handler, socket, chatService, sessionManager, io, roomEmit };
}

function setClient(handler, socket, overrides = {}) {
    const client = {
        socket,
        sessionId: null,
        userId: 'customer-1',
        principalId: 'customer-1',
        role: null,
        service: null,
        verifiedPrincipal: null,
        isAuthenticated: true,
        isAgentPrincipal: false,
        canRelayAgent: false,
        agentAssignments: new Map(),
        metadata: {},
        ...overrides
    };
    handler.connectedClients.set(socket.id, client);
    return client;
}

function responseFor(socket, requestId) {
    return socket.emit.mock.calls
        .filter(([event]) => event === 'response')
        .map(([, payload]) => payload)
        .find(payload => payload.requestId === requestId);
}

function assignedSession(agentId = 'agent-7', status = 'assigned') {
    return {
        sessionId: 'session-1',
        userId: 'customer-1',
        state: {
            assignedAgentId: agentId,
            assignmentStatus: status
        }
    };
}

describe('SocketHandler agent principal authentication', () => {
    const previousSecret = process.env.JWT_SECRET;

    beforeAll(() => {
        process.env.JWT_SECRET = JWT_SECRET;
    });

    afterAll(() => {
        if (previousSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previousSecret;
    });

    test.each([
        [{ userId: 'agent-7', role: 'agent' }, 'agent-7', 'agent', null, false],
        [
            { userId: 'agent-ui-service', role: 'service', service: 'agent-ui' },
            'agent-ui-service',
            'service',
            'agent-ui',
            true
        ]
    ])('joins a verified agent principal to the agents room', async (
        claims,
        principalId,
        role,
        service,
        canRelayAgent
    ) => {
        const { handler, socket } = createHarness();
        const client = setClient(handler, socket, { isAuthenticated: false });
        const token = jwt.sign(claims, JWT_SECRET);

        await handler.handleAuthentication(socket, { token });

        expect(socket.join).toHaveBeenCalledWith('agents');
        expect(client).toMatchObject({
            principalId,
            userId: principalId,
            role,
            service,
            verifiedPrincipal: { subject: principalId, role, service },
            isAgentPrincipal: true,
            canRelayAgent
        });
        expect(socket.emit).toHaveBeenCalledWith(
            'authenticationSuccess',
            expect.objectContaining({ userId: principalId, role, service })
        );
    });

    test('does not grant agent access from handshake or caller-controlled sessionData', async () => {
        const { handler, socket } = createHarness();
        const client = setClient(handler, socket, { isAuthenticated: false });
        socket.handshake.auth.service = 'agent-ui';
        const token = jwt.sign({
            userId: 'customer-1',
            sessionData: { source: 'agent-ui', requestedRole: 'service' }
        }, JWT_SECRET);

        await handler.handleAuthentication(socket, { token, service: 'agent-ui' });

        expect(socket.join).not.toHaveBeenCalledWith('agents');
        expect(client).toMatchObject({
            principalId: 'customer-1',
            isAuthenticated: true,
            isAgentPrincipal: false,
            canRelayAgent: false
        });
    });

    test.each([
        [{ userId: 'almost-service', role: 'service' }],
        [{ userId: 'wrong-service', role: 'service', service: 'other-service' }],
        [{ userId: 'service-name-only', service: 'agent-ui' }]
    ])('requires both exact service-principal claims', async claims => {
        const { handler, socket } = createHarness();
        const client = setClient(handler, socket, { isAuthenticated: false });

        await handler.handleAuthentication(socket, { token: jwt.sign(claims, JWT_SECRET) });

        expect(client.isAgentPrincipal).toBe(false);
        expect(client.canRelayAgent).toBe(false);
        expect(socket.join).not.toHaveBeenCalledWith('agents');
    });

    test('requires a verified token subject', async () => {
        const { handler, socket } = createHarness();
        setClient(handler, socket, { isAuthenticated: false });
        const token = jwt.sign({ role: 'service', service: 'agent-ui' }, JWT_SECRET);

        await handler.handleAuthentication(socket, { token });

        expect(socket.join).not.toHaveBeenCalledWith('agents');
        expect(socket.emit).toHaveBeenCalledWith(
            'authenticationError',
            expect.objectContaining({ error: 'Authentication failed' })
        );
    });

    test('removes room access and cached assignments when the principal changes', async () => {
        const { handler, socket } = createHarness();
        const client = setClient(handler, socket, {
            isAuthenticated: false,
            userId: null,
            principalId: null,
            agentAssignments: new Map([['session-1', 'agent-7']])
        });
        const agentToken = jwt.sign({ userId: 'agent-7', role: 'agent' }, JWT_SECRET);
        const customerToken = jwt.sign({ userId: 'customer-2' }, JWT_SECRET);

        await handler.handleAuthentication(socket, { token: agentToken });
        await handler.handleAuthentication(socket, { token: customerToken });

        expect(socket.leave).toHaveBeenCalledWith('agents');
        expect(client).toMatchObject({
            principalId: 'customer-2',
            isAgentPrincipal: false,
            canRelayAgent: false
        });
        expect(client.agentAssignments.size).toBe(0);
    });
});

describe('SocketHandler assigned session authorization', () => {
    test('allows the customer owner to join their session', async () => {
        const session = assignedSession();
        const { handler, socket, chatService } = createHarness(session);
        setClient(handler, socket);

        await handler.handleJoinSession(socket, { sessionId: session.sessionId });

        expect(socket.join).toHaveBeenCalledWith('session:session-1');
        expect(chatService.getConversationHistory).toHaveBeenCalledWith('session-1');
        expect(socket.emit).toHaveBeenCalledWith(
            'sessionJoined',
            expect.objectContaining({ sessionId: 'session-1' })
        );
    });

    test('allows only the directly assigned agent identity', async () => {
        const session = assignedSession('agent-7');
        const { handler, socket } = createHarness(session);
        setClient(handler, socket, {
            userId: 'agent-7',
            principalId: 'agent-7',
            role: 'agent',
            isAgentPrincipal: true
        });

        await handler.handleJoinSession(socket, { sessionId: session.sessionId });

        expect(socket.join).toHaveBeenCalledWith('session:session-1');
    });

    test('allows the Agent UI service to relay only for the active assigned agent', async () => {
        const session = assignedSession('agent-7');
        const { handler, socket } = createHarness(session);
        setClient(handler, socket, {
            userId: 'agent-ui-service',
            principalId: 'agent-ui-service',
            role: 'service',
            service: 'agent-ui',
            isAgentPrincipal: true,
            canRelayAgent: true
        });

        await handler.handleJoinSession(socket, {
            sessionId: session.sessionId,
            agentId: 'agent-7'
        });

        expect(socket.join).toHaveBeenCalledWith('session:session-1');
    });

    test('denies an Agent UI relay that does not identify an assigned agent', async () => {
        const session = assignedSession('agent-7');
        const { handler, socket, chatService } = createHarness(session);
        setClient(handler, socket, {
            userId: 'agent-ui-service',
            principalId: 'agent-ui-service',
            role: 'service',
            service: 'agent-ui',
            isAgentPrincipal: true,
            canRelayAgent: true
        });

        await handler.handleJoinSession(socket, { sessionId: session.sessionId });

        expect(socket.join).not.toHaveBeenCalledWith('session:session-1');
        expect(chatService.getConversationHistory).not.toHaveBeenCalled();
        expect(socket.emit).toHaveBeenCalledWith('sessionError', { error: 'Access denied' });
    });

    test.each([
        ['agent-ui service with a mismatched identity', {
            userId: 'agent-ui-service',
            principalId: 'agent-ui-service',
            role: 'service',
            service: 'agent-ui',
            isAgentPrincipal: true,
            canRelayAgent: true
        }, { agentId: 'agent-8' }, assignedSession('agent-7')],
        ['an unassigned direct agent', {
            userId: 'agent-8',
            principalId: 'agent-8',
            role: 'agent',
            isAgentPrincipal: true
        }, {}, assignedSession('agent-7')],
        ['an agent after the assignment ended', {
            userId: 'agent-7',
            principalId: 'agent-7',
            role: 'agent',
            isAgentPrincipal: true
        }, {}, assignedSession('agent-7', 'ended')]
    ])('denies %s', async (_label, clientOverrides, request, session) => {
        const { handler, socket, chatService } = createHarness(session);
        setClient(handler, socket, clientOverrides);

        await handler.handleJoinSession(socket, { sessionId: session.sessionId, ...request });

        expect(socket.join).not.toHaveBeenCalledWith('session:session-1');
        expect(chatService.getConversationHistory).not.toHaveBeenCalled();
        expect(socket.emit).toHaveBeenCalledWith('sessionError', { error: 'Access denied' });
    });
});

describe('SocketHandler agent relay requests', () => {
    test.each([
        ['top-level', { agentId: 'agent-7' }],
        ['legacy metadata', { metadata: { agentId: 'agent-7', source: 'agent-ui' } }]
    ])('attributes a service-relayed message from %s agent ID to the assignment', async (
        _location,
        agentAssertion
    ) => {
        const session = assignedSession('agent-7');
        const { handler, socket, chatService } = createHarness(session);
        setClient(handler, socket, {
            userId: 'agent-ui-service',
            principalId: 'agent-ui-service',
            role: 'service',
            service: 'agent-ui',
            isAgentPrincipal: true,
            canRelayAgent: true
        });

        await handler.handleAgentRequest(socket, {
            requestId: 'request-1',
            type: 'sendMessage',
            data: {
                sessionId: session.sessionId,
                content: 'I can help with that.',
                ...agentAssertion
            }
        });

        expect(chatService.sendResponse).toHaveBeenCalledWith(
            'session-1',
            { content: 'I can help with that.', type: 'text' },
            { agentId: 'agent-7', agentType: 'human' }
        );
        expect(responseFor(socket, 'request-1')).toMatchObject({
            success: true,
            result: { agentId: 'agent-7', delivered: true }
        });
    });

    test.each([
        ['mismatched service assertion', {
            principalId: 'agent-ui-service',
            userId: 'agent-ui-service',
            role: 'service',
            service: 'agent-ui',
            isAgentPrincipal: true,
            canRelayAgent: true
        }, 'agent-8'],
        ['direct agent spoofing another agent', {
            principalId: 'agent-8',
            userId: 'agent-8',
            role: 'agent',
            isAgentPrincipal: true,
            canRelayAgent: false
        }, 'agent-7']
    ])('rejects %s', async (_label, clientOverrides, requestedAgentId) => {
        const session = assignedSession('agent-7');
        const { handler, socket, chatService } = createHarness(session);
        setClient(handler, socket, clientOverrides);

        await handler.handleAgentRequest(socket, {
            requestId: 'request-denied',
            type: 'sendMessage',
            data: {
                sessionId: session.sessionId,
                content: 'Spoofed message',
                agentId: requestedAgentId
            }
        });

        expect(chatService.sendResponse).not.toHaveBeenCalled();
        expect(responseFor(socket, 'request-denied')).toMatchObject({
            success: false,
            error: 'Access denied'
        });
    });

    test('prevents a customer from assigning an agent', async () => {
        const session = assignedSession(null, null);
        const { handler, socket, sessionManager } = createHarness(session);
        setClient(handler, socket);

        await handler.handleAgentRequest(socket, {
            requestId: 'request-customer',
            type: 'assignAgent',
            data: { sessionId: session.sessionId, agentId: 'customer-1' }
        });

        expect(sessionManager.updateSession).not.toHaveBeenCalled();
        expect(responseFor(socket, 'request-customer')).toMatchObject({
            success: false,
            error: 'Agent authorization required'
        });
    });

    test('allows the verified assignee to read ended-session history without reopening it', async () => {
        const session = assignedSession('agent-7', 'ended');
        const { handler, socket, chatService } = createHarness(session);
        setClient(handler, socket, {
            userId: 'agent-7',
            principalId: 'agent-7',
            role: 'agent',
            isAgentPrincipal: true
        });

        await handler.handleAgentRequest(socket, {
            requestId: 'request-history',
            type: 'getSessionHistory',
            data: { sessionId: session.sessionId }
        });

        expect(chatService.getMessageHistory).toHaveBeenCalledWith('session-1');
        expect(responseFor(socket, 'request-history')).toMatchObject({
            success: true,
            result: { sessionId: 'session-1', messages: [] }
        });
        expect(socket.join).not.toHaveBeenCalledWith('session:session-1');
    });

    test('persists a service assignment for a subsequent session-room join', async () => {
        const session = assignedSession(null, null);
        const { handler, socket, sessionManager } = createHarness(session);
        const client = setClient(handler, socket, {
            userId: 'agent-ui-service',
            principalId: 'agent-ui-service',
            role: 'service',
            service: 'agent-ui',
            isAgentPrincipal: true,
            canRelayAgent: true
        });
        sessionManager.updateSession.mockImplementation(async (_sessionId, updates) => {
            session.state = { ...session.state, ...updates.state };
            return session;
        });

        await handler.handleAgentRequest(socket, {
            requestId: 'request-assign',
            type: 'assignAgent',
            data: { sessionId: session.sessionId, agentId: 'agent-7' }
        });
        await handler.handleJoinSession(socket, { sessionId: session.sessionId });

        expect(client.agentAssignments.get('session-1')).toBe('agent-7');
        expect(socket.join).toHaveBeenCalledWith('session:session-1');
    });
});
