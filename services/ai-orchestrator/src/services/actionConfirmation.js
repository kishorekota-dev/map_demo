const { requestDigest } = require('./mutationProof');
function confirmationContext(state, tools = [], action = 'banking') {
  return { schema: 1, fingerprint: requestDigest({ action, sessionId: state.sessionId, userId: state.userId,
    tenantId: state.tenantId || state.metadata?.tenantId || process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise',
    channel: state.channel || state.metadata?.channel || state.runtimeContext?.channel || null,
    interactionId: state.interactionId || state.metadata?.interactionId || null, intent: state.intent,
    tools: [...tools].sort(), collectedData: state.collectedData || {},
    route: Object.fromEntries(['version', 'channel', 'journeyId', 'queue', 'action', 'environment', 'cohort']
      .filter(key => state.runtimeContext?.[key] !== undefined).map(key => [key, state.runtimeContext[key]])) }) };
}
function matchesConfirmation(context, state, tools = [], action = 'banking') {
  return context?.schema === 1 && context.fingerprint === confirmationContext(state, tools, action).fingerprint;
}
module.exports = { confirmationContext, matchesConfirmation };
