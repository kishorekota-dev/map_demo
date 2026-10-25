/**
 * IVR call state machine (provider-neutral).
 *
 * States: started -> verifying -> gathering -> confirming -> transferring | ended
 *
 * Rules that matter, enforced here rather than in a prompt:
 * 1. No account action before caller verification. Until verified, the
 *    only allowed paths are: verify (DTMF PIN / account digits, checked by
 *    an injected verifier the operator supplies), transfer to a human, or
 *    hang up. A transcript or caller ID alone never verifies a caller.
 * 2. Interruption passes input through the current verification or
 *    confirmation state. It never grants verification or confirmation.
 * 3. Transfer returns bounded context to its caller. The standalone TwiML
 *    route only dials a number; delivering context to a real agent remains
 *    the durable provider adapter's responsibility.
 * 4. A call ending mid-flow is marked ended in this development process,
 *    never represented as a completed account action or durable record.
 *
 * The verifier is injected ({ verify(callerId, digits) -> Promise<boolean> })
 * because this repo cannot supply an enterprise's identity check. The
 * default verifier denies everything, which is the safe failure mode.
 */

const TYPES = ['call.started', 'call.ended', 'speech', 'dtmf', 'interrupted', 'transfer.requested'];
const STATES = ['started', 'verifying', 'gathering', 'confirming', 'transferring', 'ended'];

class IvrSession {
  constructor({ callId, callerId = null, verifier = null } = {}) {
    if (!callId) throw new Error('IVR session requires a callId');
    this.callId = callId;
    this.callerId = callerId;
    this.state = 'started';
    this.verified = false;
    this.transcript = []; // Bounded post-verification utterances; verification speech/digits omitted.
    this.intent = null;
    this.transferTo = null;
    this.endedReason = null;
    this.verifier = verifier || { verify: async () => false };
    this.verificationAttempts = 0;
    this.turns = 0;
  }

  _record(event) {
    if (event.transcript && this.verified) this.transcript.push({ type: 'speech', text: String(event.transcript).slice(0, 2000), at: new Date().toISOString() });
    if (event.digits && this.verified) this.transcript.push({ type: 'dtmf', text: `digits:${String(event.digits).length} digits`, at: new Date().toISOString() });
    this.transcript = this.transcript.slice(-50);
  }

