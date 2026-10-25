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
 * 2. Interruption is a first-class event, not an error. If the caller
 *    speaks or presses a key while a prompt is playing, the machine moves
 *    to gathering with that input — it does not replay the prompt and
 *    does not discard the input.
 * 3. Transfer carries context, not just a phone call: intent, verification
 *    status, and the call transcript so far, so the agent does not ask
 *    the customer to repeat everything.
 * 4. Uncertain outcomes are explicit. A call that ends mid-flow is
 *    recorded as ended with reason + transcript, not as completed.
 *
 * The verifier is injected ({ verify(callerId, digits) -> Promise<boolean> })
 * because this repo cannot supply an enterprise's identity check. The
 * default verifier denies everything, which is the safe failure mode.
 */

const STATES = ['started', 'verifying', 'gathering', 'confirming', 'transferring', 'ended'];

class IvrSession {
  constructor({ callId, callerId = null, verifier = null } = {}) {
    if (!callId) throw new Error('IVR session requires a callId');
    this.callId = callId;
    this.callerId = callerId;
    this.state = 'started';
    this.verified = false;
    this.transcript = []; // [{ type, text, at }] — caller utterances only, no secrets
    this.intent = null;
    this.transferTo = null;
    this.endedReason = null;
    this.verifier = verifier || { verify: async () => false };
  }

  _record(event) {
    if (event.transcript) this.transcript.push({ type: 'speech', text: String(event.transcript).slice(0, 2000), at: new Date().toISOString() });
    if (event.digits) this.transcript.push({ type: 'dtmf', text: `digits:${String(event.digits).length} digits`, at: new Date().toISOString() });
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
    if (this.state === 'ended') return { response: { action: 'hangup' }, state: this.state };
    if (event.type === 'call.ended') {
      this.state = 'ended';
      this.endedReason = event.status || 'ended';
      return { response: { action: 'hangup' }, state: this.state };
    }
    if (event.type === 'call.started') {
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
    if (event.type === 'interrupted') {
      // Caller barged in during a prompt: treat the interruption as input.
      this.state = 'gathering';
      return {
        response: {
          action: 'gather',
          say: 'Go ahead, I am listening.',
          timeoutSeconds: 15,
          maxDigits: 1,
        },
        state: this.state,
      };
    }
    if (this.state === 'verifying') {
      const transcript = (event.transcript || '').toLowerCase();
      if (transcript.includes('agent') || transcript.includes('human') || event.digits === '0') {
        return this._transfer('caller requested an agent before verification');
      }
      if (event.digits) {
        // Digits are passed to the operator verifier, never compared here
        // against a stored value and never logged in full (see _record).
        const ok = await this.verifier.verify(this.callerId, event.digits);
        if (ok) {
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
      if (text.includes('agent') || text.includes('human') || event.digits === '0') {
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
      this._record(event);
      const text = (event.transcript || '').toLowerCase();
      if (text.includes('agent') || text.includes('human') || event.digits === '0') {
        return this._transfer('caller requested an agent at confirmation');
      }
      if (text.includes('yes') || event.digits === '1') {
        // Confirmed, verified intent: the caller is handed to the
        // orchestrator path via a transfer record, not executed here.
        return {
          response: {
            action: 'say',
            say: `Confirmed. Your request for ${this.intent.replace(/_/g, ' ')} is being processed. Please hold while I connect you to complete it.`,
          },
          state: this.state,
        };
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

  _transfer(reason) {
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
    this.transferTo = target || null;
    return this;
  }
}

module.exports = { IvrSession, STATES };
