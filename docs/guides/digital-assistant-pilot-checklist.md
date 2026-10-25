# Digital Assistant pilot qualification checklist

The recent changes add an internal backend-adapter API, a Socket.IO live-chat
pilot, a standalone IVR simulator/TwiML pilot, observed outcome metrics and a
conversation linter. The review fixed defects in those additions. None is a
certificate of customer readiness or market leadership. This checklist separates
implemented mechanics from the live acceptance evidence still required.

## Backend adapter pilot

The [adapter guide](backend-integration-framework.md) defines the exact supported
contract and restrictions. The API is private and service-authenticated; it is
not registered in the governed customer workflow/MCP tool catalog.

- [ ] Register one real backend using a protected `ADAPTERS_CONFIG_PATH` file,
      explicit host policy and server-owned credentials. Verify read authorization
      for the intended records; a service credential is not customer authorization.
- [ ] In an isolated development/test pilot, explicitly enable pilot mutations.
      Repeating the same key/arguments must produce one provider record; changing
      the arguments must be rejected. Verify provider-side dedupe across restart.
- [ ] Force an ambiguous timeout, 5xx and asynchronous 202 response. Preserve
      `uncertain` status and reconcile using authoritative provider evidence.
- Production standalone mutations remain blocked. Connect mutations to customer
  authorization, confirmation and the durable effect ledger before changing that
  restriction. The in-process cache is not shared durable dedupe.

## Live agent chat pilot

- [ ] Use supported Socket.IO customer events and the existing agent dashboard
      assignment protocol to request, accept and exchange messages in one owned
      session. The current React customer page does not expose the new live-chat
      request protocol; this is not a completed end-to-end React feature.
- [ ] Require durable chat persistence for production assignment. Verify two
      simultaneous agents have one claim winner; an unrequested session, pending
      financial workflow, expired token and non-owner/non-assigned actor are denied.
- [ ] Verify transfer context is bounded/redacted and queued customers do not
      silently continue into the AI workflow. End live handling explicitly and
      verify the same transcript/session continues as intended.
- [ ] Qualify room delivery, reconnect, assignment revocation, supervisor actions
      and multiple-server routing with the actual contact-center topology.
- Queue visibility and socket routing still have process-local boundaries. Database
  assignment coordination does not establish distributed Socket.IO delivery.

## IVR pilot

The new standalone `/api/ivr` adapter is development/test-only. Production returns
unavailable; use the existing durable provider-neutral operations voice contract
for a production integration. The gateway does not publish this standalone prefix.

- [ ] Test Twilio signature verification with an exact local/tunnel public URL;
      forged signatures, malformed callbacks and overlapping turns must fail.
- [ ] Verify interruption cannot bypass caller verification, bounded attempts/TTL,
      DTMF input, explicit confirmation, real provider transfer and call cleanup.
- [ ] Establish actual customer identity independently. Pilot verification is not
      a banking access token. This adapter does not execute account actions, and
      generated TwiML does not deliver the collected context to an agent system.
- [ ] Qualify real ASR/TTS, barge-in, DTMF timing, caller identity, queue mapping,
      transfer context and voice latency against the production durable adapter.
- Chat timeout budgets and fixture TwiML tests are not voice SLA evidence.

## Outcome and conversation evidence

- [ ] Read `/api/operations/analytics/outcomes?days=30` with an authorized operator.
      Check the observation cutoff, event count, distinct interaction/session
      counts and mature/unknown/recent FCR denominators alongside the rates.
- FCR is an observed seven-day no-return/no-case proxy. Recent and anonymous
  completions are excluded. A recorded successful runtime outcome is not independent
  customer or provider proof. Windows above 50,000 relevant events return 422 rather
  than a misleading partial aggregate; choose fewer days.
- Live agent events are not comprehensively forwarded into operations. Consequently
  `containmentRate` is null. `observedAutomatedCompletionRate` is a separately
  labeled proxy that may miss unrecorded human handling.
- [ ] Use `conversationEvaluator` only to lint reviewed, annotated transcripts.
      It validates input and applies deterministic rules; mutation/confirmation
      annotations are supplied by the caller and do not prove actual authorization.
      Correlate financial action evidence and confirmations independently.
- [ ] Verify connector knowledge sync rejects a whole invalid/sensitive batch
      before importing drafts. Internal versions are assigned by the control plane;
      supplied versions are optional labels. Pattern checks are incomplete and can
      flag legitimate public contact details, which need explicit human review.
      Manual knowledge authoring retains its existing publication/ACL controls.
- [ ] Configure actual prices for `/api/operations/costs`; unpriced usage must
      remain unknown. Measure business completion and cost in the same pilot.

## Still required in the target deployment

Live enterprise identity, CRM/provider sandbox and remote Qwen qualification;
representative load, realtime routing, backup/restore and RPO/RTO; authoritative
customer outcome evidence. See the [platform assessment](platform-gap-assessment.md)
and [recent-change review](recent-changes-review.md). No checklist item becomes
complete solely because a unit or integration fixture passes.