  /**
   * Handle one neutral call event and return the neutral response.
   * Returns { response, state } where response is one of:
   * { action: 'gather', say, timeoutSeconds, maxDigits, fallbackSay }
   * { action: 'say', say }
   * { action: 'transfer', say, transferTo }
   * { action: 'hangup' }
   */
  async handle(event) {
    if (!event || !TYPES.includes(event.type) || (event.callId && event.callId !== this.callId)
      || (event.transcript != null && (typeof event.transcript !== 'string' || event.transcript.length > 2000))
      || (event.digits != null && (typeof event.digits !== 'string' || !/^[0-9*#]{0,32}$/.test(event.digits)))) throw Object.assign(new Error('Invalid call event'), { status: 400 });
    if (this.state === 'ended') return { response: { action: 'hangup' }, state: this.state };
    if (event.type === 'call.ended') {
      this.state = 'ended';
      this.endedReason = event.status || 'ended';
      return { response: { action: 'hangup' }, state: this.state };
    }
    if (++this.turns > 100) return this._end('call_limit', 'This call has reached its limit. Please contact customer service.');
    if (this.state === 'transferring') return { response: { action: 'hangup' }, state: this.state };
    if (event.type === 'call.started' && this.state === 'started') {
      this.state = 'verifying';
      return {
        response: {
          action: 'gather',
          say: 'Welcome. For security, please enter your verification code using your keypad, or say agent to speak to a person.',
          timeoutSeconds: 15,
          maxDigits: 6,
        },
        state: this.state,
      };
    }
    if (event.type === 'transfer.requested') return this._transfer('caller requested an agent');
    if (event.type === 'call.started' && this.state !== 'started') return this._prompt();
    if (event.type === 'interrupted') {
      // Barge-in carries input into the current security/confirmation state.
      // It must never promote an unverified caller into an account path.
      if (event.transcript || event.digits) event = { ...event, type: event.digits ? 'dtmf' : 'speech' };
      else if (this.verified && this.state === 'gathering') return { response: { action: 'gather', say: 'Go ahead, I am listening.', timeoutSeconds: 15, maxDigits: 1 }, state: this.state };
    }
    if (!this.verified && this.state !== 'verifying') this.state = 'verifying';
    if (this.state === 'verifying') {
      const transcript = (event.transcript || '').toLowerCase();
      if (/\b(agent|human)\b/.test(transcript) || event.digits === '0') {
        return this._transfer('caller requested an agent before verification');
      }
      if (event.digits) {
        if (this.verificationAttempts >= 3) return this._transfer('verification attempt limit');
        // Digits are passed to the operator verifier, never compared here
        // against a stored value and never logged in full (see _record).
        this.verificationAttempts++;
        const ok = await this.verifier.verify(this.callerId, event.digits);
        if (ok === true) {
          this.verified = true;
          this.state = 'gathering';
          return {
            response: {
              action: 'gather',
              say: 'Thank you, you are verified. How can I help? You can say balance, recent transactions, or agent.',
              timeoutSeconds: 15,
              maxDigits: 1,
            },
            state: this.state,
          };
        }
        if (this.verificationAttempts >= 3) return this._transfer('verification attempt limit');
        return {
          response: {
            action: 'gather',
            say: 'That verification did not match. Please try again, or say agent.',
            timeoutSeconds: 15,
            maxDigits: 6,
          },
          state: this.state,
        };
      }
      if (event.transcript) {
        this._record(event);
        return {
          response: {
            action: 'gather',
            say: 'Verification needs a keypad code. Please enter your verification code, or say agent.',
            timeoutSeconds: 15,
            maxDigits: 6,
          },
          state: this.state,
        };
      }
      return { response: { action: 'gather', say: 'Please enter your verification code.', timeoutSeconds: 15, maxDigits: 6 }, state: this.state };
    }
    if (this.state === 'gathering') {
      this._record(event);
      const text = (event.transcript || '').toLowerCase();
      if (/\b(agent|human)\b/.test(text) || event.digits === '0') {
        return this._transfer('caller requested an agent');
      }
      if (text.includes('balance')) this.intent = 'balance_inquiry';
      else if (text.includes('transaction')) this.intent = 'transaction_history';
      else if (text) this.intent = 'general_inquiry';
      if (!this.intent) {
        return {
          response: {
            action: 'gather',
            say: 'I did not catch that. You can say balance, recent transactions, or agent.',
            timeoutSeconds: 15,
            maxDigits: 1,
          },
          state: this.state,
        };
      }
      // Account actions are not executed by the IVR machine itself: it
      // confirms intent and hands the verified intent to the orchestrator
      // (or to a human) through the transfer/context path. This keeps the
      // voice layer from becoming a second banking execution engine.
      this.state = 'confirming';
      return {
        response: {
          action: 'gather',
          say: `You asked about ${this.intent.replace(/_/g, ' ')}. Is that right? Say yes to continue, or agent to speak to a person.`,
          timeoutSeconds: 15,
          maxDigits: 1,
        },
        state: this.state,
      };
    }
    if (this.state === 'confirming') {
      if (!event.transcript && !event.digits) return this._prompt();
      this._record(event);
      const text = (event.transcript || '').toLowerCase();
      if (/\b(agent|human)\b/.test(text) || event.digits === '0') {
        return this._transfer('caller requested an agent at confirmation');
      }
      if (/^(yes|confirm|correct|continue)[.!\s]*$/.test(text.trim()) || event.digits === '1') {
        // No customer JWT or durable action contract is available here.
        // An actual configured Dial is a human transfer, never fulfillment.
        return this._transfer('verified request confirmed; agent fulfillment required');
      }
      this.state = 'gathering';
      this.intent = null;
      return {
        response: {
          action: 'gather',
          say: 'No problem. How can I help instead? You can say balance, recent transactions, or agent.',
          timeoutSeconds: 15,
          maxDigits: 1,
        },
        state: this.state,
      };
    }
    return { response: { action: 'hangup' }, state: this.state };
  }

  _prompt() {
    const verifying = !this.verified;
    return { response: { action: 'gather', say: verifying ? 'Please enter your verification code, or say agent.'
      : this.state === 'confirming' ? `You asked about ${this.intent.replace(/_/g, ' ')}. Say yes to connect with an agent, or no to choose another request.`
        : 'How can I help? You can say balance, recent transactions, or agent.', timeoutSeconds: 15, maxDigits: verifying ? 6 : 1 }, state: this.state };
  }

  _end(reason, say) {
    this.state = 'ended'; this.endedReason = reason;
    return { response: { action: 'hangup', say }, state: this.state };
  }

  _transfer(reason) {
    if (!this.transferTo) return this._end('transfer_unavailable', 'An agent connection is unavailable. No account action was performed. Please contact customer service.');
    this.state = 'transferring';
    return {
      response: {
        action: 'transfer',
        say: 'Connecting you to an agent. Please hold.',
        transferTo: this.transferTo,
      },
      state: this.state,
      transferContext: {
        callId: this.callId,
        callerId: this.callerId,
        verified: this.verified,
        intent: this.intent,
        reason,
        transcript: this.transcript,
      },
    };
  }

  /** Operator configuration: where transfers go (a queue/agent number). */
  setTransferTarget(target) {
    if (target && (typeof target !== 'string' || !/^\+[1-9][0-9]{6,14}$/.test(target))) throw Object.assign(new Error('Transfer target must be an E.164 phone number'), { status: 503 });
    this.transferTo = target || null;
    return this;
  }
}

module.exports = { IvrSession, STATES };
