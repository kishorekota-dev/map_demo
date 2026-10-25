# Provider-neutral servicing adapters and operations

This runbook covers the dedicated enterprise gateway, durable fulfillment worker,
voice ingress, identity broker and operational evidence. All HTTP examples below
are contracts; they do not imply that a commercial provider is connected.

## Deployment configuration

| Setting | Purpose |
| --- | --- |
| `OPERATIONS_DATABASE_URL` | PostgreSQL for operational records/jobs/events; defaults to `CONTROL_PLANE_DATABASE_URL`, then `DATABASE_URL`; missing configuration returns 503 |
| `OPERATIONS_MANAGE_SCHEMA` | `false` when a migration owner applies `services/api-gateway/operations/schema.sql` |
| `FULFILLMENT_WORKER_ENABLED` | `true` starts two-second job/SLA processing and a thirty-second rollout monitor; PostgreSQL serializes replicas |
| `SERVICING_SERVICE_TOKEN` | Separate high-entropy internal credential on gateway, chat and orchestrator; never expose in browser runtime config |
| `OPERATIONS_URL` | Orchestrator's internal gateway `/api/operations` URL |
| `CONTROL_PLANE_INTERNAL_URL` | Gateway loopback/internal `/api/control-plane` URL for knowledge import and rollout observations |
| `CONNECTOR_ALLOWED_HOSTS` | Exact connector hostname allowlist, comma-separated; no wildcards |
| `CONNECTOR_PRIVATE_HOSTS` | Additional exact hostname allowlist for intentional RFC1918/ULA enterprise destinations; host must also be in `CONNECTOR_ALLOWED_HOSTS`; loopback/link-local metadata remain blocked |
| `CONNECTOR_ALLOW_LOCAL` | Explicit development-only HTTP/loopback exception; has no effect in production |
| `CONNECTOR_SECRET_ROOT` | Directory of read-only secret-manager-mounted files |
| `CASE_CONNECTOR_ID` | Explicit enabled case connector; otherwise exactly one enabled case connector must exist |
| `SLA_ESCALATION_QUEUE` | Supervisor destination for overdue work, default `supervisor` |
| `OPERATIONS_RETENTION_DAYS` | Console default, 90 days; deletion remains an explicit administrator operation |
| `AUDIT_ACTOR_HASH_KEY` | Stable HMAC key for operational actor pseudonyms; defaults to JWT key, so configure separately before production |
| `AUDIT_SIGNING_KEY_FILE` | Mounted RSA private key used to sign operational evidence exports |

Connections contain secret **references**, not credentials:
`env:CONNECTOR_SECRET_CASE` or `file:case-provider/token`. Files resolve beneath
`CONNECTOR_SECRET_ROOT`, including symlink checks. Secrets resolve on every call,
so rotation does not require resaving a connector. Environment variables must be
injected into the gateway process/container explicitly; mounted files are
recommended for enterprise secret stores.

Production connectors require HTTPS. The transport validates DNS results and
pins the chosen address to the socket, verifies TLS normally, follows no
redirects, limits response size and applies a deadline covering DNS and response
streaming. Deliberate enterprise private hosts require both allowlists. Never
use a customer-provided URL as an adapter target.

## Case adapter contract, version 1

The gateway authenticates with `Authorization: Bearer <resolved credential>`.
Providers must implement stable idempotency, authoritative reconciliation and
side-effect-free validation rejection.

| Request | Contract |
| --- | --- |
| `GET /health` | `200 {"status":"ok","contractVersion":"1"}` |
| `POST /cases` | Header `Idempotency-Key`; body contains operationId, caseId, sessionId, channel, queue, summary, reference, details and releaseVersion |
| Successful create | `200/201/202 {"externalId":"...","status":"in_progress"\|"completed"}`; both fields required |
| `GET /cases/by-idempotency-key/:key` | Existing: 200 with externalId/status; absent: `404 {"authoritative":true,"found":false}`; inability to determine must not claim absent |
| `POST /cases/:externalId/escalations` | Same authentication/idempotency contract, queue and operationId ending `:escalation`; return externalId/status |

