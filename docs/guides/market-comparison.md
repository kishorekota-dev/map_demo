# Customer servicing product: market comparison and differentiation

Review date: October 24, 2026. Scope: the canonical `services/` implementation,
including the new control plane, compared with publicly documented products.
Vendor capabilities below are documentation-based, not hands-on benchmarks or
claims that every feature is included in every commercial plan. The roadmap and
positioning are engineering/product judgments.

## Implementation update

The comparison below records the **pre-expansion baseline**. The subsequent
implementation adds provider-neutral voice/case/knowledge/identity contracts,
durable execution and handoffs, custom/typed intent authoring, customer-response
prompts, evaluations, independent approvals, environments/canaries, measured usage,
operational traces and privacy/evidence controls. See the
[implementation matrix](servicing-product-implementation.md) for current status,
acceptance evidence and remaining provider qualification. The selected product
model is dedicated enterprise deployment, not shared SaaS.

## Baseline assessment

The app is a credible governed transaction-servicing foundation. It has useful
runtime controls, banking tools, configuration releases, and human work tracking.
It is not yet a complete omnichannel service or fulfillment product.

The strongest commercial direction is a banking-focused servicing control plane
that connects to existing contact-center and case-management systems. Competing
immediately across a full contact-center suite would spread the implementation
across telephony, workforce operations, quality management, CRM, knowledge,
analytics, and enterprise platform administration.

The differentiating hypothesis is **governed execution of customer transactions
across channels and systems, with evidence of what was authorized and completed**.
Some supporting mechanisms exist today. Vendor portability, complete fulfillment
evidence, and a measurable operational advantage still need to be demonstrated.

## Relevant product benchmarks

These products overlap different layers; they should not all be treated as
interchangeable replacements.

