# Platform gap assessment and implementation

Reviewed October 24, 2026 against canonical `services/*` code and current primary vendor documentation. The target remains a dedicated enterprise customer-servicing platform with a banking accelerator, provider-neutral adapters, and local or cloud models. This is an engineering comparison, not a procurement ranking or a measured claim of market leadership.

## What was missing, and what this change delivers

| Gap found in the code | Implementation | Boundary |
| --- | --- | --- |
| Contract simulations did not inspect actual model responses | **Response quality** workspace, synthetic dataset editor, generation/extraction/recognition probes, deterministic assertions, latency and provider-reported token usage, recorded-run comparison, cancellation and bounded durable queue | Explicitly requested inference only. No business tools, semantic judge, acoustic tests or complete conversation evaluation. |
| A passing routing simulation could not establish that the selected model met authored response expectations | Administrator-required suite/profile gates with exact configuration, dataset and profile fingerprints; minimal worker-created evidence reconciled transactionally into publication/promotion/rollback checks | Changed content invalidates evidence. Provider weights, mutable aliases and endpoint changes still require deliberate re-evaluation. |
| Operators had traces and manual fulfillment records but no unified handling surface for executed cases | **Agent workspace**, filtered queues and supervisor counts, self-assignment, revision-protected handling notes/dispositions, pinned journey context, approved knowledge citations and bounded evidence | Operates on existing connector cases. Live media/chat delivery remains with the existing agent console/provider. Context is deliberately limited to authorized case data. |
| Durable effect records could survive a crash while LangGraph progress disappeared | PostgreSQL checkpoint saver, explicit V2 migration, startup verification, synchronously persisted graph state and owner-authorized interrupted-request recovery | Recovery retains the original interaction/release and consults the effect ledger. An uncertain financial dispatch requires reconciliation. Socket routing and NLU caches still have process-local state. |
| Persisted graph state carried a customer's bearer credential | Fresh request-local credential context for execution/recovery; credential-free checkpoints and scoped quality-job delegation | Database checkpoints still contain servicing context and need restricted access, retention and backups. |

Read [model evaluation](model-evaluation.md), [agent workspace](../../services/api-gateway/operations/AGENT-WORKSPACE.md), and [checkpoint/recovery reference](../../services/ai-orchestrator/WHY-CHECKPOINTER-IS-REQUIRED.md) for contracts, permissions, limits and operating procedures. These additions extend the established control plane, PostgreSQL stores, workflow ledger and provider registry; they do not introduce a second execution architecture.

## Market benchmark