Reusing an idempotency key with different input must return a conflict. An
`authoritative:true` absence response means the provider guarantees the original
operation cannot later appear, including delayed processing. If that cannot be
guaranteed, leave the case uncertain and resolve it operationally.

The gateway creates a case and job in one transaction. The authoritative queue,
SLA and input field contract come from the pinned published journey. Caller
queue values are ignored. Details accept only declared, bounded scalar fields;
credentials are forbidden. Case details belong in the access-controlled case
record, never in operational telemetry.

Workers claim jobs under PostgreSQL locks. Failures before dispatch can retry
with bounded backoff. Timeouts/disconnects after dispatch, malformed successful
responses and expired worker leases become `reconciliation_required`. They are
not automatically retried. HTTP 400/401/403/404/422 are treated as side-effect-free
rejections under this adapter contract; providers must honor that rule.

Overdue cases move to the supervisor queue and emit evidence. Existing provider
cases receive a durable escalation operation. An escalation rejection does not
falsely mark the underlying case complete. The operator can inspect the provider
and resolve an unknown outcome using a reference and note.

`POST /api/operations/cases/:id/reconcile` accepts `completed`, `failed` or
`retry`. Completion requires an external reference. Retry is only allowed for an
uncertain case and first invokes the provider's idempotency lookup; a known
existing case is linked, authoritative absence queues the **same** operation key,
and an unknown answer remains blocked.

### Local reference adapter

`services/api-gateway/operations/reference-adapter/server.js` implements health,
cases, escalation, lookup and knowledge documents for contract development.
It binds loopback and stores fixture cases in memory; it is **not** a production
case management backend.

```bash
CONNECTOR_SECRET_REFERENCE=local-contract-secret \
  node services/api-gateway/operations/reference-adapter/server.js
```

For local development set gateway `CONNECTOR_ALLOW_LOCAL=true` and the same
`CONNECTOR_SECRET_REFERENCE`. Save a case connector with base URL
`http://127.0.0.1:3099` and credential reference
`env:CONNECTOR_SECRET_REFERENCE`; run **Test connection**. The test really calls
`/health` and does not create a provider case.

## Signed callbacks and voice ingress

POST exact JSON bytes to `/api/operations/webhooks/:connectionId`. Configure the
connection's `webhookSecretRef`. Headers:

```text
X-Servicing-Timestamp: <Unix seconds>
X-Servicing-Event-Id: <stable provider event identifier>
X-Servicing-Signature: <hex HMAC-SHA256>
```

The HMAC input is `timestamp + "." + eventId + "." + rawRequestBody` with no
extra newline. Events must be within five minutes. Retries use the same event ID
and body, with a fresh timestamp/signature if needed. Receipts are persisted
before processing; completed receipts return the original response, and unknown
in-flight outcomes return 409 instead of re-executing. Retained receipts leave
tombstones that cannot be replayed.

Case callback body:

```json
{"type":"case.updated","operationId":"original-key","externalId":"provider-case","status":"completed"}
```

The callback's connector must own the case. Its external ID must match, and
terminal states cannot regress.

Voice requests require **both** provider signature and the customer's verified
local access token in `Authorization`. A phone number or provider call ID does
not establish customer identity. Without an access token the response requests
`authenticate` and executes no tools.

| Voice event | Fields / result |
| --- | --- |
| `voice.start` | callId, optional resumeGrant; atomically claims call before session creation; returns sessionId and gather action |
| `voice.turn` | callId, utterance or digits; stable event ID becomes stable interaction ID; returns speak plus gather or transfer |
| `voice.interrupt` | callId; stop_playback and gather; does not cancel/repeat an already dispatched financial action |
| `voice.end` | callId; closes mapping and returns end |

The provider adapter performs ASR/TTS/media, converts DTMF according to the
customer journey, honors speech interruption, maps queue IDs to live destinations
and performs the actual transfer. This implementation supplies the application
contract, not a SIP/media server. Text speech is never treated as trusted system
instructions.

