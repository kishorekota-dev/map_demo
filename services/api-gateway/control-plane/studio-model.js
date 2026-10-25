const { createHash } = require('crypto');
const { object, text, identifier, CHANNEL_IDS, clone } = require('./config');
const { ControlPlaneError } = require('./store');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
const fingerprint = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function ensureStudio(state) {
  state.studio ||= {
    governance: { requireEvaluationForPublish: false, requireIndependentApproval: false, requiredSuiteIds: [] },
    environments: ['development', 'staging', 'production'].map((id) => ({ id, stableVersion: id === 'development' ? state.published.version : 1, candidateVersion: null, canaryPercent: 0, updatedAt: state.published.publishedAt, updatedBy: 'system' })),
    draftUpdatedBy: 'system'
  };
  state.studio.rolloutPolicy ||= { enabled: false, minSamples: 20, maxFailureRate: 0.2, windowMinutes: 15 };
  return state.studio;
}
function environmentRelease(state, { environment, actor, version }) {
  if (version !== undefined) {
    const number = typeof version === 'string' && /^\d+$/.test(version) ? Number(version) : version;
    if (!Number.isInteger(number) || number < 1) throw new ControlPlaneError(400, 'version must be a positive integer.');
    const release = state.releases.find((entry) => entry.version === number);
    if (!release) throw new ControlPlaneError(404, 'Published version not found.');
    return { release, environment: environment || 'pinned', cohort: 'pinned' };
  }
  const name = environment || process.env.CONTROL_PLANE_ENVIRONMENT || 'development';
  const deployment = ensureStudio(state).environments.find((entry) => entry.id === name);
  if (!deployment) throw new ControlPlaneError(400, 'environment must be development, staging, or production.');
  const bucket = parseInt(createHash('sha256').update(`${state.tenant.id}:${actor}:${name}`).digest('hex').slice(0, 8), 16) % 10000;
  const candidate = deployment.candidateVersion !== null && bucket < deployment.canaryPercent * 100;
  const selected = candidate ? deployment.candidateVersion : deployment.stableVersion;
  const release = state.releases.find((entry) => entry.version === selected);
  if (!release) throw new ControlPlaneError(503, 'Environment refers to an unavailable release.');
  return { release, environment: name, cohort: candidate ? 'canary' : 'stable' };
}
function validateSuite(suite) {
  const errors = [];
  if (!object(suite) || !identifier(suite.id) || !text(suite.name) || (suite.description !== undefined && (typeof suite.description !== 'string' || suite.description.length > 1000)) || !Array.isArray(suite.cases) || suite.cases.length < 1 || suite.cases.length > 100) return ['Suite needs id, name and 1–100 cases.'];
  const ids = new Set();
  for (const item of suite.cases) {
    if (!object(item) || !identifier(item.id) || ids.has(item.id)) { errors.push('Case identifiers must be unique.'); continue; }
    ids.add(item.id);
    const steps = item.steps === undefined ? [item] : Array.isArray(item.steps) ? [...(item.utterance ? [item] : []), ...item.steps] : item.steps;
    if (!Array.isArray(steps) || steps.length < 1 || steps.length > 20) { errors.push(`${item.id}: provide 1–20 steps.`); continue; }
    for (const [index, step] of steps.entries()) {
      if (!object(step) || !text(step.utterance, 4000) || !CHANNEL_IDS.includes(step.channel || item.channel || 'digital') || (step.expectedIntent !== null && !identifier(step.expectedIntent))) { errors.push(`${item.id} step ${index + 1}: utterance, channel and expectedIntent (or null) are required.`); continue; }
      if (step.expectedAction !== undefined && !['automated', 'human', 'disabled', 'clarify'].includes(step.expectedAction)) errors.push(`${item.id}: invalid expectedAction.`);
      for (const key of ['expectedTools', 'requiredFields']) if (step[key] !== undefined && (!Array.isArray(step[key]) || step[key].length > 30 || step[key].some((entry) => !text(entry, 120)))) errors.push(`${item.id}: ${key} must be a bounded string list.`);
      if (step.continueIntent !== undefined && typeof step.continueIntent !== 'boolean') errors.push(`${item.id}: continueIntent must be boolean.`);
    }
  }
  return errors;
}
async function enforceGates(state, records, config, author) {
  const governance = ensureStudio(state).governance;
  const digest = fingerprint(config);
  if (governance.requireEvaluationForPublish) {
    if (!governance.requiredSuiteIds.length) throw new ControlPlaneError(409, 'Configure at least one required evaluation suite.');
    for (const suiteId of governance.requiredSuiteIds) {
      const suite = await records.get('suites', suiteId);
      if (!suite) throw new ControlPlaneError(409, `Required evaluation suite ${suiteId} is unavailable.`);
      const results = await records.list('evaluations', { limit: 100, filters: { fingerprint: digest, suiteId, passed: true } });
      if (!results.items.some((result) => result.suiteFingerprint === fingerprint(suite.definition))) throw new ControlPlaneError(409, `A passing evaluation of the current configuration and current ${suiteId} suite is required.`);
    }
  }
  if (governance.requireIndependentApproval) {
    const approvals = await records.list('approvals', { limit: 100, filters: { fingerprint: digest } });
    if (!approvals.items.some((approval) => approval.approvedBy !== author)) throw new ControlPlaneError(409, 'An independent approval of this exact configuration is required.');
  }
  return digest;
}
function pageParameters(query = {}) {
  const read = (value, fallback) => value === undefined ? fallback : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  const offset = read(query.offset, 0); const limit = read(query.limit, 50);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new ControlPlaneError(400, 'Pagination requires offset >= 0 and limit between 1 and 100.');
  return { offset, limit };
}
function listPage(items, pagination) {
  return { items: clone(items.slice(pagination.offset, pagination.offset + pagination.limit)), total: items.length, ...pagination };
}
module.exports = { fingerprint, ensureStudio, environmentRelease, validateSuite, enforceGates, pageParameters, listPage };
