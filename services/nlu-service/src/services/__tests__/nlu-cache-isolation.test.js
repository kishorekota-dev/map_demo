jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const nluService = require('../nlu.service');

describe('NLU cache isolation', () => {
  beforeEach(() => {
    nluService.cache.flushAll();
    nluService.contexts.clear();
    nluService.enhanceWithNLP = jest.fn().mockResolvedValue(null);
  });

  test('does not reuse identity or context across users with identical text', async () => {
    const first = await nluService.detectIntent('hello', 'user-a', 'session-a');
    const second = await nluService.detectIntent('hello', 'user-b', 'session-b');

    expect(first.data).toMatchObject({ userId: 'user-a', sessionId: 'session-a' });
    expect(second.data).toMatchObject({ userId: 'user-b', sessionId: 'session-b' });
    expect(nluService.cache.keys()).toHaveLength(2);
  });

  test('expires stale session context using the configured max age', () => {
    nluService.contexts.set('stale-session', {
      lastIntent: 'balance_inquiry',
      timestamp: new Date(0).toISOString()
    });

    expect(nluService.getContext('stale-session')).toEqual({});
    expect(nluService.contexts.has('stale-session')).toBe(false);
  });
});
