jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const ChatService = require('../chatService');
const SessionManager = require('../sessionManager');
const DatabaseService = require('../databaseService');

describe('chat persistence adapters', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('restores complete message history from persistent storage', async () => {
    const timestamp = new Date('2026-01-02T03:04:05.000Z');
    const storedMessage = {
      id: '042e1a1a-08f1-4e0d-a20d-88b1d8f7c111',
      sessionId: 'c73ddb82-e06b-46d9-99df-a5406b548111',
      userId: 'user-1',
      direction: 'outgoing',
      content: 'Your balance is $25.',
      type: 'text',
      metadata: { suggestedActions: ['View transactions'] },
      processing: { bankingProcessed: true },
      agentInfo: { agentType: 'ai' },
      intent: 'check_balance',
      entities: { accountType: 'checking' },
      sentiment: 'neutral',
      confidenceScore: 0.98,
      processingTimeMs: 12,
      sequenceNumber: 0,
      timestamp
    };
    const databaseService = {
      getSession: jest.fn().mockResolvedValue({
        session_id: storedMessage.sessionId,
        user_id: 'user-1',
        is_active: true,
        status: 'active',
        created_at: timestamp,
        last_activity: timestamp,
        message_count: 1,
        metadata: { userData: { locale: 'en' } },
        conversation_context: { currentIntent: 'check_balance' },
        state: {}
      }),
      getConversationHistory: jest.fn().mockResolvedValue([storedMessage])
    };
    const chatService = new ChatService(databaseService);

    const history = await chatService.getConversationHistory(storedMessage.sessionId);

    expect(history).toEqual([storedMessage]);
    expect(chatService.getSession(storedMessage.sessionId)).toEqual(expect.objectContaining({
      userId: 'user-1',
      userData: { locale: 'en' },
      conversationContext: { currentIntent: 'check_balance' }
    }));
  });

  test('maps every persisted message field back to the public chat shape', () => {
    const timestamp = new Date('2026-01-02T03:04:05.000Z');
    const mapped = DatabaseService.prototype.toMessageData({
      message_id: 'message-1',
      session_id: 'session-1',
      user_id: 'user-1',
      direction: 'incoming',
      content: 'Show my balance',
      message_type: 'text',
      metadata: { channel: 'web' },
      processing: { nluProcessed: true },
      agent_info: { agentType: 'ai' },
      intent: 'check_balance',
      entities: { accountType: 'checking' },
      sentiment: 'neutral',
      confidence_score: 0.95,
      processing_time_ms: 8,
      parent_message_id: null,
      sequence_number: 3,
      created_at: timestamp
    });

    expect(mapped).toEqual({
      id: 'message-1',
      sessionId: 'session-1',
      userId: 'user-1',
      direction: 'incoming',
      content: 'Show my balance',
      type: 'text',
      metadata: { channel: 'web' },
      processing: { nluProcessed: true },
      agentInfo: { agentType: 'ai' },
      intent: 'check_balance',
      entities: { accountType: 'checking' },
      sentiment: 'neutral',
      confidenceScore: 0.95,
      processingTimeMs: 8,
      parentMessageId: null,
      sequenceNumber: 3,
      timestamp
    });
  });

  test('hydrates an active session and persists expiration with expired status semantics', async () => {
    const sessionId = 'c73ddb82-e06b-46d9-99df-a5406b548111';
    const databaseService = {
      getSession: jest.fn().mockResolvedValue({
        session_id: sessionId,
        user_id: 'user-1',
        is_active: true,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        last_activity: new Date('2026-01-01T00:01:00.000Z'),
        expires_at: new Date('2027-01-01T00:00:00.000Z'),
        metadata: {},
        conversation_context: {},
        state: {},
        statistics: { agentsUsed: ['banking'], intentsProcessed: ['check_balance'] },
        security: {},
        message_count: 2
      }),
      endSession: jest.fn().mockResolvedValue({})
    };
    const sessionManager = new SessionManager(databaseService);

    const restored = await sessionManager.getSession(sessionId);
    expect(restored.statistics.agentsUsed).toEqual(new Set(['banking']));
    expect(restored.statistics.intentsProcessed).toEqual(new Set(['check_balance']));
    expect(restored.statistics.messageCount).toBe(2);

    await sessionManager.endSession(sessionId, 'expired');
    expect(databaseService.endSession).toHaveBeenCalledWith(sessionId, 'expired');
  });

  test('increments persisted session statistics without lost concurrent updates', async () => {
    const sessionManager = new SessionManager();
    const session = await sessionManager.createSession('user-1');

    await Promise.all(Array.from({ length: 20 }, () =>
      sessionManager.incrementSessionStatistics(session.sessionId, { messageCount: 1 })
    ));

    expect((await sessionManager.getSession(session.sessionId)).statistics.messageCount).toBe(20);
  });
});
