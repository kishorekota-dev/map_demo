/**
 * Provider-neutral telephony adapter + Twilio-compatible adapter (IVR).
 *
 * What was missing before this module: the IVR channel existed only as a
 * policy value ('ivr' in the control plane, disabled by design, "telephony
 * adapter required"). There was no media, speech, DTMF, interruption,
 * signed-webhook, caller-verification or transfer implementation at all.
 *
 * This module supplies the adapter layer, and only that layer:
 * - a provider-neutral call event shape (call.started, speech, dtmf,
 *   interrupted, ended, transfer.requested) and a provider-neutral
 *   response shape (say, gather, transfer, hangup),
 * - a Twilio adapter: HMAC-SHA1 signature validation (Twilio's documented
 *   scheme: SHA1 of URL + sorted POST parameters, base64), form-body
 *   parsing into neutral events, and neutral responses rendered as TwiML,
 * - a simulator adapter (JSON in / JSON out, no telephony provider) so
 *   the IVR state machine can be exercised locally without a phone number.
 *
 * What this is NOT: a live telephony qualification. No provider is
 * configured by default, no call is placed, and no account action is
 * allowed until caller verification succeeds (see ivrSession.js). A
 * Twilio number, a public webhook URL and a pilot call are still required
 * to claim a working IVR — see docs/guides/digital-assistant-pilot-checklist.md.
 *
 * Security notes:
 * - Signature validation uses timingSafeEqual on equal-length buffers;
 *   a missing signature, missing secret, or mismatch is a rejection, not
 *   a fallback to "trusted".
 * - Caller IDs and digits are treated as untrusted input: they are never
 *   used as authentication by themselves.
 * - TwiML is built by escaping text, never by string-interpolating raw
 *   caller input into XML.
 */

const { createHmac, timingSafeEqual } = require('crypto');

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Twilio signature: base64(HMAC-SHA1(authToken, url + sorted(key+value))).
 * The URL must be the exact public URL Twilio called, including query
 * string, as configured by the operator — not the internal host.
 */
function twilioSignatureValid({ url, params, signature, authToken }) {
  if (!url || !signature || !authToken) return false;
  const data = url + Object.keys(params || {}).sort().map((key) => key + params[key]).join('');
  const expected = createHmac('sha1', authToken).update(data).digest('base64');
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actual.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actual, expectedBuffer);
}

function parseTwilioEvent(body) {
  const callSid = body.CallSid || body.CallSID || null;
  const from = body.From || null;
  if (body.CallStatus === 'completed' || body.CallStatus === 'failed' || body.CallStatus === 'busy' || body.CallStatus === 'no-answer') {
    return { type: 'call.ended', callId: callSid, callerId: from, status: body.CallStatus, raw: body };
  }
  // Gather results arrive as SpeechResult and/or Digits on the same webhook.
  if (body.SpeechResult !== undefined || body.Digits !== undefined) {
    if (body.Digits !== undefined && String(body.Digits).length > 0) {
      return { type: 'dtmf', callId: callSid, callerId: from, digits: String(body.Digits), speech: body.SpeechResult || null, raw: body };
    }
    return { type: 'speech', callId: callSid, callerId: from, transcript: String(body.SpeechResult || ''), raw: body };
  }
  if (body.CallStatus === 'in-progress' || body.CallStatus === 'ringing') {
    return { type: 'call.started', callId: callSid, callerId: from, status: body.CallStatus, raw: body };
  }
  return { type: 'call.started', callId: callSid, callerId: from, status: body.CallStatus || 'unknown', raw: body };
}

/**
 * Render a neutral response as TwiML. Gather with speech + DTMF input is
 * interruptible by design: the caller speaking or pressing a key during
 * a prompt ends the prompt (barge-in), which is what "interruption
 * handling" means at the telephony layer. The state machine in
 * ivrSession.js decides what the interruption means.
 */
function renderTwiml(response) {
  if (!response || response.action === 'hangup') {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
  }
  if (response.action === 'transfer') {
    const target = escapeXml(response.transferTo || '');
    const say = response.say ? `<Say>${escapeXml(response.say)}</Say>` : '';
    // <Dial> to a queue/agent number supplied by the operator. The number
    // is configuration, never caller input.
    return `<?xml version="1.0" encoding="UTF-8"?><Response>${say}<Dial>${target}</Dial></Response>`;
  }
  if (response.action === 'gather') {
    const say = response.say ? `<Say>${escapeXml(response.say)}</Say>` : '';
    const timeout = Number.isInteger(response.timeoutSeconds) ? response.timeoutSeconds : 10;
    const action = response.actionUrl ? ` action="${escapeXml(response.actionUrl)}"` : '';
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech dtmf" timeout="${timeout}" speechTimeout="auto" numDigits="${response.maxDigits || 1}"${action}>${say}</Gather><Say>${escapeXml(response.fallbackSay || 'I did not catch that. Please try again.')}</Say></Response>`;
  }
  // say only
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${escapeXml(response.say || '')}</Say></Response>`;
}

/** Simulator adapter: JSON events in, neutral responses out. No provider. */
function parseSimulatorEvent(body) {
  if (!body || typeof body.type !== 'string') throw new Error('Simulator event requires a type');
  return {
    type: body.type,
    callId: body.callId || null,
    callerId: body.callerId || null,
    transcript: body.transcript || null,
    digits: body.digits || null,
    status: body.status || null,
    raw: body,
  };
}

module.exports = {
  escapeXml,
  twilioSignatureValid,
  parseTwilioEvent,
  renderTwiml,
  parseSimulatorEvent,
};
