const { createHash } = require('crypto');
const { issueProof } = require('./mutationProof');
const tools = new Set(require('../../config/intentConfig').CANONICAL_BANKING_TOOLS);
const metadataEnums = {
  recognitionSource: new Set(['literal', 'lexical', 'external', 'llm', 'lexical_fallback']),
  recognitionMethod: new Set(['literal', 'lexical', 'external', 'llm']),
  workflowStatus: new Set(['complete', 'completed', 'human_escalation', 'policy_blocked', 'error', 'human_input_required', 'confirmation_required', 'clarification_required', 'reconciliation_required', 'processing', 'cancelled', 'unknown']),
  reason: new Set(['allowed', 'authentication_required', 'confirmation_required', 'missing_auth_token', 'invalid_input', 'policy_denied', 'channel_disabled', 'intent_disabled', 'journey_disabled', 'channel_requires_human', 'journey_requires_human', 'fulfillment_disabled']), tool: tools,
};
class RuntimeIntegrations {
  async request(path, body, authToken, controlPlane = false, confirmationProof = null) {
    if (!authToken) throw Object.assign(new Error('Authenticated integration context required'), { status: 401, dispatched: false });
    const base = (controlPlane ? process.env.CONTROL_PLANE_URL || 'http://localhost:3001/api/control-plane'
      : process.env.OPERATIONS_URL || 'http://localhost:3001/api/operations').replace(/\/$/, '');
    const response = await require('axios').post(`${base}${path}`, body, { timeout: 10000, maxRedirects: 0,
      headers: { Authorization: `Bearer ${authToken}`, 'X-Servicing-Service-Token': process.env.SERVICING_SERVICE_TOKEN || '',
        ...(confirmationProof ? { 'X-Servicing-Confirmation': confirmationProof, 'Idempotency-Key': body.idempotencyKey } : {}) } });
    return response.data;
  }
  async event(input, authToken) {
    if (!process.env.SERVICING_SERVICE_TOKEN) return { telemetryUnavailable: true };
    // Only enumerated operational fields leave the runtime. No transcript,
    // tokens, extracted customer fields, prompts or raw tool responses.
    const body = Object.fromEntries(['sessionId', 'interactionId', 'version', 'environment', 'cohort', 'channel', 'intent', 'stage', 'outcome', 'operationId', 'durationMs']
      .filter(key => input[key] !== undefined && input[key] !== null).map(key => [key, input[key]]));
    const metadata = Object.fromEntries(Object.entries(metadataEnums).filter(([key, allowed]) => allowed.has(input.metadata?.[key])).map(([key]) => [key, input.metadata[key]]));
    for (const key of ['confirmationRequired', 'confirmationVerified']) if (typeof input.metadata?.[key] === 'boolean') metadata[key] = input.metadata[key];
    if (Number.isFinite(input.metadata?.confidence) && input.metadata.confidence >= 0 && input.metadata.confidence <= 1) metadata.confidence = input.metadata.confidence;
    if (Object.keys(metadata).length) body.metadata = metadata;
    try { return await this.request('/runtime/events', body, authToken); }
    catch (_error) { return { telemetryUnavailable: true }; }
  }
  async usage(input, authToken) {
    if (!process.env.SERVICING_SERVICE_TOKEN) return { telemetryUnavailable: true };
    const body = Object.fromEntries(['eventId', 'sessionId', 'interactionId', 'provider', 'service', 'metric', 'units', 'version', 'channel']
      .filter(key => input[key] !== undefined && input[key] !== null).map(key => [key, input[key]]));
    try { return await this.request('/runtime/usage', body, authToken); }
    catch (_error) { return { telemetryUnavailable: true }; }
  }
  async createCase(state, reason = 'service_request') {
    if (state.confirmationGranted !== true) throw Object.assign(new Error('Verified confirmation of the support request is required'), { code: 'CONFIRMATION_REQUIRED', status: 403, dispatched: false });
    const route = state.runtimeContext || state.metadata || {};
    const key = createHash('sha256').update(`${state.sessionId}:${state.interactionId}:${reason}`).digest('hex');
    const intentMapper = require('./intentMapper');
    const fields = new Set([...intentMapper.getRequiredData(state.intent), ...intentMapper.getOptionalData(state.intent)]);
    const details = Object.fromEntries(Object.entries(state.collectedData || {}).filter(([field, value]) => fields.has(field)
      && !/auth|password|secret|token|userId|tenantId/i.test(field) && (value === null || ['string', 'number', 'boolean'].includes(typeof value))));
    const body = { sessionId: state.sessionId, version: route.version, channel: route.channel || 'digital',
      journeyId: route.journeyId, queue: route.queue, intent: state.intent, summary: `Customer servicing: ${reason}`,
      reference: state.interactionId, idempotencyKey: key, details };
    const proof = issueProof({ scope: 'servicing_case', principalId: String(state.userId || ''), tenantId: state.tenantId || state.metadata?.tenantId || process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise',
      key, method: 'POST', path: '/runtime/cases', body });
    try {
      const result = await this.request('/runtime/cases', body, state.authToken, false, proof);
      if (result?.outcome === 'uncertain') throw Object.assign(new Error('Support request outcome requires reconciliation'), { outcome: 'uncertain' });
      if (result?.success === false || !result?.id) throw Object.assign(new Error('Support request was rejected'), { dispatched: false });
      return result;
    }
    catch (error) {
      const definitive = error.response?.status >= 400 && error.response?.status <= 599;
      const notSent = error.dispatched === false || ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(error.code);
      throw Object.assign(new Error(definitive || notSent ? 'Support request was rejected' : 'Support request outcome requires reconciliation'),
        { code: definitive || notSent ? 'OPERATION_REJECTED' : 'RECONCILIATION_REQUIRED', outcome: definitive || notSent ? 'failed' : 'uncertain',
          status: error.response?.status, operationId: key, reconcilePath: '/api/operations/cases' });
    }
  }
  async knowledge(state) {
    const response = await this.request('/runtime/knowledge/search', { query: state.question, limit: 5 }, state.authToken, true);
    const matches = Array.isArray(response.matches) ? response.matches : [];
    const citations = matches.map(item => ({ id: item.id, title: item.title, source: item.source, version: item.version }));
    return { type: 'complete', intent: state.intent, generationSource: 'approved-knowledge', citations,
      response: matches.length ? matches.map((item, index) => `[${index + 1}] ${item.title}\n${item.content}\nSource: ${item.source}`).join('\n\n')
        : 'I could not find approved knowledge for that question. Please provide more detail or contact support.' };
  }
}
module.exports = RuntimeIntegrations;
