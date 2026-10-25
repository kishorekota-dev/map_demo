const { timingSafeEqual, randomUUID } = require('crypto');
const { clone, object } = require('./config');
const { ControlPlaneError } = require('./store');
const { ensureStudio, fingerprint } = require('./studio-model');

function validateRolloutPolicy(policy) {
  return object(policy) && Object.keys(policy).every((key) => ['enabled', 'minSamples', 'maxFailureRate', 'windowMinutes'].includes(key))
    && typeof policy.enabled === 'boolean' && Number.isInteger(policy.minSamples) && policy.minSamples >= 1 && policy.minSamples <= 1000000
    && Number.isFinite(policy.maxFailureRate) && policy.maxFailureRate >= 0 && policy.maxFailureRate <= 1
    && Number.isInteger(policy.windowMinutes) && policy.windowMinutes >= 1 && policy.windowMinutes <= 1440;
}
function equalSecret(input, configured) {
  return typeof input === 'string' && typeof configured === 'string' && configured.length > 0
    && Buffer.byteLength(input) === Buffer.byteLength(configured) && timingSafeEqual(Buffer.from(input), Buffer.from(configured));
}
function attachRolloutObserver(router, store, env = process.env) {
  // This route is deliberately before customer JWT middleware. Only the trusted
  // monitor service credential can submit measurements; browser access tokens
  // and customer-supplied cohort fields have no authority here.
  router.post('/runtime/rollout/observe', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!env.SERVICING_SERVICE_TOKEN) return res.status(503).json({ error: 'Trusted rollout monitoring is not configured.' });
    if (!equalSecret(req.get('X-Servicing-Service-Token'), env.SERVICING_SERVICE_TOKEN)) return res.status(403).json({ error: 'Trusted rollout monitor identity is required.' });
    Promise.resolve().then(async () => {
      const b = req.body;
      if (!object(b) || !['development', 'staging', 'production'].includes(b.environment) || !Number.isInteger(b.candidateVersion) || b.candidateVersion < 1 || !Number.isInteger(b.sampleCount) || b.sampleCount < 0 || b.sampleCount > 10000000 || !Number.isInteger(b.failureCount) || b.failureCount < 0 || b.failureCount > b.sampleCount || typeof b.windowStart !== 'string' || typeof b.windowEnd !== 'string') throw new ControlPlaneError(400, 'Provide a valid environment, candidate version, counts, and observation window.');
      const state = await store.read(); const studio = ensureStudio(state); const policy = studio.rolloutPolicy;
      const start = Date.parse(b.windowStart); const end = Date.parse(b.windowEnd); const now = Date.now();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > now + 30000 || end < now - 120000 || Math.abs(end - start - policy.windowMinutes * 60000) > 5000) throw new ControlPlaneError(400, 'Observation must use the current configured rollout window.');
      const environment = studio.environments.find((entry) => entry.id === b.environment);
      if (environment.candidateVersion !== b.candidateVersion) throw new ControlPlaneError(409, 'This candidate is no longer active in the environment.');
      const failureRate = b.sampleCount ? b.failureCount / b.sampleCount : 0;
      if (!policy.enabled || b.sampleCount < policy.minSamples || failureRate <= policy.maxFailureRate) {
        return res.json({ observed: true, rolledBack: false, failureRate, reason: !policy.enabled ? 'policy_disabled' : b.sampleCount < policy.minSamples ? 'insufficient_samples' : 'within_threshold' });
      }
      const id = randomUUID();
      const updated = await store.update(state.revision, 'rollout-monitor', 'studio.environment.auto_rolled_back', async (nextState, records) => {
        const currentStudio = ensureStudio(nextState);
        if (fingerprint(currentStudio.rolloutPolicy) !== fingerprint(policy)) throw new ControlPlaneError(409, 'Rollout policy changed. Recompute the observation.');
        const current = currentStudio.environments.find((entry) => entry.id === b.environment);
        if (current.candidateVersion !== b.candidateVersion) throw new ControlPlaneError(409, 'Candidate changed before rollback.');
        const previous = clone(current);
        current.candidateVersion = null; current.canaryPercent = 0; current.updatedAt = new Date().toISOString(); current.updatedBy = 'rollout-monitor';
        await records.put('promotions', id, { id, environment: current.id, version: current.stableVersion, previous, deployment: clone(current), canaryPercent: 100, automatic: true, reason: 'failure_rate_exceeded', observation: { sampleCount: b.sampleCount, failureCount: b.failureCount, failureRate, windowStart: b.windowStart, windowEnd: b.windowEnd, candidateVersion: b.candidateVersion }, policy: clone(policy), createdAt: current.updatedAt, createdBy: 'rollout-monitor' });
      }, { resourceId: id, environment: b.environment, candidateVersion: b.candidateVersion, failureRate });
      res.json({ observed: true, rolledBack: true, failureRate, revision: updated.revision, environment: updated.studio.environments.find((entry) => entry.id === b.environment), reason: 'failure_rate_exceeded' });
    }).catch(next);
  });
}
module.exports = { validateRolloutPolicy, attachRolloutObserver };
