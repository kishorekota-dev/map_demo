# Servicing Studio operator guide

Servicing Studio is available at `/control-plane` in the existing React frontend.
It uses the configured API gateway and the deployment's authenticated identity.
The console is designed for a dedicated enterprise deployment. It does not claim
to provide isolation between multiple enterprises sharing the existing banking
data plane.

## Access and identity

Customer chat remains at `/chat`. The header exposes the studio link to accounts
with a servicing role. This navigation check is a convenience: gateway APIs enforce
authorization independently using verified tokens.

| Role | Console access |
| --- | --- |
| `control_plane_viewer` | Inspect configuration and operational evidence |
| `control_plane_editor` | Edit configuration, test suites, and knowledge drafts |
| `control_plane_operator` | Manage fulfillment and permitted reconciliation |
| `control_plane_admin` / `admin` | Publish, approve, promote, configure connections and identity, and run maintenance |

The server may additionally require scopes for sensitive operation/context APIs.
Financial ledger reads require `servicing:operations:read`, reconciliation requires
`servicing:operations:reconcile`, and privileged session context requires
`servicing:context:read` (or the wildcard scope).

If `GET /api/identity/config` reports enabled enterprise identity, the sign-in page
offers **Continue with enterprise identity**. The server performs the identity
provider handshake and redirects to `/auth?enterprise=1`. The frontend then calls
`GET /api/identity/session` with credentials included and stores only the returned
local access token and account profile. It removes any prior local refresh token.
Enterprise refresh uses the HttpOnly session; sign-out also calls
`POST /api/identity/logout` to invalidate that session. Identity tokens, signing
keys, and provider client secrets are never authored in the browser console.

## Configuration lifecycle

1. Edit channels, prompts, intents, journeys, queues, or recognition settings.
2. Use **Validate draft** and resolve contract validation errors.
3. **Save draft** persists the configuration without changing the published release.
4. Run evaluations and obtain independent approval when the publication policy
   requires them.
5. Enter a release note in **Releases & audit**, then **Validate & publish**.
6. Promote a published version in **Environments & approvals** when an environment
   should move to that version.

Configuration and studio resources use optimistic workspace revisions. A stale
write returns a conflict and preserves the local form. The complete configuration
JSON can be copied before reloading to reconcile changes. Save local configuration
edits before mutating studio resources, since both share the same revision.
Save module forms before navigating away from them.

Rollback restores a prior configuration as a new published version. Environment
promotion and publication are separate controls. Existing sessions keep their
runtime-pinned release; the runtime chooses the configured environment's stable
or canary release for new sessions.

## Channels, intents, and prompts

**Channels** manages Digital, AVA, and IVR policy, automation versus human routing,
fallback queues, and adapter response budgets. A response budget is published
adapter configuration; changing it does not cancel a workflow already executing.
Enabling IVR policy alone does not connect telephony or speech services.

**Intents & prompts** provides individual controls for every configured intent:
recognition phrases, entity requirements, tool mappings, confirmation, system
prompt, and user prompt template. Supported user-template placeholders are
`{{question}}`, `{{userId}}`, and `{{context}}`. Shared extraction prompts are
edited separately, including optional model-based intent-recognition instructions.
Authoritative tool responses remain deterministic, and prompt
changes cannot remove runtime authorization or transaction safeguards.

Customer-response wording includes clarification, handoff, unavailable-service,
and data-collection messages. Individual intents can customize the confirmation
introduction while the runtime retains the authoritative action details. Declared
entities can have additive text/number/boolean types, allowed values, numerical
bounds, and text-length bounds. Clearing an optional override restores the
established behavior; banking contract requirements cannot be weakened.

Custom intents can use an existing canonical banking recipe, `service_request`,
or `knowledge_search`. Add the intent to a journey to control its channel routing
and fulfillment ownership. Canonical tool contracts remain validated on save.

The optional recognition policy configures lexical or deployment-configured
external or model-based recognition, confidence thresholds, ambiguity handling,
and synonyms. Model-based recognition requires enabled model-assisted servicing
and a recognition profile in **Models & providers**.
The utterance preview calls the actual server simulator against the saved draft
or published configuration and displays recognition evidence. Preview does not
execute a customer action or an external provider.

