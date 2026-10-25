/**
 * Standalone IVR pilot routes. These process-memory sessions are development-only;
 * production voice must use the durable authenticated operations voice contract.
 * No banking tool or customer JWT is available to this adapter.
 */
const express = require('express');
const { twilioSignatureValid, parseTwilioEvent, renderTwiml, parseSimulatorEvent } = require('../ivr/telephonyAdapter');
const { IvrSession } = require('../ivr/ivrSession');
const callIdValid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const invalid = message => Object.assign(new Error(message), { status: 400 });
function createIvrRouter({ sessions = new Map(), env = process.env, verifier = null, now = Date.now,
  maxSessions = 100, sessionTtlMs = 300000 } = {}) {
  const router = express.Router(); const pending = new Set();
  const publicAddress = () => {
    try { const value = new URL(env.IVR_PUBLIC_URL); return value.protocol === 'https:' && !value.username && !value.password && !value.hash ? value : null; } catch { return null; }
  };
  const isConfigured = () => env.NODE_ENV !== 'production' && env.IVR_ENABLED === 'true' && Boolean(env.TWILIO_AUTH_TOKEN) && Boolean(publicAddress())
    && (!env.IVR_PROVIDER || env.IVR_PROVIDER === 'twilio');
  const prune = () => {
    for (const [key, session] of sessions) if (!pending.has(key) && session.expiresAt <= now()) sessions.delete(key);
  };
  const handle = async (event, provider) => {
    if (!callIdValid(event.callId) || (event.callerId != null && (typeof event.callerId !== 'string' || event.callerId.length > 64))) throw invalid('Invalid call identity');
    const key = `${provider}:${event.callId}`; prune();
    if (pending.has(key)) throw Object.assign(new Error('Previous call event is still processing'), { status: 409 });
    let session = sessions.get(key);
    if (!session) {
      if (event.type === 'call.ended') return { response: { action: 'hangup' }, state: 'ended', verified: false };
      if (event.type !== 'call.started') throw Object.assign(new Error('Call state is unavailable; restart the pilot call'), { status: 409 });
      if (sessions.size >= maxSessions) throw Object.assign(new Error('Pilot call capacity reached'), { status: 429 });
      session = new IvrSession({ callId: event.callId, callerId: event.callerId, verifier });
      if (env.IVR_TRANSFER_TARGET) session.setTransferTarget(env.IVR_TRANSFER_TARGET);
      session.expiresAt = now() + sessionTtlMs;
      sessions.set(key, session);
    }
    if (event.callerId && session.callerId && event.callerId !== session.callerId) throw Object.assign(new Error('Call identity changed'), { status: 409 });
    if (!session.callerId) session.callerId = event.callerId;
    pending.add(key);
    try {
      const result = await session.handle(event);
      // Keep bounded terminal tombstones so a callback cannot resurrect the call.
      if (session.state === 'ended') { session.transcript = []; session.verified = false; }
      return { ...result, verified: session.verified };
    } finally { pending.delete(key); }
  };
  const errorResponse = (error, res) => res.status([400, 409, 429].includes(error.status) ? error.status : 503)
    .json({ error: [400, 409, 429].includes(error.status) ? error.message : 'IVR service unavailable' });
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.post('/twilio/voice', async (req, res) => {
    try {
      if (!isConfigured()) return res.status(503).json({ error: 'Standalone IVR pilot is not configured or is unavailable in production' });
      const publicUrl = publicAddress();
      const body = req.body;
      if (!body || Array.isArray(body) || typeof body !== 'object' || JSON.stringify(body).length > 16000
        || Object.values(body).some(value => typeof value !== 'string')) throw invalid('Invalid bounded form parameters');
      if (!twilioSignatureValid({ url: publicUrl.href, params: body, signature: req.headers['x-twilio-signature'], authToken: env.TWILIO_AUTH_TOKEN })) return res.status(403).json({ error: 'Invalid Twilio signature' });
      const result = await handle(parseTwilioEvent(body), 'twilio');
      if (result.response.action === 'gather') result.response.actionUrl = publicUrl.href;
      return res.type('text/xml').send(renderTwiml(result.response));
    } catch (error) { return errorResponse(error, res); }
  });
  router.post('/simulator/event', async (req, res) => {
    try {
      if (env.NODE_ENV === 'production' || env.IVR_SIMULATOR_ENABLED !== 'true') return res.status(403).json({ error: 'Simulator is not enabled' });
      if (JSON.stringify(req.body || {}).length > 8000) throw invalid('Simulator event exceeds its limit');
      const result = await handle(parseSimulatorEvent(req.body), 'simulator');
      return res.json({ state: result.state, response: result.response, transferContext: result.transferContext || null, verified: result.verified });
    } catch (error) { return errorResponse(error, res); }
  });
  router.get('/health', (_req, res) => {
    prune();
    res.json({ configured: isConfigured(), provider: env.IVR_PROVIDER || null, scope: 'development_pilot', durable: false,
      simulatorEnabled: env.NODE_ENV !== 'production' && env.IVR_SIMULATOR_ENABLED === 'true' });
  });
  return router;
}
module.exports = { createIvrRouter };
