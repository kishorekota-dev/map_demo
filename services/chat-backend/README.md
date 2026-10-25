# Chat backend

The chat backend serves authenticated customer REST and Socket.IO conversations on port **3006**. It owns chat sessions/messages and pending-response context, forwards workflow requests to the AI orchestrator, and supports identity-bound one-time cross-channel handoff. It is not a second banking execution engine.

## Current references

- [Architecture](ARCHITECTURE.md)
- [REST and socket quick reference](QUICK-REFERENCE.md)
- [Session resume and channel handoff](SESSION-RESUME-FLOW.md)
- [Deployment](DOCKER-README.md)
- [Documentation index](DOCUMENTATION-INDEX.md)
- [Governed runtime](../ai-orchestrator/CONTROL-PLANE-RUNTIME.md)

Completion reports, old test results, and review summaries are historical snapshots, not current deployment evidence.

## Processing flow

New customer messages follow the NLU-hint → AI-orchestrator pipeline. The enabled control plane performs authoritative published recognition in the orchestrator. Replies to pending field/confirmation requests go directly to `/api/orchestrator/feedback`, retaining the original release and action identity. Channel metadata is carried through REST and sockets.

The backend maps completion, data collection, confirmation, clarification, human handoff, policy blocks, citations/evidence, and reconciliation results into chat responses. Provider unavailability preserves pending feedback so the customer can retry safely. A timeout is not proof that a financial action failed; the orchestrator ledger governs recovery.

## Customer REST API

The gateway preserves `/api/chat` and `/api/sessions` prefixes. Protected endpoints require `Authorization: Bearer <access-token>` and enforce customer/tenant session ownership.

| Method | Path | Request/purpose |
| --- | --- | --- |
| POST | `/api/sessions` | Create a session; optional `{metadata:{channel:"digital"}}`, identity from JWT |
| GET | `/api/sessions/:id` | Owned session information |
| GET | `/api/sessions/:id/history` | Owned conversation history |
| POST | `/api/sessions/:id/messages` | `{content,type?,attachments?,metadata?}` |
| DELETE | `/api/sessions/:id` | End an owned session |
| POST | `/api/chat/message` | Compatibility message endpoint; requires session ID |
| POST | `/api/chat/recover` | Explicit recovery of the same owned session; `{sessionId}`, no new message or release |
| GET | `/api/chat/history` | Compatibility history endpoint; requires session ID |
| POST | `/api/sessions/:id/handoff` | `{targetChannel:"digital|ava|ivr"}` → short-lived grant |
| POST | `/api/sessions/resume` | `{grant}` → resume the same authenticated customer's session/channel |

Direct service `/api/process` is a protected compatibility endpoint, not the preferred browser route. `/api/agents` exposes logical stage information, not dynamic multi-agent execution. Health endpoints are `/health`, `/health/metrics`, and `/health/status` (also mounted under `/api/health`); treat them as operational diagnostics, not production certification.

```bash
curl http://localhost:3001/api/sessions \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' \
  -d '{"metadata":{"channel":"digital"}}'

curl http://localhost:3001/api/sessions/OWNED_SESSION_ID/messages \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' \
  -H 'X-Interaction-ID: customer-turn-001' \
  -d '{"content":"What can you help with?","type":"text"}'
```

Retain `X-Interaction-ID` when retrying the same new request. Do not reuse it for a different intended action.

## Live human agent chat

This is a **Socket.IO client pilot capability**. The React customer's REST chat
has no live-assistance request/composer UI yet; enabling this backend does not
silently turn REST conversations into a complete live-chat product.

A customer sends `requestLiveAgent {queue?}` for the current owned session. Queue
names are bounded identifiers; the in-memory FIFO has at most 1,000 entries and
requests expire after 15 minutes. A session can wait in only one logical queue.
The queue is a routing aid, not durable dispatch: restart loses queue visibility,
and the customer must request again. The current request marker and assignment
persist with the chat session. Expired requests require explicit renewal or
`endLiveChat`; they do not silently resume AI processing.

