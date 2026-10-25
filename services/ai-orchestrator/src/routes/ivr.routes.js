/**
 * IVR webhook routes (ai-orchestrator, mounted under /api/ivr).
 *
 * Gating: the routes exist, but every webhook is rejected with 503
 * "IVR not configured" unless IVR_ENABLED=true AND the provider secret is
 * set (TWILIO_AUTH_TOKEN for Twilio). This prevents a half-configured
 * deployment from accepting unauthenticated calls.
 *
 * Endpoints:
 * - POST /api/ivr/twilio/voice — Twilio voice webhook (form-encoded).
 *   Signature is validated against TWILIO_AUTH_TOKEN and the public URL
 *   in IVR_PUBLIC_URL (Twilio signs the URL it called, not the internal
 *   host). A bad signature is 403, never a fallback.
 * - POST /api/ivr/simulator/event — local simulator (JSON), only when
 *   IVR_SIMULATOR_ENABLED=true and NODE_ENV != 'production'. Never in
 *   production: a simulator that bypasses telephony signatures must not
 *   exist where real calls arrive.
 *
 * Sessions are in-memory per process. A restart drops in-progress calls;
 * the provider will report them as ended. Durable call records belong in
 * the operations store, which is future work, not a v1 claim.
 */

const express = require('express');
const { twilioSignatureValid, parseTwilioEvent, renderTwiml, parseSimulatorEvent } = require('../ivr/telephonyAdapter');
const { IvrSession } = require('../ivr/ivrSession');

function createIvrRouter({ sessions = new Map(), env = process.env, verifier = null } = {}) {
  const router = express.Router();

  const isConfigured = () => env.IVR_ENABLED === 'true' && Boolean(env.TWILIO_AUTH_TOKEN);
  const getSession = (callId) => {
    if (!sessions.has(callId)) {
      const session = new IvrSession({ callId, verifier });
      if (env.IVR_TRANSFER_TARGET) session.setTransferTarget(env.IVR_TRANSFER_TARGET);
      sessions.set(callId, session);
    }
    return sessions.get(callId);
  };

  router.post('/twilio/voice', async (req, res) => {
    try {
      if (!isConfigured()) return res.status(503).json({ error: 'IVR not configured' });
      const publicUrl = env.IVR_PUBLIC_URL;
      if (!publicUrl) return res.status(503).json({ error: 'IVR_PUBLIC_URL is required for signature validation' });
      const signature = req.headers['x-twilio-signature'];
      if (!twilioSignatureValid({ url: publicUrl, params: req.body || {}, signature, authToken: env.TWILIO_AUTH_TOKEN })) {
        return res.status(403).json({ error: 'Invalid Twilio signature' });
      }
      const event = parseTwilioEvent(req.body || {});
      if (!event.callId) return res.status(400).json({ error: 'CallSid is required' });
      const session = getSession(event.callId);
      if (!session.callerId) session.callerId = event.callerId;
      const result = await session.handle(event);
      if (session.state === 'ended') sessions.delete(event.callId);
      res.set('Content-Type', 'text/xml');
      return res.send(renderTwiml(result.response));
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });

  router.post('/simulator/event', async (req, res) => {
    try {
      if (env.NODE_ENV === 'production' || env.IVR_SIMULATOR_ENABLED !== 'true') {
        return res.status(403).json({ error: 'Simulator is not enabled' });
      }
      const event = parseSimulatorEvent(req.body || {});
      if (!event.callId) return res.status(400).json({ error: 'callId is required' });
      const session = getSession(event.callId);
      if (!session.callerId) session.callerId = event.callerId;
      const result = await session.handle(event);
      if (session.state === 'ended') sessions.delete(event.callId);
      return res.json({ state: result.state, response: result.response, transferContext: result.transferContext || null, verified: session.verified });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });

  router.get('/health', (req, res) => {
    res.json({
      configured: isConfigured(),
      provider: env.IVR_PROVIDER || null,
      simulatorEnabled: env.NODE_ENV !== 'production' && env.IVR_SIMULATOR_ENABLED === 'true',
      activeSessions: sessions.size,
    });
  });

  return router;
}

module.exports = { createIvrRouter };
