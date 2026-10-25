const { randomUUID } = require('crypto');
const { clone, object, text, identifier, CHANNEL_IDS, resolveDecision } = require('./config');
const { ControlPlaneError } = require('./store');
const { recognize } = require('./recognition');
const { fingerprint, ensureStudio, environmentRelease, validateSuite, enforceGates, pageParameters, listPage } = require('./studio-model');
const { validateRolloutPolicy } = require('./rollout');
const { semanticDiff } = require('./diff');

function configuredModelProfiles(config, intentId) {
  const intent = config.intents.find((entry) => entry.id === intentId);
  const profiles = {};
  if (config.llm?.enabled) for (const task of ['generation', 'extraction', 'recognition']) {
    const profileId = task === 'generation' ? intent?.llmProfileId || config.llm.routing?.generation : config.llm.routing?.[task];
    const profile = config.llm.profiles.find((entry) => entry.id === profileId);
    if (profile) profiles[task] = { profileId: profile.id, providerId: profile.providerId, model: profile.model };
  }
  return profiles;
}

function simulateUtterance(config, input, version, previousIntent = null) {
  const channel = input.channel || 'digital';
  if (!CHANNEL_IDS.includes(channel)) throw new ControlPlaneError(400, 'channel must be digital, ava, or ivr.');
  if (!text(input.utterance, 4000)) throw new ControlPlaneError(400, 'An utterance of up to 4000 characters is required.');
  const recognition = input.continueIntent && previousIntent
    ? { intent: previousIntent, confidence: 1, ambiguous: false, candidates: [{ intent: previousIntent, confidence: 1 }], source: 'continuation', reason: 'pinned_intent' }
    : recognize(config, input.utterance);
  const route = recognition.intent ? resolveDecision(config, { channel, intent: recognition.intent }, version)
    : { channel, intent: null, version, action: config.recognition?.ambiguityAction || 'clarify', reason: recognition.reason, journeyId: null, queue: config.channels.find((entry) => entry.id === channel)?.queue || null, slaMinutes: null, timeoutSeconds: null };
  if (!config.channels.find((entry) => entry.id === channel)?.enabled) { route.action = 'disabled'; route.reason = 'channel_disabled'; }
  const intent = config.intents.find((entry) => entry.id === recognition.intent);
  return { ...route, recognition, tools: route.action === 'automated' ? intent?.tools || [] : [], requiredFields: intent?.requiredData || [], scope: 'contract_simulation', externalProviderExecuted: false, modelProfilesTested: false, configuredModelProfiles: configuredModelProfiles(config, recognition.intent) };
}

function runSuite(definition, config, version) {
  return definition.cases.map((test) => {
    let previousIntent = null;
    const scenario = test.steps ? [...(test.utterance ? [test] : []), ...test.steps] : [test];
    const steps = scenario.map((step) => {
      const actual = simulateUtterance(config, { ...step, channel: step.channel || test.channel || 'digital' }, version, previousIntent);
      if (actual.intent) previousIntent = actual.intent;
      const failures = [];
      if (actual.intent !== step.expectedIntent) failures.push(`Expected intent ${step.expectedIntent}, received ${actual.intent}.`);
      if (step.expectedAction !== undefined && actual.action !== step.expectedAction) failures.push(`Expected action ${step.expectedAction}, received ${actual.action}.`);
      if (step.expectedTools !== undefined && JSON.stringify([...step.expectedTools].sort()) !== JSON.stringify([...actual.tools].sort())) failures.push('Configured tool contract does not match expectedTools.');
      if (step.requiredFields !== undefined && step.requiredFields.some((field) => !actual.requiredFields.includes(field))) failures.push('Required fields are missing from the intent contract.');
      return { utterance: step.utterance, actual, passed: failures.length === 0, failures };
    });
    return { id: test.id, name: test.name || test.id, passed: steps.every((step) => step.passed), steps };
  });
}

