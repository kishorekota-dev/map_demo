const express = require('express');
const jwt = require('jsonwebtoken');
const { isQualityDelegation } = require('../middleware/tokenScope');
const { randomUUID } = require('crypto');
const { ControlPlaneStore, ControlPlaneError } = require('./store');
const { PostgresControlPlaneStore } = require('./postgres-store');
const { CHANNEL_IDS, INTENT_CATALOG, clone, object, text, identifier, validateConfig, resolveDecision } = require('./config');
const { attachStudioRoutes, simulateUtterance, configuredModelProfiles } = require('./studio');
const { fingerprint, ensureStudio, environmentRelease, enforceGates } = require('./studio-model');
const { attachRolloutObserver } = require('./rollout');

const TRANSITIONS = {
  queued: ['in_progress', 'cancelled'],
  in_progress: ['waiting', 'completed', 'failed', 'cancelled'],
  waiting: ['in_progress', 'cancelled'],
  completed: [], failed: [], cancelled: []
};
const TERMINAL = ['completed', 'failed', 'cancelled'];

function permissionsFor(user) {
  const roles = [user.role, ...(Array.isArray(user.roles) ? user.roles : [])]
    .filter((role) => typeof role === 'string').map((role) => role.toLowerCase());
  const admin = roles.includes('admin') || roles.includes('control_plane_admin');
  return {
    canView: admin || roles.some((role) => ['control_plane_viewer', 'control_plane_editor', 'control_plane_operator'].includes(role)),
    canEdit: admin || roles.includes('control_plane_editor'),
    canPublish: admin,
    canOperate: admin || roles.includes('control_plane_operator')
  };
}

