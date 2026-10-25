const { LlmError } = require('./errors');
const IDENTIFIER = /^[a-z][a-z0-9_-]{0,63}$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}$/;
const validModel = model => typeof model === 'string' && MODEL.test(model) && !model.includes('://');
function validateRequest(input) {
  if (!input || !validModel(input.model) || !Array.isArray(input.messages) || !input.messages.length || input.messages.length > 64
    || input.messages.some(message => !message || !['system', 'user', 'assistant'].includes(message.role)
      || typeof message.content !== 'string' || message.content.length > 64000)
    || input.messages.reduce((total, message) => total + message.content.length, 0) > 160000) {
    throw new LlmError('LLM_INVALID_REQUEST', 'The model request exceeds the supported text contract.', 400);
  }
  const request = { model: input.model, messages: input.messages.map(({ role, content }) => ({ role, content })),
    format: input.format || 'text', temperature: input.temperature ?? 0,
    maxOutputTokens: input.maxOutputTokens ?? 1024, timeoutMs: input.timeoutMs ?? 30000 };
  if (!['text', 'json'].includes(request.format) || !Number.isFinite(request.temperature) || request.temperature < 0 || request.temperature > 2
    || !Number.isInteger(request.maxOutputTokens) || request.maxOutputTokens < 1 || request.maxOutputTokens > 8192
    || !Number.isInteger(request.timeoutMs) || request.timeoutMs < 1000 || request.timeoutMs > 120000) {
    throw new LlmError('LLM_INVALID_REQUEST', 'The model generation settings are outside supported limits.', 400);
  }
  return request;
}
function usage(inputTokens, outputTokens, totalTokens) {
  return Object.fromEntries(Object.entries({ inputTokens, outputTokens, totalTokens })
    .filter(([, value]) => Number.isFinite(value) && value >= 0));
}
function validateResponse(result, format) {
  if (typeof result?.text !== 'string' || !result.text.trim() || result.text.length > 128000) {
    throw new LlmError('LLM_INVALID_RESPONSE', 'The model did not return a supported text response.');
  }
  if (format === 'json') {
    try {
      result.json = JSON.parse(result.text);
      if (!result.json || typeof result.json !== 'object' || Array.isArray(result.json)) throw new Error('Expected object');
    } catch (_error) { throw new LlmError('LLM_INVALID_JSON', 'The model did not return a valid JSON object.'); }
  }
  return result;
}
module.exports = { IDENTIFIER, validModel, validateRequest, validateResponse, usage };
