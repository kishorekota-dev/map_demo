const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const router = express.Router();
const logger = require('../utils/logger');
const { authenticate, authorizeSession } = require('../middleware/auth');
const { normalizeChannel } = require('../services/controlPlaneRuntime');

router.use(authenticate);
router.use('/llm', require('../llm/routes'));

function requireOperationsPermission(permission) {
  return (req, res, next) => {
    if (!req.user.roles.some(role => ['admin', 'control_plane_admin', 'control_plane_operator', 'servicing_operator', 'supervisor'].includes(role))
      || !req.user.permissions.some(value => value === permission || value === '*')) return res.status(403).json({ error: 'Operator permission required' });
    next();
  };
}
router.get('/operations', requireOperationsPermission('servicing:operations:read'), async (req, res, next) => {
  try {
    if (req.query.status && !['dispatched', 'succeeded', 'reconciliation_required', 'failed'].includes(req.query.status)) return res.status(400).json({ error: 'Invalid operation status' });
    res.json({ operations: await req.app.locals.workflowService.persistence.listOperations(req.user.tenantId, { status: req.query.status }) });
  } catch (error) { next(error); }
});
router.post('/operations/:operationId/reconcile', requireOperationsPermission('servicing:operations:reconcile'), async (req, res, next) => {
  try {
    const service = req.app.locals.workflowService;
    const operation = await service.persistence.reconcile(req.user.tenantId, req.params.operationId, { outcome: req.body.outcome,
      reference: req.body.reference, note: req.body.note, actor: req.user.userId });
    const event = await service.integrations.event({ sessionId: operation.sessionId, interactionId: `reconcile-${operation.operationId}`,
      operationId: operation.operationId, stage: 'reconciliation', outcome: req.body.outcome,
      metadata: { reconciliationReference: req.body.reference } }, req.headers.authorization.slice(7));
    res.json({ operation, evidenceId: event.id || null, telemetryUnavailable: event.telemetryUnavailable === true });
  } catch (error) { if (error.status) return res.status(error.status).json({ error: error.message }); next(error); }
});

router.post('/session/:sessionId/channel', authorizeSession, async (req, res, next) => {
  try {
    const expected = process.env.SERVICING_SERVICE_TOKEN;
    const provided = req.get('X-Servicing-Service-Token') || '';
    if (!expected || Buffer.byteLength(provided) !== Buffer.byteLength(expected)
      || !require('crypto').timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return res.status(403).json({ error: 'Trusted handoff service required' });
    const channel = normalizeChannel(req.body.channel);
    const session = req.ownedSession;
    if (!session) return res.json({ updated: false, channel });
    const persistence = req.app.locals.workflowService.persistence;
    await persistence.runSession(req.user.tenantId, session.sessionId, async () => {
      const current = await req.app.locals.sessionManager.getSession(session.sessionId);
      const { resolvePublishedRoute } = require('../services/controlPlaneRuntime');
      const snapshot = current.metadata?.controlPlane;
      const route = snapshot ? { ...resolvePublishedRoute(snapshot, channel, current.intent), environment: snapshot.environment, cohort: snapshot.cohort } : null;
      if (route?.action === 'disabled') throw Object.assign(new Error('Target channel is disabled for this workflow'), { status: 409 });
      await req.app.locals.sessionManager.updateSession(current.sessionId, { metadata: { ...current.metadata, channel,
        ...(route ? { runtimeContext: route } : {}) } });
    });
    return res.json({ updated: true, channel, version: session.metadata?.controlPlane?.version });
  } catch (error) { if (error.status) return res.status(error.status).json({ error: error.message }); next(error); }
});

router.get('/session/:sessionId/context', async (req, res, next) => {
  try {
    const session = await req.app.locals.sessionManager.getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const sameTenant = !session.metadata?.tenantId || session.metadata.tenantId === req.user.tenantId;
    const operator = req.user.roles.some(role => ['admin', 'control_plane_admin', 'control_plane_operator', 'servicing_operator', 'supervisor', 'agent'].includes(role))
      && req.user.permissions.some(permission => ['servicing:context:read', '*'].includes(permission));
    if (!sameTenant || (String(session.userId) !== req.user.userId && !operator)) return res.status(403).json({ error: 'Context access denied' });
    const operations = await req.app.locals.workflowService.persistence.listOperations(req.user.tenantId, { sessionId: session.sessionId });
    return res.json({ sessionId: session.sessionId, summary: `${session.intent || 'Unclassified'} request is ${session.status}; current step: ${session.currentStep || 'initial'}.`,
      intent: session.intent, status: session.status, currentStep: session.currentStep, channel: session.metadata?.channel || 'digital',
      version: session.metadata?.controlPlane?.version, collectedFields: Object.keys(session.collectedData || {}), requiredFields: session.requiredData || [],
      confirmationPending: session.currentStep === 'request_confirmation', caseId: session.metadata?.caseId || null, evidenceIds: session.metadata?.evidenceIds || [],
      unresolvedOperations: operations.filter(operation => ['dispatched', 'reconciliation_required'].includes(operation.status)).map(({ operationId, status, tool }) => ({ operationId, status, tool })) });
  } catch (error) { next(error); }
});

/**
 * Enforce express-validator rules. Without this, the declared body()/param()
 * validators are decorative and malformed/empty intents reach the workflow.
 */
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  return next();
}

/**
 * Extract the bearer token from the Authorization header (or explicit body
 * field) so it can be propagated into banking tool execution.
 */
function extractAuthToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  return null;
}

