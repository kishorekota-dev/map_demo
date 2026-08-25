const EventEmitter = require('events');

jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const SocketHandler = require('../socketHandler');

describe('SocketHandler session creation', () => {
  test('uses the SessionManager ID for ChatService, rooms, and client state', async () => {
    const io = {
      on: jest.fn(),
      to: jest.fn(() => ({ emit: jest.fn() }))
    };
    const chatService = Object.assign(new EventEmitter(), {
      createChatSession: jest.fn(async (userId, sessionId) => ({ userId, sessionId }))
    });
    const agentOrchestrator = new EventEmitter();
    const sessionManager = Object.assign(new EventEmitter(), {
      createSession: jest.fn(async () => ({ sessionId: 'session-canonical', state: {} }))
    });
    const socket = {
      id: 'socket-1',
      join: jest.fn(),
      emit: jest.fn()
    };

    const handler = new SocketHandler(io, chatService, agentOrchestrator, sessionManager);
    handler.connectedClients.set(socket.id, {
      isAuthenticated: true,
      userId: 'user-1',
      metadata: {}
    });

    await handler.handleCreateSession(socket, { metadata: {}, userData: { locale: 'en' } });

    expect(chatService.createChatSession).toHaveBeenCalledWith(
      'user-1',
      'session-canonical',
      { locale: 'en' }
    );
    expect(handler.connectedClients.get(socket.id).sessionId).toBe('session-canonical');
    expect(socket.join).toHaveBeenCalledWith('session:session-canonical');
    expect(socket.emit).toHaveBeenCalledWith(
      'sessionCreated',
      expect.objectContaining({ sessionId: 'session-canonical' })
    );
  });
});
