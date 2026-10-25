# Servicing control plane and product studio

This module is mounted at `/api/control-plane`. It manages configuration for a
dedicated enterprise deployment. It uses the existing authenticated servicing
runtime and registered domain tools; publishing configuration does not itself
execute customer transactions.

## Authorization and deployment

Every route requires a verified access token. The signed `tenantId` must match
`DEPLOYMENT_TENANT_ID`. Legacy tokens without that claim remain confined to the
configured deployment. Refresh tokens and missing principals are rejected.
Roles are read from signed `role`/`roles` claims, case-insensitively:

| Role | Capability |
| --- | --- |
| `admin`, `control_plane_admin` | View, edit, evaluate, publish, approve, promote and operate |
| `control_plane_editor` | View/edit configuration, test suites and knowledge drafts; run evaluations |
| `control_plane_operator` | View and operate the fulfillment queue |
| `control_plane_viewer` | View, validate and simulate |
| Other authenticated principals | Published runtime configuration, routing and permission-filtered knowledge retrieval |

The constructor accepts `verifyAccessToken(token)` for an external verification
adapter, or verifies local HS256 tokens with the configured `JWT_SECRET`. Neither
body fields nor caller-supplied tenant/role headers establish authorization.
The enterprise identity integration can exchange an externally verified identity
for a local signed access token without changing this module.

Set `CONTROL_PLANE_DATABASE_URL` for PostgreSQL. `schema.sql` provisions a
tenant-scoped configuration row and a separate `servicing_control_plane_records`
table for suites, detailed evaluations, approvals, knowledge drafts/releases and
deployment events. Tenant row locking serializes updates across gateway replicas;
record changes, revision checks and audit append commit in the same transaction.
Indexes support tenant/kind listing, exact digest lookup and lexical knowledge
search. Set `CONTROL_PLANE_MANAGE_SCHEMA=false` when migrations are applied by a
separate database role.

Without PostgreSQL, development uses the atomic file store. Production file use
requires `CONTROL_PLANE_DATA_FILE` and `CONTROL_PLANE_SINGLE_WRITER=true`. Only one
process may write that file. Corrupt state fails closed; it is never reset
silently. Call `router.close()` at shutdown to release PostgreSQL connections.

## Configurable intent contracts

`Config` contains `channels`, `journeys`, `queues`, `intents`, `prompts` and optional
`recognition` and `llm`. All 16 canonical intent IDs remain present; disable an intent to
stop it. Custom intent IDs can be added with a `baseIntent`:

- A canonical banking base inherits its data requirements, confirmation minimum
  and registered tool allowlist. Canonical entries cannot change their own base.
- `service_request` defines a provider-neutral fulfillment/case intent without
  banking tools.
- `knowledge_search` defines a governed retrieval intent without banking tools.

Each intent has `id`, optional `baseIntent`, `name`, `description`, `enabled`,
literal `patterns`, `requiredData`, `optionalData`, `tools`, `needsConfirmation`,
`systemPrompt` and `userPromptTemplate`. Additional required fields and stronger
confirmation are allowed. Established required fields and confirmation cannot be
removed. Tools can be narrowed within the inherited contract. Removing the
required fulfillment tool disables that automated route instead of reporting
false completion.

Optional `fieldSchemas` adds typed validation for declared required/optional
entities: `type` is string, number or boolean; `enum`, numeric `min`/`max`, and
string `minLength`/`maxLength` further constrain values. Runtime validation applies
these **in addition to** the inherited banking rules. An optional
`confirmationMessage` customizes the introductory wording; the runtime still
appends mandatory action details and requires the established confirmation.

User templates support only `{{question}}`, `{{userId}}` and `{{context}}`.
`prompts.extractionSystem` and `prompts.extractionInstructions` configure shared
extraction instructions. Optional `prompts.recognitionSystem` configures the model
recognizer's instruction text (up to 16,000 characters). The runtime appends its
required JSON result schema and published-intent constraints. Prompts are text,
never executable JavaScript. Store no
credentials or customer secrets in configuration: authenticated runtime clients
can read published configuration.
Optional `clarificationText`, `handoffText`, `unavailableText` and
`dataCollectionText` customize shared response wording (plain text, up to 2,000
characters each).

### Recognition

New configurations use:

```json
{
  "strategy": "lexical",
  "confidenceThreshold": 0.65,
  "ambiguityMargin": 0.12,
  "ambiguityAction": "clarify",
  "synonyms": {}
}
```

