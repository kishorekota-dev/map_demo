// Analytics accepts declared operational values, never arbitrary strings or payloads.
const tools = new Set(require('../control-plane/intent-catalog.json').flatMap(intent => intent.tools || []));
const enums = {
  recognitionSource: new Set(['literal', 'lexical', 'external', 'llm', 'lexical_fallback']),
  recognitionMethod: new Set(['literal', 'lexical', 'external', 'llm']),
  workflowStatus: new Set(['complete', 'completed', 'human_escalation', 'policy_blocked', 'error', 'human_input_required', 'confirmation_required',
    'clarification_required', 'reconciliation_required', 'processing', 'cancelled', 'unknown']),
  reason: new Set(['allowed', 'authentication_required', 'confirmation_required', 'missing_auth_token', 'invalid_input', 'policy_denied',
    'channel_disabled', 'intent_disabled', 'journey_disabled', 'channel_requires_human', 'journey_requires_human', 'fulfillment_disabled']),
  tool: tools,
};
function eventMetadata(input) {
  const result = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
  for (const [key, allowed] of Object.entries(enums)) if (allowed.has(input[key])) result[key] = input[key];
  for (const key of ['confirmationRequired', 'confirmationVerified']) if (typeof input[key] === 'boolean') result[key] = input[key];
  if (Number.isFinite(input.confidence) && input.confidence >= 0 && input.confidence <= 1) result.confidence = input.confidence;
  return result;
}
module.exports = { eventMetadata };
