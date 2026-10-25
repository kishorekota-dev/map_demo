const { randomUUID } = require('crypto');

module.exports = async function recordProviderUsage(response, record, provider, service, callId = randomUUID()) {
  if (!record) return;
  // Actual response usage only. No estimates from text length or no-call paths.
  const usage = response?.usage_metadata;
  const legacy = response?.response_metadata?.tokenUsage;
  const actual = response?.usage;
  const metrics = {
    input_tokens: usage?.input_tokens ?? legacy?.promptTokens ?? actual?.input_tokens ?? actual?.prompt_tokens,
    output_tokens: usage?.output_tokens ?? legacy?.completionTokens ?? actual?.output_tokens ?? actual?.completion_tokens
  };
  // Usage telemetry must never replace an executed provider's actual outcome.
  await Promise.allSettled(Object.entries(metrics).filter(([, units]) => typeof units === 'number' && Number.isFinite(units) && units >= 0)
    .map(([metric, units]) => Promise.resolve().then(() => record({ eventId: `${callId}:${metric}`, provider, service, metric, units }))));
};
