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
| `SERVICING_SERVICE_TOKEN` | Separate high-entropy internal credential on gateway, chat, orchestrator, MCP and NLU; never expose in browser runtime config |
| `OPERATIONS_URL` | Orchestrator's internal gateway `/api/operations` URL |
| `CONTROL_PLANE_INTERNAL_URL` | Gateway loopback/internal `/api/control-plane` URL for knowledge import and rollout observations |
| `CONNECTOR_ALLOWED_HOSTS` | Exact connector hostname allowlist, comma-separated; no wildcards |
| `CONNECTOR_PRIVATE_HOSTS` | Additional exact hostname allowlist for intentional RFC1918/ULA enterprise destinations; host must also be in `CONNECTOR_ALLOWED_HOSTS`; loopback/link-local metadata remain blocked |
| `CONNECTOR_ALLOW_LOCAL` | Explicit development-only HTTP/loopback exception; has no effect in production |
| `CONNECTORS_CONFIG_PATH` | Protected startup JSON declaring immutable connector endpoints, kinds and environment credential references |
| `CASE_CONNECTOR_ID` | Explicit enabled case connector; otherwise exactly one enabled case connector must exist |
| `SLA_ESCALATION_QUEUE` | Supervisor destination for overdue work, default `supervisor` |
| `OPERATIONS_RETENTION_DAYS` | Console default, 90 days; deletion remains an explicit administrator operation |
| `AUDIT_ACTOR_HASH_KEY` | Stable HMAC key for operational actor pseudonyms; defaults to JWT key, so configure separately before production |
| `AUDIT_SIGNING_KEY` | Environment-injected RSA private key used to sign operational evidence exports |

Declare integrations in `CONNECTORS_CONFIG_PATH` before startup, using the
[fictional schema example](../../services/api-gateway/operations/connectors.example.json).
The optional file has a `connectors` array with unique `id`, `name`, `kind`,
`baseUrl` and optional `credentialRef`, `webhookSecretRef`, `webhookPublicUrl`.
Credentials are named environment references such as `env:CONNECTOR_SECRET_CASE`;
literal credentials and credential-file references are rejected. Referenced
variables must exist at startup and are resolved again on each call for rotation.
Invalid files, endpoints and missing referenced variables fail startup.

The console and `GET /connections/catalog` expose declared metadata. A publisher
can enable a declared integration and adjust its display name and timeout.
`PUT /connections/:id` cannot register an undeclared backend or replace endpoint,
kind or credential bindings. No declarations means no configured integration can
execute. Existing database records must match a startup declaration before tests,
sync, fulfillment or webhooks can run. Dispatched work pins its binding digest;
reconciliation cannot silently use a replacement provider.

Mount the declaration file read-only and inject its path and referenced variables
into the gateway explicitly with a deployment override. The default Compose files
do not invent provider-specific mounts or pass arbitrary host variables. Legacy
`CONNECTOR_SECRET_ROOT`, `CONNECTOR_SECRET_HOST_DIR` and
`AUDIT_SIGNING_KEY_FILE` settings are unsupported. Inject an optional RSA signing
key through `AUDIT_SIGNING_KEY`; invalid signing configuration fails startup.

Production connectors require HTTPS. The transport validates DNS results and
pins the chosen address to the socket, verifies TLS normally, follows no
redirects, limits response size and applies a deadline covering DNS and response
streaming. Deliberate enterprise private hosts require both allowlists. Never
use a customer-provided URL as an adapter target.

## Case adapter contract, version 1

The gateway authenticates with `Authorization: Bearer <resolved credential>`.
Providers must implement stable idempotency, authoritative reconciliation and
side-effect-free definitive HTTP 4xx/5xx rejection. A provider that can commit
and then return an HTTP error does not satisfy this contract and needs a qualified
adapter before use.

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

Creating a new case requires a short-lived `X-Servicing-Confirmation` proof from
the authenticated runtime, bound to the original customer, tenant, key and exact
request body. Caller flags alone do not establish confirmation. Idempotency keys
are bounded to 128 characters. The runtime signs only after checking the saved
confirmation request; the gateway verifies it before enqueueing.

Workers claim jobs under PostgreSQL locks. Mutations are never automatically
retried, including failures before dispatch. Timeouts/disconnects after dispatch, malformed successful
responses and expired worker leases become `reconciliation_required`. They are
not automatically retried. HTTP 4xx/5xx and known pre-dispatch failures are
definitive failures. An explicit repeat of the original case request with the same
key, exact effective inputs and fresh confirmation can requeue that failure.
Changed arguments conflict, and uncertain work still requires reconciliation. The resolved intent is part of the case identity, including when two intents share a journey.

At first dispatch, the worker persists the actual provider method, path, operation key, and body separately for case creation and escalation. Explicit retries reuse these exact arguments. SLA routing changes create a separate escalation; they never change the body under an existing create key. These original requests contain governed customer details, remain in access-controlled case records, and are excluded from viewer listings and analytics metadata. Previously dispatched legacy cases lacking original request records cannot be automatically retried; operators must resolve them manually against provider evidence. Historical case digests without intent cannot authorize a new intent replay.

