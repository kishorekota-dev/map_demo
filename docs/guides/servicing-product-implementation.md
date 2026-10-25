# Dedicated enterprise servicing: implementation record

Date: October 24, 2026. Deployment decision: **dedicated enterprise**. Integration
decision: **provider-neutral adapters first**. This follows the
[market review](market-comparison.md); its original gap register is the baseline,
not a statement of the repository after this implementation.

## Delivered against the market gaps

| Baseline gap | Implementation | Validation / remaining external work |
| --- | --- | --- |
| Digital / AVA / IVR | Existing authenticated chat/assistant plus signed provider-neutral voice ingress, speech/DTMF turn contract, interruption and transfer actions | Signed/replayed/concurrent events tested; live media, ASR/TTS, DTMF timing and contact-center transfer require a chosen provider adapter |
| Cross-channel continuity | Durable, user/tenant/target-bound one-time grants with expiry; atomic consumption; pinned workflow release preserved | Real PostgreSQL concurrent consumption and restart tests; same customer identity required on both channels |
| Fulfillment | Automatic escalation/service-request cases, normalized jobs, idempotent adapter operations, signed callbacks, retry classification, lease recovery, SLA queue escalation and reconciliation | Real HTTP reference connector plus PostgreSQL failure/replay tests; enterprise system mappings and provider-side idempotency qualification remain deployment work |
| Enterprise identity | OIDC authorization-code + PKCE, nonce/state/browser binding, pinned issuer/audience/JWKS, mapped local identity/roles, short access tokens, revocable browser sessions | Cryptographic flow, role isolation, callback replay and disabled mappings tested; register production IdP/client/callback and provision mappings |
| Credentials | Secret references to constrained environment names or files under a configured mounted secret root; HTTPS/host allowlists/DNS socket pinning/no redirects | Private-network/rebinding/timeout tests; use the enterprise secret manager to project files or environment values |
| Evaluation | Contract suites plus measured synthetic generation/extraction/recognition probes, objective assertions, latency/usage, comparison and exact config+suite+profile release gates | Fixture tests validate mechanics; actual model quality, full multi-turn/tool and acoustic evaluations remain qualification or further product work |
| Distributed safety | PostgreSQL advisory session coordination, graph checkpoints/pending writes, durable dispatched/succeeded/uncertain tool ledger, owner recovery, worker leases, one-time grants and no mutating-transport fallback | Independent worker/restart/ambiguous outcome tests; operational runbook describes restore and reconciliation |
| Recognition | Shared pure recognizer, confidence/ambiguity policies, synonyms and a provider-neutral semantic NLU contract | Runtime/simulator lexical parity tested; external recognition must be evaluated separately, lexical fallback is explicitly labeled |
| Model portability | Ollama/Qwen, OpenAI Responses, compatible servers, Vertex Gemini and Gemini API plugins; versioned task profiles and generation override per intent | HTTP fixture protocols, explicit credential isolation, structured responses and profile pinning tested; separate Mac Studio/cloud connectivity and model quality require deployment qualification. See [setup](llm-providers.md) |
| General authoring | Custom banking aliases, generic service and knowledge intents, typed input fields, prompt wording, governed tool subsets and journey composition | New registered financial tools require implementation; arbitrary scripts/unknown APIs cannot be enabled through a prompt |
| Knowledge | Author/import, revisions, publish/archive, signed-role ACL, expiry, pre-filtered lexical retrieval and cited responses | PostgreSQL indexed retrieval and ACL tests; trusted connector supplies text, enterprise document extraction is adapter-owned |
| Release operations | Semantic diffs, independent approvals, dev/staging/prod, deterministic principal canaries, promotion/rollback and observed-outcome rollback thresholds | Exact-content gates and cohort tests; monitor uses recorded runtime outcomes, never browser-provided counters |
| Observability | Correlated session/interaction/version/tool/case evidence, operational trace UI, version/channel outcomes, latency and repeat-contact counts; financial exception workspace | Telemetry failure is explicit; provider invoices and model quality cannot be inferred from HTTP success |
| Privacy / assurance | Restricted context, bounded payloads, transcript-free operational events, case-detail retention/subject export/erasure, replay tombstones, hash-chain/signed export | Operational scope is explicit; owning services retain banking/chat policy, external immutable archival and retention/legal decisions are customer responsibilities |
| Agent experience | Unified connector case workspace with ownership, bounded context, approved knowledge citations, revision-protected handling/disposition, evidence, queue summaries and exception reconciliation | Provider adapter maps logical queues to actual agents; existing agent console remains available |
| Storage | Normalized studio records, cases/jobs/events/identity/receipts/usage and indexed pagination | Legacy configuration release/audit/manual-work aggregates remain bounded through API but require archival for very large histories |
| Platform reuse / readiness | Validated solution catalog/import/export, reviewed conflict-aware draft merges, package provenance, sanitized runtime diagnostics and explicit production lifecycle | Unit/browser/PostgreSQL and isolated container checks; full customer/provider/capacity/recovery acceptance remains deployment work |
| Shared SaaS platform | Deliberately not introduced | Dedicated enterprise deployment selected; no unsupported billing, pooled-tenancy or residency claims |