`recognition.strategy` is `lexical`, `external` or `llm`; both confidence values are
between zero and one. The lexical implementation uses normalized literal phrases,
weighted token overlap and synonyms over examples, names and descriptions. It is
**not an embedding model**. Tied or low-confidence recognition requests
clarification or human handling. An external NLU adapter can supply validated
candidate scores through the runtime's environment-configured provider; URLs and
credentials are not editable configuration. The simulator never calls that
provider and identifies lexical fallback explicitly. Existing configurations
without recognition settings use literal-only matching.

The `llm` strategy uses the configured recognition task profile below. It requires
`llm.enabled:true` and a recognition route. Model-produced candidate IDs and
confidence values pass through the same published-catalog, threshold and
ambiguity checks as external candidates. Model recognition is not exercised by
contract simulation; the simulator reports `lexical_fallback` for this strategy.

`recognition.js` is an exact vendored copy of the pure runtime implementation in
`ai-orchestrator/src/services/recognition.js`. Contract tests compare their results.
Change both copies together.

### Governed model profiles

Model identity, generation settings and task routing are part of the immutable
configuration release. Endpoint addresses, provider adapter types and credentials
remain in the orchestrator's server-owned provider registry. The control plane
never accepts those values in a profile and does not perform provider discovery
or infer whether a particular model is installed.

New configurations include this disabled example:

```json
{
  "llm": {
    "enabled": false,
    "profiles": [{
      "id": "local-qwen",
      "name": "Mac Studio Qwen",
      "providerId": "mac-qwen",
      "model": "qwen3.5:latest",
      "temperature": 0,
      "maxOutputTokens": 2048,
      "timeoutMs": 120000
    }],
    "routing": {
      "generation": "local-qwen",
      "extraction": "local-qwen",
      "recognition": "local-qwen"
    }
  }
}
```

`mac-qwen` refers to the remote Mac Studio's registry entry. An example endpoint
is `http://mac-studio.local:11434`; its actual hostname belongs in server
configuration, never the published profile. `qwen3.5:latest` is an editable model
example and does not assert that the remote host has that model. Discover and
test models against the configured remote host before enabling a release.

Each profile has exactly the seven fields shown above. Profile IDs and provider
IDs match `[a-z][a-z0-9_-]{0,63}`. Names are nonblank and at most 120 characters;
model identifiers are at most 200 characters and cannot be URLs. A profile permits
temperature from 0 to 2, an integer output limit from 1 to 8,192 tokens and an
integer deadline from 1,000 to 120,000 milliseconds. There can be at most 50 unique
profiles. Provider adapters may impose narrower provider-specific limits at
execution time.

`routing` accepts only `generation`, `extraction` and `recognition` profile IDs.
An intent's optional `llmProfileId` overrides **generation only**; extraction and
recognition continue to use their task routes. Every configured reference must
resolve even when models are disabled. Enabled configuration requires at least
one profile and a task route or intent generation override. A model task that
lacks its required profile/provider fails unavailable at runtime; it never falls
back silently to another provider or the legacy cloud configuration.

The three configuration states have distinct meanings:

- No `llm` key preserves compatibility with historical runtime model settings.
- `llm.enabled:false` disables both plugin and legacy model calls; deterministic
  recognition, collection and routing remain available.
- `llm.enabled:true` uses only the model profiles pinned to the workflow release.

Model profile edits, task-route changes, intent overrides and recognition prompt
changes alter the exact configuration fingerprint. Existing required evaluations
and independent approvals must therefore be renewed before publication. Prior
published versions retain their original settings.

## Studio API

All writes include the current top-level `revision`. A conflicting update returns
409 and leaves both records and audit unchanged. Studio mutations return the same
summary shape as `GET /studio/state`:

```text
{revision, configDigest, suites, evaluations, environments, approvals,
 knowledge, promotions, governance, pagination, scope}
```

The summary returns at most 50 records of each kind. Evaluation summaries omit
detailed results. Get a record by ID for details, or page the list with
`?offset=0&limit=50` (maximum 100).

