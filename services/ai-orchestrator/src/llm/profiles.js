const { LlmError } = require('./errors');
const { IDENTIFIER, validModel } = require('./contract');
function validateLlmConfig(llm, intents = [], recognition) {
  const overrides = intents.filter(intent => intent.llmProfileId !== undefined);
  if (llm === undefined) {
    if (overrides.length || recognition?.strategy === 'llm') throw new LlmError('LLM_PROFILE_INVALID', 'Published model profile configuration is required.');
    return;
  }
  if (!llm || typeof llm.enabled !== 'boolean' || !Array.isArray(llm.profiles) || llm.profiles.length > 50
    || Object.keys(llm).some(key => !['enabled', 'profiles', 'routing'].includes(key))
    || !llm.routing || typeof llm.routing !== 'object' || Array.isArray(llm.routing)) throw new LlmError('LLM_PROFILE_INVALID', 'Published model routing is invalid.');
  const profiles = new Map();
  for (const profile of llm.profiles) {
    if (!profile || Object.keys(profile).some(key => !['id', 'name', 'providerId', 'model', 'temperature', 'maxOutputTokens', 'timeoutMs'].includes(key))
      || typeof profile.name !== 'string' || !profile.name.trim() || profile.name.length > 120
      || !IDENTIFIER.test(profile.id || '') || !IDENTIFIER.test(profile.providerId || '') || !validModel(profile.model)
      || profiles.has(profile.id) || !Number.isFinite(profile.temperature) || profile.temperature < 0 || profile.temperature > 2
      || !Number.isInteger(profile.maxOutputTokens) || profile.maxOutputTokens < 1 || profile.maxOutputTokens > 8192
      || !Number.isInteger(profile.timeoutMs) || profile.timeoutMs < 1000 || profile.timeoutMs > 120000) throw new LlmError('LLM_PROFILE_INVALID', 'Published model profile settings are invalid.');
    profiles.set(profile.id, profile);
  }
  for (const [task, profileId] of Object.entries(llm.routing)) {
    if (!['generation', 'extraction', 'recognition'].includes(task) || !profiles.has(profileId)) throw new LlmError('LLM_PROFILE_INVALID', 'Published model routing references an unknown profile.');
  }
  for (const intent of overrides) if (!profiles.has(intent.llmProfileId)) throw new LlmError('LLM_PROFILE_INVALID', 'An intent references an unknown model profile.');
  if (llm.enabled && (!llm.profiles.length || (!Object.keys(llm.routing).length && !overrides.length))) throw new LlmError('LLM_PROFILE_INVALID', 'Enabled model routing requires a profile and task route.');
  if (recognition?.strategy === 'llm' && (!llm.enabled || !llm.routing.recognition)) throw new LlmError('LLM_PROFILE_INVALID', 'Model recognition requires an enabled recognition profile.');
}
function selectProfile(llm, task, intentEntry) {
  if (llm === undefined) return null;
  validateLlmConfig(llm, intentEntry ? [intentEntry] : []);
  if (!llm.enabled) throw new LlmError('LLM_DISABLED', 'Model-assisted servicing is disabled.');
  const id = (task === 'generation' && intentEntry?.llmProfileId) || llm.routing[task];
  const profile = llm.profiles.find(item => item.id === id);
  if (!profile) throw new LlmError('LLM_PROFILE_MISSING', 'No published model profile is configured for this task.');
  return structuredClone(profile);
}
async function generateWithProfile(llm, task, intentEntry, input, recordUsage, registry = require('./registry').getRegistry()) {
  const profile = selectProfile(llm, task, intentEntry);
  if (!profile) throw new LlmError('LLM_PROFILE_MISSING', 'Published model routing is not configured.');
  const response = await registry.generate(profile.providerId, { ...input, model: profile.model, temperature: profile.temperature,
    maxOutputTokens: profile.maxOutputTokens, timeoutMs: profile.timeoutMs });
  const metrics = { input_tokens: response.usage.inputTokens, output_tokens: response.usage.outputTokens };
  if (recordUsage) await Promise.allSettled(Object.entries(metrics).filter(([, value]) => Number.isFinite(value))
    .map(([metric, units]) => Promise.resolve().then(() => recordUsage({ eventId: `${response.callId}:${metric}`,
      provider: response.providerId, service: task, metric, units }))));
  return response;
}
module.exports = { validateLlmConfig, selectProfile, generateWithProfile };