| Product | Documented capability relevant to this app | Main gap exposed in this app |
| --- | --- | --- |
| Genesys Cloud CX / Virtual Agent | Voice and digital bot flows, intent/utterance generation, knowledge assistance, summaries, informed human transfers, and performance dashboards. [Virtual Agent documentation](https://help.genesys.cloud/articles/about-genesys-virtual-agent/) | Actual voice integration, richer conversation understanding, knowledge, production handoffs and measured assistant performance |
| NiCE CXone Orchestrator | Long-running workflows connecting front-office service with back-office fulfillment and enterprise systems. The opened documentation labels this capability **controlled release**, so availability must be checked for a deployment. [Orchestrator documentation](https://help.nicecxone.com/Content/orchestrator/orchestrator.htm) | Executable cross-system fulfillment, callback handling, workflow recovery and reconciliation |
| Cognigy | SIP Voice Gateway, webchat, REST/socket/webhook endpoints, contact-center integrations and MCP tool exposure. [Endpoint reference](https://docs.cognigy.com/ai/agents/deploy/endpoint-reference/overview) | Production channel adapters and tested integrations; MCP alone is not differentiating |
| Kore.ai | Agent orchestration integrated with its service experience platform, plus observability, evaluations and business-outcome insights. [AI for customer experience](https://kore.ai/customer-experience) | A broader authoring and optimization lifecycle, connected channels and operating analytics |
| Google Conversational Agents / Dialogflow CX | Visual deterministic flows, generative playbooks, tools, test cases, versions and environments. [Console capabilities](https://docs.cloud.google.com/dialogflow/cx/docs/concept/console-conversational-agents) | General journey/action authoring and independently managed test/production environments |
| Microsoft Copilot Studio | Repeatable test sets with response/conversation evaluation and methods covering quality, safety and tool use. [Agent evaluation](https://learn.microsoft.com/microsoft-copilot-studio/analytics-agent-evaluation-intro), [evaluation methods](https://learn.microsoft.com/en-us/microsoft-copilot-studio/analytics-agent-evaluation-overview) | Customer-facing evaluation workbench and evidence-based release gates |
| Salesforce Agentforce | Configurable actions built from flows, APIs and code; simulation/live testing and programmatic batch testing. [Context and actions](https://developer.salesforce.com/blogs/2025/08/a-developers-guide-to-context-engineering-with-agentforce), [debugging and simulation](https://developer.salesforce.com/blogs/2026/03/agent-script-decoded-how-to-debug-agent-script), [Testing API](https://developer.salesforce.com/docs/ai/agentforce/guide/testing-api.html) | Extensible action contracts, safe action simulation and broad scenario evaluation |
| ServiceNow CSM | Cross-department case workflows, agent workspace, knowledge and integration with existing contact centers. [Customer Service Management](https://www.servicenow.com/products/customer-service-management.html) | Real case ownership and fulfillment integration; complementing existing contact centers is already a competitive proposition |
| Amazon Connect | Unified customer profiles combining contact history with external systems, and operator-visible AI interaction traces. [Customer Profiles](https://docs.aws.amazon.com/us_en/connect/latest/adminguide/customer-profiles.html), [AI agent traces](https://docs.aws.amazon.com/connect/latest/adminguide/ai-agent-traces.html) | Unified customer context and end-to-end investigation of automated service interactions |

Do not infer that these products lack capabilities omitted from this table. It
selects the most relevant comparison point for each product, not a complete
feature inventory or procurement ranking.

## Baseline strengths

- All 16 canonical intents have editable recognition phrases, entity requirements,
  system/user prompts, allowed tools and confirmation settings. Shared extraction
  prompts are configurable too.
- Drafts are separate from published runtime configuration. Releases can be
  restored without rewriting previous versions.
- Active confirmation/data-collection workflows retain the configuration they
  started with. A new request cannot overwrite pending workflow configuration.
- Required fields, mandatory confirmations and registered tool contracts remain
  enforced beneath editable instructions.
- Prompts are isolated per request, avoiding a global mutable configuration that
  leaks changes between concurrent requests.
- PostgreSQL commits configuration, release history, work and audit updates
  transactionally. Revision conflicts prevent silent concurrent overwrites.
- Human work records have idempotent creation, assignment, due dates, allowed
  transitions and resolution history.

These are implemented strengths, not evidence of market uniqueness. The
[control-plane guide](control-plane.md) documents their deployment boundaries.

## Original gap register

P0 means needed for the proposed connected enterprise pilot, P1 means needed to
make the offering repeatable and competitive, and P2 means dependent on the
commercial deployment model. These are priorities, not delivery estimates.

| Priority | Capability | Current state | Required enhancement and acceptance evidence |
| --- | --- | --- | --- |
| P0 | Real Digital/AVA/IVR integration | Channel policy exists; IVR is disabled and has no provider | Connect one telephony/contact-center provider with speech, DTMF, interruption handling, signed webhooks, caller verification and transfer. Demonstrate a complete authenticated voice journey. |
| P0 | Conversation continuity | Sessions persist, but a channel ID is not a cross-channel handoff contract | Introduce a canonical interaction envelope and authenticated transfer/resume token. Preserve customer context, collected entities, consent and release version through digital → voice → human transfer. |
| P0 | Reliable fulfillment execution | Manual work records; selected banking tools execute through the existing pipeline | Automatically create/link cases on escalation. Add one CRM/ITSM connector, durable operation IDs, callback deduplication, retry classification, timer-driven escalation and outcome reconciliation. Prove recovery from an ambiguous timeout without duplicate financial action. |
| P0 | Enterprise identity and credentials | Signed local JWT roles and deployment tenant checks | Add enterprise issuer/audience validation, OIDC sign-in, scoped service identities and vault-backed connector credentials. Verify denied access and credential rotation. Provisioning automation can follow customer requirements. |
| P0 | Product-level evaluation | Engineering tests and known-intent routing preview | Add utterance and multi-turn test sets, expected tools/arguments/outcomes, negative security cases, transcript replay and release pass/fail gates. Test real voice inputs when the adapter is connected. |
| P0 | Distributed runtime reliability | Control-plane writes support multiple gateway replicas; workflow mutex is per process | Add distributed workflow coordination, durable jobs/outbox, action outcome records and recovery procedures. Verify concurrent workers, process loss, callback redelivery and backup restoration. |
| P1 | Intent understanding | Published classification uses literal substring matching | Restore a governed semantic recognition layer with calibrated confidence, ambiguity handling, paraphrase evaluation, language settings and escalation. Keep authorization and transaction execution constrained regardless of recognizer output. |
| P1 | General authoring | Existing 16 intents are editable; new IDs and new tool mappings require code | Add versioned intent/action definitions, typed input/output schemas, reusable prompt fragments and journey composition. Validate new actions against adapter contracts before publication. |
| P1 | Knowledge | No complete governed enterprise knowledge pipeline in the canonical product | Add approved ingestion connectors, document permissions, freshness/expiry, retrieval evaluation, source-grounded answers and knowledge release controls. |
| P1 | Release operations | Draft/publish/rollback exists | Add dev/test/prod promotion, environment-specific secrets, semantic diffs, independent approval where required, staged rollout, experiment comparison and automated rollback criteria. |
| P1 | Observability and improvement | Basic gateway metrics, logs, session data and audit history | Trace message → recognition → policy → tool → external outcome. Report task completion, repeat contact, escalation reasons, latency, version regressions and cost per completed service. |
| P1 | Privacy and operating assurance | Application audit, some policy/redaction controls | Add configurable retention/deletion/export, redaction verification, restricted diagnostic access, external tamper-resistant audit export, capacity evidence and customer-approved recovery objectives. |
| P1 | Agent experience | Existing escalation console and separate work queue | Add unified case context, approved knowledge, conversation summary, next action, disposition and supervisor oversight; connect the logical queue to a real operational queue. |
| P1 | Storage scalability | Configuration, all releases, audit and work share a JSONB state row; `/state` returns the aggregate | Split append-only event/audit and work data into indexed records; add pagination, retention and snapshot management. Measure load against representative history volumes. |
| P2 | SaaS commercial platform | Deployment-scoped product with runtime branding | If selling shared SaaS: full data-plane tenant isolation, tenant onboarding, entitlements, quotas, metering, billing, residency choices and upgrade management. A dedicated deployment product can defer shared tenancy. |

### Two baseline behavioral gaps

**Recognition changes currently replace semantic classification with phrase matching.**
The published runtime ignores the legacy NLU fallback when no phrase matches and
uses `general_inquiry`. An illustrative local check of the default catalog returned:

| Input | Current result |
| --- | --- |
| `check balance` | `balance_inquiry` |
| `Please tell me how much cash is left in checking.` | `general_inquiry` |
| `I would like to temporarily lock the debit card I misplaced.` | `general_inquiry` |
| `Please send fifty dollars to my other account.` | `general_inquiry` |

This is a small diagnostic example, not an accuracy benchmark. It shows why
operator-controlled prompts/intents must be paired with semantic recognition and
an evaluation corpus. Deterministic business controls do not require literal-only
language understanding.

**Fulfillment status is not a fulfillment engine.** A due date does not dispatch a
timer, a named queue does not connect to a provider, and marking a work item
complete does not verify an external case or transaction outcome. Those edges
need explicit contracts and integration tests.

## Differentiation: what can actually be claimed?

| Proposed distinction | Evidence today | What would make it defensible |
| --- | --- | --- |
| Governed transaction execution | Published snapshots, confirmation floors, tool allowlists and authenticated ownership | Produce a complete action evidence record linking identity, configuration, consent, policy, tool arguments, operation ID and authoritative result; verify it under recovery scenarios |
| Safe change during active servicing | Pending workflows retain their published configuration | Demonstrate the same guarantee through cross-channel handoffs, multi-worker recovery, connector/schema changes and staged deployments |
| Portable servicing policy | Separate services and a tool boundary provide an architectural starting point | Run the same journey and policy package through two real channel providers and two system adapters without rewriting business logic |
| Banking domain depth | Existing balance, transfer, card, fraud and dispute contracts | Package reusable banking journey definitions, tests, exception paths and integration mappings; show faster deployment and better completion quality in a customer pilot |
| Customer control over deployment | Source-based deployment and configurable service/model endpoints | Deliver supported private deployment, upgrade/rollback, secret rotation, model substitution and operational runbooks with measured cost and reliability |

The best candidate product statement is:

> A governed banking-servicing control plane that connects existing digital,
> voice and case-management systems, with traceable authorization and completion
> of every customer action.

The implementation now supplies provider-neutral connected-system contracts and
correlated execution evidence. Live multi-provider portability and complete
customer-deployment evidence still require qualification; the new mechanisms do
not establish market uniqueness by themselves.

### What is not unique

Prompt editing, intent configuration, RBAC, audit logs, versioning, rollback,
MCP support, microservices and deterministic workflow steps are not defensible
claims of uniqueness by themselves. For example, Google documents immutable
versions and environments; Salesforce recommends structured actions for critical
business logic; Cognigy exposes tools through MCP. [Google versions](https://docs.cloud.google.com/dialogflow/cx/docs/concept/version),
[Salesforce structured actions](https://developer.salesforce.com/blogs/2025/08/a-developers-guide-to-context-engineering-with-agentforce),
[Cognigy endpoint reference](https://docs.cognigy.com/ai/agents/deploy/endpoint-reference/overview).

Even the promise of extending an existing contact center is already made by
ServiceNow. Differentiate through demonstrable domain depth, integration effort,
execution evidence and operating economics rather than architecture labels.
[ServiceNow CSM](https://www.servicenow.com/products/customer-service-management.html).

Do not claim the product is cheaper, more accurate, more compliant, or more
reliable than a named vendor until a comparable deployment has been measured.
No market-wide uniqueness or patentability conclusion follows from this review.

## Recommended sequence

### 1. Prove a complete service journey

Use disputed-transaction intake as the first vertical slice. Connect one digital
surface, one voice/contact-center provider and one actual case-management system.
Collect verified customer identity and transaction context, apply required evidence
and confirmation, create the external case, track its status and let the customer
resume without repeating already verified information.

Deliver enterprise sign-in, operation IDs, recovery behavior and a small evaluated
test corpus alongside the connectors. Make the transcript, configuration version,
authorization and authoritative outcome visible to the operator.

### 2. Make changes safe and measurable

Add a test/evaluation workbench, approval and environment promotion, trace-based
diagnostics, recognition tuning, knowledge management and version comparisons.
The next console modules should therefore be **Connections, Tests & Evaluations,
Knowledge, Execution Traces, and Environments & Approvals**. Expand Intent Studio
into schema-based intent/action authoring after the adapter contract is stable.

### 3. Package and scale

Add reusable banking journey packs, a second provider/connector combination,
storage pagination/retention, distributed workflow coordination and supported
deployment operations. Add shared SaaS administration only if that is the selected
commercial model. Integrate existing CCaaS workforce and routing capabilities
before attempting to build an entire workforce/contact-center suite.

### Evidence to collect

Agree targets with a pilot customer; these are proposed measurements, not current
results:

- Correct completion rate and repeated-contact rate by journey and channel.
- Incorrect/duplicate action rate under normal operation and injected failures.
- Share of completed actions with full authorization/version/outcome evidence.
- Context preserved and customer information repeated during handoffs.
- Time to implement, evaluate and deploy a governed policy change.
- Cost per successfully completed service, including model, voice, platform,
  human handling, integration and operating effort.
- Tail latency, recovery time and successful restoration of pending work.

## Repository evidence

- [Control-plane scope and deployment boundaries](control-plane.md)
- [Configuration validation and fixed canonical catalog](../../services/api-gateway/control-plane/config.js)
- [Versioned configuration, simulation and work-item APIs](../../services/api-gateway/control-plane/index.js)
- [Transactional PostgreSQL state adapter](../../services/api-gateway/control-plane/postgres-store.js)
- [Published recognition and routing](../../services/ai-orchestrator/src/services/controlPlaneRuntime.js)
- [Workflow pinning and per-process serialization](../../services/ai-orchestrator/src/services/workflowService.js)
- [Request-scoped intent/prompt configuration](../../services/ai-orchestrator/src/services/intentMapper.js)
- [Basic gateway metrics](../../services/api-gateway/routes/metrics.js)

This review changes documentation only. It does not implement the proposed gaps.