## Differentiating factors supported by this implementation

The strongest product proposition is **governed banking servicing across existing
channels and systems**, with pinned policy and recoverable execution. Its useful
combination is:

- A configuration change does not silently alter an active confirmation flow.
- Editable prompts and intents retain ownership, typed-data, tool and consent
  constraints underneath them.
- Unknown financial outcomes are visible operational exceptions rather than
  automatic repeated mutations.
- Provider-neutral voice, case, knowledge, recognition and identity boundaries
  keep business policy in the established architecture.
- Local/private and cloud model profiles share the same governed workflow and
  release process; provider errors cannot silently move traffic to another model.
- Reusable configurations retain the same banking contracts and release governance
  rather than silently publishing imported settings.
- Release fingerprints, operation records and external outcome references make
  changes and actions inspectable.

These are concrete product strengths, **not proof of market uniqueness**. Vendors
already offer many individual controls. To establish a defensible commercial
advantage, measure completion quality, duplicate-effect rate, integration effort,
recovery time and operating cost in a real customer pilot. Portability across two
actual providers and customer-scale reliability remain claims to validate.

## Product qualification before live activation

1. Configure the enterprise IdP, service identity, databases and secret mounts;
   exercise login, role downgrade, credential rotation and outage behavior.
2. Implement or configure each chosen provider behind the documented contracts.
   Run health, idempotency, unknown-outcome and signed-callback tests against its
   sandbox. Enable IVR only after real call transfer and identity verification.
3. Build representative customer utterance and multi-turn suites, including
   ambiguous wording, confirmation, authorization denial and adverse outcomes.
   Enable exact-content evaluation and independent approval gates.
4. Load representative histories and concurrent sessions; measure p95 latency and
   throughput. Execute database backup/restore with the worker disabled, reconcile
   in-flight external actions, and record customer-approved recovery objectives.
5. Archive signed evidence exports externally. Agree scope-specific retention for
   operational cases, chat transcripts, identity sessions and banking records.

The repository now supplies the product mechanisms and local verification. It
cannot supply an enterprise's provider credentials, actual telephony/media stack,
commercial entitlements, authoritative customer identity mapping, or measured
production SLA without a configured deployment.

The [current platform assessment](platform-gap-assessment.md) explains these latest changes and the remaining market gaps.

## Baseline verification (initial control-plane implementation)

The initial control-plane commit `0dd5d15` validation used Node.js 22 and a disposable PostgreSQL 15 database:

| Suite | Passing tests |
| --- | ---: |
| API gateway, control plane, identity and operations | 138 |
| AI orchestrator, provider plugins and runtime recovery | 123 |
| Chat and authenticated handoffs | 58 |
| Banking authorization/contracts | 11 |
| NLU contracts | 11 |
| MCP tool contracts | 11 |
| Frontend services/authentication | 29 |
| **Total** | **381** |

Frontend production build/typecheck, lint of changed service code, whitespace
checks, enterprise-profile validation and both Docker Compose configuration
checks passed. Real browser checks exercised authoring, preview/diff, publication,
rollback, evaluations, knowledge, provider health, environments, identity mappings,
retention preview, cost configuration and privacy preview. The expanded controls
fit a 390px viewport without clipping. These checks used synthetic local data and
a reference adapter; they do not claim live telephony or enterprise IdP/provider
qualification.

The model extension adds fixture checks for Ollama, OpenAI Responses, compatible
servers, Vertex explicit bearer-token and Gemini protocols, credential isolation, JSON validation,
disabled/legacy states, pinned continuations and fail-closed extraction. Exact
model-profile changes invalidate evaluation and approval evidence. Confirmation
retries survive a model outage without executing a tool during failure.

Browser checks additionally covered the thirteenth **Models & providers**
workspace: actual authenticated registry/discovery/test routes backed by a
deterministic HTTP fixture, success/failure, viewer permissions, profile edits,
publication/rollback and 390px layout. The administrative probe passed registry
listing, discovery, text and JSON tests, explicit-model and allowlist rejection
checks using another fixture. Remote Mac Studio and cloud inference were not
performed. The configuration uses editable standard-port examples.

## Platform and production-hardening verification

The subsequent platform slice adds readiness and governed solution packages,
explicit production lifecycle tooling, first-administrator provisioning, required
internal NLU/MCP identity, verified database TLS, migration failure handling and
reproducible dependency locks. The documentation was reviewed against these
changes; historical completion reports retain explicit banners.

Browser checks against the actual PostgreSQL-backed platform routes exercised
read-only preview, reviewed draft application, downloadable export, normal
publication/rollback, explicit conflict consent, stale revision rejection,
actionable financial validation, runtime failure/recovery, viewer restrictions
and partial diagnostics outages. Desktop and 390px layouts had no clipped
controls or browser exceptions. Health/model dependencies in that browser test
were fixtures; separate isolated production-container checks cover real service
health and private networking.

The production Compose check uses an unseeded disposable deployment with synthetic
secrets and no enabled model provider. Explicit banking and servicing migrations
run before applications with runtime DDL disabled. Infrastructure health is
recorded separately from live identity, voice/media, customer integrations, remote
Mac Studio inference, capacity and backup/restore acceptance, which still require
the configured target environment. See [dependency audit](../architecture/dependency-audit.md),
[deployment](deployment.md) and [platform runbook](platform-readiness.md).

Final Node 22 regression counts for this slice:

| Suite | Passing tests |
| --- | ---: |
| Gateway, platform, control plane, identity and operations | 156 |
| AI orchestration, models, schema and recovery | 130 |
| Chat, schema and handoffs | 63 |
| Banking, migrations and administrator/bootstrap safety | 29 |
| NLU | 15 |
| MCP | 16 |
| Agent UI | 9 |
| Frontend | 29 |
| Deployment tooling and repeated real PostgreSQL migrations | 13 |
| **Total** | **460** |

Production dependency and build/test audits report zero known npm findings across
the audited root, standalone services, locked frontend static server and nested
banking database tree. This is dated registry/advisory evidence, with no claim
that container operating systems or application logic are vulnerability-free.

Final isolated production smoke built all nine images and started ten healthy
containers from empty disposable volumes. Banking V1–V9 and all four servicing
schema components migrated successfully, then the offline administrator CLI,
gateway password login, protected `/auth/me`, authenticated platform readiness
(all eight runtime checks) and catalog passed. Unauthenticated platform access
returned 401; MCP/NLU rejected missing service credentials. Redis outage and
recovery changed readiness 200→503→200 while application users remained non-root.
The deployed gateway package-author fix matched host source. Test containers,
volumes, images and temporary credentials were removed afterward; no enterprise
IdP, external model or customer provider was contacted.