function validateDocument(document, principal) {
  if (!object(document) || !identifier(document.id) || !text(document.title, 200) || !text(document.content, 50000) || !text(document.source, 1000) || !Array.isArray(document.allowedRoles) || !document.allowedRoles.length || document.allowedRoles.length > 30 || document.allowedRoles.some((role) => typeof role !== 'string' || (role !== '*' && !/^[a-z][a-z0-9_]{0,63}$/.test(role))) || !['draft', 'published', 'archived'].includes(document.status) || (document.expiresAt !== null && document.expiresAt !== undefined && (typeof document.expiresAt !== 'string' || !Number.isFinite(Date.parse(document.expiresAt))))) throw new ControlPlaneError(400, 'Invalid knowledge document. Provide id, title, content, source, allowedRoles, status and a valid optional expiry.');
  const source = document.source.trim();
  if ([...source].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new ControlPlaneError(400, 'Source references cannot contain control characters.');
  if (/^[a-z][a-z0-9+.-]*:/i.test(source) && !/^https?:\/\//i.test(source)) throw new ControlPlaneError(400, 'Source links must use HTTP or HTTPS. A plain reference label is also supported.');
  if (document.status !== 'draft' && !principal.permissions.canPublish) throw new ControlPlaneError(403, 'Publishing or withdrawing knowledge requires administrator permission.');
}
async function saveDocument(records, document, actor) {
  const previous = await records.get('knowledge', document.id);
  const now = new Date().toISOString();
  const record = { id: document.id, title: document.title.trim(), content: document.content, source: document.source.trim(), allowedRoles: [...new Set(document.allowedRoles)], expiresAt: document.expiresAt || null, status: document.status, version: (previous?.version || 0) + 1, publishedVersion: document.status === 'published' ? (previous?.version || 0) + 1 : previous?.publishedVersion || null, createdAt: previous?.createdAt || now, updatedAt: now, updatedBy: actor };
  await records.put('knowledge', document.id, record);
  await records.put('knowledge_versions', `${document.id}:${record.version}`, { ...record, documentId: document.id });
  if (document.status !== 'draft') await records.put('knowledge_published', document.id, record);
}

function attachStudioRoutes({ router, store, route, authorize }) {
  const summary = async (state) => {
    const studio = ensureStudio(state);
    const kinds = ['suites', 'evaluations', 'approvals', 'knowledge', 'promotions'];
    const pages = await Promise.all(kinds.map((kind) => store.listRecords(kind, { limit: 50 })));
    const result = { revision: state.revision, configDigest: fingerprint(state.draft), governance: studio.governance, rolloutPolicy: studio.rolloutPolicy, environments: studio.environments, pagination: {}, scope: 'contract_simulation' };
    kinds.forEach((kind, index) => {
      result[kind] = pages[index].items.map((record) => kind === 'suites' ? { ...record.definition, version: record.version, updatedAt: record.updatedAt } : kind === 'evaluations' ? { ...record, results: undefined } : record);
      result.pagination[kind] = { total: pages[index].total, limit: 50, offset: 0 };
    });
    return result;
  };
  const mutate = async (req, action, fn, details = {}) => {
    const state = await store.update(req.body.revision, req.controlPlane.actor, action, async (next, records) => {
      ensureStudio(next); await fn(next, records);
    }, details);
    return summary(state);
  };
  const requireNote = (value) => { if (!text(value, 1000)) throw new ControlPlaneError(400, 'A note of up to 1000 characters is required.'); return value.trim(); };
  router.get('/studio/state', authorize('canView'), route(async (req, res) => res.json(await summary(await store.read()))));
  router.get('/studio/diff', authorize('canView'), route(async (req, res) => {
    const state = await store.read();
    const before = environmentRelease(state, { actor: req.controlPlane.actor, version: req.query.fromVersion ?? state.published.version }).release;
    const after = req.query.toVersion === undefined || req.query.toVersion === 'draft' ? { version: null, config: state.draft } : environmentRelease(state, { actor: req.controlPlane.actor, version: req.query.toVersion }).release;
    res.json({ from: { version: before.version, fingerprint: fingerprint(before.config) }, to: { version: after.version, fingerprint: fingerprint(after.config) }, ...semanticDiff(before.config, after.config) });
  }));
  router.put('/studio/rollout-policy', authorize('canPublish'), route(async (req, res) => {
    if (!validateRolloutPolicy(req.body.policy)) throw new ControlPlaneError(400, 'Provide enabled, minSamples (1–1000000), maxFailureRate (0–1), and windowMinutes (1–1440).');
    res.json(await mutate(req, 'studio.rollout_policy.updated', (next) => { next.studio.rolloutPolicy = clone(req.body.policy); }));
  }));
  for (const kind of ['suites', 'evaluations', 'approvals', 'knowledge', 'promotions']) {
    router.get(`/studio/${kind}`, authorize('canView'), route(async (req, res) => res.json(await store.listRecords(kind, pageParameters(req.query)))));
    router.get(`/studio/${kind}/:id`, authorize('canView'), route(async (req, res) => {
      const record = await store.getRecord(kind, req.params.id);
      if (!record) throw new ControlPlaneError(404, 'Studio record not found.');
      res.json(kind === 'suites' ? { ...record.definition, version: record.version, updatedAt: record.updatedAt } : record);
    }));
  }
  for (const [path, key] of [['releases', 'releases'], ['audit', 'audit'], ['work-items', 'workItems']]) {
    router.get(`/${path}`, authorize('canView'), route(async (req, res) => {
      const state = await store.read();
      let items = [...state[key]].reverse();
      if (key === 'releases') items = items.map(({ config, ...metadata }) => ({ ...metadata, fingerprint: fingerprint(config) }));
      res.json(listPage(items, pageParameters(req.query)));
    }));
  }
  router.put('/studio/suites/:id', authorize('canEdit'), route(async (req, res) => {
    const suite = req.body.suite;
    const errors = validateSuite(suite);
    if (errors.length || suite.id !== req.params.id) throw new ControlPlaneError(400, 'Evaluation suite validation failed.', { errors });
    res.json(await mutate(req, 'studio.suite.saved', async (next, records) => {
      const previous = await records.get('suites', suite.id);
      const now = new Date().toISOString();
      await records.put('suites', suite.id, { id: suite.id, definition: clone(suite), version: (previous?.version || 0) + 1, createdAt: previous?.createdAt || now, createdBy: previous?.createdBy || req.controlPlane.actor, updatedAt: now, updatedBy: req.controlPlane.actor });
    }, { resourceId: req.params.id }));
  }));
  router.post('/studio/evaluations', authorize('canEdit'), route(async (req, res) => {
    if (!identifier(req.body.suiteId) || !['draft', 'published'].includes(req.body.source)) throw new ControlPlaneError(400, 'suiteId and source (draft/published) are required.');
    const id = randomUUID();
    res.json(await mutate(req, 'studio.evaluation.completed', async (next, records) => {
      const suite = await records.get('suites', req.body.suiteId);
      if (!suite) throw new ControlPlaneError(404, 'Evaluation suite not found.');
      const release = req.body.source === 'published' ? environmentRelease(next, { actor: req.controlPlane.actor, version: req.body.version ?? next.published.version }).release : null;
      const config = release?.config || next.draft;
      const results = runSuite(suite.definition, config, release?.version || null);
      const result = { id, suiteId: suite.id, suiteFingerprint: fingerprint(suite.definition), fingerprint: fingerprint(config), source: req.body.source, version: release?.version || null, passed: results.every((entry) => entry.passed), passedCases: results.filter((entry) => entry.passed).length, totalCases: results.length, results, createdAt: new Date().toISOString(), createdBy: req.controlPlane.actor, scope: 'contract_simulation', modelProfilesTested: false, limitations: ['No external tools, providers, financial actions or LLM responses are executed.', 'Model profile settings are fingerprinted but model availability, response quality and provider credentials are not tested.', 'Multi-turn continuation tests the pinned intent contract; it does not prove the live collection/confirmation workflow.'] };
      await records.put('evaluations', id, result);
    }, { resourceId: id }));
  }));
  router.put('/studio/governance', authorize('canPublish'), route(async (req, res) => {
    const value = req.body.governance;
    if (!object(value) || Object.keys(value).some((key) => !['requireEvaluationForPublish', 'requireIndependentApproval', 'requiredSuiteIds'].includes(key)) || typeof value.requireEvaluationForPublish !== 'boolean' || typeof value.requireIndependentApproval !== 'boolean' || !Array.isArray(value.requiredSuiteIds) || value.requiredSuiteIds.length > 20 || value.requiredSuiteIds.some((id) => !identifier(id)) || new Set(value.requiredSuiteIds).size !== value.requiredSuiteIds.length || (value.requireEvaluationForPublish && !value.requiredSuiteIds.length)) throw new ControlPlaneError(400, 'Provide valid governance toggles and unique required suite IDs. Evaluation gating needs at least one suite.');
    res.json(await mutate(req, 'studio.governance.updated', async (next, records) => {
      for (const id of value.requiredSuiteIds) if (!await records.get('suites', id)) throw new ControlPlaneError(400, `Unknown required suite ${id}.`);
      next.studio.governance = clone(value);
    }));
  }));
  router.post('/studio/approvals', authorize('canPublish'), route(async (req, res) => {
    const note = requireNote(req.body.note); const id = randomUUID();
    res.json(await mutate(req, 'studio.configuration.approved', async (next, records) => {
      const release = req.body.version === undefined ? null : environmentRelease(next, { actor: req.controlPlane.actor, version: req.body.version }).release;
      const author = release?.authoredBy || release?.publishedBy || next.studio.draftUpdatedBy;
      if (author === req.controlPlane.actor) throw new ControlPlaneError(409, 'The author cannot approve their own configuration. A second administrator must approve it.');
      await records.put('approvals', id, { id, fingerprint: fingerprint(release?.config || next.draft), version: release?.version || null, approvedBy: req.controlPlane.actor, authoredBy: author, note, createdAt: new Date().toISOString() });
    }, { resourceId: id, note }));
  }));
  router.post('/studio/promote', authorize('canPublish'), route(async (req, res) => {
    const note = requireNote(req.body.note); const percent = req.body.canaryPercent ?? 100; const id = randomUUID();
    if (!['development', 'staging', 'production'].includes(req.body.environment) || !Number.isInteger(req.body.version) || req.body.version < 1 || !Number.isInteger(percent) || percent < 1 || percent > 100) throw new ControlPlaneError(400, 'Choose an environment, published version, and an integer canaryPercent from 1 to 100.');
    res.json(await mutate(req, 'studio.environment.promoted', async (next, records) => {
      const release = environmentRelease(next, { actor: req.controlPlane.actor, version: req.body.version }).release;
      const digest = await enforceGates(next, records, release.config, release.authoredBy || release.publishedBy);
      const environment = next.studio.environments.find((entry) => entry.id === req.body.environment);
      const previous = clone(environment);
      if (percent === 100) { environment.stableVersion = release.version; environment.candidateVersion = null; environment.canaryPercent = 0; }
      else { if (environment.stableVersion === release.version) throw new ControlPlaneError(400, 'Canary candidate must differ from the stable release.'); environment.candidateVersion = release.version; environment.canaryPercent = percent; }
      environment.updatedAt = new Date().toISOString(); environment.updatedBy = req.controlPlane.actor;
      await records.put('promotions', id, { id, environment: environment.id, version: release.version, fingerprint: digest, canaryPercent: percent, previous, deployment: clone(environment), note, createdAt: environment.updatedAt, createdBy: req.controlPlane.actor });
    }, { resourceId: id, note }));
  }));
  router.put('/studio/knowledge/:id', authorize('canEdit'), route(async (req, res) => {
    const document = req.body.document;
    validateDocument(document, req.controlPlane);
    if (document.id !== req.params.id) throw new ControlPlaneError(400, 'Document identifier does not match the URL.');
    res.json(await mutate(req, 'studio.knowledge.saved', async (next, records) => {
      await saveDocument(records, document, req.controlPlane.actor);
    }, { resourceId: document.id }));
  }));
  router.post('/studio/knowledge/import', authorize('canEdit'), route(async (req, res) => {
    const documents = req.body.documents;
    if (!Array.isArray(documents) || !documents.length || documents.length > 50) throw new ControlPlaneError(400, 'Import 1–50 knowledge documents at a time.');
    documents.forEach((document) => validateDocument(document, req.controlPlane));
    if (new Set(documents.map((document) => document.id)).size !== documents.length) throw new ControlPlaneError(400, 'Import document IDs must be unique.');
    res.json(await mutate(req, 'studio.knowledge.imported', async (next, records) => {
      for (const document of documents) await saveDocument(records, document, req.controlPlane.actor);
    }, { count: documents.length }));
  }));
  router.get('/studio/knowledge/:id/versions', authorize('canView'), route(async (req, res) => res.json(await store.listRecords('knowledge_versions', { ...pageParameters(req.query), filters: { documentId: req.params.id } }))));
  router.post('/runtime/knowledge/search', route(async (req, res) => {
    const { query } = req.body; const limit = req.body.limit ?? 5;
    if (!text(query, 2000) || !Number.isInteger(limit) || limit < 1 || limit > 10) throw new ControlPlaneError(400, 'Provide a query up to 2000 characters and limit from 1 to 10.');
    const stop = new Set(['the', 'and', 'are', 'is', 'to', 'for', 'my', 'me', 'can', 'how', 'what', 'do', 'a', 'an']);
    const terms = [...new Set(query.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])].filter((term) => term.length > 1 && !stop.has(term)).slice(0, 30);
    const matches = terms.length ? await store.searchKnowledge(terms, req.controlPlane.roles, limit, new Date().toISOString()) : [];
    res.json({ query, matches: matches.map(({ id, title, content, source, version, score }) => ({ id, title, content, source, version, score })), scope: 'lexical_retrieval', grounded: matches.length > 0 });
  }));
}
module.exports = { attachStudioRoutes, simulateUtterance, runSuite, configuredModelProfiles };
