class LlmError extends Error {
  constructor(code, message, status = 503) { super(message); this.name = 'LlmError'; this.code = code; this.status = status; }
}
const isLlmError = error => error instanceof LlmError || /^LLM_/.test(error?.code || '');
const modelUnavailable = error => ({ type: 'policy_blocked', code: 'model_unavailable', stage: 'model', modelErrorCode: error.code,
  message: 'The configured model service is unavailable. Please try again later or contact support.', needsHumanInput: false });
module.exports = { LlmError, isLlmError, modelUnavailable };
