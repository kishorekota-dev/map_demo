const express = require('express');
const { authenticate, authorize } = require('../operations/auth');
const { fingerprint, ensureStudio } = require('../control-plane/studio-model');
const { ControlPlaneError } = require('../control-plane/store');
const { text } = require('../control-plane/config');
const { catalog, previewPackage } = require('./solutions');
function createPlatformRouter({ configStore, readiness, env = process.env }) {
  const router = express.Router();
  const route = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(authenticate(env.JWT_SECRET, configStore.tenantId));
  router.use(authorize('canView'));
  router.get('/readiness', route(async (_req, res) => res.json(await readiness.check())));
  router.get('/catalog', (_req, res) => res.json({ schemaVersion: 1, deployment: 'dedicated-enterprise',
    capabilities: ['versioned-servicing', 'provider-neutral-models', 'governed-solution-packages', 'durable-fulfillment', 'knowledge', 'oidc', 'readiness'],
    extensions: [{ id: 'model-provider', contract: 'bounded-text-json' }, { id: 'case-adapter', contract: 'idempotent-case-callback' },
      { id: 'voice-adapter', contract: 'signed-speech-dtmf-events' }, { id: 'knowledge-adapter', contract: 'permissioned-text-documents' },
      { id: 'domain-tool', contract: 'registered-code-owned-tool-schema' }],
    solutions: catalog().map(solution => ({ ...solution.manifest, digest: fingerprint(solution) })) }));
  const packageFor = body => {
    if (!body || Object.keys(body).some(key => !['package', 'catalogId', 'revision', 'digest', 'baseFingerprint', 'overwrite', 'note'].includes(key))
      || (body.package === undefined) === (body.catalogId === undefined)) throw new ControlPlaneError(400, 'Select exactly one catalogId or package.');
    const solution = body.package || catalog().find(entry => entry.manifest.id === body.catalogId);
    if (!solution) throw new ControlPlaneError(404, 'Solution package not found.');
    return solution;
  };
  const presentation = preview => ({ manifest: preview.solution.manifest, digest: preview.digest, baseFingerprint: preview.baseFingerprint,
    resultFingerprint: preview.resultFingerprint, conflicts: preview.conflicts, diff: preview.diff });
  router.get('/solutions/export', route(async (req, res) => {
    if (!['draft', 'published'].includes(req.query.source || 'draft')) throw new ControlPlaneError(400, 'source must be draft or published.');
    const state = await configStore.read();
    const solution = { schemaVersion: 1, manifest: { id: 'servicing-export', name: 'Servicing solution export', version: '1.0.0', description: 'Portable servicing configuration; review and publish through destination governance.' },
      configuration: req.query.source === 'published' ? state.published.config : state.draft };
    res.json({ package: solution, digest: fingerprint(solution), sourceRevision: state.revision });
  }));
  router.post('/solutions/preview', authorize('canEdit'), route(async (req, res) => {
    const state = await configStore.read();
    res.json({ revision: state.revision, ...presentation(previewPackage(state.draft, packageFor(req.body))) });
  }));
  router.post('/solutions/apply', authorize('canEdit'), route(async (req, res) => {
    const solution = packageFor(req.body);
    if (!text(req.body.note, 1000) || typeof req.body.overwrite !== 'boolean') throw new ControlPlaneError(400, 'A bounded change note and explicit overwrite decision are required.');
    let result;
    const state = await configStore.update(req.body.revision, req.principal.actor, 'solution.applied', current => {
      const preview = previewPackage(current.draft, solution);
      if (preview.digest !== req.body.digest || preview.baseFingerprint !== req.body.baseFingerprint) throw new ControlPlaneError(409, 'Package or draft changed. Preview the current package again.');
      if (preview.conflicts.length && !req.body.overwrite) throw new ControlPlaneError(409, 'Existing configuration conflicts require an explicit overwrite decision.');
      current.draft = preview.configuration;
      ensureStudio(current).draftUpdatedBy = req.principal.actor;
      result = presentation(preview);
    }, { solutionId: solution.manifest?.id, solutionVersion: solution.manifest?.version, packageDigest: fingerprint(solution), note: req.body.note.trim() });
    res.json({ revision: state.revision, ...result, published: false });
  }));
  router.use((error, _req, res, _next) => res.status(error.status || 503).json({ error: error.status ? error.message : 'Platform service is unavailable.', ...(error.status && error.details ? { details: error.details } : {}), ...(error.status && Array.isArray(error.details?.errors) ? { errors: error.details.errors } : {}) }));
  return router;
}
module.exports = { createPlatformRouter };
