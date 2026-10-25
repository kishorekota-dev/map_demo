const { createHash } = require('crypto');
class RuntimeIntegrations {
  async request(path, body, authToken, controlPlane = false) {
    if (!authToken) throw new Error('Authenticated integration context required');
    const base = (controlPlane ? process.env.CONTROL_PLANE_URL || 'http://localhost:3001/api/control-plane'
      : process.env.OPERATIONS_URL || 'http://localhost:3001/api/operations').replace(/\/$/, '');
    const response = await require('axios').post(`${base}${path}`, body, { timeout: 10000, maxRedirects: 0,
      headers: { Authorization: `Bearer ${authToken}`, 'X-Servicing-Service-Token': process.env.SERVICING_SERVICE_TOKEN || '' } });
    return response.data;
  }
  async event(input, authToken) {
    if (!process.env.SERVICING_SERVICE_TOKEN) return { telemetryUnavailable: true };
    // Only enumerated operational fields leave the runtime. No transcript,
    // tokens, extracted customer fields, prompts or raw tool responses.
    const body = Object.fromEntries(['sessionId', 'interactionId', 'version', 'environment', 'cohort', 'channel', 'intent', 'stage', 'outcome', 'operationId', 'durationMs']
      .filter(key => input[key] !== undefined && input[key] !== null).map(key => [key, input[key]]));
    const metadata = Object.fromEntries(['reconciliationReference', 'workflowStatus', 'reason', 'tool', 'confidence', 'recognitionSource', 'confirmationRequired', 'confirmationVerified']
      .filter(key => ['string', 'number', 'boolean'].includes(typeof input.metadata?.[key]))
      .map(key => [key, typeof input.metadata[key] === 'string' ? input.metadata[key].slice(0, 200) : input.metadata[key]]));
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
  createCase(state, reason = 'service_request') {
    const route = state.runtimeContext || state.metadata || {};
    const key = createHash('sha256').update(`${state.sessionId}:${state.interactionId}:${reason}`).digest('hex');
    const intentMapper = require('./intentMapper');
    const fields = new Set([...intentMapper.getRequiredData(state.intent), ...intentMapper.getOptionalData(state.intent)]);
    const details = Object.fromEntries(Object.entries(state.collectedData || {}).filter(([field, value]) => fields.has(field)
      && !/auth|password|secret|token|userId|tenantId/i.test(field) && (value === null || ['string', 'number', 'boolean'].includes(typeof value))));
    return this.request('/runtime/cases', { sessionId: state.sessionId, version: route.version, channel: route.channel || 'digital',
      journeyId: route.journeyId, queue: route.queue, intent: state.intent, summary: `Customer servicing: ${reason}`,
      reference: state.interactionId, idempotencyKey: key, details }, state.authToken);
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
