# Banking tool adapter (MCP service)

The service on port **3004** exposes the implemented banking-tool catalog through HTTP and the repository's JSON-RPC WebSocket adapter. Both transports call the same tool definitions/handlers and the authoritative banking API. It is not a general plugin marketplace, model host, or proof of interoperability with every MCP client.

## Current references

- [Source organization and extension boundary](MODULAR-ORGANIZATION.md)
- [Deployment and verification](DEPLOYMENT.md)
- [Orchestrator transport integration](../ai-orchestrator/MCP-INTEGRATION-README.md)
- [Published execution/reconciliation contract](../ai-orchestrator/CONTROL-PLANE-RUNTIME.md)

Older implementation-complete, banking-update, and test-report documents are historical records.

## Runtime contract

The active entry point is [src/server.js](src/server.js), which loads [src/config/config.js](src/config/config.js). The older top-level `config/` surface is not the canonical server configuration. `MCP_SERVICE_PORT` controls the listener (default 3004). `BANKING_SERVICE_URL` is normalized by the tool implementation to a single `/api/v1` suffix; pass a service origin or an already normalized base.

The current [tool catalog](src/tools/completeBankingTools.js) contains 29 definitions across authentication, accounts, transactions, transfers, cards, fraud, and disputes. Use discovery to obtain exact names and schemas rather than relying on old counts or shortened aliases. Examples include `banking_get_accounts`, `banking_get_balance`, `banking_create_transfer`, `banking_activate_card`, and `banking_verify_transaction`.

Tool arguments are validated before dispatch. Domain bearer credentials are supplied as `parameters.authToken` and forwarded to the banking API; the bank enforces customer ownership and business rules. The internal servicing-service credential authenticates the calling service and must not be forwarded to banking or a model provider. Published intent/confirmation/ledger controls live in the orchestrator; invoking this lower-level adapter is not equivalent to running that workflow.

## HTTP endpoints

| Method | Direct service path | Purpose |
| --- | --- | --- |
| GET | `/health` | Minimal process health |
| GET | `/api` | Service/protocol description |
| GET | `/api/mcp/health` | Adapter health |
| GET | `/api/mcp/tools` | Tool discovery |
| GET | `/api/mcp/tools/:toolName` | One tool schema |
| GET | `/api/mcp/categories` | Catalog categories |
| POST | `/api/mcp/validate` | Validate `{tool,parameters}` without dispatch |
| POST | `/api/mcp/execute` | Execute `{tool,parameters,sessionId?}` |
| POST | `/api/mcp/execute-batch` | Execute `{tools:[{tool,parameters}],sessionId?}` sequentially |

Batch execution is not a database transaction and does not replace workflow idempotency. The canonical prefix is `/api/mcp`; gateway routing must preserve it.

Read-only internal example:

```bash
curl http://localhost:3004/api/mcp/tools \
  -H "X-Servicing-Service-Token: $SERVICING_SERVICE_TOKEN"
```

In production or when `INTERNAL_SERVICE_AUTH_REQUIRED=true`, internal HTTP/upgrade requests require the server service token. Health remains public and safe. Development compatibility without the gate is not a production security configuration. Keep this service private to trusted callers and use the gateway/orchestrator rather than exposing it as a public banking workflow API.

## WebSocket adapter

The advertised address is `ws://host:3004/mcp`. The implementation handles JSON-RPC `initialize`, `notifications/initialized`, `tools/list`, `tools/call`, `resources/list`, `prompts/list`, `logging/setLevel`, and `ping`. The server advertises protocol version `2024-11-05`; this describes its implementation, not a claim that it supports every contemporary MCP transport, client, or extension. No runnable stdio or Streamable HTTP entry point is established by the current server.

Supply the servicing-service header during the authenticated upgrade; query-string credentials are not accepted. Tool calls still need the domain credentials declared by their input schemas.

## Generic backend adapters

The private `/api/adapters` administrative API loads server-owned declarations from
`ADAPTERS_CONFIG_PATH`. It always requires a strong `X-Servicing-Service-Token`,
including development, and applies bounded schema validation and pinned HTTPS
egress. Generic tools are not added to the existing MCP protocol/tool catalog or
governed customer workflow automatically.

Production executes GET tools only. Mutations require an explicit
`ADAPTER_PILOT_MUTATIONS_ENABLED=true` outside production; production always denies
them until customer authorization, confirmation and durable effect-ledger contracts
are integrated. Pilot replay is argument-bound and concurrent-safe within one
process, with explicit uncertainty; it does not survive restart or span replicas.

See [the adapter contract and operating limits](../../docs/guides/backend-integration-framework.md)
and [fictional example](adapters.example.json). No credential values belong in
adapter declarations, browser configuration or request bodies.
