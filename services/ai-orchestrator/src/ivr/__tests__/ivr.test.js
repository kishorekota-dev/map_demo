const { createHmac } = require('crypto');
const { twilioSignatureValid, parseTwilioEvent, renderTwiml } = require('../telephonyAdapter');
const { IvrSession } = require('../ivrSession');
const { createIvrRouter } = require('../../routes/ivr.routes');

describe('Twilio signature validation', () => {
  const authToken = 'test-token';
  const url = 'https://example.com/api/ivr/twilio/voice';
  const params = { CallSid: 'CA123', From: '+15551234567', CallStatus: 'in-progress' };
  const signature = createHmac('sha1', authToken)
    .update(url + Object.keys(params).sort().map((k) => k + params[k]).join(''))
    .digest('base64');

  test('accepts a correct signature and rejects a forged or missing one', () => {
    expect(twilioSignatureValid({ url, params, signature, authToken })).toBe(true);
    expect(twilioSignatureValid({ url, params, signature: 'forged', authToken })).toBe(false);
    expect(twilioSignatureValid({ url, params, signature: null, authToken })).toBe(false);
    expect(twilioSignatureValid({ url, params, signature, authToken: null })).toBe(false);
  });

  test('parses Gather speech and DTMF into neutral events, and TwiML escapes input', () => {
    expect(parseTwilioEvent({ CallSid: 'CA1', From: '+1', Digits: '1', SpeechResult: 'balance' }).type).toBe('dtmf');
    expect(parseTwilioEvent({ CallSid: 'CA1', From: '+1', SpeechResult: 'balance' }).type).toBe('speech');
    expect(parseTwilioEvent({ CallSid: 'CA1', From: '+1', CallStatus: 'completed' }).type).toBe('call.ended');
    const twiml = renderTwiml({ action: 'say', say: '<script>alert(1)</script>' });
    expect(twiml).not.toContain('<script>');
    expect(twiml).toContain('&lt;script&gt;');
  });
});

describe('IVR state machine', () => {
  test('no account path before verification; agent request transfers instead', async () => {
    const session = new IvrSession({ callId: 'CA1', callerId: '+1555' });
    const start = await session.handle({ type: 'call.started', callId: 'CA1' });
    expect(start.state).toBe('verifying');
    const transfer = await session.handle({ type: 'speech', callId: 'CA1', transcript: 'agent please' });
    expect(transfer.state).toBe('transferring');
    expect(transfer.transferContext.verified).toBe(false);
  });

  test('verified caller can gather intent, confirm, and be handed off', async () => {
    const session = new IvrSession({
      callId: 'CA2',
      callerId: '+1555',
      verifier: { verify: async (callerId, digits) => digits === '123456' },
    });
    await session.handle({ type: 'call.started', callId: 'CA2' });
    const verified = await session.handle({ type: 'dtmf', callId: 'CA2', digits: '123456' });
    expect(verified.state).toBe('gathering');
    expect(session.verified).toBe(true);
    const gathered = await session.handle({ type: 'speech', callId: 'CA2', transcript: 'What is my balance?' });
    expect(gathered.state).toBe('confirming');
    expect(session.intent).toBe('balance_inquiry');
    const confirmed = await session.handle({ type: 'speech', callId: 'CA2', transcript: 'yes' });
    expect(confirmed.response.action).toBe('say');
  });

  test('wrong verification code does not verify, and digits are not kept in full', async () => {
    const session = new IvrSession({
      callId: 'CA3',
      verifier: { verify: async () => false },
    });
    await session.handle({ type: 'call.started', callId: 'CA3' });
    const retry = await session.handle({ type: 'dtmf', callId: 'CA3', digits: '999999' });
    expect(retry.state).toBe('verifying');
    expect(session.verified).toBe(false);
    expect(JSON.stringify(session.transcript)).not.toContain('999999');
  });

  test('interruption during a prompt becomes new input, not a replay', async () => {
    const session = new IvrSession({ callId: 'CA4', verifier: { verify: async () => true } });
    await session.handle({ type: 'call.started', callId: 'CA4' });
    await session.handle({ type: 'dtmf', callId: 'CA4', digits: '123456' });
    const interrupted = await session.handle({ type: 'interrupted', callId: 'CA4' });
    expect(interrupted.state).toBe('gathering');
    expect(interrupted.response.say).toMatch(/listening/i);
  });
});

describe('IVR routes gating', () => {
  const express = require('express');
  const request = require('supertest');

  function appWith(env) {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use('/api/ivr', createIvrRouter({ env }));
    return app;
  }

  test('unconfigured Twilio webhook is 503, simulator is forbidden in production', async () => {
    const app = appWith({ IVR_ENABLED: 'false', NODE_ENV: 'development' });
    await request(app).post('/api/ivr/twilio/voice').send({ CallSid: 'CA1' }).expect(503);
    const prod = appWith({ NODE_ENV: 'production', IVR_SIMULATOR_ENABLED: 'true' });
    await request(prod).post('/api/ivr/simulator/event').send({ type: 'call.started', callId: 'CA1' }).expect(403);
  });

  test('simulator drives a call to agent transfer end to end', async () => {
    const app = appWith({
      NODE_ENV: 'development',
      IVR_SIMULATOR_ENABLED: 'true',
      IVR_TRANSFER_TARGET: '+15550001111',
    });
    // The default verifier denies, so use agent path to reach transferring.
    const started = await request(app).post('/api/ivr/simulator/event').send({ type: 'call.started', callId: 'CA9' });
    expect(started.body.state).toBe('verifying');
    const transferred = await request(app).post('/api/ivr/simulator/event').send({ type: 'speech', callId: 'CA9', transcript: 'agent' });
    expect(transferred.body.state).toBe('transferring');
    expect(transferred.body.response.action).toBe('transfer');
    expect(transferred.body.transferContext.verified).toBe(false);
  });
});