`agentAcceptLiveChat {sessionId,agentId?,reason?}` requires a verified agent, a
current customer request or server escalation, and the matching deployment tenant.
Only the trusted agent-ui relay may assert another agent's identity. The existing
agent dashboard's `request` envelope (`assignAgent`, `sendMessage`,
`transferSession`, `endSession`) uses the same assignment/live-mode state, rather
than a separate assignment that leaves customer messages routed to AI. Pending
confirmation or recovery must finish before a new live takeover.

Assignments and live sends serialize by session. Production requires persistent
chat storage and a PostgreSQL advisory lock; unavailable durable coordination
fails closed. Claim checks refresh session state under that lock, so competing
workers cannot both take the same request. **Realtime delivery is still local to
one chat worker**: route participating customer/agent sockets to that worker. A
shared Socket.IO adapter and multi-worker delivery qualification are separate
work. Durable assignment does not establish cross-worker realtime routing.

Waiting/assigned socket customer messages use `chatService.processMessage`, and
human replies use `sendResponse` with agentType `human`. Incoming customer text
uses the existing `newMessage` event consumed by agent-ui. The stored-message
acknowledgment identifies the actual transcript record; persistence failure
produces no success acknowledgment. Statistics failure after a stored message is
reported separately. Customer and agent messages bypass AI while waiting/assigned.

`endLiveChat {reason?}` lets the owner cancel waiting or end a live conversation;
the current assigned agent can end an active conversation. End/transfer removes
revoked session rooms, and each delivery checks current ownership/assignment and
tenant again. JWT expiry revokes rooms and disconnects the socket; credential
login uses the bank-issued access JWT rather than caller-provided identity.

Agent queue broadcasts contain session/queue/time and bounded intent metadata,
without transcript or raw escalation errors. Only the accepting authorized agent
receives the last ten bounded messages as transfer context. Common credential
patterns and long digit runs are redacted; this is not comprehensive PII/secret
classification. A customer can still include sensitive text in a conversation,
so assigned-agent transcript access needs the deployment's privacy controls.

See [live chat implementation](services/liveAgentChat.js),
[protocol authorization tests](services/__tests__/socketHandler.liveAgent.test.js)
and the [pilot checklist](../../docs/guides/digital-assistant-pilot-checklist.md).

## Socket.IO

Connect to the chat backend's `/socket.io` with `auth:{token:accessToken}`. This is Socket.IO, not a raw WebSocket JSON protocol. Key customer events are `createSession`, `joinSession`, `sendMessage`, `endSession`, `typing`, `stopTyping`, `requestHandoff`, and `resumeSession`. Use `clientMessageId` to retain a request's identity. Operator request-envelope events are separately authorized; a browser-supplied agent flag does not grant operator rights. See the [event reference](QUICK-REFERENCE.md).

## Identity and persistence

Use the gateway's enterprise identity exchange or domain login flow to obtain verified access tokens. Development token helpers under `/auth` are not an enterprise identity provider and are gated by deployment configuration. JWT roles and tenant identity come from the server; session ownership is checked independently.

Credential-backed `/auth/token` now returns the verified bank-issued access token
and its signed identity/roles rather than minting a role-free replacement token.
`/auth/validate` returns validated top-level roles and expiry without echoing
caller profile/session data. Development customer token issuance cannot be enabled
in production; the development refresh route returns 403 there. Bank/IdP access
tokens must refresh through their owning identity service. `JWT_SECRET` is required
in the environment (at least 32 bytes at startup); there is no built-in signing key.
Socket credentials belong in the Socket.IO auth payload or authorization header,
never a query string.
`/auth/logout` acknowledges client sign-out and explicitly returns
`tokenRevoked:false`; actual revocation belongs to the configured identity service.

The final log formatter accepts fixed event messages, operational enums and
numeric/boolean measurements only. Request URLs/headers, IPs, identities,
transcripts, tool payloads and arbitrary error messages/stacks are excluded in
every environment, including debug mode. New operational event messages must be
added explicitly to `services/logMessages.js`; unknown text is logged as
`Operational event`. This restriction applies to log output, not the owned,
access-controlled conversation store.

