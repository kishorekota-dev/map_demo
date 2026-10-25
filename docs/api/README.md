# API overview

The normal external entry point is the API gateway, `http://localhost:3001/api`
in local development and an HTTPS ingress in a deployed installation. The
production Compose overlay keeps service ports private and exposes the frontend
and gateway on host loopback for a separately configured TLS ingress.

## Route families

| Gateway prefix | Owner and purpose | Authentication |
| --- | --- | --- |
| `/api/banking/v1/auth` | Banking login, refresh, logout and user identity | Login/refresh have their own validation; protected operations require access JWTs |
| `/api/banking/v1` | Banking accounts, transfers, cards, transactions, fraud and disputes | Signed user access JWT plus domain ownership/authorization |
| `/api/chat`, `/api/sessions` | Customer messages, owned sessions, explicit interrupted-request recovery and one-time channel handoffs | Signed customer JWT; session ownership enforced |
| `/api/orchestrator` | Governed workflows, feedback, session context and financial exception reconciliation | Signed tenant JWT; extra operator scopes for context/reconciliation |
| `/api/orchestrator/llm/evaluate` | Internal bounded synthetic model probe, without tools | Short-lived run-scoped delegation JWT plus service credential; ordinary customer/editor tokens cannot invoke it |
| `/api/orchestrator/llm` | Sanitized server model registry, model discovery and fixed synthetic tests | Operator viewing roles; editor/admin for tests |
| `/api/control-plane` | Drafts, simulation, publish/rollback, work, suites, knowledge, environments and approvals | Signed deployment tenant; operation-specific control-plane role |
| `/api/quality` | Synthetic model probes, persisted results, comparison and exact-fingerprint release policy | Signed operator read; editor/admin run; admin policy |
| `/api/operations` | Connections, executed cases, callbacks, identity mappings, evidence, retention and measured costs | Operation-specific signed roles; runtime writes also require internal service identity |
| `/api/identity` | OIDC code/PKCE login, callback, browser session and logout | Bound login state and HTTP-only session; role mapping is server-owned |
| `/api/platform` | Readiness diagnostics, extension catalog and governed solution packages | Operator view; editor/admin for package preview/apply |
| `/api/nlu`, `/api/nlp` | Intent/context analysis and compatibility contracts | Gateway JWT; production internal hop also requires service credential |
| `/api/mcp` | Registered banking tool metadata/execution | Gateway JWT plus internal service credential; banking actions still require customer authorization |

The frontend's default local login calls banking directly. A production runtime
config can use the gateway auth prefix. OIDC uses the gateway `/api/identity`
routes and the registered public HTTPS callback. Never place a server secret in
frontend runtime JSON or a query string.

## Current references

- [Measured model evaluation](../guides/model-evaluation.md) and
  [agent workspace](../../services/api-gateway/operations/AGENT-WORKSPACE.md).
- [Control-plane API](../../services/api-gateway/control-plane/README.md):
  payloads, revision conflicts, publish gates, pagination and runtime policy.
- [Platform API](../../services/api-gateway/platform/README.md): package
  manifests, reviewed diffs, imports/exports and readiness scope.
- [Model management and generation contract](../../services/ai-orchestrator/src/llm/README.md).
- [Banking API](../../services/banking-service/API-DOCUMENTATION.md) and
  [banking quick reference](../../services/banking-service/API-QUICK-REFERENCE.md).
- [Chat/session API](../../services/chat-backend/README.md) and
  [orchestrator API](../../services/ai-orchestrator/README.md).
- [Provider callback/fulfillment/identity contracts](../guides/servicing-operations.md)
  and [usage/cost API](../../services/api-gateway/operations/USAGE.md).

Internal NLU/MCP URLs are service-network addresses, not public customer APIs.
Production or `INTERNAL_SERVICE_AUTH_REQUIRED=true` requires
`X-Servicing-Service-Token` on those HTTP/WebSocket hops. The gateway discards a
caller-supplied service credential and injects its configured identity. A service
credential does not replace a customer's banking access token.

## Responses and concurrency

Service response envelopes differ; use the examples for the route owner rather
than assuming all responses have `data.data`. Configuration writes require the
current revision and return 409 on stale state. Package application additionally
requires the reviewed package digest and base-draft fingerprint. Banking tools,
cases, callbacks and handoffs each have their own idempotency/ownership contract;
a request ID by itself does not make a financial mutation safe to retry.

`/health` and `/health/live` are gateway liveness. `/health/ready` returns 200 or
503 after required storage/Redis/downstream checks and exposes only probe state.
Detailed diagnostics require an operator at `/api/platform/readiness`. Health
checks do not invoke models or execute financial tools. The former public
`/health/services` URL now returns the same minimal readiness contract.

## OpenAPI artifacts

The `poc-*.swagger.yaml` files in [openapi](openapi/) are historical design
artifacts and are not a complete conformance specification for the current
servicing platform. In particular, they do not establish current control-plane,
OIDC, solution-package or provider-callback coverage. Use route-owned references
above and the actual route validators/tests when integrating. Adding an endpoint
requires updating its service documentation and regression contract tests.
