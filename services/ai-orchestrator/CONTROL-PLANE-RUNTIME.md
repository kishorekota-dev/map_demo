# Governed customer servicing runtime

Digital, AVA, and IVR share the existing authenticated chat → AI orchestrator → MCP/banking architecture. The gateway control plane publishes versioned behavior; it does not execute arbitrary code or replace the banking system's authorization. The gateway operations service owns cases, connector delivery, operational evidence, and metered usage.

## Release selection and execution

With `CONTROL_PLANE_ENABLED=true`, each new workflow retrieves `GET /api/control-plane/runtime/config?environment=...` using the customer's access JWT. The response contains `{version, config, environment?, cohort?}`. The control plane selects the stable or canary cohort. Caller-supplied metadata cannot set a release, cohort, tenant, authorization policy, or confirmation state.

The orchestrator saves the complete published snapshot in its durable session before any tools run. Data collection, confirmation, handoff, and resumed work use that snapshot; a new publish or rollback affects subsequent workflows. A new process request cannot replace a pending workflow. Configuration unavailability blocks execution when governance is enabled.

Channel and intent availability, journey routing, human fulfillment, and the published tool subset are evaluated before execution. Disabled intents remain recognizable so they produce an explicit service-unavailable result. Human routes create a real idempotent operations case before claiming that the request is queued. Case creation failure produces an unavailable response.

`channels[].timeoutSeconds` is an adapter response budget carried in routing metadata. It does not cancel a banking mutation or impose an execution deadline. A timeout must never trigger a second financial dispatch.

## Model provider profiles

The [provider setup guide](../../docs/guides/llm-providers.md) covers the separate Mac Studio/Qwen deployment, default ports, cloud credentials, and operator configuration. The [adapter contract](src/llm/README.md) documents the implementation and official provider references. Supported plugins are Ollama, OpenAI Responses, OpenAI-compatible servers (including LM Studio/vLLM), Vertex Gemini, and the Gemini Developer API. The remote Mac Studio endpoint remains deployment-specific and unverified; test fixtures do not establish a live connection to it.

`LLM_PROVIDERS_FILE` or `LLM_PROVIDERS_JSON` supplies the server-only provider registry. Relative file paths resolve against the orchestrator service directory. Published profiles contain provider IDs and model settings, never endpoint URLs, credentials, or executable code. Registry `baseUrlRef` supports a named server environment override such as `LLM_OLLAMA_BASE_URL`; credentials use explicit `credentialRef` variables or Vertex ADC. Local adapters do not inherit ambient OpenAI credentials or the customer's JWT.

Optional `config.llm` contains `{enabled, profiles:[{id,name,providerId,model,temperature,maxOutputTokens,timeoutMs}], routing:{generation?,extraction?,recognition?}}`. Profiles pin with the published release. `intents[].llmProfileId` overrides generation only. The generation and extraction paths consume the actual selected adapter, and LLM recognition uses its recognition task route. Tool-backed banking results and approved knowledge responses remain deterministic.

Missing `config.llm` preserves legacy deployment enablement. Explicit `enabled:false` disables both legacy and plugin model calls. `enabled:true` selects only the published profiles; a missing required task profile, unavailable provider, malformed JSON, or truncated output fails closed as `model_unavailable`. There is no implicit cloud or cross-provider fallback. Extraction failure during pending feedback restores the pending reply before returning unavailable, retaining the release and original interaction for a safe retry.

Model requests are text/JSON only, bounded by output tokens, input/response sizes, and cancellable network deadlines; they cannot execute financial tools. `supportsTemperature:false` in the server registry omits that unsupported provider parameter without retrying. Protected `/api/orchestrator/llm/providers`, `/providers/:id/models`, and `/test` endpoints support sanitized discovery and fixed synthetic operator tests. Tests require a signed editor/admin role; customer-supplied prompts and credentials are not accepted.

## Recognition

Published `intents[].patterns` are literal phrases, not regular expressions. Longest whole-phrase matches take precedence. The same pure `recognition.js` implementation is vendored into the control plane and checked for runtime/evaluator parity.

```json
{
  "recognition": {
    "strategy": "lexical",
    "confidenceThreshold": 0.65,
    "ambiguityMargin": 0.12,
    "ambiguityAction": "clarify",
    "synonyms": { "balance": ["funds", "cash"] }
  }
}
```

Governed strategies are `lexical`, `external`, and `llm`; legacy configuration without recognition settings retains literal matching. Lexical recognition is deterministic weighted token overlap with synonyms; it is not an embedding or semantic model. Results contain a confidence score, candidates, source, ambiguity flag, and reason. Scores are matching or provider-reported scores, not calibrated probabilities. Unknown, low-confidence, or ambiguous inputs clarify or create a human case according to `ambiguityAction`; they never silently select a financial action. Missing recognition settings retain literal matching.

