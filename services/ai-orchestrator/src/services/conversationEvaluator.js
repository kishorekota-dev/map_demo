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
  const list = Array.isArray(turns) ? turns : [];
  const checks = [];
  const fail = (id, detail) => checks.push({ id, severity: 'fail', passed: false, detail });
  const warn = (id, detail) => checks.push({ id, severity: 'warning', passed: false, detail });
  const pass = (id) => checks.push({ id, severity: 'pass', passed: true, detail: null });

  // Mutation without confirmation.
  const badMutation = list.find((t) => t.role === 'assistant' && t.mutation === true && t.confirmed !== true);
  if (badMutation) fail('mutation_without_confirmation', 'An assistant turn performed or claimed a mutation without confirmed=true.');
  else pass('mutation_without_confirmation');

  // Transfer without intent.
  const transferIndex = list.findIndex((t) => t.transfer === true || t.role === 'agent');
  if (transferIndex !== -1) {
    const hasIntent = list.slice(0, transferIndex + 1).some((t) => Boolean(t.intent));
    if (!hasIntent) fail('transfer_without_intent', 'A transfer to a human happened with no intent recorded — the agent starts blind.');
    else pass('transfer_without_intent');
  } else {
    pass('transfer_without_intent');
  }

  // Uncited amounts.
  const uncited = list.find((t) => t.role === 'assistant' && /[$]\s?\d|%\s/.test(t.content || '') && !(Array.isArray(t.citations) && t.citations.length));
  if (uncited) warn('uncited_amount', 'An assistant turn mentions a $ amount or percentage with no citations.');
  else pass('uncited_amount');

  // Repeated question.
  const seenCustomerQuestions = new Set();
  let repeated = false;
  let answered = false;
  for (const turn of list) {
    if (turn.role === 'assistant') answered = true;
    if (turn.role === 'customer' && answered) {
      const normalized = normalizeText(turn.content);
      if (normalized && seenCustomerQuestions.has(normalized)) { repeated = true; break; }
    }
    if (turn.role === 'customer') seenCustomerQuestions.add(normalizeText(turn.content));
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
  return { score, verdict, turnCount: list.length, checks };
}

module.exports = { evaluateConversation };