/**
 * POST /api/orchestrator/process
 * Process a message through the AI orchestrator workflow
 * 
 * The user must be authenticated and userId is required.
 * This endpoint receives userId from the authenticated session via the client.
 */
router.post('/process', authorizeSession,
  [
    body('sessionId').notEmpty().withMessage('Session ID is required'),
    body('intent').notEmpty().withMessage('Intent is required'),
    body('question').notEmpty().withMessage('Question is required'),
    body('userId').notEmpty().withMessage('User ID is required (from authenticated session)')
  ],
  handleValidation,
  async (req, res) => {
    try {
      const { sessionId, intent, question, userId, metadata } = req.body;
      try { metadata.channel = normalizeChannel(metadata.channel); } catch (error) {
        return res.status(400).json({ success: false, error: 'Unsupported servicing channel' });
      }
      const { workflowService } = req.app.locals;
      const authToken = extractAuthToken(req);

      logger.info('Processing orchestrator request', {
        sessionId,
        intent,
        userId,
        hasAuthToken: !!authToken
      });

      // Process through workflow with authenticated user context
      const result = await workflowService.processMessage({
        sessionId,
        intent,
        question,
        userId,
        authToken,
        metadata
      });

      res.json({
        success: true,
        sessionId,
        ...result
      });
    } catch (error) {
      logger.error('Error processing orchestrator request', {
        error: error.message,
        stack: error.stack
      });
      
      res.status(error.status || 500).json({
        success: false,
        error: 'Failed to process request',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/orchestrator/feedback
 * Submit human feedback/input to continue workflow
 */
router.post('/feedback', authorizeSession,
  [
    body('sessionId').notEmpty().withMessage('Session ID is required'),
    body('response').notEmpty().withMessage('Response is required')
  ],
  handleValidation,
  async (req, res) => {
    try {
      const { sessionId, response, confirmed } = req.body;
      const { workflowService } = req.app.locals;
      const authToken = extractAuthToken(req);

      logger.info('Processing human feedback', {
        sessionId,
        hasResponse: !!response,
        confirmed
      });

      // Process feedback
      const result = await workflowService.processHumanFeedback({
        sessionId,
        response,
        confirmed,
        authToken
      });

      res.json({
        success: true,
        sessionId,
        ...result
      });
    } catch (error) {
      logger.error('Error processing feedback', {
        error: error.message
      });
      
      res.status(error.status || 500).json({
        success: false,
        error: 'Failed to process feedback',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/orchestrator/session/:sessionId
 * Get session status and state
 */
router.get('/session/:sessionId', authorizeSession,
  [
    param('sessionId').notEmpty().withMessage('Session ID is required')
  ],
  handleValidation,
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { sessionManager } = req.app.locals;

      const session = await sessionManager.getSession(sessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      res.json({
        success: true,
        session: {
          sessionId: session.sessionId,
          userId: session.userId,
          status: session.status,
          intent: session.intent,
          currentStep: session.currentStep,
          requiredData: session.requiredData,
          conversationHistory: session.conversationHistory,
          lastActivityAt: session.lastActivityAt,
          expiresAt: session.expiresAt
        }
      });
    } catch (error) {
      logger.error('Error getting session', {
        error: error.message
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get session',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/orchestrator/session
 * Create a new session
 */
router.post('/session', authorizeSession,
  [
    body('sessionId').notEmpty().withMessage('Session ID is required'),
    body('userId').notEmpty().withMessage('User ID is required')
  ],
  handleValidation,
  async (req, res) => {
    try {
      const { sessionId, userId, intent, metadata } = req.body;
      const { sessionManager } = req.app.locals;

      const session = await sessionManager.createSession(
        userId,
        sessionId,
        intent,
        metadata
      );

      res.json({
        success: true,
        session: {
          sessionId: session.sessionId,
          userId: session.userId,
          status: session.status,
          expiresAt: session.expiresAt
        }
      });
    } catch (error) {
      logger.error('Error creating session', {
        error: error.message
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to create session',
        message: error.message
      });
    }
  }
);

/**
 * DELETE /api/orchestrator/session/:sessionId
 * Complete/end a session
 */
router.delete('/session/:sessionId', authorizeSession,
  [
    param('sessionId').notEmpty().withMessage('Session ID is required')
  ],
  handleValidation,
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { sessionManager } = req.app.locals;

      await sessionManager.completeSession(sessionId);

      res.json({
        success: true,
        message: 'Session completed'
      });
    } catch (error) {
      logger.error('Error completing session', {
        error: error.message
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to complete session',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/orchestrator/user/:userId/sessions
 * Get user's active sessions
 */
router.get('/user/:userId/sessions', authorizeSession,
  [
    param('userId').notEmpty().withMessage('User ID is required'),
    query('status').optional().isIn(['active', 'waiting_human_input', 'completed', 'failed', 'expired'])
  ],
  handleValidation,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { status } = req.query;
      const { sessionManager } = req.app.locals;

      const sessions = await sessionManager.getUserSessions(userId, status);

      res.json({
        success: true,
        sessions: sessions.filter(s => !s.metadata?.tenantId || s.metadata.tenantId === req.user.tenantId).map(s => ({
          sessionId: s.sessionId,
          status: s.status,
          intent: s.intent,
          currentStep: s.currentStep,
          lastActivityAt: s.lastActivityAt,
          expiresAt: s.expiresAt
        }))
      });
    } catch (error) {
      logger.error('Error getting user sessions', {
        error: error.message
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to get user sessions',
        message: error.message
      });
    }
  }
);

module.exports = router;