## Models and providers

**Models & providers** separates the server-managed provider registry from the
versioned servicing configuration. The registry can expose approved Ollama,
OpenAI, OpenAI-compatible, Gemini, and Vertex Gemini adapters. The console shows
only providers actually registered by this deployment. It does not accept provider
URLs, API keys, cloud credentials, or executable plugins.

The Qwen starter uses profile `local-qwen`, provider `mac-qwen`, and example model
`qwen3.5:latest`. The intended provider runs on a **remote Mac Studio**, not the
computer displaying the console. A deployment administrator must configure the
actual Mac Studio host and install its model first. A sample hostname or model
name is not evidence that the remote service is available.

1. Refresh the provider registry and inspect enabled/configured status.
2. Select a profile and provider, then use **Discover available models** when the
   adapter supports discovery. Otherwise enter an approved model ID.
3. Run the fixed **synthetic model test** to verify an actual response. Editors
   and administrators can run this check. It can consume provider usage, but does
   not publish configuration or execute a customer transaction.
4. Configure profile temperature, output-token limit, and response timeout. Assign
   profiles to response generation, entity extraction, and intent recognition.
   Individual intents can override the generation profile only.
5. Save the draft, evaluate applicable contracts, and publish through the normal
   release process. Configure model-based recognition separately when wanted.

Provider readiness, a successful synthetic test, and published routing are
distinct states. Test evidence is shown for the current profile/provider/model;
it is not a production quality evaluation or a guarantee of future availability.
Discovery has an explicit unsupported state when an adapter does not provide it.
If a provider does not support temperature, that control is disabled and its
saved value is retained for use with another provider.

The **Enable model-assisted servicing** switch is part of the draft. Publishing
`llm.enabled: false` disables model calls and uses deterministic collection and
rendering; saved profiles remain available for later activation. Older
configurations without an `llm` section retain legacy deployment behavior. The
starter is disabled by default. Publishing enabled routing uses its selected
provider explicitly and fails closed on an unavailable provider or invalid
profile; it does not silently fall back to a cloud model.

The browser's chat request budget is deployment-managed through
`runtime-config.json` → `chatRequestTimeoutMs` (1,000–600,000 milliseconds,
default 420,000), with `VITE_CHAT_REQUEST_TIMEOUT_MS` as the build-time fallback.
This budget accommodates multiple model stages within one chat request. Model
profiles set each individual model-call timeout; ordinary frontend API calls
retain their 30-second Axios timeout.

## Tests and evaluation evidence

**Tests & evaluations** manages named suites with customer utterances, expected
intent/routing, optional exact tool mappings, and required-field assertions.
Follow-up turns can continue the previous intent or start another intent.
An expected unresolved intent can test ambiguity/clarification behavior.

Save the suite, choose draft or published configuration, and run the evaluation.
Review pass/fail results per case and turn, including the recorded recognition and
routing details. Results are bound to a configuration fingerprint and suite
fingerprint. Editing either invalidates prior matching gate evidence.

These are **contract simulations**: they do not execute banking tools, call
external adapters, assess generated answer quality, or establish production
latency. Live integration checks and operational traces are separate evidence.

## Knowledge management

**Knowledge** creates and versions documents with source references, role access,
and optional expiry. Editors can save drafts; administrators can publish or
archive documents. Saving a new draft preserves the prior published version.
Archiving withdraws the document from retrieval.

Import supports JSON batches of up to 50 documents, saved as drafts for review.
Each document contains `id`, `title`, `content`, `source`, `allowedRoles`, and an
optional `expiresAt`. A source URL is provenance; saving it does not crawl it.
Provider imports are available through a configured knowledge connection.

Retrieval testing uses the current authenticated account's roles. It searches
published, unexpired, authorized documents and shows the source evidence. The
managed retrieval API currently reports its lexical retrieval scope explicitly.

## Provider-neutral connections

