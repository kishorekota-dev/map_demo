/**
 * Multi-turn conversation evaluation (pure, no I/O, no model calls).
 *
 * The orchestrator already evaluates single turns (policyEngine: ingress,
 * tool execution, response). What was missing was a conversation-level
 * check: a turn can pass in isolation while the conversation as a whole
 * mutates without confirmation, drifts across intents, or hands off
 * without context. This module scores a transcript against those
 * conversation-level rules.
 *
 * Input turns: [{ role: 'customer'|'assistant'|'agent', content,
 *   intent?, mutation?: boolean, confirmed?: boolean, citations?: string[],
 *   transfer?: boolean }]
 *
 * Checks (fail = -25, warning = -10, floor 0):
 * - mutation_without_confirmation (fail): an assistant turn that performs
 *   or claims a mutation without confirmed=true.
 * - transfer_without_intent (fail): a transfer to a human with no intent
 *   recorded on any earlier turn — the agent would start blind.
 * - uncited_amount (warning): an assistant turn mentioning a $ amount or
 *   a percentage with no citations. Amounts are the claims customers act
 *   on; they need a source.
 * - repeated_question (warning): the customer repeats a question (same
 *   normalized text) after an assistant answer — a repeat-contact signal.
 * - intent_drift_without_clarification (warning): 3+ distinct intents and
 *   no assistant clarification turn (a turn whose content asks a
 *   clarifying question).
 *
 * Input annotations are authored, never authoritative execution evidence.
 * Empty/malformed input returns an invalid verdict and null score.
 * This is a deterministic lint for transcripts, not a quality judgment:
 * a high score does not prove a good conversation, and a warning does not
 * prove a bad one. Scores are for pilot triage, not for ranking customers.
 */

function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function isClarification(turn) {
  return turn.role === 'assistant' && /\?/.test(turn.content || '') && /which|what|confirm|did you mean|would you like/i.test(turn.content || '');
}

function evaluateConversation(turns) {
  const limitations = ['Authored mutation, confirmation, intent and citation annotations are not verified against workflow or provider evidence.',
    'This is a bounded lexical transcript lint, not semantic evaluation, a release gate or proof of servicing completion.'];
  const validTurn = turn => turn && typeof turn === 'object' && !Array.isArray(turn)
    && ['customer', 'assistant', 'agent'].includes(turn.role) && typeof turn.content === 'string' && turn.content.trim().length > 0 && turn.content.length <= 5000
    && (turn.intent === undefined || (typeof turn.intent === 'string' && turn.intent.trim().length > 0 && turn.intent.length <= 128))
    && ['mutation', 'confirmed', 'transfer'].every(key => turn[key] === undefined || typeof turn[key] === 'boolean')
    && (turn.citations === undefined || (Array.isArray(turn.citations) && turn.citations.length <= 20 && turn.citations.every(id => typeof id === 'string' && id.trim().length > 0 && id.length <= 200)));
  if (!Array.isArray(turns) || turns.length === 0 || turns.length > 200 || !turns.every(validTurn)
    || !turns.some(turn => turn.role === 'customer') || !turns.some(turn => turn.role !== 'customer')) {
    return { score: null, verdict: 'invalid', turnCount: Array.isArray(turns) ? turns.length : 0,
      scope: 'annotated_transcript_lint', limitations,
      checks: [{ id: 'valid_transcript', severity: 'fail', passed: false, detail: 'Provide 1–200 bounded valid turns including a customer and an assistant or agent response.' }] };
  }
  const list = turns;
  const checks = [];
  const fail = (id, detail) => checks.push({ id, severity: 'fail', passed: false, detail });
  const warn = (id, detail) => checks.push({ id, severity: 'warning', passed: false, detail });
  const pass = (id) => checks.push({ id, severity: 'pass', passed: true, detail: null });

  // Mutation without confirmation.
  const badMutation = list.find((t) => t.role === 'assistant' && t.mutation === true && t.confirmed !== true);
  if (badMutation) fail('mutation_without_confirmation', 'An assistant turn performed or claimed a mutation without confirmed=true.');
  else pass('mutation_without_confirmation');

  // Transfer without intent.
  const blindTransfer = list.some((turn, index) => (turn.transfer === true || turn.role === 'agent')
    && !list.slice(0, index + 1).some(previous => Boolean(previous.intent)));
  if (blindTransfer) fail('transfer_without_intent', 'A transfer to a human happened with no prior intent annotation.');
  else pass('transfer_without_intent');

  // Uncited amounts.
  const uncited = list.find((t) => t.role === 'assistant' && /\$\s*-?\d|\b\d+(?:\.\d+)?\s*%/.test(t.content || '') && !(Array.isArray(t.citations) && t.citations.length));
  if (uncited) warn('uncited_amount', 'An assistant turn mentions a $ amount or percentage with no citations.');
  else pass('uncited_amount');

  // Repeated question.
  const seenCustomerQuestions = new Map();
  let repeated = false;
  let lastAnswer = -1;
  for (const [index, turn] of list.entries()) {
    if (turn.role === 'assistant') lastAnswer = index;
    if (turn.role === 'customer') {
      const normalized = normalizeText(turn.content);
      if (normalized && seenCustomerQuestions.has(normalized) && lastAnswer > seenCustomerQuestions.get(normalized)) { repeated = true; break; }
      seenCustomerQuestions.set(normalized, index);
    }
  }
  if (repeated) warn('repeated_question', 'The customer repeated a question after an assistant answer.');
  else pass('repeated_question');

  // Intent drift.
  const intents = new Set(list.map((t) => t.intent).filter(Boolean));
  if (intents.size >= 3 && !list.some(isClarification)) {
    warn('intent_drift_without_clarification', `${intents.size} distinct intents with no assistant clarification turn.`);
  } else {
    pass('intent_drift_without_clarification');
  }

  const score = Math.max(0, 100 - checks.filter((c) => c.severity === 'fail').length * 25 - checks.filter((c) => c.severity === 'warning').length * 10);
  const verdict = checks.some((c) => c.severity === 'fail') ? 'fail' : checks.some((c) => c.severity === 'warning') ? 'warn' : 'pass';
  return { score, verdict, turnCount: list.length, checks, scope: 'annotated_transcript_lint', limitations };
}

module.exports = { evaluateConversation };
