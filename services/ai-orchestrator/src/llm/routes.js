const express = require('express');
const rateLimit = require('express-rate-limit');
const { getRegistry } = require('./registry');
const { IDENTIFIER, validModel } = require('./contract');
const { LlmError } = require('./errors');
const router = express.Router();
router.use(require('./evaluation-routes').createEvaluationRouter());
function authorize(edit = false) {
  return (req, res, next) => {
    const allowed = edit ? ['admin', 'control_plane_admin', 'control_plane_editor']
      : ['admin', 'control_plane_admin', 'control_plane_editor', 'control_plane_viewer', 'control_plane_operator'];
    if (!req.user?.roles?.some(role => allowed.includes(role))) return res.status(403).json({ error: 'Control-plane permission required.' });
    next();
  };
}
const failure = error => ({ code: error instanceof LlmError ? error.code : 'LLM_PROVIDER_ERROR',
  message: error instanceof LlmError ? error.message : 'The configured model provider is unavailable.' });
router.get('/providers', authorize(), (req, res) => {
  try { res.json({ providers: getRegistry().list() }); }
  catch (error) { res.status(error.status || 503).json({ error: failure(error) }); }
});
router.get('/providers/:providerId/models', authorize(), async (req, res) => {
  try {
    if (!IDENTIFIER.test(req.params.providerId)) return res.status(400).json({ error: 'Invalid provider identifier.' });
    res.json(await getRegistry().models(req.params.providerId));
  } catch (error) { res.status(error.status || 503).json({ error: failure(error) }); }
});
router.post('/test', authorize(true), (req, res, next) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: { code: 'LLM_TEST_DISABLED', message: 'Model connectivity tests are disabled in production.' } });
  next();
}, rateLimit({ windowMs: 60000, max: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => `${req.user.tenantId}:${req.user.userId}` }), async (req, res) => {
  const { providerId, model } = req.body || {};
  if (!IDENTIFIER.test(providerId || '') || !validModel(model) || Object.keys(req.body || {}).some(key => !['providerId', 'model'].includes(key))) {
    return res.status(400).json({ error: 'A providerId and model are required; custom test prompts are not accepted.' });
  }
  const started = Date.now();
  try {
    const result = await getRegistry().generate(providerId, { model, format: 'text', temperature: 0, maxOutputTokens: 32, timeoutMs: 60000,
      messages: [{ role: 'system', content: 'Reply with exactly READY. Do not add an explanation.' }, { role: 'user', content: 'Synthetic model connectivity test.' }] });
    res.json({ ok: true, providerId, model, latencyMs: result.latencyMs, text: result.text.slice(0, 400), usage: result.usage });
  } catch (error) { res.json({ ok: false, providerId, model, latencyMs: Date.now() - started, text: '', usage: {}, error: failure(error) }); }
});
// Compares lexical, semantic and hybrid retrieval of a draft or published
// configuration on operator-authored cases. Synthetic questions and procedure
// text go to the configured embedding provider, as at runtime. Questions are not
// stored; procedure vectors enter the shared index. Like other synthetic model
// evaluation, it runs only outside production.
router.post('/retrieval/evaluate', authorize(true), (req, res, next) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: { code: 'LLM_EVALUATION_DISABLED', message: 'Retrieval evaluation is disabled in production. Use a qualified staging environment.' } });
  next();
}, rateLimit({ windowMs: 60000, max: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => `${req.user.tenantId}:${req.user.userId}` }), async (req, res) => {
  const { config, cases, channel = 'digital', minSimilarity } = req.body || {};
  if (Object.keys(req.body || {}).some(key => !['config', 'cases', 'channel', 'minSimilarity'].includes(key)) || !['digital', 'ava', 'ivr'].includes(channel)
    || (minSimilarity !== undefined && (!Number.isFinite(minSimilarity) || minSimilarity < 0 || minSimilarity > 1))) {
    return res.status(400).json({ error: 'Provide a servicing config, cases, an optional channel and an optional minSimilarity from 0 to 1.' });
  }
  try { require('../services/controlPlaneRuntime').validateSnapshot({ version: 1, config }); }
  catch (_error) { return res.status(400).json({ error: 'The configuration is not a valid servicing configuration. Validate the draft first.' }); }
  try { res.json(await require('../services/retrievalEvaluation').evaluateRetrieval({ config, cases, channel, minSimilarity })); }
  catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    res.status(error.status || 503).json({ error: failure(error) });
  }
});
// Retrieval index coverage and builds. Builds run in the background on this
// instance; with durable workflow persistence their vectors are shared.
const builds = new Map();
const MAX_BUILD_RECORDS = 50;
const limiter = max => rateLimit({ windowMs: 60000, max, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => `${req.user.tenantId}:${req.user.userId}` });
const buildKey = (req, version) => `${req.user.tenantId}:${version}`;
const validVersion = version => Number.isInteger(version) && version >= 1;