| Benchmark | Primary evidence | Resulting product decision |
| --- | --- | --- |
| Evaluation is a repeatable operating workflow | Microsoft documents recorded per-case agent evaluation results, response times and run comparison. [Evaluation results](https://learn.microsoft.com/en-us/microsoft-copilot-studio/analytics-agent-evaluation-results) | Ship an operator workbench with persistent measured results, distinct from routing simulations. |
| Broad evaluations inspect conversations and tools | Google documents playbook test cases with golden responses, tool expectations and evaluation metrics. [Playbook evaluation](https://docs.cloud.google.com/dialogflow/cx/docs/concept/playbook/evaluation) | Label the new objective prompt probes precisely. Full multi-turn/tool and semantic quality evaluation remains a separate next capability. |
| Operators need a coherent service surface | Amazon documents an agent workspace combining contact handling, profiles, cases and knowledge. [Agent workspace](https://docs.aws.amazon.com/connect/latest/adminguide/agent-user-guide.html) | Put case ownership, context, citations and disposition together. Do not claim the bounded case projection is a full customer profile platform. |
| Voice and digital experiences require actual integrations | Genesys documents voice/digital virtual agents, knowledge assistance, informed handoff and dashboards. [Virtual Agent](https://help.genesys.cloud/articles/about-genesys-virtual-agent/) | Keep provider-neutral policies, then qualify real speech, interruption, DTMF and human-transfer delivery against the customer's selected provider. |
| Workflow persistence must be durable | LangGraph documents checkpoint-based persistence and recovery. [Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence) | Replace process-memory production checkpoints and test process termination with independent workers and the existing financial-effect ledger. |

The [earlier market comparison](market-comparison.md) preserves the original baseline and broader vendor landscape. Neither table implies a competitor lacks capabilities not listed here. Vendor licensing, regional availability and commercial plan coverage require separate verification.

## Remaining gaps before a best-in-class claim

The [October 2026 platform review](platform-review-2026-10.md) records the
authorization, identity and build defects found and fixed in a full code review,
and engineering gaps (token signing, browser token storage, refresh rotation)
that sit alongside the capability gaps below.

The following are still real work. Some require the enterprise deployment, while others are broader product investments. They are not silently described as delivered.

| Priority | Remaining capability | Acceptance evidence needed |
| --- | --- | --- |
| P0: customer pilot | Live IVR/media and human delivery | One complete authenticated voice journey, real ASR/TTS, DTMF, interruption, queue transfer, failure recovery and signed callbacks on the selected provider. |
| P0: customer pilot | Live enterprise systems and identity | IdP role downgrade/revocation, credential rotation, authoritative CRM/case mappings, provider-side idempotency and ambiguous-outcome reconciliation. |
| P0: customer pilot | Real model qualification | Run reviewed synthetic datasets on the separate Mac Studio Qwen instance, pin the actual model tag, inspect refusals/extraction/recognition, and measure latency and resource use. Current tests use fixtures. |
| P0: customer pilot | Reliability and recovery objectives | Representative concurrency/history load, p95/p99 latency, backlog limits, database backup/restore, external-outcome reconciliation, upgrade/rollback, agreed RPO/RTO and alerts. A process-kill test is not a database disaster-recovery test. |
| P1: product depth | Complete conversation and semantic evaluation | Versioned multi-turn fixtures, expected tool arguments/results, safe sandbox replay, groundedness/citation checks, multilingual and acoustic datasets, calibrated human review and an optional governed judge. |
| P1: product depth | Knowledge ingestion and retrieval quality | OCR and server-side extraction for document libraries, synchronization with source ACLs, semantic retrieval with relevance/grounding benchmarks, and lifecycle handling. Knowledge retrieval is governed lexical search; [procedures](procedures-and-guardrails.md) add batch SOP and knowledge import from Word, PDF, HTML, Markdown and text (no OCR or library synchronization), release-governed enforced guardrails and lexical, semantic or hybrid retrieval over customer procedures, with a Studio evaluation that measures each strategy and calibrates the similarity floor on authored cases. |
| P1: product depth | Customer outcome analytics | Authoritative completion, first-contact resolution, repeat contact, escalation causes and cost per completed service, with explicit denominators and observational limits. Existing telemetry and token counts do not prove business impact. |
| P1: operating scale | Horizontal realtime delivery and lifecycle | Shared Socket.IO routing/affinity or adapter, cache behavior under failover, checkpoint/evaluation retention and archival, representative large-history pagination and supported rolling upgrades. |
| P1: platform expansion | Domain packs and integration qualification | Extract banking-specific code behind explicit domain contracts before advertising another regulated domain; certify at least two real channel and system providers with one unchanged solution policy. |
| P2: commercial scope | Full contact-center or shared-SaaS suite | Workforce scheduling, quality coaching/recording, outbound campaigns, shared-tenant provisioning/billing/residency are separate investments if the business model needs them. Dedicated deployment was selected. |

## Differentiation to validate

The strongest proposition is governed transaction servicing across existing customer channels and systems. The useful combination is editable intent/prompt/model policy, pinned releases through active confirmations, durable recovery, and evidence that distinguishes completed, failed and uncertain actions. Local/private Qwen and cloud profiles follow the same business controls; reusable solutions preserve release gates.

These mechanisms support a product story but do not establish uniqueness. Demonstrate an advantage in a customer pilot by measuring duplicate financial effects, servicing completion, time to change a journey safely, effort to switch provider, recovery time and cost per completed service. Compare the same workloads and failure scenarios against a named commercial alternative before claiming superiority.

## Verification scope

Regression tests exercise objective assertions, budget/deadline enforcement, scoped job identity, exact-evidence gate invalidation, competing PostgreSQL workers, cancellation and interrupted jobs without replay. Agent tests exercise concurrent claims, ownership, stale revisions, knowledge ACL/version checks and privacy removal. Runtime tests terminate a separate process around checkpoint/effect boundaries and verify that recovery never blindly repeats uncertain financial actions.

Browser checks use actual local authenticated routes with synthetic cases and deterministic model transports. No enterprise IdP, live telephony, CRM sandbox, remote Qwen or cloud model is qualified by these tests. The [implementation record](servicing-product-implementation.md) records the final test/build evidence.