**Connections** configures case/fulfillment, voice/IVR, and knowledge adapters.
The form holds an adapter URL, enabled state, timeout, and secret references.
Supported environment references use `env:CONNECTOR_SECRET_<NAME>`; approved file
references are resolved under the server's configured secret root. Never paste
credential values into the console.

**Test saved connection** calls the adapter's real health endpoint. Saving a
connection and passing a health test are distinct states. Changes use per-record
revisions, including identity mappings, to avoid lost updates.

For a saved, enabled knowledge adapter, **Sync knowledge to drafts** retrieves
the provider's document batch through the server and imports it for review.
Save local configuration changes before synchronization.

## Execution and reconciliation

**Fulfillment** tracks manually managed service requests and their status history.
Updating these work items does not execute a banking transaction.

**Execution traces** shows recorded runtime events, connector-backed cases,
session filtering, per-intent/channel outcome aggregates, and authorized session
context. Lists are paginated; an empty list means no recorded observations, not
that an integration has been tested successfully.

Connector cases with uncertain outcomes require investigation. The reconciliation
form records confirmed completion/failure or authorizes a provider-verified retry.
The server controls whether reconciliation and retry are valid.

The separate financial operation ledger has **no retry action**. An authorized
operator must verify the authoritative outcome and provide an evidence reference
and note before recording completion or failure. Recording that outcome does not
re-execute the financial action.

## Environments, approval, and operations

**Environments & approvals** manages development, staging, and production stable
and candidate versions. A share from 1–99 creates a canary; 100 promotes a stable
version. Promotion requires a note and the server's applicable governance gates.
Independent approval is bound to the exact configuration digest and rejects
self-approval by the configuration author.

The release comparison shows field-level before/after values between saved
versions or the draft. Large comparisons report truncation explicitly; use the
saved configuration JSON to review remaining fields. Automatic rollback policy
sets minimum observations, failure-rate threshold, and window duration. Its
decisions consume server-recorded canary telemetry, not values entered into a
browser report.

**Identity & operations** reports storage, workers, identity readiness, connection
counts, and configured retention. Administrators map the configured issuer's exact
subject to a local user and supported roles. Deployment-wide issuer credentials,
worker startup, and infrastructure settings remain server-managed.

Retention requires a dry-run preview before the UI enables applying the same
retention period. The API determines eligible records and preserves protected
evidence. Audit export downloads bounded evidence batches, retaining chain hashes,
payloads, and signatures when configured. Continue downloading while the server
reports additional batches.

The measured-usage panel separates priced and unpriced records and shows observed
cost by provider, service, and metric. Administrators can configure prospective
per-unit rates. Missing prices are never presented as zero cost, and historical
records retain their ingestion-time price and currency. These reports reflect
captured usage, not an invoice reconciliation or an estimate for unobserved work.
Metric presets cover reported generation, extraction, and recognition token usage,
plus MCP tool calls. Presets never supply a price: enter the deployment's contracted
rate explicitly. An empty report says **No usage recorded**. Mixed currencies have
separate totals, and incomplete pricing does not produce a cost-per-completion
number.

Voice recovery in **Execution traces** can inspect recorded calls and mark an
investigated uncertain start as ended with a note and reference. It does not
resume a call or replay customer speech. The server enforces the eligible states
and minimum age for an uncertain start.

Subject privacy requests in **Identity & operations** provide account lookup,
an erasure preview, and application of that reviewed request. The API rejects
erasure while unresolved cases or active calls exist and preserves minimal replay
protection. Inspect the returned batch metadata when reviewing a large subject
record set.

## Validation

```bash
npm run typecheck -w services/frontend
npm run lint -w services/frontend
npm run test -w services/frontend
npm run build -w services/frontend
```

Client tests cover authenticated requests, stale-revision handling, avoiding
ambiguous network retries, access-token refresh, and the credentialed enterprise
session handoff. Browser verification should exercise real gateway APIs and verify
panel/input right edges at mobile widths, since a clipped outer shell can hide
overflow from a document-level scroll-width check.
