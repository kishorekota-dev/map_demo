const axios = require('axios');

jest.mock('axios');
jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const AgentOrchestrator = require('../agentOrchestrator');

describe('AgentOrchestrator NLU contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sends the validated message field and returns the canonical intent', async () => {
    axios.post.mockResolvedValue({
      data: {
        success: true,
        data: { intent: 'balance_inquiry' }
      }
    });

    const orchestrator = new AgentOrchestrator();
    const intent = await orchestrator.classifyIntent(
      'What is my account balance?',
      'session-123',
      {}
    );

    expect(intent).toBe('balance_inquiry');
    expect(axios.post).toHaveBeenCalledWith(
      `${orchestrator.nluServiceUrl}/api/nlu/intents`,
      {
        message: 'What is my account balance?',
        sessionId: 'session-123'
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Session-ID': 'session-123'
        })
      })
    );
  });
});
