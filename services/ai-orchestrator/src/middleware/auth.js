const jwt = require('jsonwebtoken');

function deploymentTenant() {
  return process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise';
}

function authenticate(req, res, next) {
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(503).json({ success: false, error: 'Authentication is not configured' });
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ success: false, error: 'Authentication required' });
  try {
    const principal = jwt.verify(header.slice(7), secret, { algorithms: ['HS256'] });
    const userId = principal.userId || principal.sub || principal.id;
    if (typeof userId !== 'string' || !userId || principal.type === 'refresh') {
      return res.status(401).json({ success: false, error: 'Invalid access token' });
    }
    const tenantId = principal.tenantId || principal.tenant_id || deploymentTenant();
    if (tenantId !== deploymentTenant()) return res.status(403).json({ success: false, error: 'Tenant access denied' });
    req.user = { userId, tenantId, roles: [...(Array.isArray(principal.roles) ? principal.roles : []), principal.role].filter(role => typeof role === 'string').map(role => role.toLowerCase()),
      permissions: Array.isArray(principal.permissions) ? principal.permissions : [] };
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired access token' });
  }
}

async function authorizeSession(req, res, next) {
  try {
    const requestedUserId = req.body?.userId || req.params?.userId;
    if (requestedUserId && String(requestedUserId) !== req.user.userId) {
      return res.status(403).json({ success: false, error: 'User access denied' });
    }
    const sessionId = req.params.sessionId || req.body?.sessionId;
    if (sessionId) {
      if (typeof sessionId !== 'string' || sessionId.length > 200) {
        return res.status(400).json({ success: false, error: 'Invalid session ID' });
      }
      const session = await req.app.locals.sessionManager.getSession(sessionId);
      if (session && (String(session.userId) !== req.user.userId
        || (session.metadata?.tenantId && session.metadata.tenantId !== req.user.tenantId))) {
        return res.status(403).json({ success: false, error: 'Session access denied' });
      }
      req.ownedSession = session;
    }
    if (req.body && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
      req.body.userId = req.user.userId;
      // A caller cannot inject a pinned release or impersonate another tenant.
      const metadata = req.body.metadata;
      const rawChannel = req.ownedSession?.metadata?.channel || metadata?.channel || 'digital';
      const channel = typeof rawChannel === 'string' ? rawChannel.trim().toLowerCase() : '';
      if (!['digital', 'ava', 'ivr'].includes(channel)) {
        return res.status(400).json({ success: false, error: 'Unsupported servicing channel' });
      }
      req.body.metadata = {
        channel,
        tenantId: req.user.tenantId,
        ...(typeof (req.headers['x-interaction-id'] || req.body.interactionId) === 'string'
          && /^[A-Za-z0-9_-]{1,128}$/.test(req.headers['x-interaction-id'] || req.body.interactionId)
          ? { interactionId: req.headers['x-interaction-id'] || req.body.interactionId } : {})
      };
      delete req.body.resumePublished;
    }
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { authenticate, authorizeSession, deploymentTenant };