`CHAT_PERSISTENCE_ENABLED=true` enables PostgreSQL chat storage through the current database service. With `DATABASE_MANAGE_SCHEMA=false` (the production default), startup authenticates and verifies model tables/columns without DDL. Development defaults to non-altering sync followed by verification. Schemas are in [migrations](migrations/), including `chat_sessions`, `chat_messages`, and the handoff grant table. Session/cache/socket state also exists in process; do not infer cross-worker socket routing guarantees from persistent messages alone.

Handoff grants use PostgreSQL by default, a five-minute lifetime, hashed storage, and atomic one-time consumption. They bind customer, tenant, session, and target channel; a phone number/session ID alone is not authorization. `HANDOFF_STORAGE=memory` is an explicit non-production test/development mode. See [handoff recovery semantics](SESSION-RESUME-FLOW.md).

## Run and verify

```bash
# From repository root, with configured environment/dependencies
npm install
npm run dev:chat
npm test -w services/chat-backend -- --runInBand
```

Use Node 22. Configure `JWT_SECRET`, `DEPLOYMENT_TENANT_ID`, `SERVICING_SERVICE_TOKEN`, `AI_ORCHESTRATOR_URL`, `NLU_SERVICE_URL`, persistence/database settings, and allowed origins. `AGENT_RESPONSE_TIMEOUT` defaults to a bounded 400000 ms orchestration budget; `NLU_REQUEST_TIMEOUT_MS` defaults to 5000 ms. Coordinate gateway/browser deadlines with the published provider budgets; do not turn a slow workflow into an automatic duplicate action.

The supported deployment entry points are the root [local Compose](../../docker/docker-compose.local.yml) and [full-stack Compose](../../docker/docker-compose-full-stack.yml). Set `RUNTIME_TEST_DATABASE_URL` to an isolated PostgreSQL database for real grant replay/concurrency tests. Historical test counts and “production-ready” documents do not apply automatically to the current code or deployment.

## Interrupted workflow recovery

The customer chat retains its account-scoped session and offers an explicit **Resume interrupted request** action when the orchestrator context reports recovery or chat has an undelivered recovered response. Owner-checked `POST /api/chat/recover` sends the current JWT to `POST /api/orchestrator/session/:id/recover`, with no replacement message, intent or release. Ordinary message processing durably marks delivery pending before AI dispatch and clears that marker only after chat state and transcript persistence. Recovery maps the original result and persists pending feedback before delivering its prompt. No financial retry is inferred from transport loss. If the orchestrator explicitly confirms that the original session does not exist, chat clears the delivery marker and displays an outcome-check message without submitting the action; unreachable, forbidden, or unrecognized responses retain recovery state. Completed prompts are replayed only while their original feedback remains pending and unexpired. See [durable recovery](../ai-orchestrator/WHY-CHECKPOINTER-IS-REQUIRED.md).

Delegated quality-job credentials cannot authenticate REST/socket customer sessions or refresh into chat access tokens. Direct confirmation remains the SQL-feedback/effect-ledger path; graph recovery does not regenerate a lost post-confirmation response. If the original prompt has already advanced, recovery rejects it and clears stale chat confirmation context; check transaction history or the provider outcome before another action. Uncertain external outcomes require operator reconciliation rather than graph replay.


### Continue across channels

The existing handoff endpoints now require a matching `targetChannel` on redemption, preserve one owned conversation, and reject active/queued live chat or interrupted workflows. Digital and AVA use the normal customer workspace. IVR input requires the existing server servicing credential forwarded by the signed durable voice connector; customer sockets and direct browser IVR message posts cannot submit voice turns. Pending confirmations remain pending and are checked against the destination channel before an action can proceed. See [channel switching](../../docs/guides/channel-switching.md) for customer flows, API fields, grant handling, and local validation limits.
