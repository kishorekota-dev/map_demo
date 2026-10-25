const { computeOutcomeMetrics } = require('../outcomeAnalytics');
const { validateKnowledgeDocument, validateKnowledgeBatch } = require('../knowledgeValidation');

describe('outcome analytics', () => {
  const events = [
    // Customer A: completed, never returns, no case -> FCR + contained.
    { sessionId: 's1', actorHash: 'a', channel: 'digital', intent: 'balance_inquiry', outcome: 'completed', stage: 'conversation', type: 'runtime.execution', createdAt: '2026-10-01T10:00:00Z' },
    // Customer B: completed, then returns within 7 days -> not FCR, but contained (no case).
    { sessionId: 's2', actorHash: 'b', channel: 'ivr', intent: 'balance_inquiry', outcome: 'completed', stage: 'conversation', type: 'runtime.execution', createdAt: '2026-10-01T10:00:00Z' },
    { sessionId: 's3', actorHash: 'b', channel: 'digital', intent: 'balance_inquiry', outcome: 'completed', stage: 'conversation', type: 'runtime.execution', createdAt: '2026-10-03T10:00:00Z' },
    // Customer C: failed, with a case -> not completed, not contained.
    { sessionId: 's4', actorHash: 'c', channel: 'digital', intent: 'dispute_charge', outcome: 'failed', stage: 'conversation', type: 'runtime.execution', createdAt: '2026-10-01T10:00:00Z' },
    { sessionId: 's4', actorHash: 'c', channel: 'digital', intent: 'dispute_charge', outcome: null, stage: null, type: 'case.created', createdAt: '2026-10-01T11:00:00Z' },
  ];

  test('computes completion, FCR, containment, repeat and channel breakdown', () => {
    const metrics = computeOutcomeMetrics(events);
    expect(metrics.interactions).toBe(4);
    expect(metrics.completed).toBe(3);
    expect(metrics.completionRate).toBe(0.75);
    // FCR: A yes, B's s2 no (return in 7d), B's s3 yes (no return after), C no.
    expect(metrics.firstContactResolved).toBe(2);
    expect(metrics.firstContactResolutionRate).toBeCloseTo(2 / 3, 4);
    // Containment: s1, s2, s3 contained; s4 has a case.
    expect(metrics.containmentRate).toBe(0.75);
    // Repeat: B has 2 sessions, A and C have 1.
    expect(metrics.repeatContactRate).toBeCloseTo(1 / 3, 4);
    const ivr = metrics.byChannel.find((c) => c.channel === 'ivr');
    expect(ivr.interactions).toBe(1);
    expect(ivr.completed).toBe(1);
  });

  test('empty input returns null rates, not NaN', () => {
    const metrics = computeOutcomeMetrics([]);
    expect(metrics.interactions).toBe(0);
    expect(metrics.completionRate).toBeNull();
    expect(metrics.firstContactResolutionRate).toBeNull();
  });
});

describe('knowledge validation', () => {
  const good = {
    id: 'doc-1',
    title: 'Balance inquiry help',
    content: 'Customers can check their balance in the app or by calling support during business hours.',
    source: 'https://help.example.com/balance',
    version: '2026-10-01',
  };

  test('accepts a complete document and rejects PII, stubs and duplicates', () => {
    expect(validateKnowledgeDocument(good).valid).toBe(true);
    expect(validateKnowledgeDocument({ ...good, content: 'Contact me at jane@example.com for help with balances today.' }).valid).toBe(false);
    expect(validateKnowledgeDocument({ ...good, content: 'Short.' }).valid).toBe(false);
    expect(validateKnowledgeDocument({ ...good, source: 'unknown' }).valid).toBe(false);
    const batch = validateKnowledgeBatch([good, good]);
    expect(batch.valid).toBe(false);
    expect(batch.errors.some((e) => e.includes('duplicate id'))).toBe(true);
  });
});
