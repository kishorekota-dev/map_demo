# AI orchestrator

The orchestrator runs the published customer-servicing workflow on port **3007**. It verifies access tokens/session ownership, pins a release, applies recognition and action policy, collects validated fields, obtains confirmation, invokes declared adapters, and records execution outcomes. Banking is the canonical domain; custom intents can inherit a supported handler or use generic case/knowledge fulfillment.

## Start here

- [Published runtime, persistence, handoff, and reconciliation](CONTROL-PLANE-RUNTIME.md)
- [Model-provider configuration](../../docs/guides/llm-providers.md) and [adapter contract](src/llm/README.md)
- [Architecture diagrams](ARCHITECTURE-DIAGRAMS.md)
- [Intent maintenance](INTENT-SYSTEM-MAINTENANCE-GUIDE.md)
- [Authentication and persistence reference](QUICK-REFERENCE-AUTH-CHECKPOINTER.md)
- [MCP integration](MCP-INTEGRATION-README.md)

These are current entry points. Files labeled Historical retain earlier design/test notes and do not establish current readiness.

## IVR and conversation evaluation

- **Standalone IVR pilot** (`src/ivr/`, `/api/ivr`): a development-only
  Twilio signature/TwiML and simulator prototype. Production rejects both
  routes even when flags are enabled: its sessions, caller verification and
  retries are not durable. Production voice uses the existing authenticated,
  signed [operations voice contract](../../docs/guides/servicing-operations.md).
  These are private orchestrator routes; the gateway does not proxy `/api/ivr`.
  A local pilot requires `IVR_ENABLED=true`, `TWILIO_AUTH_TOKEN`, an HTTPS
  `IVR_PUBLIC_URL`, and an E.164 `IVR_TRANSFER_TARGET` for actual human transfer.
  The injected verifier must return boolean `true`; the default denies all codes.
  Verification is capped at three attempts. Barge-in never bypasses verification.
  Calls are bounded to 100 process-local sessions, five minutes, 100 turns and
  50 transcript entries; terminated calls retain a bounded tombstone until expiry.
  Events for one call cannot overlap; simulator and Twilio state are separate.
  A missing session cannot resume midway after restart. No customer JWT, banking
  tool, published servicing release or authoritative completion record is created.
  Confirmation connects to a configured agent number or explicitly ends with an
  unavailable message. The simulator returns bounded transfer context; TwiML Dial
  alone does not deliver that context to a contact-center case/agent workspace.
  No provider is configured or called by default. Gather's empty-input callback
  follows [Twilio's documented behavior](https://www.twilio.com/docs/voice/twiml/gather).
- **Conversation evaluation** (`src/services/conversationEvaluator.js`): a pure
  bounded lint for 1–200 annotated transcript turns, not a semantic judge, public
  API, measured workflow run or release gate. Empty/malformed/no-response input
  returns `verdict: invalid` and a null score. Authored mutation, confirmation,
  intent and citation annotations are not checked against execution evidence.

The [pilot checklist](../../docs/guides/digital-assistant-pilot-checklist.md)
requires live-provider acceptance; it does not certify these prototypes.

## Execution contract

With `CONTROL_PLANE_ENABLED=true`, a new workflow fetches published environment configuration using the verified customer's JWT. The full snapshot is stored before tool execution and retained for feedback and handoff. Draft edits are not live. Missing configuration fails closed. Literal and lexical recognition are deterministic; external/LLM recognition remains constrained to the catalog and ambiguity policy.

Published settings can strengthen requirements, add supported field schemas, restrict tools, require confirmation, route to human queues, and change relevant prompts. They cannot weaken canonical banking authorization/validation/confirmation floors or create arbitrary executable actions. Tool-backed replies use deterministic formatting; approved knowledge responses use retrieved content and source citations.

Model configuration has three states: missing `config.llm` preserves legacy environment behavior; explicit disabled blocks all legacy/plugin calls; enabled profiles select only the pinned provider/model routes. Local Qwen, OpenAI, compatible endpoints, Vertex Gemini, and Gemini Developer API are supported adapters, subject to actual target verification. A model cannot run banking tools, and provider failure does not select a different cloud provider.

## HTTP API

Customer routes below are mounted at `/api/orchestrator`, both directly on port 3007 and through the gateway. All require a verified access JWT for the configured deployment tenant; session routes enforce ownership. Identity is derived from signed claims, not body metadata.

| Method | Path suffix | Purpose |
| --- | --- | --- |
| POST | `/process` | `{sessionId,intent,question,metadata?:{channel}}`; `intent` is a required compatibility hint, while published recognition is authoritative when enabled |
| POST | `/feedback` | `{sessionId,response,confirmed?}`; continues the pinned pending workflow |
| POST | `/session` | Create an owned session with a caller-provided ID |
| GET | `/session/:sessionId` | Owned session state/history |
| DELETE | `/session/:sessionId` | Complete/end an owned session |
| GET | `/user/:userId/sessions` | The authenticated user's sessions |
| GET | `/session/:sessionId/context` | Safe agent context; owner or same-tenant operator with explicit context permission |
| POST | `/session/:sessionId/recover` | Owner-only explicit graph recovery or eligible completed-response delivery; empty body, fresh JWT, original release/interaction |
| POST | `/session/:sessionId/channel` | Trusted handoff only: owner JWT plus servicing-service token |
| GET | `/operations` | Operator ledger inspection with `servicing:operations:read` |
| POST | `/operations/:operationId/reconcile` | Evidence-backed manual resolution with `servicing:operations:reconcile`; never resubmits an action |
| GET | `/llm/providers` | Sanitized provider registry for control-plane viewing roles |
| GET | `/llm/providers/:id/models` | Read-only model discovery/allowlist |
| POST | `/llm/test` | Editor/admin fixed synthetic test; accepts only `{providerId,model}` |

`GET /health` is process/service health, not proof that configured banks, model providers, connectors, or production recovery have been validated.

Example of a harmless help request through the gateway:

```bash
curl http://localhost:3001/api/orchestrator/process \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Interaction-ID: help-request-001' \
  -d '{"sessionId":"owned-session-id","intent":"help","question":"What can you help with?","metadata":{"channel":"digital"}}'
```

Keep an interaction ID for retries of the same new request. Feedback retains the original action ID. Results explicitly distinguish completion, required fields/confirmation, clarification, human handoff, policy block, and reconciliation-required outcomes; they may include release, case, citation, and evidence metadata.

## Persistence

The Sequelize models use `ai_sessions`, `ai_workflow_executions`, and `ai_human_feedback`. With `DATABASE_MANAGE_SCHEMA=false` (the production default), startup authenticates and verifies every model table/column without DDL. Development defaults to non-altering sync followed by the same verification. Apply the controlled [base migration](migrations/V0__ai_model_tables.sql) before verification-only startup. The separate ledger migration is [V1__servicing_tool_operations.sql](migrations/V1__servicing_tool_operations.sql).

`WORKFLOW_DURABLE_EXECUTION=true` enables PostgreSQL session coordination and durable mutation replay protection; production defaults to enabled. `WORKFLOW_SCHEMA_AUTO_MIGRATE=false` verifies a preinstalled ledger schema. `WORKFLOW_DATABASE_URL` selects that database, otherwise the service's `DB_*` settings apply. Graph checkpoints use PostgreSQL in production and `MemorySaver` in development. `CHECKPOINT_BACKEND=postgres` opts development into durable graph state. `CHECKPOINT_SCHEMA_AUTO_MIGRATE=false` verifies the separately installed V2 schema; `CHECKPOINT_DATABASE_URL` defaults to the workflow database. See [checkpoint recovery](WHY-CHECKPOINTER-IS-REQUIRED.md) for the owner-authenticated resume endpoint and its safety boundaries.

After dispatch, uncertain effects require reconciliation. A lost acknowledgement must not trigger an alternate-transport mutation. Read the [recovery contract](CONTROL-PLANE-RUNTIME.md) before implementing retries or operational resolution.

## Run and verify

Use Node 22 and the root environment workflow:

```bash
# From repository root, after configuring dependencies and secrets
npm install
npm run dev:ai
npm test -w services/ai-orchestrator -- --runInBand
```

Configure `JWT_SECRET`, `DEPLOYMENT_TENANT_ID`, `SERVICING_SERVICE_TOKEN`, database settings, `CONTROL_PLANE_URL`, `OPERATIONS_URL`, and `MCP_SERVICE_URL` for the deployment. Use the [root configuration guide](../../docs/getting-started/configuration.md) and supported root Compose files. The default bare service database name is `ai_orchestrator`; use the deployment's configured database rather than copying old example names.

Set `RUNTIME_TEST_DATABASE_URL` to an isolated PostgreSQL database to include multi-worker/restart tests. Provider suites use synthetic fixtures and do not contact the separate Mac Studio or live cloud models. Current test runs and target-environment verification are required evidence; historical “complete” reports are not a production approval.
