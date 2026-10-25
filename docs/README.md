# Documentation index

Reviewed against the canonical `services/*` implementation on October 24, 2026.
Start here for current instructions. Service routes, configuration validators and
executable migration scripts resolve conflicts with old implementation reports.

## Start and operate

| Task | Current guide |
| --- | --- |
| Run the app locally | [Quick start](getting-started/quick-start.md) |
| Configure services and credentials | [Configuration](getting-started/configuration.md) |
| Prepare a dedicated production deployment | [Deployment](guides/deployment.md) |
| Check platform health and reuse solution packages | [Platform readiness and solutions](guides/platform-readiness.md) |
| Connect Qwen on the separate Mac Studio | [Model providers](guides/llm-providers.md) |
| Investigate a failed startup or request | [Troubleshooting](reference/troubleshooting.md) |
| Develop and verify changes | [Development](guides/development.md) |

## Product and architecture

| Topic | Current source |
| --- | --- |
| System boundaries and data flow | [Architecture overview](architecture/overview.md) |
| Deterministic banking contracts and model limits | [Determinism](architecture/determinism.md) |
| Prompt/intent/channel authoring and release governance | [Control plane](guides/control-plane.md) |
| SOP import, procedure retrieval and enforced guardrails | [Procedures and guardrails](guides/procedures-and-guardrails.md) |
| Continue an owned conversation across Digital, AVA and IVR | [Channel switching](guides/channel-switching.md) |
| Operator workflows and permissions | [Studio guide](../services/frontend/OPERATIONS-CONSOLE.md) |
| Fulfillment, OIDC, evidence, privacy and recovery | [Operations runbook](guides/servicing-operations.md) |
| Model plugin protocol and credentials | [Plugin contract](../services/ai-orchestrator/src/llm/README.md) |
| Pinned runtime behavior and durable effect records | [Runtime reference](../services/ai-orchestrator/CONTROL-PLANE-RUNTIME.md) |
| Enterprise packaging and supported boundaries | [Productization](guides/productization.md) |
| Delivered market gaps and verification evidence | [Implementation record](guides/servicing-product-implementation.md) |
| Recent integration changes, fixes and qualification scope | [Change review](guides/recent-changes-review.md) |
| Requirements hardening, compatibility changes and acceptance scope | [Requirements review](guides/requirements-compliance.md) |
| Backend adapter contract and restrictions | [Backend integration](guides/backend-integration-framework.md) |
| Digital assistant pilot acceptance | [Pilot checklist](guides/digital-assistant-pilot-checklist.md) |
| Current gaps, new implementation and differentiation | [Platform assessment](guides/platform-gap-assessment.md) |
| Measured model responses and exact-evidence release gates | [Response quality](guides/model-evaluation.md) |
| Case assignment, citations and handling | [Agent workspace](../services/api-gateway/operations/AGENT-WORKSPACE.md) |
| Vendor comparison and differentiation | [Market review](guides/market-comparison.md) |
| Dependency audit and runtime/build-tool scope | [Dependency review](architecture/dependency-audit.md) |
| Remaining architecture work | [Recommendations](architecture/recommendations.md) |

## API and service references

The [API overview](api/README.md) distinguishes external ingress, internal service
contracts and historical OpenAPI artifacts. Detailed references are owned by the
[control plane](../services/api-gateway/control-plane/README.md),
[platform](../services/api-gateway/platform/README.md),
[banking service](../services/banking-service/API-DOCUMENTATION.md),
[chat service](../services/chat-backend/README.md),
[orchestrator](../services/ai-orchestrator/README.md),
[MCP service](../services/mcp-service/README.md) and
[NLU service](../services/nlu-service/README.md). The [agent service reference](../services/agent-ui/README.md) documents verified role and current-assignment enforcement for its dashboard and sockets.

The [documentation review record](reference/documentation-review.md) describes
the source-of-truth audit and automated local-link check.

## Reading older documents

`docs/archive/`, `README.old.md`, old completion/review/test reports and historical
diagrams preserve earlier engineering records. A historical banner points to
current guides; old counts, ports, credentials, endpoint lists and readiness
claims are not present-day acceptance evidence. Historical content is retained
for context, rather than silently rewritten as if it described the current app.
The two pre-existing white-paper review drafts are outside this implementation.

The canonical deployment uses `services/*`. The `packages/*` tree and
`docker-compose-enterprise.yml` are legacy/experimental. The supported dedicated
Compose path combines the full-stack manifest with the production overlay and
requires explicit secrets, migrations, TLS ingress and customer qualification.
A passing unit suite or static preflight alone does not establish a production
SLA, compliance certification, live IVR readiness or measured model quality.
