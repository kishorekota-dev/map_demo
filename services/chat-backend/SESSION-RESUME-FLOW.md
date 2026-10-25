# Session continuation and channel handoff

An ordinary session reopen is an authenticated read/join of the same customer's session. A cross-channel transition uses a one-time grant; neither a phone number nor a session ID authenticates a caller.

1. The signed customer requests `POST /api/sessions/:id/handoff` with `{ "targetChannel": "ava" }` (or `digital` / `ivr`). Ownership and target-channel policy are checked.
2. The response contains `{grant, expiresAt, sessionId, targetChannel}`. Pass this opaque grant through the trusted channel adapter; do not log it or put it in a URL.
3. The same authenticated customer calls `POST /api/sessions/resume` with `{grant}`. The five-minute grant is consumed atomically once and returns the resumed session/channel context.
4. The downstream orchestrator preserves the release, original action identity, collected fields, and pending confirmation. Caller metadata cannot replace them.

Socket equivalents are `requestHandoff` / `handoffCreated` and `resumeSession` / `sessionResumed`. Both require an authenticated socket bound to the same user/tenant. Disabled channels reject transitions. PostgreSQL stores only grant hashes; memory storage is an explicit non-production option.

Grant consumption and orchestrator update are not one transaction. If the downstream update fails after consumption, reusing the grant fails; inspect the session and request a new grant. No handoff retry may duplicate a financial action. Provider-neutral voice adapters must establish verified identity before this exchange.

See [handoff implementation](services/handoffService.js), [route ownership](routes/api.js), [socket handlers](services/socketHandler.js), and [runtime recovery](../ai-orchestrator/CONTROL-PLANE-RUNTIME.md).