| Method | Route | Body / result |
| --- | --- | --- |
| GET | `/studio/state` | Bounded studio summary, including `rolloutPolicy` |
| GET | `/studio/diff` | `?fromVersion=N&toVersion=N\|draft`; semantic configuration comparison |
| GET | `/studio/{suites,evaluations,approvals,knowledge,promotions}` | `{items,total,offset,limit}` |
| GET | `/studio/{kind}/:id` | Full record; suite definitions are flattened |
| PUT | `/studio/suites/:id` | `{revision,suite}` |
| POST | `/studio/evaluations` | `{revision,suiteId,source:"draft"\|"published",version?}` |
| PUT | `/studio/governance` | `{revision,governance}` |
| POST | `/studio/approvals` | `{revision,note,version?}`; default target is draft |
| POST | `/studio/promote` | `{revision,environment,version,note,canaryPercent?}` |
| PUT | `/studio/rollout-policy` | `{revision,policy:{enabled,minSamples,maxFailureRate,windowMinutes}}` |
| PUT | `/studio/knowledge/:id` | `{revision,document}` |
| POST | `/studio/knowledge/import` | `{revision,documents}`; 1–50 documents atomically |
| GET | `/studio/knowledge/:id/versions` | Paginated author/release history |
| POST | `/studio/procedures/parse` | Editor/admin. `{document:{source,content,title?,id?,intents?,channels?,audience?}}`; returns a disabled draft procedure, suggested guardrails, warnings and blocking errors. Stores nothing. |
| GET | `/releases`, `/audit`, `/work-items` | Paginated legacy records; release lists omit config bodies |
| POST | `/simulate` | `{channel,utterance,source?}` or existing `{channel,intent,source?}` |
| GET | `/runtime/config` | Optional `environment` or pinned `version` query |
| POST | `/runtime/knowledge/search` | `{query,limit?}`; maximum 10 results |
| POST | `/runtime/rollout/observe` | Trusted service-token-only observation; see rollout section |

The existing `/state`, `/draft`, `/validate`, `/publish`, `/rollback`,
`/runtime/resolve` and work-item mutation routes remain available. `/state` caps
legacy history lists and does not contain studio record payloads.

## Evaluation suites and release gates

A suite contains `id`, `name`, optional `description` and 1–100 cases. A case has
`id`, an `utterance`, `channel`, `expectedIntent` (an ID or null), optional
`expectedAction`, `expectedTools` and `requiredFields`. An optional `steps` array
adds follow-up turns after the root utterance. A case may instead omit the root
utterance and put the whole scenario in `steps`. Each scenario has at most 20
turns. `continueIntent:true` tests a continuation pinned to the previous intent.

```json
{
  "id": "balance-regression",
  "name": "Balance regression",
  "cases": [{
    "id": "balance",
    "channel": "digital",
    "utterance": "check balance",
    "expectedIntent": "balance_inquiry",
    "expectedAction": "automated",
    "expectedTools": ["banking_get_accounts", "banking_get_balance"],
    "steps": [{
      "utterance": "yes",
      "continueIntent": true,
      "expectedIntent": "balance_inquiry"
    }]
  }]
}
```

Evaluation results persist exact configuration and suite SHA-256 fingerprints,
per-turn recognition/routing details and assertion failures. These are explicitly
`contract_simulation` results: they do not execute LLM responses, customer tools,
external providers, telephony or financial transactions. Multi-turn simulations
test recognition/routing continuity and configured field contracts; live workflow
behavior also needs the existing runtime integration suites and provider sandbox
tests. Both simulations and evaluations explicitly return
`modelProfilesTested:false`. Simulations expose `configuredModelProfiles` for the
selected generation/extraction/recognition routes, so reviewers can inspect model
selection without mistaking it for model availability or quality evidence.

Governance defaults preserve existing publishing behavior:

```json
{
  "requireEvaluationForPublish": false,
  "requireIndependentApproval": false,
  "requiredSuiteIds": []
}
```

When evaluation gating is enabled, publishing, rollback and promotion require a
passing result for the exact target configuration and every **current** required
suite definition. Changing either invalidates the previous evidence. When
independent approval is enabled, an administrator distinct from the draft author
must approve the exact configuration digest. Self-approval is rejected even when
the gate is currently disabled. Gates, approvals and changes are audited.

## Environments, canaries and rollback

Development follows newly published releases. Staging and production start at
release 1 and change only through promotion. Each environment stores a stable
version, optional candidate version and canary percentage. Promote with 100%
(the default) to replace the stable version; 1–99% creates a candidate rollout.

Runtime cohort assignment hashes the authenticated deployment tenant, principal
ID and environment. The same principal consistently receives the same cohort.
The runtime pins its returned release snapshot for subsequent turns. The server
uses `CONTROL_PLANE_ENVIRONMENT` (default `development`) unless a runtime API
request explicitly names an environment. Production adapters should set their
environment on the server, not infer it from customer message content.

Promoting an earlier version rolls that environment back and appends a deployment
event. Existing release objects never change. The legacy `/rollback` endpoint
creates a new release from an older configuration and moves development to it.

