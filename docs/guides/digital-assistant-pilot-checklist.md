# Digital Assistant pilot checklist

How to prove, phase by phase, that map_demo is actually best-in-class
for a company — not just that the code exists. Each phase has a pass
criterion that needs a real backend, a real provider, or real customers.
Code alone does not pass a phase.

## Phase 1 — Generic backend integration (done, code only)

- [ ] One real backend (CRM or ticketing) registered via
      `ADAPTERS_CONFIG_PATH` with env-only credentials.
- [ ] A mutating tool executed twice with the same `idempotencyKey`
      produces one backend record (replay, not duplicate).
- [ ] A forced timeout on a mutating call returns `uncertain`, and
      `POST /api/adapters/:adapterId/reconcile` resolves it without a
      blind retry.
- Pass: all three, against the real backend, with the backend's own
  record counts as evidence.

## Phase 2 — Live agent chat (done, code only)

- [ ] A customer requests a live agent from a digital session, an agent
      accepts, and the two exchange at least 3 messages each in-session
      (Socket.IO events `requestLiveAgent`, `agentAcceptLiveChat`,
      `sendMessage` in live mode, `endLiveChat`).
- [ ] The accepting agent sees intent + recent transcript (transfer
      context); the agent dashboard queue sees session + intent only.
- [ ] After `endLiveChat`, the same session continues with the AI
      orchestrator (no new session, transcript intact).
- [ ] A non-assigned agent and a non-owner customer are both denied
      live messages.
- Pass: all four, with a transcript export as evidence.

## Phase 3 — IVR (done, code only — no live telephony yet)

- [ ] A Twilio number points at the public `/api/ivr/twilio/voice`
      webhook, with `IVR_ENABLED=true`, `TWILIO_AUTH_TOKEN` and
      `IVR_PUBLIC_URL` set. A forged signature is rejected (403).
- [ ] A complete authenticated voice journey: verification, intent
      gathering, confirmation, and transfer to a live agent queue,
      with interruption (barge-in) exercised mid-prompt.
- [ ] A caller who fails verification cannot reach an account action
      and can still reach an agent.
- [ ] Real ASR/TTS quality, DTMF reliability, and call latency are
      measured (the repo's 120s/400s chat budgets are NOT a voice SLA).
- Pass: all four, with call recordings / provider logs as evidence.
  Until then, IVR is "adapter implemented, provider unqualified".

## Phase 4 — Best-in-class proof (done, code only)

- [ ] `GET /analytics/outcomes` (30 days) shows completion, FCR
      (proxy, 7-day no-return + no case), containment, repeat contact,
      and channel breakdown — with the limitations in the response
      read alongside the numbers.
- [ ] Conversation evaluation (`conversationEvaluator`) is run over a
      pilot transcript sample: zero `mutation_without_confirmation`
      failures, zero `transfer_without_intent` failures.
- [ ] Knowledge imports pass `validateKnowledgeDocument` (no PII, no
      stubs, no duplicates, source + version present) before they
      become answer sources.
- [ ] Cost per completed interaction is priced (cost model configured;
      otherwise `/costs` correctly reports unpriced, not zero).
- Pass: all four, with the analytics output and evaluation report as
  evidence.

## Still explicitly not proven by this repo

- Live enterprise identity (IdP) and live CRM sandbox qualification.
- Real model qualification on production hardware (tests use fixtures).
- Load, backup, and RPO/RTO evidence.
- Any vendor's production certification.

These were already listed in `docs/guides/platform-gap-assessment.md`
and remain open. Do not mark them complete on the basis of this work.
