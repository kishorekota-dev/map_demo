# Deploying the MCP adapter

Use Node 22 and the root [local Compose](../../docker/docker-compose.local.yml) or [full-stack Compose](../../docker/docker-compose-full-stack.yml), with the production overlay/preflight for a target environment. The service listens on `MCP_SERVICE_PORT` (default 3004), mounts HTTP tools at `/api/mcp`, and exposes the repository WebSocket transport normally at `/mcp`.

Production, or `INTERNAL_SERVICE_AUTH_REQUIRED=true`, requires a server-only `SERVICING_SERVICE_TOKEN` of at least 32 bytes that is not an obvious placeholder. Missing/weak configuration aborts startup. HTTP APIs and WebSocket upgrades require `X-Servicing-Service-Token`; query tokens and customer JWTs alone do not authenticate the calling service. Safe GET `/health` and `/api/mcp/health` remain public. Keep internal ports private and terminate TLS at the deployment boundary.

The gateway replaces browser-provided internal credentials with its server credential only for NLU/MCP targets. AI sends the credential on every HTTP request/upgrade. The bank-facing adapter uses `BANKING_SERVICE_URL` normalized to `/api/v1`, `API_TIMEOUT`, and the customer's separate `authToken`; it does not propagate the service secret.

From repository root: `npm test -w services/mcp-service -- --runInBand`. Auth tests cover missing/forged/query credentials, rotation, HTTP and WebSocket access; tool tests use fixed provider fixtures. A passing health check proves process availability, not bank authorization, external interoperability, or production capacity. Test those in the intended environment before traffic.

See [API](README.md) and [orchestrator replay/reconciliation](../ai-orchestrator/CONTROL-PLANE-RUNTIME.md).
