/**
 * Canonical intent vocabulary tests. Verifies the deterministic mapping from
 * every classifier vocabulary to the orchestrator's snake_case intents, and
 * (cross-service) that the canonical set matches the orchestrator exactly.
 */
const path = require('path');
const vocab = require('../intent-vocabulary');

describe('intent vocabulary mapping', () => {
  test('banking-nlu dotted names map to canonical intents', () => {
    expect(vocab.toCanonical('banking.balance.check')).toBe('balance_inquiry');
    expect(vocab.toCanonical('banking.transfer.money')).toBe('transfer_funds');
    expect(vocab.toCanonical('banking.card.block')).toBe('card_management');
    expect(vocab.toCanonical('banking.bill.payment')).toBe('payment_inquiry');
    expect(vocab.toCanonical('banking.account.info')).toBe('account_info');
    expect(vocab.toCanonical('banking.help')).toBe('help');
  });

  test('DialogFlow / display names map to canonical intents', () => {
    expect(vocab.toCanonical('check.balance')).toBe('balance_inquiry');
    expect(vocab.toCanonical('Default Welcome Intent')).toBe('general_inquiry');
    expect(vocab.toCanonical('report.fraud')).toBe('report_fraud');
  });

  test('already-canonical intents pass through unchanged', () => {
    for (const intent of vocab.CANONICAL_INTENTS) {
      expect(vocab.toCanonical(intent)).toBe(intent);
    }
  });

  test('unknown / empty / null inputs resolve to the deterministic fallback', () => {
    for (const bad of ['unknown', 'error', '', null, undefined, 'totally-made-up']) {
      expect(vocab.toCanonical(bad)).toBe(vocab.FALLBACK_INTENT);
    }
  });

  test('mapping is deterministic (same input -> same output)', () => {
    const a = vocab.toCanonical('banking.transfer.money');
    const b = vocab.toCanonical('banking.transfer.money');
    expect(a).toBe(b);
  });
});

describe('cross-service vocabulary parity', () => {
  test('NLU canonical intents exactly match the orchestrator intentConfig', () => {
    const orchestratorPath = path.join(
      __dirname, '..', '..', '..', '..', 'ai-orchestrator', 'config', 'intentConfig'
    );
    const orchestrator = require(orchestratorPath);
    const nluSet = [...vocab.CANONICAL_INTENTS].sort();
    const orchSet = [...orchestrator.getAllIntents()].sort();
    expect(nluSet).toEqual(orchSet);
  });
});