function createControlPlaneRouter(options = {}) {
  const router = express.Router();
  const store = options.store || (options.databaseUrl || process.env.CONTROL_PLANE_DATABASE_URL
    ? new PostgresControlPlaneStore(options)
    : new ControlPlaneStore(options));
  const secret = options.jwtSecret || process.env.JWT_SECRET;
  attachRolloutObserver(router, store, options.env || process.env);
  // Control configuration must never accept the gateway's historical fallback key.
  const authenticate = async (req, res, next) => {
    if (!secret && !options.verifyAccessToken) return res.status(503).json({ error: 'Control-plane authentication is not configured.' });
    try {
      const bearer = req.get('Authorization');
      if (!bearer?.startsWith('Bearer ')) throw new Error('Missing bearer token');
      const claims = options.verifyAccessToken ? await options.verifyAccessToken(bearer.slice(7)) : jwt.verify(bearer.slice(7), secret, { algorithms: ['HS256'] });
      if (isQualityDelegation(claims)) throw new Error('Evaluation delegation is not an operator login');
      const actor = claims.userId || claims.sub;
      if (!text(actor, 200) || claims.type === 'refresh') throw new Error('An access token with a principal is required');
      const tenant = claims.tenantId === undefined ? store.tenantId : claims.tenantId;
      if (tenant !== store.tenantId) return res.status(403).json({ error: 'This token does not belong to the deployment tenant.' });
      const roles = [...new Set([claims.role, ...(Array.isArray(claims.roles) ? claims.roles : [])].filter((role) => typeof role === 'string').map((role) => role.toLowerCase()))];
      req.controlPlane = { actor, tenantId: tenant, roles: roles.length ? roles : ['customer'], permissions: permissionsFor(claims) };
      next();
    } catch {
      res.status(401).json({ error: 'A valid access token is required.' });
    }
  };
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(authenticate);
  router.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && !object(req.body)) {
      return res.status(400).json({ error: 'A JSON object body is required.' });
    }
    next();
  });
  const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
  const authorize = (permission) => (req, res, next) => {
    if (!req.controlPlane.permissions[permission]) return res.status(403).json({ error: 'You do not have permission to perform this control-plane action.' });
    next();
  };
  const capabilities = {
    runtimeEnforcementEnabled: process.env.CONTROL_PLANE_ENABLED === 'true',
    persistence: store.storageKind,
    tenancy: 'single-deployment',
    channels: [
      { id: 'digital', status: 'available', description: 'Existing authenticated digital chat pipeline.' },
      { id: 'ava', status: 'available', description: 'Existing virtual assistant orchestration.' },
      { id: 'ivr', status: 'adapter_required', description: 'Policy configuration is available. A telephony, speech and identity adapter must be integrated before live IVR traffic.' }
    ],
    intentCatalog: INTENT_CATALOG.map((intent) => ({ id: intent.id, allowedTools: intent.tools, requiredData: intent.requiredData, confirmationRequired: intent.needsConfirmation })),
    customIntentBases: [...INTENT_CATALOG.map((intent) => intent.id), 'service_request', 'knowledge_search'],
    workItemTransitions: TRANSITIONS,
    limitations: [
      ...(store.storageKind === 'postgres' ? [] : ['One gateway writer per persistent state file.']),
      'Work items track human fulfillment; they do not execute banking transactions.',
      'Prompts and policy configuration must not contain credentials or customer secrets.'
    ]
  };
  const present = (state, req) => {
    const { studioRecords, ...safe } = state;
    return { ...safe, releases: state.releases.slice(-50), audit: state.audit.slice(-100), workItems: state.workItems.slice(-100), pagination: { releases: { total: state.releases.length, limit: 50 }, audit: { total: state.audit.length, limit: 100 }, workItems: { total: state.workItems.length, limit: 100 } }, permissions: req.controlPlane.permissions, capabilities };
  };
  const revision = (req) => req.body.revision;
  const note = (value) => {
    if (!text(value, 1000)) throw new ControlPlaneError(400, 'A change note is required (maximum 1000 characters).');
    return value.trim();
  };
  const assertValid = (config) => {
    const errors = validateConfig(config);
    if (errors.length) throw new ControlPlaneError(400, 'Configuration validation failed.', { errors });
  };
  const releaseFor = (state, input) => {
    if (input === undefined) return state.published;
    const version = typeof input === 'string' && /^\d+$/.test(input) ? Number(input) : input;
    if (!Number.isInteger(version) || version < 1) throw new ControlPlaneError(400, 'version must be a positive integer.');
    const release = state.releases.find((entry) => entry.version === version);
    if (!release) throw new ControlPlaneError(404, 'Published version not found.');
    return release;
  };
  const resolve = (config, body, version) => {
    if (!CHANNEL_IDS.includes(body.channel)) throw new ControlPlaneError(400, 'channel must be digital, ava, or ivr.');
    if (!identifier(body.intent)) throw new ControlPlaneError(400, 'A canonical intent identifier is required.');
    return resolveDecision(config, body, version);
  };

  router.get('/runtime/config', route(async (req, res) => {
    const selected = environmentRelease(await store.read(), { environment: req.query.environment, actor: req.controlPlane.actor, version: req.query.version });
    res.json({ version: selected.release.version, config: selected.release.config, environment: selected.environment, cohort: selected.cohort, fingerprint: fingerprint(selected.release.config) });
  }));
  router.post('/runtime/resolve', route(async (req, res) => {
    const { release } = environmentRelease(await store.read(), { environment: req.body.environment, actor: req.controlPlane.actor, version: req.body.version });
    res.json(resolve(release.config, req.body, release.version));
  }));

  router.get('/state', authorize('canView'), route(async (req, res) => res.json(present(await store.read(), req))));
  router.post('/validate', authorize('canView'), route(async (req, res) => {
    const config = req.body.config === undefined ? (await store.read()).draft : req.body.config;
    const errors = validateConfig(config);
    res.json({ valid: errors.length === 0, errors });
  }));
  router.put('/draft', authorize('canEdit'), route(async (req, res) => {
    assertValid(req.body.config);
    const state = await store.update(revision(req), req.controlPlane.actor, 'draft.updated', (next) => {
      next.draft = clone(req.body.config);
      ensureStudio(next).draftUpdatedBy = req.controlPlane.actor;
    });
    res.json(present(state, req));
  }));
  router.post('/publish', authorize('canPublish'), route(async (req, res) => {
    const changeNote = note(req.body.note);
    const state = await store.update(revision(req), req.controlPlane.actor, 'release.published', async (next, records) => {
      assertValid(next.draft);
      const studio = ensureStudio(next);
      await enforceGates(next, records, next.draft, studio.draftUpdatedBy);
      const release = { version: next.published.version + 1, config: clone(next.draft), publishedAt: new Date().toISOString(), publishedBy: req.controlPlane.actor, authoredBy: studio.draftUpdatedBy, note: changeNote };
      next.published = release;
      next.releases.push(clone(release));
      Object.assign(studio.environments.find((entry) => entry.id === 'development'), { stableVersion: release.version, candidateVersion: null, canaryPercent: 0, updatedAt: release.publishedAt, updatedBy: req.controlPlane.actor });
    }, { note: changeNote });
    res.json(present(state, req));
  }));
  router.post('/rollback', authorize('canPublish'), route(async (req, res) => {
    const changeNote = note(req.body.note);
    if (req.body.version === undefined) throw new ControlPlaneError(400, 'A published version is required.');
    const state = await store.update(revision(req), req.controlPlane.actor, 'release.rolled_back', async (next, records) => {
      const previous = releaseFor(next, req.body.version);
      assertValid(previous.config);
      await enforceGates(next, records, previous.config, previous.authoredBy || previous.publishedBy);
      const release = { version: next.published.version + 1, config: clone(previous.config), publishedAt: new Date().toISOString(), publishedBy: req.controlPlane.actor, authoredBy: previous.authoredBy || previous.publishedBy, note: changeNote, restoredFrom: previous.version };
      next.published = release;
      next.draft = clone(previous.config);
      next.releases.push(clone(release));
      const studio = ensureStudio(next);
      studio.draftUpdatedBy = req.controlPlane.actor;
      Object.assign(studio.environments.find((entry) => entry.id === 'development'), { stableVersion: release.version, candidateVersion: null, canaryPercent: 0, updatedAt: release.publishedAt, updatedBy: req.controlPlane.actor });
    }, { note: changeNote });
    res.json(present(state, req));
  }));
  router.post('/simulate', authorize('canView'), route(async (req, res) => {
    if (req.body.source !== undefined && !['draft', 'published'].includes(req.body.source)) throw new ControlPlaneError(400, 'source must be draft or published.');
    const state = await store.read();
    const published = req.body.source === 'published';
    const config = published ? state.published.config : state.draft;
    const version = published ? state.published.version : null;
    const result = req.body.utterance === undefined ? resolve(config, req.body, version) : simulateUtterance(config, req.body, version);
    res.json({ ...result, source: published ? 'published' : 'draft', revision: state.revision, scope: 'contract_simulation', externalProviderExecuted: false, modelProfilesTested: false, configuredModelProfiles: configuredModelProfiles(config, result.intent) });
  }));

  router.post('/work-items', authorize('canOperate'), route(async (req, res) => {
    const { journeyId, channel, reference, summary, idempotencyKey } = req.body;
    if (!identifier(journeyId) || !CHANNEL_IDS.includes(channel) || !text(reference, 120) || !text(summary, 1000) || !text(idempotencyKey, 120)) {
      throw new ControlPlaneError(400, 'Provide a journey, channel, reference (120 characters), summary (1000 characters), and idempotencyKey (120 characters).');
    }
    const input = { journeyId, channel, reference: reference.trim(), summary: summary.trim(), idempotencyKey };
    // Idempotent replay is deliberately checked before revision: retries of a
    // successful request carry its original revision and must not duplicate work.
    const current = await store.read();
    const existing = current.workItems.find((item) => item.idempotencyKey === idempotencyKey);
    if (existing) {
      if (Object.keys(input).some((key) => input[key] !== existing[key])) throw new ControlPlaneError(409, 'Idempotency key was already used with different work-item details.');
      return res.json(present(current, req));
    }
    const id = randomUUID();
    const state = await store.update(revision(req), req.controlPlane.actor, 'work_item.created', (next) => {
      // Recheck while holding the write lock. Another replica could have
      // inserted after the optimistic replay lookup but before this transaction.
      if (next.workItems.some((item) => item.idempotencyKey === idempotencyKey)) {
        throw new ControlPlaneError(409, 'This work item was created concurrently. Retry with the same idempotency key to retrieve it.');
      }
      const journey = next.published.config.journeys.find((entry) => entry.id === journeyId);
      if (!journey || !journey.channels.includes(channel)) throw new ControlPlaneError(400, 'Journey does not support this channel in the published configuration.');
      const now = new Date();
      next.workItems.push({
        id, ...input, status: 'queued', queue: journey.queue, slaMinutes: journey.slaMinutes,
        version: next.published.version, dueAt: new Date(now.getTime() + journey.slaMinutes * 60000).toISOString(),
        createdAt: now.toISOString(), updatedAt: now.toISOString(), createdBy: req.controlPlane.actor, assignee: null,
        history: [{ timestamp: now.toISOString(), actor: req.controlPlane.actor, status: 'queued', note: 'Work item created' }]
      });
    }, { resourceId: id });
    res.status(201).json(present(state, req));
  }));
  router.patch('/work-items/:id', authorize('canOperate'), route(async (req, res) => {
    const { status, assignee } = req.body;
    if (typeof status !== 'string' || !Object.hasOwn(TRANSITIONS, status)) throw new ControlPlaneError(400, 'Unknown work-item status.');
    if (assignee !== undefined && assignee !== null && !text(assignee, 200)) throw new ControlPlaneError(400, 'assignee must be a principal identifier or null.');
    const resolution = TERMINAL.includes(status) ? note(req.body.note) : req.body.note === undefined ? '' : note(req.body.note);
    const state = await store.update(revision(req), req.controlPlane.actor, 'work_item.updated', (next) => {
      const item = next.workItems.find((entry) => entry.id === req.params.id);
      if (!item) throw new ControlPlaneError(404, 'Work item not found.');
      if (TERMINAL.includes(item.status) || (status !== item.status && !TRANSITIONS[item.status].includes(status))) throw new ControlPlaneError(409, `Cannot transition work item from ${item.status} to ${status}.`);
      if (assignee !== undefined) item.assignee = assignee === null ? null : assignee.trim();
      if (status === 'in_progress' && !item.assignee) item.assignee = req.controlPlane.actor;
      item.status = status;
      item.updatedAt = new Date().toISOString();
      item.history.push({ timestamp: item.updatedAt, actor: req.controlPlane.actor, status, note: resolution });
    }, { resourceId: req.params.id, note: resolution });
    res.json(present(state, req));
  }));

  attachStudioRoutes({ router, store, route, authorize });
  router.use((error, req, res, next) => {
    const known = error instanceof ControlPlaneError;
    res.status(known ? error.status : 503).json({
      error: known ? error.message : 'Control-plane storage is unavailable. No configuration change was acknowledged.',
      ...(known && error.details ? error.details : {})
    });
  });
  router.close = () => store.close?.();
  return router;
}

module.exports = { createControlPlaneRouter, permissionsFor, TRANSITIONS };
