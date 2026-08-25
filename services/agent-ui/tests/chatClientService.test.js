const EventEmitter = require('events');

jest.mock('../services/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    chat: jest.fn()
}));

jest.mock('socket.io-client', () => jest.fn());

const jwt = require('jsonwebtoken');
const io = require('socket.io-client');
const logger = require('../services/logger');
const ChatClientService = require('../services/chatClientService');
const { connectChatBackendAtStartup } = require('../server');

const originalEnv = { ...process.env };

function createSocket(id) {
    const socket = new EventEmitter();
    socket.id = id;
    socket.disconnect = jest.fn();
    return socket;
}

async function completeConnection(service, socket, tokenOverride) {
    const connection = service.connect(tokenOverride);
    await Promise.resolve();
    socket.emit('connect');
    socket.emit('authenticationSuccess');
    await connection;
}

beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.CHAT_BACKEND_SERVICE_TOKEN;
    jest.clearAllMocks();
});

afterEach(() => {
    jest.useRealTimers();
});

afterAll(() => {
    process.env = originalEnv;
});

describe('ChatClientService payload normalization', () => {
    test('sends the flat payload expected by chat-backend', async () => {
        const service = new ChatClientService();
        service.isConnected = true;
        service.sendRequest = jest.fn().mockResolvedValue({ delivered: true });

        await service.sendMessage('session-1', {
            messageId: 'message-1',
            content: 'Hello',
            type: 'text',
            agentId: 'agent-1'
        });

        expect(service.sendRequest).toHaveBeenCalledWith('sendMessage', expect.objectContaining({
            sessionId: 'session-1',
            messageId: 'message-1',
            content: 'Hello',
            type: 'text'
        }));
        expect(service.sendRequest.mock.calls[0][1]).not.toHaveProperty('message');
    });

    test('normalizes backend history messages for the browser', async () => {
        const service = new ChatClientService();
        service.sendRequest = jest.fn().mockResolvedValue({
            messages: [{
                id: 'history-1',
                direction: 'incoming',
                content: 'Need help',
                createdAt: '2026-08-25T12:00:00.000Z'
            }]
        });

        const result = await service.getSessionHistory('session-1');
        expect(result.messages[0]).toMatchObject({
            messageId: 'history-1',
            sessionId: 'session-1',
            sender: 'customer',
            content: 'Need help'
        });
    });
});

describe('ChatClientService service-principal authentication', () => {
    test('signs a short-lived service JWT when no configured token exists', async () => {
        process.env.JWT_SECRET = 'agent-ui-service-secret';
        const socket = createSocket('generated-token-socket');
        io.mockReturnValue(socket);
        const service = new ChatClientService();

        await completeConnection(service, socket);

        const token = io.mock.calls[0][1].auth.token;
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        expect(decoded).toMatchObject({
            userId: 'agent-ui-service',
            role: 'service',
            service: 'agent-ui'
        });
        expect(decoded.exp - decoded.iat).toBe(5 * 60);
        expect(JSON.stringify([
            ...logger.info.mock.calls,
            ...logger.warn.mock.calls,
            ...logger.error.mock.calls,
            ...logger.chat.mock.calls
        ])).not.toContain(token);

        await service.disconnect();
    });

    test('prefers an explicitly configured service token without requiring JWT_SECRET', async () => {
        process.env.CHAT_BACKEND_SERVICE_TOKEN = 'configured-service-token';
        delete process.env.JWT_SECRET;
        const socket = createSocket('configured-token-socket');
        io.mockReturnValue(socket);
        const service = new ChatClientService();

        await completeConnection(service, socket);

        expect(io.mock.calls[0][1].auth.token).toBe('configured-service-token');
        expect(service.authTokenSource).toBe('configured');
        await service.disconnect();
    });

    test('issues a fresh generated token for a reconnect attempt', async () => {
        jest.useFakeTimers();
        process.env.JWT_SECRET = 'agent-ui-reconnect-secret';
        const firstSocket = createSocket('first-socket');
        const secondSocket = createSocket('second-socket');
        io.mockReturnValueOnce(firstSocket).mockReturnValueOnce(secondSocket);
        const service = new ChatClientService();
        service.reconnectDelay = 100;

        await completeConnection(service, firstSocket);
        const firstToken = io.mock.calls[0][1].auth.token;

        firstSocket.emit('disconnect', 'transport close');
        jest.advanceTimersByTime(service.reconnectDelay);
        await Promise.resolve();
        await Promise.resolve();

        expect(io).toHaveBeenCalledTimes(2);
        const secondToken = io.mock.calls[1][1].auth.token;
        expect(secondToken).not.toBe(firstToken);
        expect(jwt.verify(secondToken, process.env.JWT_SECRET)).toMatchObject({
            userId: 'agent-ui-service',
            role: 'service',
            service: 'agent-ui'
        });

        secondSocket.emit('connect');
        secondSocket.emit('authenticationSuccess');
        await Promise.resolve();
        await service.disconnect();
    });

    test('starts the backend connection without waiting for an agent token', async () => {
        const client = { connect: jest.fn().mockResolvedValue(true) };

        await connectChatBackendAtStartup(client);

        expect(client.connect).toHaveBeenCalledTimes(1);
        expect(client.connect).toHaveBeenCalledWith();
    });
});