Strategy `llm` uses the pinned recognition profile and published `prompts.recognitionSystem`. The runtime appends mandatory JSON structure, published-ID constraints, and a boundary treating the customer message as data. Candidates still pass the same pure validation, threshold, and ambiguity logic. Provider failure returns unavailable without executing a lexical or alternate-cloud fallback. Literal phrases continue to take precedence without invoking a model. Simulator/evaluation output labels that a model profile was not executed, so lexical previews are not presented as provider accuracy tests.

For an enterprise NLU/embedding adapter, set `RECOGNITION_PROVIDER_URL` and optionally `RECOGNITION_PROVIDER_TOKEN`, and publish strategy `external`. The adapter receives:

```json
{"text":"customer input","intents":[{"id":"balance_inquiry","name":"Balance","description":"...","examples":["check balance"]}]}
```

It returns `{"candidates":[{"intent":"balance_inquiry","confidence":0.94}]}`. Optional actual token usage is `usage.input_tokens`/`usage.output_tokens`. Only configured intent IDs and finite scores in `[0,1]` are accepted; at most 1,000 candidates are inspected and duplicate IDs retain their highest score. The provider receives its own deployment credential, never the customer JWT. Requests have a five-second timeout and no redirects. Provider absence or failure returns an explicitly labeled lexical fallback. Simulators do not pretend to have executed the external provider.

## Intent, prompt, and field controls

All canonical intents remain in each release, with individual enablement, phrase patterns, required/optional fields, supported tool subset, confirmation, system prompt, user prompt template, and optional confirmation wording. The runtime enforces the canonical authorization, required-field, tool-allowlist, and confirmation floors independently of editable policy.

Custom IDs can inherit a canonical handler using `baseIntent`, or use:

* `service_request`: collects and validates declared fields, then creates an idempotent operations case with those fields.
* `knowledge_search`: retrieves only approved, published, unexpired, access-scoped knowledge and returns exact evidence with source citations. Empty retrieval reports that no approved answer was found. This path does not generate unsupported claims.

Custom intents do not add arbitrary executable workflows or URLs. A new banking action still requires a reviewed adapter and a canonical handler with authorization and validation.

Optional `fieldSchemas` add scalar constraints to declared required/optional fields:

```json
{
  "id": "appointment_request",
  "baseIntent": "service_request",
  "requiredData": ["participants"],
  "optionalData": ["language"],
  "fieldSchemas": {
    "participants": {"type":"number","min":1,"max":4},
    "language": {"type":"string","enum":["English","Spanish"],"maxLength":30}
  }
}
```

Types are `string`, `number`, and `boolean`; supported constraints are enum, numeric min/max, and string minLength/maxLength. These validations run in addition to canonical validators, and case submission validates them again at the gateway. Without an extractor, replies can be JSON, one `field: value` per line, or a single value when exactly one field is pending. Unknown fields and authentication/secret fields are excluded from case details.

Published prompts use asynchronous request-scoped storage, so concurrent sessions and releases cannot change each other's behavior. Active model paths consume:

* Intent `systemPrompt` and `userPromptTemplate` for optional no-tool generation. Governed user-template placeholders are `{{question}}`, `{{userId}}`, and `{{context}}`. Interpolation reads only own context properties and does not execute expressions.
* Global `prompts.extractionSystem` and `prompts.extractionInstructions` for structured extraction. Code appends the mandatory JSON schema, field constraints, and rules against inventing values or executing actions.
* Global `prompts.recognitionSystem` for optional LLM recognition, with mandatory catalog/JSON constraints appended by code.
* Optional plain-text `prompts.clarificationText`, `handoffText`, `unavailableText`, `dataCollectionText`, and per-intent `confirmationMessage` for their corresponding runtime responses. Confirmation wording is followed by authoritative action details and the required confirmation question.

Tool-backed banking answers retain deterministic rendering of authoritative adapter results. Security denials, validation facts, immutable confirmation requirements, and authoritative transaction/reference facts remain code governed. These are deliberate policy boundaries, not unused editable prompts.

## Concurrency, idempotency, and uncertain outcomes

Every process and feedback turn acquires a PostgreSQL advisory lock for the deployment tenant and session. HTTP and runtime ownership checks bind the session to the authenticated customer. The local mutex remains useful within a worker, but shared PostgreSQL coordination is required across workers.