The diff endpoint compares objects and entries by identifier, avoiding noise from
list reorder. It returns `from`/`to` version and digest metadata and
`changes:[{path,kind,before,after}]`, bounded to 200 changes with `totalChanges`
and `truncated` indicators.

An optional rollout policy automatically withdraws a canary when its recorded
failure rate exceeds `maxFailureRate` after `minSamples` within `windowMinutes`.
The default is disabled, 20 samples, 20% maximum failure rate and a 15-minute
window. The operations monitor derives observations from persisted outcomes for
the candidate **and environment**, restricted to canary interactions. It calls
`/runtime/rollout/observe` with `X-Servicing-Service-Token` and:

```text
{environment,candidateVersion,sampleCount,failureCount,windowStart,windowEnd}
```

Customer access tokens alone cannot submit observations. The observer verifies
the current candidate, recent configured window and coherent counts, then
atomically clears the candidate while retaining the stable version. The automatic
decision, evidence counts and policy are appended to deployment/audit history.
Healthy or insufficient samples do not change the revision. Existing pinned
conversations remain on their release; withdrawal changes new cohort assignments.

## Procedures and guardrails

`config.procedures` holds the standard operating procedures the assistant follows.
They are part of the draft and release, so diffs, validation, simulation,
approvals, promotion, canaries, rollback and solution packages all apply. Each
procedure binds to intents and channels (at most one enabled procedure per pair),
lists ordered steps, and carries typed guardrails: `require_fields`,
`require_confirmation`, `escalate_when`, `prohibited_phrases` and
`required_disclosure`. Guardrail fields must be collected by every bound intent.
`/simulate` reports the applied procedure and includes procedure-required fields
in `requiredFields`. See [Procedures and guardrails](../../../docs/guides/procedures-and-guardrails.md)
for the schema, import grammar, runtime enforcement and retrieval.

## Governed knowledge

A document contains:

```text
{id,title,content,source,allowedRoles:string[],expiresAt:null|ISO-date,
 status:"draft"|"published"|"archived"}
```

Content must contain at least 20 characters after trimming and is bounded to
50,000 characters. Manual saves, imports and connector sync use the same preflight:
IDs must be unique within a batch; title, content and source cannot contain email,
card-like or Social Security number patterns. Unicode compatibility normalization
is applied before pattern checks. `source` is an HTTP(S) URL without embedded
credentials or a plain reference label, and cannot be `"unknown"`. These patterns
flag obvious sensitive content and can reject public contact details; they are not
a comprehensive privacy classifier. Rejection writes nothing. Allowed roles use
lowercase signed role names; `"*"` allows all
authenticated principals in the deployment. Publishing or archiving requires
administrator permission. Editor draft saves preserve the previous live release.
Each save creates a positive internal `version`; callers do not need to supply one.
An optional caller label is validated but cannot choose or overwrite this internal
revision. Archiving removes the document from retrieval while retaining its history.

Retrieval filters tenant, published status, role permission and expiry **before**
lexical ranking. PostgreSQL uses indexed full-text search; development uses token
overlap. Results contain only permitted document content, source, version and
relevance score. Retrieval also validates stored answer sources, including a
positive internal version and matching stored/document identifiers. Unsafe or
incomplete historical records are omitted; operators must correct and republish
them. A candidate page can contain fewer than the requested number of valid results.
Existing published content remains available while a valid draft is edited.
No matching evidence returns an empty list with `grounded:false`;
the endpoint never fabricates an answer or citation. Documents are authored or
imported as text; this module does not fetch arbitrary source URLs.

## Scale and operational boundaries

New knowledge/evaluation/approval/deployment history is normalized and paginated
in PostgreSQL. Existing configuration releases, audit history and legacy work
items still share the original configuration aggregate; their responses are
bounded, but very large legacy histories still need archival or migration to
separate tables. The adapter does not claim unlimited scale. Use dedicated
operational case/event storage for higher-volume provider workflows.

Back up both configuration and studio-record tables together. Retention and
external immutable audit export remain deployment policies; no automatic
destructive retention is enabled. A provider-neutral integration contract does
not mean that a live telephony, CRM, semantic NLU or fulfillment vendor is already
connected. Provider sandbox qualification and enterprise credentials are required
before live activation.

## Verification

```bash
npm test -w services/api-gateway -- --runInBand
```

Set `TEST_CONTROL_PLANE_DATABASE_URL` to a disposable PostgreSQL database to run
real concurrency, normalized-record, full-text retrieval and transaction rollback
tests. Test rows use unique tenant IDs and are removed afterwards. Do not point
integration tests at production data.
