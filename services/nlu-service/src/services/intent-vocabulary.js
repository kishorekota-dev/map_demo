/**
 * Canonical Intent Vocabulary
 *
 * The NLU service has historically emitted three incompatible intent
 * vocabularies (banking-nlu dotted names like "banking.balance.check",
 * DialogFlow display names like "check.balance" / "Default Welcome Intent",
 * and local labels), while the AI orchestrator only accepts snake_case names
 * such as "balance_inquiry". None of the raw names passed the orchestrator's
 * isValidIntent(), so classified intents were silently dropped.
 *
 * This module is the single deterministic translation layer: every classifier
 * result is normalised to ONE canonical vocabulary that exactly matches the
 * orchestrator's intentConfig. Unknown/low-confidence inputs resolve to a
 * single, well-defined fallback intent so behaviour is always defined.
 *
 * Keep CANONICAL_INTENTS in sync with
 * services/ai-orchestrator/config/intentConfig.js (enforced by a cross-service
 * contract test).
 */

const FALLBACK_INTENT = 'general_inquiry';

// The canonical orchestrator intents (snake_case).
const CANONICAL_INTENTS = [
  'balance_inquiry',
  'account_info',
  'account_statement',
  'transaction_history',
  'transfer_funds',
  'payment_inquiry',
  'card_management',
  'card_activation',
  'card_replacement',
  'dispute_transaction',
  'report_fraud',
  'check_fraud_alerts',
  'verify_transaction',
  'general_inquiry',
  'help',
  'complaint'
];

const CANONICAL_SET = new Set(CANONICAL_INTENTS);

// Explicit translations from every known raw vocabulary to canonical intents.
// Keys are matched case-insensitively against both the raw value and a
// normalised (non-alphanumeric -> "_") form.
const INTENT_ALIASES = {
  // ---- banking-nlu dotted vocabulary ----
  'banking.balance.check': 'balance_inquiry',
  'banking.transaction.history': 'transaction_history',
  'banking.transfer.money': 'transfer_funds',
  'banking.card.info': 'card_management',
  'banking.card.block': 'card_management',
  'banking.card.unblock': 'card_management',
  'banking.loan.info': 'general_inquiry',
  'banking.bill.payment': 'payment_inquiry',
  'banking.account.info': 'account_info',
  'banking.help': 'help',

  // ---- DialogFlow / common display names ----
  'default welcome intent': 'general_inquiry',
  'default fallback intent': 'general_inquiry',
  'check.balance': 'balance_inquiry',
  'balance.inquiry': 'balance_inquiry',
  'transaction.history': 'transaction_history',
  'transfer.money': 'transfer_funds',
  'transfer.funds': 'transfer_funds',
  'send.money': 'transfer_funds',
  'card.block': 'card_management',
  'card.management': 'card_management',
  'card.activate': 'card_activation',
  'card.replace': 'card_replacement',
  'report.fraud': 'report_fraud',
  'fraud.alerts': 'check_fraud_alerts',
  'verify.transaction': 'verify_transaction',
  'dispute.transaction': 'dispute_transaction',
  'account.info': 'account_info',
  'account.statement': 'account_statement',
  'payment.inquiry': 'payment_inquiry',
  'complaint': 'complaint',
  'help': 'help',

  // ---- non-intent sentinels ----
  unknown: FALLBACK_INTENT,
  error: FALLBACK_INTENT,
  none: FALLBACK_INTENT,
  '': FALLBACK_INTENT
};

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Map any raw classifier intent to a canonical orchestrator intent.
 * Always returns a value in CANONICAL_INTENTS (FALLBACK_INTENT when unknown).
 */
function toCanonical(rawIntent) {
  if (!rawIntent || typeof rawIntent !== 'string') {
    return FALLBACK_INTENT;
  }

  const raw = rawIntent.trim();

  // 1. Already canonical.
  if (CANONICAL_SET.has(raw)) {
    return raw;
  }

  // 2. Explicit alias (raw form).
  const lowerRaw = raw.toLowerCase();
  if (INTENT_ALIASES[lowerRaw]) {
    return INTENT_ALIASES[lowerRaw];
  }

  // 3. Normalised form against canonical set and aliases.
  const normalized = normalize(raw);
  if (CANONICAL_SET.has(normalized)) {
    return normalized;
  }
  if (INTENT_ALIASES[normalized]) {
    return INTENT_ALIASES[normalized];
  }

  // 4. Unknown -> deterministic fallback.
  return FALLBACK_INTENT;
}

function isCanonical(intent) {
  return CANONICAL_SET.has(intent);
}

module.exports = {
  FALLBACK_INTENT,
  CANONICAL_INTENTS,
  INTENT_ALIASES,
  toCanonical,
  isCanonical
};
