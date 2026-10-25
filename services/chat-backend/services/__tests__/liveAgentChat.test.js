const {
  LiveAgentQueue,
  isLiveAgentSession,
  validateLiveSender,
  buildLiveMessage,
  buildTransferContext,
} = require('../liveAgentChat');

describe('live agent queue', () => {
  test('FIFO order, positions, and duplicate requests do not double-queue', () => {
    const queue = new LiveAgentQueue();
    const first = queue.enqueue({ sessionId: 's1', customerId: 'c1', intent: 'balance_inquiry' });
    const second = queue.enqueue({ sessionId: 's2', customerId: 'c2' });
    expect(first.queuePosition).toBe(1);
    expect(second.queuePosition).toBe(2);
    const again = queue.enqueue({ sessionId: 's1', customerId: 'c1' });
    expect(again.alreadyQueued).toBe(true);
    expect(again.queuePosition).toBe(1);
    expect(queue.size()).toBe(2);
    expect(queue.dequeueForAgent().sessionId).toBe('s1');
    expect(queue.position('default', 's2')).toBe(1);
  });
});

describe('live agent session validation', () => {
  const liveSession = {
    sessionId: 's1',
    userId: 'c1',
    state: { liveAgentActive: true, liveAgentId: 'agent-7' },
  };
  const aiSession = { sessionId: 's1', userId: 'c1', state: {} };

  test('owner customer and assigned agent pass; others are denied', () => {
    expect(isLiveAgentSession(liveSession)).toBe(true);
    expect(isLiveAgentSession(aiSession)).toBe(false);
    expect(validateLiveSender({ role: 'customer', senderId: 'c1', session: liveSession })).toBe(true);
    expect(validateLiveSender({ role: 'agent', senderId: 'agent-7', session: liveSession })).toBe(true);
    expect(() => validateLiveSender({ role: 'customer', senderId: 'c2', session: liveSession })).toThrow('Access denied');
    expect(() => validateLiveSender({ role: 'agent', senderId: 'agent-9', session: liveSession })).toThrow('Access denied');
    expect(() => validateLiveSender({ role: 'customer', senderId: 'c1', session: aiSession })).toThrow('not in live agent mode');
  });

  test('message validation rejects empty and over-long content', () => {
    expect(() => buildLiveMessage({ sessionId: 's1', senderRole: 'customer', senderId: 'c1', content: '   ' })).toThrow('Message content required');
    expect(() => buildLiveMessage({ sessionId: 's1', senderRole: 'customer', senderId: 'c1', content: 'x'.repeat(2001) })).toThrow('Message too long');
    const message = buildLiveMessage({ sessionId: 's1', senderRole: 'agent', senderId: 'agent-7', content: 'Hello, how can I help?' });
    expect(message.senderRole).toBe('agent');
    expect(message.content).toBe('Hello, how can I help?');
  });

  test('transfer context carries intent and recent messages, never tokens', () => {
    const context = buildTransferContext(
      { ...liveSession, state: { ...liveSession.state, lastIntent: 'dispute_charge' } },
      [
        { direction: 'incoming', content: 'I need to dispute a charge', timestamp: '2026-10-24T00:00:00Z' },
        { direction: 'outgoing', content: 'Which charge?', timestamp: '2026-10-24T00:01:00Z' },
      ],
    );
    expect(context.intent).toBe('dispute_charge');
    expect(context.recentMessages).toHaveLength(2);
    expect(JSON.stringify(context)).not.toMatch(/authToken|password|secret/i);
  });
});