// Read-only: looks vectors up by content key and never calls a provider.
router.post('/retrieval/index/status', authorize(), limiter(60), async (req, res) => {
  const { config, version } = req.body || {};
  if (Object.keys(req.body || {}).some(key => !['config', 'version'].includes(key)) || (version !== undefined && !validVersion(version))) {
    return res.status(400).json({ error: 'Provide a servicing config and an optional published version.' });
  }
  try { require('../services/controlPlaneRuntime').validateSnapshot({ version: version || 1, config }); }
  catch (_error) { return res.status(400).json({ error: 'The configuration is not a valid servicing configuration. Validate the draft first.' }); }
  try {
    const status = await require('../services/procedureRetrieval').indexStatus({ config });
    res.json({ ...status, ...(version && builds.has(buildKey(req, version)) ? { build: builds.get(buildKey(req, version)) } : {}) });
  } catch (error) { res.status(503).json({ error: failure(error) }); }
});

// Embeds a published release's customer procedures before traffic arrives,
// exactly as the runtime would on first use. Only published (approved)
// content is embedded, so this is allowed in production.
router.post('/retrieval/index/build', authorize(true), limiter(5), async (req, res) => {
  const { version } = req.body || {};
  if (Object.keys(req.body || {}).some(key => key !== 'version') || !validVersion(version)) {
    return res.status(400).json({ error: 'Provide the published version to index.' });
  }
  const { ControlPlaneRuntime } = require('../services/controlPlaneRuntime');
  const { indexStatus, buildIndex } = require('../services/procedureRetrieval');
  let snapshot;
  try { snapshot = await new ControlPlaneRuntime().getRelease(req.headers.authorization.slice(7), version); }
  catch (error) {
    const status = error.response?.status === 404 ? 404 : 502;
    return res.status(status).json({ error: { code: 'RELEASE_UNAVAILABLE', message: status === 404 ? 'Published version not found.' : 'The published release could not be loaded.' } });
  }
  const before = await indexStatus({ config: snapshot.config });
  if (!before.embedding || before.strategy === 'lexical') {
    return res.status(409).json({ error: { code: 'RETRIEVAL_NOT_SEMANTIC', message: 'This release uses lexical retrieval or has no embedding route, so there is nothing to index.' } });
  }
  const key = buildKey(req, version);
  if (builds.get(key)?.state === 'running') return res.status(202).json({ ...before, build: builds.get(key) });
  const record = { state: 'running', version, startedAt: new Date().toISOString(), startedBy: req.user.userId, missingAtStart: before.totals.chunks - before.totals.indexed, inputTokens: 0 };
  builds.delete(key); builds.set(key, record);
  while (builds.size > MAX_BUILD_RECORDS) builds.delete(builds.keys().next().value);
  // Measured provider tokens are reported on the build, not as customer usage.
  void buildIndex({ config: snapshot.config, recordUsage: usage => { record.inputTokens += usage.units; } })
    .then(async ({ ok }) => {
      const after = await indexStatus({ config: snapshot.config }).catch(() => null);
      Object.assign(record, { state: ok && after && after.totals.indexed === after.totals.chunks ? 'succeeded' : 'failed', finishedAt: new Date().toISOString(),
        ...(after ? { remaining: after.totals.chunks - after.totals.indexed } : {}), ...(ok ? {} : { reason: 'embedding_unavailable' }) });
    });
  res.status(202).json({ ...before, building: true, build: record });
});
module.exports = router;
