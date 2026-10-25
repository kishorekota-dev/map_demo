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
    const metrics = computeOutcomeMetrics(events, { windowEnd: "2026-10-20T00:00:00Z" });
    expect(metrics.interactions).toBe(4);
    expect(metrics.completed).toBe(3);
    expect(metrics.completionRate).toBe(0.75);
    // FCR: A yes, B's s2 no (return in 7d), B's s3 yes (no return after), C no.
    expect(metrics.firstContactResolved).toBe(2);
    expect(metrics.firstContactResolutionRate).toBeCloseTo(2 / 3, 4);
    // Containment: s1, s2, s3 contained; s4 has a case.
    expect(metrics.containmentRate).toBeNull();
    expect(metrics.observedAutomatedCompletionRate).toBe(0.75);
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

const conversation = (sessionId, interactionId, createdAt, overrides = {}) => ({ sessionId, interactionId, createdAt,
  actorHash: sessionId, type: 'runtime.execution', stage: 'conversation', channel: 'digital', outcome: 'completed', ...overrides });
test('counts distinct interactions and takes the final outcome despite unsorted events', () => {
  const result = computeOutcomeMetrics([
    conversation('session', 'first', '2026-10-02T00:00:00Z', { outcome: 'awaiting_input' }),
    conversation('session', 'second', '2026-10-03T00:00:00Z'),
    conversation('session', 'first', '2026-10-01T00:00:00Z'),
  ], { windowEnd: '2026-10-20T00:00:00Z' });
  expect(result).toMatchObject({ interactions: 2, sessions: 1, completed: 1, completionRate: 0.5, firstContactEligibleCompleted: 1 });
});
test('recent and anonymous completions cannot inflate first-contact resolution', () => {
  const result = computeOutcomeMetrics([
    conversation('recent', 'i', '2026-10-19T00:00:00Z'),
    conversation('anonymous', 'i', '2026-10-01T00:00:00Z', { actorHash: null }),
  ], { windowEnd: '2026-10-20T00:00:00Z' });
  expect(result).toMatchObject({ completed: 2, firstContactResolved: 0, firstContactEligibleCompleted: 0,
    firstContactPendingObservation: 1, firstContactUnknownCustomer: 1, firstContactResolutionRate: null });
});
test('failed and handed-off sessions are not automated completions; earlier unrelated cases do not poison FCR', () => {
  const result = computeOutcomeMetrics([
    { type: 'case.created', sessionId: 'old', actorHash: 'customer', createdAt: '2026-09-01T00:00:00Z' },
    conversation('success', 'i', '2026-10-01T00:00:00Z', { actorHash: 'customer' }),
    conversation('failed', 'i', '2026-10-01T00:00:00Z', { outcome: 'failed' }),
    conversation('human', 'i', '2026-10-01T00:00:00Z', { outcome: 'handoff' }),
    conversation('human', 'i', '2026-10-02T00:00:00Z'),
  ], { windowEnd: '2026-10-20T00:00:00Z' });
  expect(result).toMatchObject({ interactions: 3, completed: 2, observedAutomatedCompletions: 1, firstContactResolved: 1, containmentRate: null });
});
test('malformed/future evidence is excluded and equal timestamps use sequence order', () => {
  const result = computeOutcomeMetrics([null, {}, conversation('s', 'i', 'invalid'),
    conversation('future', 'i', '2026-11-01T00:00:00Z'),
    conversation('s', 'i', '2026-10-01T00:00:00Z', { sequence: 2, outcome: 'failed' }),
    conversation('s', 'i', '2026-10-01T00:00:00Z', { sequence: 1 }),
  ], { windowEnd: '2026-10-20T00:00:00Z' });
  expect(result).toMatchObject({ interactions: 1, completed: 0, observedAutomatedCompletions: 0 });
});

test('connector knowledge uses server-assigned revisions and rejects unsafe URLs and separated card patterns', () => {
  const doc = { id: 'help', title: 'Approved help', content: 'This is a sufficiently detailed support guide.', source: 'Approved internal manual' };
  expect(validateKnowledgeDocument(doc).valid).toBe(true);
  expect(validateKnowledgeDocument({ ...doc, version: 1 }).valid).toBe(true);
  expect(validateKnowledgeDocument({ ...doc, source: 'https://user:password@example.invalid/path' }).valid).toBe(false);
  expect(validateKnowledgeDocument({ ...doc, source: 'javascript:alert(1)' }).valid).toBe(false);
  expect(validateKnowledgeDocument({ ...doc, content: 'This private card number is 4111 1111 1111 1111.' }).valid).toBe(false);
  expect(validateKnowledgeDocument({ ...doc, version: {} }).valid).toBe(false);
  expect(validateKnowledgeBatch([]).valid).toBe(false);
});
