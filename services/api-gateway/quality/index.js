const express = require('express');
const { randomUUID } = require('crypto');
const { authenticate, authorize, actorHash } = require('../operations/auth');
const { OperationsError } = require('../operations/store');
const { identifier, clone } = require('../control-plane/config');
const { fingerprint, environmentRelease, ensureStudio, pageParameters } = require('../control-plane/studio-model');
const { LIMITS, validateSuite, budgetFor, buildMessages, present, keys } = require('./model');
const { QualityWorker } = require('./worker');
const route = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const limitations = [
  'These are synthetic prompt probes with deterministic assertions, not an LLM judge or an end-to-end conversation/tool evaluation.',
  'Refusal checks match authored phrases; they do not prove semantic refusal or resistance to every prompt injection.',
  'A pinned model identifier does not freeze provider weights or server endpoint changes. Repeat evaluations after provider changes.',
  'Usage is measured only when returned by the provider; missing usage is unknown, not zero. Cancellation cannot guarantee an already dispatched provider request stops or is unbilled.'
];
function createQualityRouter(options = {}) {
  const { store, configStore } = options; const env = options.env || process.env;
  if (!store || !configStore || store.tenantId !== configStore.tenantId) throw new Error('Quality requires matching deployment stores.');
  const secret = options.jwtSecret || env.JWT_SECRET;
  const router = express.Router();
  const worker = options.worker || new QualityWorker({ store, configStore, env, generate: options.generate, now: options.now });
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(authenticate(secret, store.tenantId));
  const suitesPage = async query => {
    const page = await configStore.listRecords('quality_suites', pageParameters(query));
    return { ...page, items: page.items.map(record => ({ ...record.definition, version: record.version, suiteFingerprint: fingerprint(record.definition), updatedAt: record.updatedAt, updatedBy: record.updatedBy })) };
  };
  const runsPage = async query => {
    const filters = {};
    for (const key of ['suiteId', 'profileId', 'source', 'status']) if (query[key] !== undefined) {
      if (typeof query[key] !== 'string' || query[key].length > 64) throw new OperationsError(400, 'Invalid run filter.');
      filters[key] = query[key];
    }
    if (query.version !== undefined) { if (!/^\d+$/.test(String(query.version))) throw new OperationsError(400, 'Invalid release version.'); filters.version = Number(query.version); }
    const page = await store.list('quality_run', pageParameters(query), filters);
    return { ...page, items: page.items.map(run => present(run)) };
  };
  router.get('/state', authorize('canView'), route(async (req, res) => {
    const state = await configStore.read();
    res.json({ revision: state.revision, configFingerprint: fingerprint(state.draft), policy: ensureStudio(state).qualityPolicy || { requirements: [] }, suites: await suitesPage({}), runs: await runsPage({}), limits: LIMITS, permissions: req.principal.permissions, scope: 'measured_prompt_probe', limitations });
  }));
  router.get('/suites', authorize('canView'), route(async (req, res) => res.json(await suitesPage(req.query))));
  router.get('/suites/:id', authorize('canView'), route(async (req, res) => {
    const record = await configStore.getRecord('quality_suites', req.params.id);
    if (!record) throw new OperationsError(404, 'Quality suite not found.');
    res.json({ ...record.definition, version: record.version, suiteFingerprint: fingerprint(record.definition), updatedAt: record.updatedAt, updatedBy: record.updatedBy });
  }));
  router.put('/suites/:id', authorize('canEdit'), route(async (req, res) => {
    if (!keys(req.body, ['revision', 'suite'])) throw new OperationsError(400, 'Provide revision and suite.');
    const suite = validateSuite(req.body.suite);
    if (suite.id !== req.params.id) throw new OperationsError(400, 'Suite id must match the path.');
    const state = await configStore.update(req.body.revision, req.principal.actor, 'quality.suite.saved', async (next, records) => {
      for (const item of suite.cases) buildMessages(suite, item, next.draft);
      const previous = await records.get('quality_suites', suite.id); const now = new Date().toISOString();
      await records.put('quality_suites', suite.id, { id: suite.id, definition: suite, version: (previous?.version || 0) + 1, createdAt: previous?.createdAt || now, updatedAt: now, updatedBy: req.principal.actor });
    }, { resourceId: suite.id });
    res.json({ revision: state.revision, suite: { ...suite, suiteFingerprint: fingerprint(suite) } });
  }));
  router.put('/policy', authorize('canPublish'), route(async (req, res) => {
    const policy = req.body.policy;
    if (!keys(req.body, ['revision', 'policy']) || !keys(policy, ['requirements']) || !Array.isArray(policy.requirements) || policy.requirements.length > 20 || policy.requirements.some(item => !keys(item, ['suiteId', 'profileId']) || !identifier(item.suiteId) || !identifier(item.profileId)) || new Set(policy.requirements.map(item => `${item.suiteId}:${item.profileId}`)).size !== policy.requirements.length) throw new OperationsError(400, 'Provide up to 20 unique suite/profile gate requirements.');
    const state = await configStore.update(req.body.revision, req.principal.actor, 'quality.policy.updated', async (next, records) => {
      for (const item of policy.requirements) if (!await records.get('quality_suites', item.suiteId) || !next.draft.llm?.profiles.some(profile => profile.id === item.profileId)) throw new OperationsError(400, 'Every gate requirement must reference an existing suite and draft model profile.');
      ensureStudio(next).qualityPolicy = clone(policy);
    });
    res.json({ revision: state.revision, policy: state.studio.qualityPolicy });
  }));
  router.get('/runs', authorize('canView'), route(async (req, res) => res.json(await runsPage(req.query))));
  router.get('/runs/:id', authorize('canView'), route(async (req, res) => {
    const run = await store.get('quality_run', req.params.id);
    if (!run) throw new OperationsError(404, 'Quality run not found.');
    res.json({ ...present(run, true), limitations });
  }));
  router.post('/runs', authorize('canEdit'), route(async (req, res) => {
    const body = req.body;
    if (!keys(body, ['suiteId', 'source', 'version', 'profileId', 'budget']) || !identifier(body.suiteId) || !identifier(body.profileId) || !['draft', 'published'].includes(body.source) || (body.version !== undefined && (body.source !== 'published' || !Number.isInteger(body.version) || body.version < 1))) throw new OperationsError(400, 'Provide suiteId, profileId and source draft/published with an optional published version.');
    const state = await configStore.read();
    const suiteRecord = await configStore.getRecord('quality_suites', body.suiteId);
    if (!suiteRecord) throw new OperationsError(404, 'Quality suite not found.');
    const release = body.source === 'published' ? environmentRelease(state, { actor: req.principal.actor, version: body.version ?? state.published.version }).release : null;
    const config = release?.config || state.draft;
    const profile = config.llm?.profiles.find(item => item.id === body.profileId);
    if (!config.llm?.enabled || !profile) throw new OperationsError(409, 'Enable LLM execution and configure the selected profile in the evaluated configuration first.');
    const suite = validateSuite(suiteRecord.definition); const budget = budgetFor(body.budget, profile, suite.cases.length);
    const run = { id: randomUUID(), suiteId: suite.id, source: body.source, version: release?.version || null, profileId: profile.id, profile: clone(profile), configFingerprint: fingerprint(config), suiteFingerprint: fingerprint(suite), profileFingerprint: fingerprint(profile),
      status: 'queued', passed: false, scope: 'measured_prompt_probe', createdAt: new Date().toISOString(), createdBy: req.principal.actor, budget, results: [], evidencePending: false,
      snapshot: { suite, cases: suite.cases.map(item => ({ ...clone(item), messages: buildMessages(suite, item, config), ...(suite.task === 'extraction' ? { extraction: { intent: clone(config.intents.find(intent => intent.id === suite.intentId)), prompts: { extractionSystem: config.prompts.extractionSystem, extractionInstructions: config.prompts.extractionInstructions }, input: item.input } } : {}) })) } };
    await store.transaction(async tx => {
      if ((await tx.find('quality_run', { status: 'queued' }, LIMITS.maxQueuedRuns)).length >= LIMITS.maxQueuedRuns) throw new OperationsError(429, 'Evaluation queue is full. Wait for or cancel existing runs.');
      await tx.put('quality_run', run.id, run);
      await tx.event({ type: 'quality.run.requested', runId: run.id, suiteId: suite.id, profileId: profile.id, configFingerprint: run.configFingerprint, suiteFingerprint: run.suiteFingerprint, actorHash: actorHash(req.principal.actor, env.AUDIT_ACTOR_HASH_KEY || secret) });
    });
    res.status(202).json(present(run));
  }));
  router.post('/runs/:id/cancel', authorize('canEdit'), route(async (req, res) => {
    const run = await store.transaction(async tx => {
      const current = await tx.get('quality_run', req.params.id);
      if (!current) throw new OperationsError(404, 'Quality run not found.');
      if (!['queued', 'running'].includes(current.status)) throw new OperationsError(409, 'The run has already finished.');
      current.cancelRequested = true; current.cancelledBy = req.principal.actor;
      if (current.status === 'queued') { current.status = 'cancelled'; current.completedAt = new Date().toISOString(); }
      await tx.put('quality_run', current.id, current); await tx.event({ type: 'quality.run.cancellation_requested', runId: current.id });
      return current;
    });
    worker.cancel(run.id);
    res.json({ ...present(run), cancellation: 'Future calls stop; already dispatched calls may still complete and incur usage.' });
  }));
  router.get('/compare', authorize('canView'), route(async (req, res) => {
    if (typeof req.query.left !== 'string' || typeof req.query.right !== 'string') throw new OperationsError(400, 'Provide left and right run IDs.');
    const [left, right] = await Promise.all([store.get('quality_run', req.query.left), store.get('quality_run', req.query.right)]);
    if (!left || !right) throw new OperationsError(404, 'Quality run not found.');
    const comparable = left.suiteFingerprint === right.suiteFingerprint;
    const leftResult = present(left); const rightResult = present(right);
    res.json({ comparable, warnings: [...(!comparable ? ['Datasets or assertions differ; pass-rate deltas are not comparable.'] : []), ...(left.configFingerprint !== right.configFingerprint ? ['Configuration differs; changes cannot be attributed solely to the model profile.'] : []), ...([left, right].some(run => run.status !== 'completed') ? ['At least one run is incomplete.'] : [])], left: leftResult, right: rightResult,
      passRateDelta: comparable && leftResult.summary.passRate !== null && rightResult.summary.passRate !== null ? rightResult.summary.passRate - leftResult.summary.passRate : null });
  }));
  router.use((error, _req, res, _next) => res.status(error.status || 503).json({ error: error.status ? error.message : 'Quality storage or execution is unavailable.' }));
  router.start = () => worker.start(); router.close = () => worker.close(); router.worker = worker;
  return router;
}
module.exports = { createQualityRouter, limitations };