Concurrent starts with different event IDs cannot create multiple sessions for
one provider call. A startup crash remains uncertain. Operators can inspect
`GET /voice-calls` and abandon an uncertain startup using
`POST /voice-calls/:id/abandon {note,reference}` after checking the provider. Start
a new provider call ID after abandonment; the application never guesses which
possibly created session should be linked.

### Cross-channel continuation

An authenticated customer requests
`POST /api/sessions/:sessionId/handoff {"targetChannel":"ivr"}`. The result is a
five-minute opaque grant bound to the original owner, tenant, session and target.
The target consumes it through `POST /api/sessions/resume {grant}` or voice.start.
Wrong owners cannot consume it; only one concurrent consumer succeeds. Pending
workflow context and the published release remain pinned. Socket equivalents are
`requestHandoff`/`handoffCreated` and `resumeSession`/`sessionResumed`.

Digital/API clients reuse `X-Interaction-ID` (or `interactionId`) for retries of
the same logical message. Socket clients reuse `clientMessageId`. New IDs denote
new customer actions. Do not generate a new ID merely because a response timed
out.

## Knowledge and recognition adapters

Knowledge connections implement authenticated `GET /documents` returning
`{documents:[...]}` with 1–50 text documents per import. Each document uses the
control-plane schema: id, title, content, source, allowedRoles, expiresAt and
status. The gateway forces imports to **draft**. An administrator reviews and
publishes them; connector content cannot self-publish. Larger sources should
provide batches through their adapter. The provider owns format extraction and
source-system permission mapping.

An external semantic recognizer is configured by `RECOGNITION_PROVIDER_URL` and
`RECOGNITION_PROVIDER_TOKEN`, outside editable prompts. Its request contains text
and governed intent definitions/examples. It returns
`{candidates:[{intent,confidence}]}`. Only registered/configured intent IDs and
valid scores are accepted. Low confidence and ambiguity follow published policy.
The deterministic lexical fallback is explicitly reported; it is not marketed
as embeddings. Contract simulation never invokes this external service.

## Enterprise identity

Configure `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_AUTHORIZATION_ENDPOINT`,
`OIDC_TOKEN_ENDPOINT`, `OIDC_JWKS_URI`, `OIDC_REDIRECT_URI`, `FRONTEND_URL` and,
for confidential clients, `OIDC_CLIENT_SECRET_REF`. Register the exact callback
URI `/api/identity/callback` with the identity provider. Endpoints use HTTPS;
`OIDC_ALLOW_LOCAL=true` is only for localhost HTTP development.

The browser starts at `/api/identity/login`. The broker stores one-time state,
PKCE verifier and nonce with browser-cookie binding, exchanges the code, verifies
RS256 using configured JWKS, and checks issuer, audience, authorized party,
expiry, issued-at and nonce. External role/group strings are ignored. The exact
issuer/subject must have an enabled local mapping to a legitimate local banking
user and allowed servicing roles. Identity mappings do not provision banking
accounts or verify their real-world ownership; administrators must map from their
authoritative identity directory.

The callback sets an HttpOnly browser-session cookie and redirects to the fixed
frontend `/auth?enterprise=1`, with no tokens in the URL. Credentialed
`GET /api/identity/session` resolves the current mapping and issues a five-minute
local access token. `POST /api/identity/logout` deletes the durable session.
Browser sessions expire after eight hours. Disable the mapping to stop refresh;
already issued short-lived access tokens expire naturally. Use same-site HTTPS
frontend/API deployment for the default SameSite=Lax cookie policy.