A signed provider callback establishing an external case in progress takes precedence over a later failed or lost create response. Escalation requires its own operation outcome; an existing case reference alone does not prove that a queue update succeeded.
Case records remain lifecycle records; retaining a failed case does not cache or
automatically repeat a provider invocation.

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
node services/api-gateway/operations/reference-adapter/server.js
```

Supply `CONNECTOR_SECRET_REFERENCE` through the server environment before running
the fixture; never paste its value into a command, configuration declaration or
the console. For local development set gateway `CONNECTOR_ALLOW_LOCAL=true` and
inject the same environment variable. Declare a case connector with base URL
`http://127.0.0.1:3099` and credential reference
`env:CONNECTOR_SECRET_REFERENCE`, plus the exact public webhook URL when callbacks
are used. Enable that declared entry; run **Test connection**. The test really calls
`/health` and does not create a provider case.

## Signed callbacks and voice ingress

POST exact JSON bytes to `/api/operations/webhooks/:connectionId`. Configure the
startup declaration's `webhookSecretRef` and exact HTTPS `webhookPublicUrl`. Headers:

```text
X-Servicing-Timestamp: <Unix seconds>
X-Servicing-Event-Id: <stable provider event identifier>
X-Servicing-Signature: <hex HMAC-SHA256>
```

The URL-bound signature input is
`timestamp + "." + eventId + "." + webhookPublicUrl + "." + rawRequestBody`
with no extra newline. This supersedes the previous body-only signature; providers
must update their signer before enabling the integration. The actual request path
must match the configured public path, with no query string. The gateway uses the
server-declared URL, never untrusted forwarded host/protocol headers.
Events must be within five minutes. Retries use the same event ID
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

## Platform startup and diagnostics

Production uses the [dedicated deployment lifecycle](deployment.md): static
preflight, private infrastructure, explicit banking/servicing migrations, offline
administrator bootstrap, then application startup with automatic schema mutation
disabled. Migration errors are fatal. DB TLS certificate verification remains
enabled when TLS is configured; `DB_SSL_CA_FILE` supplies an approved CA for
banking/chat/orchestrator connections. URL-based gateway stores use their URL TLS
configuration.

Production MCP/NLU HTTP and MCP WebSocket ingress require the separate trusted
service token. Gateway strips user-supplied service credentials and injects its
own only on the registered internal NLU/MCP hops; chat and orchestrator attach
their trusted token directly. Banking continues to require customer authorization.

Read `/api/platform/readiness` as a signed operator or use **Platform & solutions**
for sanitized diagnostic export. Public health probes expose only liveness or
aggregate readiness. Reports cover checked storage/service contracts, with no
live model/connector/identity acceptance claim. Solution packages share the same
draft/release lifecycle; see the [platform guide](platform-readiness.md).

## Case handling and interrupted customer requests

The [Agent workspace](../../services/api-gateway/operations/AGENT-WORKSPACE.md)
combines connector case context, self-assignment, notes, disposition, knowledge
citations and evidence. A handling note cannot change an external outcome or
resolve an uncertain financial action. Use the existing reconciliation procedure
for that state.

Production graph checkpoints persist alongside the workflow ledger. A customer
can explicitly resume an interrupted request using the authenticated chat recovery
action, retaining its original session, interaction and release. Recovery uses a
fresh access token and never authorizes an operator to impersonate the customer.
See [checkpoint/recovery contract](../../services/ai-orchestrator/WHY-CHECKPOINTER-IS-REQUIRED.md).
Database restore, realtime socket failover and retention remain separate operating
procedures to qualify in the target deployment.

## Observed outcome reporting

`GET /api/operations/analytics/outcomes?days=30` requires the existing operator
viewing permission and restricts rows to the deployment tenant. It counts distinct
session/interaction pairs, using the latest recorded conversation outcome; legacy
rows without an interaction ID are explicitly counted as session buckets.

First-contact resolution is a seven-day no-return/no-case proxy, with recent
completions and unknown customer identity excluded from its denominator. Inspect
`firstContactEligibleCompleted`, `firstContactPendingObservation` and
`firstContactUnknownCustomer`. The observation cutoff and event count are returned.
A successful runtime outcome alone does not establish provider completion.

Human-transfer telemetry is incomplete, so containment is unknown (`null`). The
separate observed automated-completion proxy counts recorded completions with no
recorded case/handoff and carries explicit limits. Requests exceeding 50,000
relevant events return 422; reduce the window instead of treating a partial sample
as an aggregate. See [pilot acceptance](digital-assistant-pilot-checklist.md).

Connector knowledge sync now validates the entire batch before control-plane draft
import: required fields, bounded content, safe provenance, duplicate identifiers
and obvious sensitive-text patterns. Rejection imports nothing. Internal revision
numbers remain control-plane-owned; caller-supplied versions are optional. Pattern
matching needs human review and is not a comprehensive privacy classifier. Manual
studio saves/imports now apply the same validation to title, content and source,
including the 20-character content minimum. Sensitive patterns are checked after
Unicode compatibility normalization. Answer retrieval revalidates stored content,
provenance and its positive server-assigned version, omitting unsafe historical
records until corrected and republished. Publication/retrieval role controls and
the previous published release during a draft edit remain enforced.