## Response quality, agent workspace and graph recovery verification

The next platform slice closes three code-verified gaps from the
[current assessment](platform-gap-assessment.md): measured model-response probes
with exact-evidence release gates, unified handling of connector cases, and
PostgreSQL graph checkpoints with explicit owner recovery. It adds no dependency
or lockfile changes.

Final Node 22 regression counts for this slice, with database suites enabled
against disposable PostgreSQL:

| Suite | Passing tests |
| --- | ---: |
| Gateway, quality, platform, control plane, identity and operations | 184 |
| AI orchestration, models, checkpoints and recovery | 153 |
| Chat, delivery recovery, schema and handoffs | 74 |
| Banking, migrations and administrator/bootstrap safety | 34 |
| NLU | 15 |
| MCP | 16 |
| Agent UI | 9 |
| Frontend | 35 |
| Deployment tooling and repeated PostgreSQL migrations | 14 |
| **Total** | **534** |

Quality tests exercise bounded concurrency/deadlines, queue capacity, objective
assertions, canonical prompt builders, tenant/role boundaries, restricted job
identity, cancellation, exact-content gate invalidation and independent worker
claims. Interrupted model calls are not automatically replayed. Model transports
are fixtures, so the results establish evaluation mechanics rather than model
quality.

Case-workspace tests exercise competing claims, assignment ownership, stale case
and handling revisions, uncertain-provider restrictions, current knowledge
ACL/version checks, restart persistence and privacy removal. Browser flows verify
claim → cited guidance → waiting → truthful completion, preserved notes after a
409, release/escalation, filters and viewer restrictions.

Checkpoint tests include three real child-process SIGKILL scenarios around
checkpoint, acknowledged-effect and uncertain-dispatch boundaries. They verify
fresh request credentials, credential-free snapshots and original identity/release
binding. Additional regressions block stale confirmation replay, preserve a
lost-response recovery marker, and let an explicit confirmed missing-session
response exit the initial-dispatch-outage loop without replaying a message or
action. Expired existing records retain their ownership/expiry checks.

Actual-route browser tests cover synthetic suite authoring, structured/advanced
JSON dirty locks, explicit fixture inference, per-case assertions/usage,
comparison, exact-gate publication and rejection after a prompt change. Customer
recovery tests verify that a service error preserves the original request and a
successful explicit resume restores confirmation without creating a replacement
session or new message. Agent, quality and recovery controls fit a 390px viewport;
long customer headings wrap and the resume control retains its accessible name.

Frontend build/typecheck, workspace lint, profile validation, whitespace and local
documentation-link checks pass. The unchanged root dependency lock audits with
zero known npm findings on the review date. Dedicated provider credentials,
remote Qwen, semantic/acoustic quality, capacity and database disaster recovery
remain outside these synthetic checks.

The final isolated production smoke built all nine images from the final source
and started ten healthy services on fresh disposable volumes. Explicit migrations
created both V2 checkpoint tables before application startup. The unseeded banking
database had zero users; offline bootstrap with a password supplied on stdin
created one administrator, followed by successful gateway login and protected
identity lookup. Runtime readiness/catalog, quality state and agent case APIs
returned 200; quality had zero runs and no inference was requested. Unauthenticated
operator access and delegated job-token use on ordinary APIs were denied.

Live orchestrator health reported enabled durable PostgreSQL checkpoints. All eight
applications ran as non-root users, and hashes of sixteen critical gateway/AI/chat/
banking files matched the reviewed host source. Service logs contained no matches
for the synthetic test credentials or bearer tokens. This is a targeted log check,
not a general secret-scanning certification. The smoke used no provider, enterprise
IdP or model calls. Its containers, volumes, network, image tags and private temporary
files were removed; unrelated local applications were left running.
