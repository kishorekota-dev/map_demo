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
    const session = new IvrSession({ callId: 'CA1', callerId: '+1555' }).setTransferTarget('+15550001111');
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
    session.setTransferTarget('+15550001111');
    await session.handle({ type: 'call.started', callId: 'CA2' });
    const verified = await session.handle({ type: 'dtmf', callId: 'CA2', digits: '123456' });
    expect(verified.state).toBe('gathering');
    expect(session.verified).toBe(true);
    const gathered = await session.handle({ type: 'speech', callId: 'CA2', transcript: 'What is my balance?' });
    expect(gathered.state).toBe('confirming');
    expect(session.intent).toBe('balance_inquiry');
    const confirmed = await session.handle({ type: 'speech', callId: 'CA2', transcript: 'yes' });
    expect(confirmed.response.action).toBe('transfer');
    expect(confirmed.state).toBe('transferring');
    expect(confirmed.transferContext.intent).toBe('balance_inquiry');
    expect(confirmed.response.say).not.toMatch(/being processed|completed/i);
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

  test('unverified barge-in cannot bypass verification or leak a spoken code', async () => {
    const session = new IvrSession({ callId: 'unverified' });
    await session.handle({ type: 'call.started' });
    const result = await session.handle({ type: 'interrupted', transcript: 'My code is 123456 and I need my balance' });
    expect(result.state).toBe('verifying'); expect(session.verified).toBe(false); expect(session.intent).toBeNull();
    expect(JSON.stringify(session.transcript)).not.toContain('123456');
  });
  test('truthy verifier objects cannot authenticate and three failed attempts end safely', async () => {
    const verify = jest.fn(async () => ({ verified: false }));
    const session = new IvrSession({ callId: 'attempts', verifier: { verify } });
    await session.handle({ type: 'call.started' });
    for (let attempt = 0; attempt < 3; attempt++) await session.handle({ type: 'dtmf', digits: '123456' });
    expect(session.verified).toBe(false); expect(session.state).toBe('ended'); expect(session.endedReason).toBe('transfer_unavailable');
    expect((await session.handle({ type: 'dtmf', digits: '123456' })).response.action).toBe('hangup'); expect(verify).toHaveBeenCalledTimes(3);
  });
  test('missing transfer ends truthfully and duplicate start never resets verified context', async () => {
    const session = new IvrSession({ callId: 'verified', verifier: { verify: async () => true } });
    await session.handle({ type: 'call.started' }); await session.handle({ type: 'dtmf', digits: '123456' });
    await session.handle({ type: 'speech', transcript: 'balance' });
    const duplicate = await session.handle({ type: 'call.started' });
    expect(duplicate.state).toBe('confirming'); expect(session.intent).toBe('balance_inquiry');
    const final = await session.handle({ type: 'interrupted', transcript: 'yes' });
    expect(final.state).toBe('ended'); expect(final.response.action).toBe('hangup'); expect(final.response.say).toMatch(/No account action/);
    expect(renderTwiml(final.response)).toContain('<Say>');
  });
  test('verifier exceptions cannot bypass the attempt bound', async () => {
    const verify = jest.fn(async () => { throw new Error('verification unavailable'); });
    const session = new IvrSession({ callId: 'errors', verifier: { verify } });
    await session.handle({ type: 'call.started' });
    for (let attempt = 0; attempt < 3; attempt++) await expect(session.handle({ type: 'dtmf', digits: '123456' })).rejects.toThrow();
    const result = await session.handle({ type: 'dtmf', digits: '123456' });
    expect(result.state).toBe('ended'); expect(verify).toHaveBeenCalledTimes(3);
  });
  test('barge-in preserves input while unambiguous affirmation is required', async () => {
    const session = new IvrSession({ callId: 'barge', verifier: { verify: async () => true } }).setTransferTarget('+15550001111');
    await session.handle({ type: 'call.started' }); await session.handle({ type: 'dtmf', digits: '123456' });
    await session.handle({ type: 'interrupted', transcript: 'balance' }); expect(session.state).toBe('confirming');
    const result = await session.handle({ type: 'speech', transcript: 'not yesterday' }); expect(result.response.action).not.toBe('transfer');
    expect(session.state).toBe('gathering');
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

  function appWith(env, options = {}) {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use('/api/ivr', createIvrRouter({ env, ...options }));
    return app;
  }

  test('unconfigured Twilio webhook is 503, simulator is forbidden in production', async () => {
    const app = appWith({ IVR_ENABLED: 'false', NODE_ENV: 'development' });
    await request(app).post('/api/ivr/twilio/voice').send({ CallSid: 'CA1' }).expect(503);
    const prod = appWith({ NODE_ENV: 'production', IVR_SIMULATOR_ENABLED: 'true' });
    await request(prod).post('/api/ivr/simulator/event').send({ type: 'call.started', callId: 'CA1' }).expect(403);
  });

  test('configured standalone IVR still fails closed in production', async () => {
    const app = appWith({ NODE_ENV: 'production', IVR_ENABLED: 'true', IVR_PROVIDER: 'twilio', TWILIO_AUTH_TOKEN: 'token', IVR_PUBLIC_URL: 'https://example.test/api/ivr/twilio/voice' });
    await request(app).post('/api/ivr/twilio/voice').type('form').send({ CallSid: 'CA1' }).expect(503);
    const result = await request(app).get('/api/ivr/health'); expect(result.body.configured).toBe(false); expect(result.body.durable).toBe(false);
  });
  test('missing public URL is not reported configured', async () => {
    const result = await request(appWith({ NODE_ENV: 'development', IVR_ENABLED: 'true', TWILIO_AUTH_TOKEN: 'token' })).get('/api/ivr/health');
    expect(result.body.configured).toBe(false);
  });
  test('bounded sessions retain terminal tombstones until expiry', async () => {
    let time = 0;
    const app = appWith({ NODE_ENV: 'development', IVR_SIMULATOR_ENABLED: 'true' }, { maxSessions: 1, sessionTtlMs: 100, now: () => time });
    await request(app).post('/api/ivr/simulator/event').send({ type: 'call.started', callId: 'one' }).expect(200);
    await request(app).post('/api/ivr/simulator/event').send({ type: 'call.ended', callId: 'one' }).expect(200);
    const replay = await request(app).post('/api/ivr/simulator/event').send({ type: 'call.started', callId: 'one' }); expect(replay.body.state).toBe('ended');
    await request(app).post('/api/ivr/simulator/event').send({ type: 'call.started', callId: 'two' }).expect(429);
    time = 101; await request(app).post('/api/ivr/simulator/event').send({ type: 'call.started', callId: 'two' }).expect(200);
  });
  test('per-call overlap cannot race verification and verifier errors never leak', async () => {
    let complete; let entered;
    const enteredPromise = new Promise(resolve => { entered = resolve; });
    const verifier = { verify: jest.fn(() => { entered(); return new Promise(resolve => { complete = resolve; }); }) };
    const env = { NODE_ENV: 'development', IVR_SIMULATOR_ENABLED: 'true' };
    const app = appWith(env, { verifier });
    await request(app).post('/api/ivr/simulator/event').send({ type: 'call.started', callId: 'race' });
    const first = request(app).post('/api/ivr/simulator/event').send({ type: 'dtmf', callId: 'race', digits: '123456' }).then(result => result);
    await enteredPromise;
    await request(app).post('/api/ivr/simulator/event').send({ type: 'dtmf', callId: 'race', digits: '123456' }).expect(409);
    complete(false); expect((await first).status).toBe(200); expect(verifier.verify).toHaveBeenCalledTimes(1);
    const failing = appWith(env, { verifier: { verify: async () => { throw new Error('private-provider-secret'); } } });
    await request(failing).post('/api/ivr/simulator/event').send({ type: 'call.started', callId: 'failure' });
    const error = await request(failing).post('/api/ivr/simulator/event').send({ type: 'dtmf', callId: 'failure', digits: '123456' });
    expect(error.status).toBe(503); expect(JSON.stringify(error.body)).not.toContain('private-provider-secret');
  });
  test('Twilio and simulator cannot share verified state, and forged callbacks allocate nothing', async () => {
    const sessions = new Map(); const env = { NODE_ENV: 'development', IVR_SIMULATOR_ENABLED: 'true', IVR_ENABLED: 'true', TWILIO_AUTH_TOKEN: 'token', IVR_PUBLIC_URL: 'https://example.test/api/ivr/twilio/voice' };
    const app = appWith(env, { sessions, verifier: { verify: async () => true } });
    await request(app).post('/api/ivr/simulator/event').send({ type: 'call.started', callId: 'shared' });
    await request(app).post('/api/ivr/simulator/event').send({ type: 'dtmf', callId: 'shared', digits: '123456' });
    const params = { CallSid: 'shared', CallStatus: 'in-progress' };
    await request(app).post('/api/ivr/twilio/voice').type('form').send(params).expect(403); expect(sessions.size).toBe(1);
    const signature = createHmac('sha1', env.TWILIO_AUTH_TOKEN).update(env.IVR_PUBLIC_URL + Object.keys(params).sort().map(key => key + params[key]).join('')).digest('base64');
    const result = await request(app).post('/api/ivr/twilio/voice').set('X-Twilio-Signature', signature).type('form').send(params);
    expect(result.status).toBe(200); expect(result.text).toContain('verification code'); expect(sessions.get('twilio:shared').verified).toBe(false);
    expect(result.text).toContain('actionOnEmptyResult="true"'); expect(sessions.size).toBe(2);
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