REST clients should send a stable `X-Interaction-ID` (1–128 ASCII letters, digits, `_`, or `-`) for retries of the same new request; socket clients use `clientMessageId`. Feedback retains the original interaction ID. A new business action needs a new identifier. If a client supplies no identifier, the server creates one; automatic client retries cannot assume deduplication without retaining an identifier.

Before a state-changing MCP action, the ledger inserts a unique operation keyed by tenant, session, interaction, and tool. It stores a parameter hash, status, result, timestamps, and safe execution context: release version, intent, channel, environment, cohort, whether confirmation was required, and whether it was actually verified. Raw request parameters and credentials are not stored in the ledger context.

A recorded success is returned on replay without calling the adapter again. Different parameters with the same key are rejected. A lost acknowledgement, adapter error after dispatch, process crash after dispatch, or failed durable acknowledgement becomes `reconciliation_required`. The runtime does not retry that mutation or fail over to a second transport. Read-only operations retain normal read behavior. This is durable duplicate prevention and explicit recovery, not a claim of atomic exactly-once execution across unrelated external systems.

After durable acknowledgement, failed transcript, observation, or terminal session writes mark telemetry unavailable and preserve the actual result. Confirmation retries retain the original pinned interaction ID. If terminal session persistence fails, the pending workflow remains blocked against a new process request; repeated confirmation can only replay the ledger outcome. Session recovery may be needed after the storage outage. Pre-action authorization, confirmation persistence, and ledger dispatch writes remain mandatory.

Privileged operational endpoints are exposed through the gateway:

* `GET /api/orchestrator/operations?status=reconciliation_required` requires a supported operator role and `servicing:operations:read` or `*`.
* `POST /api/orchestrator/operations/:operationId/reconcile` requires `servicing:operations:reconcile` or `*`, with `{"outcome":"completed|failed","reference":"external evidence reference","note":"explanation"}`. Resolution and actor are persisted and an audit event is attempted. A dispatched operation must be at least 30 minutes old before manual resolution; uncertain operations can be resolved immediately. Resolve only after checking the provider's actual outcome.

Reconciliation never resubmits an action. A failed original key remains blocked. Provider-specific reconciliation and proof of absence are required before any separately authorized new action; there is no generic unsafe retry button.

## Authenticated channel handoff and agent context

Chat REST:

1. `POST /api/sessions/:id/handoff` with `{"targetChannel":"digital|ava|ivr"}` returns `{grant, expiresAt, sessionId, targetChannel}`.
2. `POST /api/sessions/resume` with `{"grant":"..."}` returns `{resumed, sessionId, channel, session:{currentStep,pendingFeedback}}`.

Socket equivalents are `requestHandoff` → `handoffCreated` and `resumeSession` → `sessionResumed`. Both steps require an access JWT for the session's customer and deployment tenant. The opaque grant is bound to that customer, tenant, session, and target channel, expires in five minutes, and is atomically consumed once. Only its hash is stored. A phone number or session ID alone is not caller authentication. Provider-neutral voice adapters must first establish verified identity and then use this contract.

Chat consumes the grant durably, coordinates concurrent handoffs, and calls the orchestrator's owner-checked channel endpoint using both the customer's JWT and `X-Servicing-Service-Token`. The release and pending confirmation are preserved. Disabled target channels reject the transition. If downstream handoff fails, the grant stays consumed; the customer can issue a new grant after checking current session state. Cross-service handoff is not a distributed transaction.

`GET /api/orchestrator/session/:id/context` returns a deterministic summary, status, intent, channel, release, collected field names, missing fields, confirmation state, case/evidence IDs, and unresolved operation IDs. The owner can read it; other users need a supported operator role and `servicing:context:read` or `*` in the same deployment tenant. It does not expose tokens, prompts, raw field values, or the transcript.

## Evidence and measured usage

Runtime events use `POST /api/operations/runtime/events` with the user JWT and the shared servicing service credential. Stages include recognition, ingress policy, authorization/confirmation, tool execution, conversation outcome, and reconciliation. A strict allowlist excludes transcripts, prompts, extracted customer details, raw tool results, and credentials. Customer-provided cohort metadata is never trusted. Successful responses carry evidence IDs; evidence service failure is reported as telemetry unavailable and does not conceal a completed financial result.

`POST /api/operations/runtime/usage` receives stable per-call metric IDs and actual measurements only:

