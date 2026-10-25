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

  test('carries the bound channel to the workflow and uses its published intent', async () => {
    const orchestrator = new AgentOrchestrator();
    orchestrator.classifyIntent = jest.fn().mockResolvedValue('help');
    orchestrator.callOrchestrator = jest.fn().mockResolvedValue({ type: 'complete', intent: 'balance_inquiry', response: 'Balance response', metadata: { version: 3, channel: 'ava' } });
    const result = await orchestrator.processMessage('s', { id: 'm', content: 'my custom balance phrase', userId: 'u', authToken: 'access' }, { channel: 'ava' });
    expect(orchestrator.callOrchestrator).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ metadata: { channel: 'ava' } }) }));
    expect(result.finalResponse.metadata).toMatchObject({ intent: 'balance_inquiry', version: 3, channel: 'ava' });
  });

  test('published human routing emits the queue and clears pending automated confirmation', () => {
    const orchestrator = new AgentOrchestrator();
    const escalation = jest.fn();
    orchestrator.on('humanEscalation', escalation);
    const result = orchestrator.mapWorkflowResult({ type: 'human_escalation', intent: 'transfer_funds', message: 'Connecting to support',
      metadata: { version: 4, channel: 'ivr', queue: 'payments_ops', journeyId: 'payments', reason: 'channel_requires_human' } },
    { intent: 'help', sessionId: 's', startTime: Date.now() });
    expect(escalation).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's', queue: 'payments_ops', journeyId: 'payments' }));
    expect(result.conversationContextUpdates).toMatchObject({ escalationRequired: true, pendingFeedback: null, lockedIntent: null });
    expect(result.finalResponse.metadata).toMatchObject({ version: 4, intent: 'transfer_funds', queue: 'payments_ops' });
  });

  test('model outage retains pending confirmation so the customer retry continues the same workflow', async () => {
    const orchestrator = new AgentOrchestrator();
    orchestrator.classifyIntent = jest.fn();
    orchestrator.callOrchestrator = jest.fn()
      .mockResolvedValueOnce({ type: 'policy_blocked', code: 'model_unavailable', stage: 'model', message: 'Please try again later.' })
      .mockResolvedValueOnce({ type: 'complete', intent: 'transfer_funds', response: 'Transfer completed.' });
    let context = { userId: 'u', authToken: 'access', lockedIntent: 'transfer_funds',
      pendingFeedback: { type: 'confirmation_required', intent: 'transfer_funds' } };

    const first = await orchestrator.processMessage('s', { id: 'm1', content: 'yes' }, context);
    context = { ...context, ...first.conversationContextUpdates };
    expect(first.finalResponse.metadata.policyCode).toBe('model_unavailable');
    expect(context.pendingFeedback).toEqual({ type: 'confirmation_required', intent: 'transfer_funds' });
    expect(context.lockedIntent).toBe('transfer_funds');

    const retry = await orchestrator.processMessage('s', { id: 'm2', content: 'yes' }, context);
    expect(orchestrator.classifyIntent).not.toHaveBeenCalled();
    expect(orchestrator.callOrchestrator).toHaveBeenCalledTimes(2);
    for (const [request] of orchestrator.callOrchestrator.mock.calls) {
      expect(request).toMatchObject({ path: '/api/orchestrator/feedback',
        payload: { sessionId: 's', response: 'yes', confirmed: true } });
    }
    expect(retry.conversationContextUpdates).toMatchObject({ pendingFeedback: null, lockedIntent: null });
  });
});

describe('AgentOrchestrator request deadlines', () => {
  const originalWorkflowTimeout = process.env.AGENT_RESPONSE_TIMEOUT;
  const originalNluTimeout = process.env.NLU_REQUEST_TIMEOUT_MS;
  beforeEach(() => {
    axios.post.mockReset();
    delete process.env.AGENT_RESPONSE_TIMEOUT;
    delete process.env.NLU_REQUEST_TIMEOUT_MS;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    if (originalWorkflowTimeout === undefined) delete process.env.AGENT_RESPONSE_TIMEOUT;
    else process.env.AGENT_RESPONSE_TIMEOUT = originalWorkflowTimeout;
    if (originalNluTimeout === undefined) delete process.env.NLU_REQUEST_TIMEOUT_MS;
    else process.env.NLU_REQUEST_TIMEOUT_MS = originalNluTimeout;
  });

  test('passes the longer workflow deadline to Axios and its abort timer while keeping NLU short', async () => {
    const timer = jest.spyOn(global, 'setTimeout');
    const orchestrator = new AgentOrchestrator();
    axios.post.mockResolvedValueOnce({ data: { type: 'complete' } })
      .mockResolvedValueOnce({ data: { intent: 'balance_inquiry' } });
    await orchestrator.callOrchestrator({ path: '/api/orchestrator/process', payload: {}, authToken: 'token' });
    expect(axios.post).toHaveBeenNthCalledWith(1, expect.any(String), {}, expect.objectContaining({ timeout: 400000 }));
    expect(timer).toHaveBeenCalledWith(expect.any(Function), 400000);
    await orchestrator.classifyIntent('check balance', 'session-1', {});
    expect(axios.post).toHaveBeenNthCalledWith(2, expect.any(String), expect.any(Object), expect.objectContaining({ timeout: 5000 }));
    expect(timer).toHaveBeenCalledWith(expect.any(Function), 5000);
  });

  test.each([
    ['480000', 480000], ['999999', 590000], ['0', 1000], ['-10', 1000],
    ['', 400000], ['bad', 400000], ['12000ms', 400000], ['Infinity', 400000], ['123.5', 400000]
  ])('uses a bounded workflow timeout for %p', async (value, expected) => {
    process.env.AGENT_RESPONSE_TIMEOUT = value;
    axios.post.mockResolvedValue({ data: {} });
    const orchestrator = new AgentOrchestrator();
    await orchestrator.callOrchestrator({ path: '/api/orchestrator/feedback', payload: {} });
    expect(axios.post.mock.calls[0][2].timeout).toBe(expected);
  });

  test('independently bounds an explicit NLU budget', async () => {
    process.env.NLU_REQUEST_TIMEOUT_MS = '999999';
    axios.post.mockResolvedValue({ data: { intent: 'help' } });
    const orchestrator = new AgentOrchestrator();
    await orchestrator.classifyIntent('help', 'session-1', {});
    expect(axios.post.mock.calls[0][2].timeout).toBe(120000);
    expect(orchestrator.requestTimeout).toBe(400000);
  });

  test('aborts at the configured deadline without retrying a dispatched workflow', async () => {
    jest.useFakeTimers();
    process.env.AGENT_RESPONSE_TIMEOUT = '1000';
    let capturedSignal;
    axios.post.mockImplementation((_url, _payload, options) => new Promise((_resolve, reject) => {
      capturedSignal = options.signal;
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { code: 'ERR_CANCELED' })));
    }));
    const orchestrator = new AgentOrchestrator();
    const outcome = expect(orchestrator.callOrchestrator({ path: '/api/orchestrator/process', payload: {} })).rejects.toThrow('aborted');
    await jest.advanceTimersByTimeAsync(1000);
    await outcome;
    expect(capturedSignal.aborted).toBe(true);
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