Protocol references: [OpenID Connect Core ID Token validation](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)
and [PKCE RFC 7636](https://www.rfc-editor.org/rfc/rfc7636).

## Evidence, privacy and recovery

`GET /events` and `/cases` provide bounded pagination; the console correlates
session/interaction/release with tools and external cases. Runtime evidence uses
an allowlist and omits prompts, raw dialogue, tokens and extracted field values.
Actor IDs use keyed hashes. Basic pattern masking of summaries is not a general
PII detector; providers and operators must not put sensitive content in summaries
or free-text references. Declared case details can contain customer data and
remain within the restricted operational store.

`GET /audit/export?after=<sequence>` returns at most 1000 events and `nextAfter`.
Each event includes the exact `payload` bytes, `previousHash` and SHA-256 hash:
`SHA256(previousHash + "\n" + payload)`. Verify all pages in sequence. Export
`payload` has its own digest and optional RSA-SHA256 signature. Verify using the
corresponding public key and archive outside the application database. The
separate control-plane audit/release endpoints preserve configuration evidence;
operational export does not silently claim to include every service log.

`POST /maintenance/retention {days,dryRun}` previews or removes old terminal case
content, ended call content, expired identity transaction/session records and
webhook response content. Unresolved work is retained. Minimal case/call/event
idempotency tombstones remain, so erasure cannot authorize duplicate effects.
The event chain is preserved; external archival and evidence retention are
separate deployment policies.

Administrators can export operational subject data at
`GET /privacy/subjects/:userId` and preview/execute erasure through
`POST /privacy/subjects/:userId/erase {dryRun}`. Open cases/active calls block
operational erasure. Erasure removes mapped identity sessions and operational
customer content while retaining pseudonymous evidence/replay protection. This
is explicitly **operations scope**: coordinate chat transcripts, banking records,
legal holds and backups with their owning services. It is not an assertion of
regulatory certification.

Financial operation recovery uses `/api/orchestrator/operations` and
`/api/orchestrator/operations/:id/reconcile {outcome,reference,note}` with signed
operator roles plus explicit scopes. Record authoritative external evidence before
marking completed/failed. No financial retry API is exposed. A stale dispatched
record must age beyond the configured recovery boundary before manual resolution.

For database restore: stop traffic and workers; restore configuration/studio,
operations and runtime/session databases from a consistent backup; verify release
and event-chain continuity; inventory dispatched/running operations; reconcile
with external providers before accepting new traffic; restart workers and then
traffic. A database restore cannot roll back an external bank transfer. Keep
provider idempotency keys and external retention longer than your recovery window.
Record measured restore time and data loss against customer-approved RTO/RPO.

## Measured usage and cost

Provider usage ingestion and administrator pricing are documented in the
[usage API reference](../../services/api-gateway/operations/USAGE.md).
`POST /runtime/usage` requires the runtime service credential and original customer
access token, a stable event ID, measured units and provider/service/metric
identifiers. Input and output tokens are reported only when the configured
provider returns actual usage metadata. MCP metering counts one dispatched
logical invocation and excludes ledger replays. Voice providers can report their
measured seconds through the same trusted contract.

`GET/PUT /cost-model` stores unit prices and currency with revisions. Ingestion
pins the matching rate/model revision; changes apply prospectively. `GET /costs`
reports priced and unpriced coverage, dimensions and currencies. Missing rates
and missing telemetry do not imply zero cost. Mixed currencies are never added.
Cost per successful interaction uses distinct `(sessionId,interactionId)` pairs
and is absent when pricing is incomplete. These are operational estimates using
customer-configured prices, not invoices.

## Local storage and restore verification

The bounded storage probe can run against a disposable database:

```bash
TEST_OPERATIONS_DATABASE_URL=... node deployment-scripts/verify-servicing-storage.cjs
```

It writes synthetic evidence with twenty concurrent requests, verifies the chain
and pagination, prints timings, then removes its test tenant. A local run with
200 events verified both checks (about 532 writes/second; p95 about 63 ms on the
development machine). These small local timings do not establish production
capacity. A separate local `pg_dump`/`pg_restore` smoke check restored the servicing
tables into an empty database and verified the restored evidence chain. Repeat
with representative enterprise data, distributed service backups and real
provider reconciliation to establish recovery objectives.
