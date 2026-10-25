# Architecture decisions and remaining work

The baseline is a dedicated-enterprise deployment with a provider-neutral control plane and the banking reference domain. Preserve the existing chat/orchestrator/adapter architecture while closing verified gaps. This page is a follow-up list, not a statement that all items are already implemented.

## Preserve these boundaries

- Published behavior is separate from server-owned endpoint/credential registries.
- Domain authorization and financial policy floors remain authoritative beneath editable intent settings.
- Workflow continuations pin releases; retries retain operation identity; ambiguous side effects require reconciliation.
- Model-provider choice does not authorize model-generated tools or arbitrary workflow code.
- A configured adapter and passing fixtures do not prove a customer's actual provider is reachable or production validated.

See the [current gap assessment](../guides/platform-gap-assessment.md) for the
market comparison, delivered response-quality/case-workspace/recovery changes,
and prioritized acceptance criteria.

## Current follow-ups

| Area | Evidence and next decision |
| --- | --- |
| Domain modularity | Canonical catalogs, workflow branches, validators, and formatters still contain banking logic. A platform/domain-pack contract should make those dependencies explicit before another domain is advertised. Generic case/knowledge intents are supported without creating arbitrary executable workflows. |
| Internal ingress | NLU/MCP now enforce the production service-token gate, with authenticated caller/header tests. Verify private ingress/TLS in the target deployment. Keep internal services private; do not treat CORS as access control. |
| Startup/readiness | Distinguish process liveness, configured capability, verified dependency readiness, and successful external-provider validation. Fail deployment preflight on missing required secrets/schemas rather than labeling a configured URL healthy. |
| Persistence | Production graph checkpoints, effect ledger and sessions now persist in PostgreSQL. NLU context/cache and socket routing remain process-local. Qualify realtime failover and database restore separately; retain and archive checkpoints under an explicit policy. |
| Provider compatibility | Verify the selected Mac Studio address/model and enterprise identity, voice, CRM, and cloud credentials in the target environment. The repo's WebSocket MCP adapter is not a blanket interoperability certification. |
| Schema lifecycle | Controlled repeatable SQL and verification-only production startup now cover model tables, ledger, and grants. Use least-privilege application users and assess existing legacy column types before upgrades. |
| Operational recovery | Exercise uncertain financial outcomes, outbox retries/dead letters, terminal-session write failures, and one-time handoff consumption before rollout. |
| Deployment drift | Keep ports, route prefixes, environment variables, provider manifests, preflight checks, and the two supported root Compose paths aligned. Retire duplicate helper paths only after their callers move. |
| Documentation | Maintain service entry-point docs and root guides; keep dated completion/review artifacts explicitly historical. Avoid copying old readiness claims into active instructions. |

The legacy `NLP_SERVICE_URL` compatibility name still points at the NLU service; there is no separate NLP service in the canonical monorepo. Browser REST traffic enters through the gateway and Socket.IO through chat. See [overview](overview.md), [runtime contracts](../../services/ai-orchestrator/CONTROL-PLANE-RUNTIME.md), and [model providers](../guides/llm-providers.md) for implemented behavior.