| Provider | Service | Metrics |
| --- | --- | --- |
| `openai` | `generation` | Provider-reported `input_tokens`, `output_tokens` |
| `slm` | `extraction` | Provider-reported `input_tokens`, `output_tokens` |
| `recognition` | `intent_recognition` | Adapter-reported `input_tokens`, `output_tokens` |
| `mcp` | `tool_execution` | Executed logical adapter `calls` |
| Published provider ID, such as `mac-qwen` | `generation`, `extraction`, `recognition` | Actual normalized adapter `input_tokens`, `output_tokens` |

Legacy LangChain usage metadata, its tokenUsage fields, and normalized plugin usage fields are recognized. Plugin metrics use the server registry provider ID and the actual task, allowing operational pricing to distinguish deployments. No token count is estimated from text. Deterministic answers, literal recognition, missing usage metadata, and ledger replays do not create token usage. A logical MCP invocation is not a claim about a provider's internal retry count. The operations service deduplicates metrics and applies configured rates; unknown rates remain explicitly unpriced. Metrics are best effort, so outages may leave missing usage rather than invented costs. Fixed synthetic operator tests return their measured usage directly rather than fabricating a customer interaction.

## Deployment settings and schemas

| Setting | Purpose |
| --- | --- |
| `CONTROL_PLANE_ENABLED=true` | Enforce published governance and fail closed on configuration outage. |
| `CONTROL_PLANE_URL` | Default `http://localhost:3001/api/control-plane`; use the gateway service address in containers. |
| `CONTROL_PLANE_ENVIRONMENT` | Default `development`; use the governed target environment in production. |
| `OPERATIONS_URL` | Default `http://localhost:3001/api/operations`. |
| `JWT_SECRET`, `DEPLOYMENT_TENANT_ID` | Shared verified access-token contract; default deployment tenant is `default-enterprise`. |
| `SERVICING_SERVICE_TOKEN` | Shared server-only credential for authoritative operations and handoff. |
| `WORKFLOW_DURABLE_EXECUTION=true` | Enable PostgreSQL locks and ledger; defaults enabled in production. |
| `WORKFLOW_DATABASE_URL` | Ledger/coordination database; falls back to orchestrator `DB_*` configuration. |
| `WORKFLOW_SCHEMA_AUTO_MIGRATE=false` | Verify preinstalled ledger schema instead of application DDL. |
| `HANDOFF_DATABASE_URL` | Chat grant database; falls back to chat `DB_*` configuration. |
| `HANDOFF_SCHEMA_AUTO_MIGRATE=false` | Verify preinstalled grant schema instead of application DDL. |
| `RECOGNITION_PROVIDER_URL`, `RECOGNITION_PROVIDER_TOKEN` | Optional external recognition adapter and isolated credential. |
| `LLM_PROVIDERS_FILE`, `LLM_PROVIDERS_JSON` | Server-only plugin registry; file takes precedence. Relative file paths use the service root. |
| `LLM_OLLAMA_BASE_URL` | Actual separate Mac Studio endpoint when referenced by registry `baseUrlRef`. |

Install `migrations/V1__servicing_tool_operations.sql` in the workflow database and `../chat-backend/migrations/V6__servicing_resume_grants.sql` in the chat database before disabling automatic migrations. Use the established session/database migrations as well. Application DDL is serialized by advisory transaction locks. Existing database TLS settings apply. Restrict application database privileges and manage retention of completed ledger records and expired grant hashes according to enterprise requirements; do not delete unresolved operations or active idempotency records prematurely.

`WORKFLOW_DURABLE_EXECUTION=false` uses an in-memory development ledger. `HANDOFF_STORAGE=memory` is accepted only outside production. These modes do not provide restart or cross-worker guarantees. Production operation also requires real enterprise identity verification, configured external adapters, appropriate secret management, and tested provider reconciliation; stub adapter tests do not certify an external provider.

## Validation

Use Node 22. In each service, run `npm test -- --runInBand`. Set `RUNTIME_TEST_DATABASE_URL` to an isolated PostgreSQL test database to include actual multi-worker lock, restart replay, uncertain-outcome, and one-time-grant tests. Tests use unique tenant identifiers and remove only their own records. Without this variable the PostgreSQL tests are explicitly skipped.

The suites also cover pinned release/model-profile continuation, concurrent prompt/usage isolation, provider credential isolation, disabled-versus-legacy model behavior, confirmation and field floors, actual LangGraph typed service fulfillment, disabled tools, model/external recognition response validation, source citations, tenant/owner/operator access, telemetry scrubbing, no duplicate metering on financial replay, and preservation of completed outcomes during ancillary evidence failure. Gateway contract tests compare the route and recognition behavior to the evaluator. Provider tests use synthetic in-process or ephemeral HTTP fixtures, not the current machine's installed Ollama, the separate Mac Studio, or live cloud inference.
