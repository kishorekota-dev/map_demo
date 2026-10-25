const express = require('express');
const jwt = require('jsonwebtoken');
const { createHash, timingSafeEqual } = require('crypto');
const { getRegistry } = require('./registry');
const { IDENTIFIER, validateRequest } = require('./contract');
const { LlmError } = require('./errors');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const only = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
function extractionMessages(extraction) {
  if (!only(extraction, ['intent', 'prompts', 'input']) || !object(extraction.intent) || !IDENTIFIER.test(extraction.intent.id || '') || !only(extraction.prompts, ['extractionSystem', 'extractionInstructions']) || ['extractionSystem', 'extractionInstructions'].some(key => typeof extraction.prompts[key] !== 'string' || !extraction.prompts[key].trim() || extraction.prompts[key].length > 16000) || typeof extraction.input !== 'string' || extraction.input.length > 4000 || JSON.stringify(extraction.intent).length > 64000) throw new LlmError('LLM_INVALID_REQUEST', 'Invalid synthetic extraction probe.', 400);
  const mapper = require('../services/intentMapper');
  const extractor = require('../services/poc-slm-data-extractor');
  return mapper.withPublishedIntents([extraction.intent], () => [
    { role: 'system', content: `${extraction.prompts.extractionSystem}\nReturn only JSON matching the supplied field schema. Do not execute actions or invent missing values.` },
    { role: 'user', content: extractor.buildPrompt({ intent: extraction.intent.id, schema: extractor.buildSchema(extraction.intent.id), latestInput: extraction.input, conversationHistory: [], existingData: {} }) }
  ], extraction.prompts);
}
function createEvaluationRouter(options = {}) {
  const router = express.Router(); const env = options.env || process.env;
  router.post('/evaluate', async (req, res) => {
    const expected = env.SERVICING_SERVICE_TOKEN; const provided = req.get('X-Servicing-Service-Token') || '';
    if (!expected || Buffer.byteLength(provided) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return res.status(403).json({ error: { code: 'QUALITY_SERVICE_AUTH_REQUIRED', message: 'Trusted evaluation worker identity is required.' } });
    try {
      const claims = jwt.verify((req.get('Authorization') || '').replace(/^Bearer /, ''), env.JWT_SECRET, { algorithms: ['HS256'], audience: 'servicing-quality' });
      if (claims.purpose !== 'quality_evaluation' || !UUID.test(claims.runId || '') || claims.runId !== req.body?.runId || claims.type !== 'access' || !req.user?.roles?.some(role => ['admin', 'control_plane_admin', 'control_plane_editor'].includes(role))) throw new Error();
    } catch { return res.status(403).json({ error: { code: 'QUALITY_DELEGATION_REQUIRED', message: 'A scoped evaluation job delegation is required.' } }); }
    try {
      const body = req.body;
      if (!only(body, ['runId', 'caseId', 'providerId', 'request', 'extraction']) || !IDENTIFIER.test(body.providerId || '') || !IDENTIFIER.test(body.caseId || '') || !only(body.request, ['model', 'messages', 'format', 'temperature', 'maxOutputTokens', 'timeoutMs']) || !Array.isArray(body.request.messages) || body.request.messages.length !== 2 || body.request.messages.some((message, index) => !only(message, ['role', 'content']) || message.role !== (index ? 'user' : 'system')) || JSON.stringify(body).length > 150000) throw new LlmError('LLM_INVALID_REQUEST', 'Invalid bounded evaluation request.', 400);
      const input = { ...body.request, ...(body.extraction ? { messages: extractionMessages(body.extraction), format: 'json' } : {}) };
      const validated = validateRequest(input);
      if (validated.messages.reduce((sum, item) => sum + item.content.length, 0) > 64000) throw new LlmError('LLM_INVALID_REQUEST', 'Evaluation prompt exceeds 64000 characters.', 400);
      const registry = options.registry || getRegistry();
      // Registry verifies configured/enabled provider, credentials and allowlisted
      // model before any network request. There is no fallback or tool execution.
      const result = await registry.generate(body.providerId, validated);
      const promptFingerprint = createHash('sha256').update(JSON.stringify({ messages: validated.messages, format: validated.format })).digest('hex');
      res.json({ ...result, promptFingerprint });
    } catch (error) {
      res.status(error instanceof LlmError ? error.status || 503 : 503).json({ error: { code: error instanceof LlmError ? error.code : 'LLM_PROVIDER_ERROR', message: error instanceof LlmError ? error.message : 'The configured model provider is unavailable.' } });
    }
  });
  return router;
}
module.exports = { createEvaluationRouter, extractionMessages };
