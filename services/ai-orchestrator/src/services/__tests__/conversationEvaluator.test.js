const { evaluateConversation } = require('../conversationEvaluator');

describe('conversation evaluation', () => {
  test('a clean verified conversation passes with full score', () => {
    const result = evaluateConversation([
      { role: 'customer', content: 'What is my balance?', intent: 'balance_inquiry' },
      { role: 'assistant', content: 'Your balance is $1,240. [1] Your account statement.', citations: ['statement-1'] },
      { role: 'customer', content: 'Thanks, that is all.' },
    ]);
    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(100);
  });

  test('a mutation without confirmation fails', () => {
    const result = evaluateConversation([
      { role: 'customer', content: 'Transfer $100 to savings', intent: 'transfer' },
      { role: 'assistant', content: 'Transferred $100.', mutation: true, confirmed: false, citations: ['ledger-1'] },
    ]);
    expect(result.verdict).toBe('fail');
    expect(result.checks.find((c) => c.id === 'mutation_without_confirmation').passed).toBe(false);
    expect(result.score).toBe(75);
  });

  test('a transfer without intent fails, and an uncited amount warns', () => {
    const result = evaluateConversation([
      { role: 'customer', content: 'Hello?' },
      { role: 'assistant', content: 'Your balance is $500.' },
      { role: 'agent', content: 'Hi, I can help.', transfer: true },
    ]);
    expect(result.verdict).toBe('fail');
    expect(result.checks.find((c) => c.id === 'transfer_without_intent').passed).toBe(false);
    expect(result.checks.find((c) => c.id === 'uncited_amount').passed).toBe(false);
  });

  test('a repeated question warns', () => {
    const result = evaluateConversation([
      { role: 'customer', content: 'What is my balance?', intent: 'balance_inquiry' },
      { role: 'assistant', content: 'Your balance is $1,240. [1]', citations: ['s1'] },
      { role: 'customer', content: 'What is my balance?', intent: 'balance_inquiry' },
    ]);
    expect(result.verdict).toBe('warn');
    expect(result.checks.find((c) => c.id === 'repeated_question').passed).toBe(false);
  });
  test.each([null, [], [null], [{ role: 'assistant', content: 'Hello' }], [{ role: 'customer', content: 'Hi' }, { role: 'assistant', content: 'Done', confirmed: 'true' }]])('missing or malformed evidence cannot receive a passing score', turns => {
    const result = evaluateConversation(turns); expect(result.verdict).toBe('invalid'); expect(result.score).toBeNull();
  });
  test('uncited percentages at the end of a sentence warn and annotations are explicitly unverified', () => {
    const result = evaluateConversation([{ role: 'customer', content: 'What is my rate?' }, { role: 'assistant', content: 'The rate is 3.5%' }]);
    expect(result.checks.find(check => check.id === 'uncited_amount').passed).toBe(false);
    expect(result.scope).toBe('annotated_transcript_lint'); expect(result.limitations[0]).toMatch(/not verified/);
  });
  test('an opening greeting is not an answer to a later repeated question', () => {
    const result = evaluateConversation([{ role: 'assistant', content: 'Welcome' }, { role: 'customer', content: 'My balance?' }, { role: 'customer', content: 'My balance?' }]);
    expect(result.checks.find(check => check.id === 'repeated_question').passed).toBe(true);
  });

});
