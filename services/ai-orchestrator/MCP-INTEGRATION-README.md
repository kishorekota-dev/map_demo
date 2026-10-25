# MCP integration

The orchestrator uses [enhancedMCPClient](src/services/enhancedMCPClient.js) to select the existing HTTP or WebSocket adapter. HTTP is the default (`MCP_TRANSPORT=http`), with origin `MCP_SERVICE_URL=http://localhost:3004`. HTTP execution uses `/api/mcp/execute`; discovery uses `/api/mcp/tools`. URL normalization accepts an origin or recognized legacy suffix.

`MCP_TRANSPORT=protocol` selects the SDK client with the repository's Node WebSocket transport at `MCP_PROTOCOL_URL` (normally `ws://localhost:3004/mcp`). `auto` allows transport preference/fallback. This custom WebSocket pairing is tested within the repository; it is not a claim of stdio or Streamable HTTP support, or interoperability with every external MCP server. The enhanced wrapper can use HTTP if a preferred protocol connection was not established; do not describe it as strict protocol isolation.

HTTP requests and each WebSocket upgrade send the current server `SERVICING_SERVICE_TOKEN` through `X-Servicing-Service-Token`. Tokens are not query parameters and redirects are disabled. The service gate is mandatory in production or with `INTERNAL_SERVICE_AUTH_REQUIRED=true`. A banking customer's JWT remains a separate `parameters.authToken`, checked by banking authorization; the internal credential never becomes a banking parameter or cloud credential.

Read-only `banking_get_*` calls may retry according to configured read policy. State-changing actions do not retry or cross-transport fail over after dispatch. The [durable ledger](CONTROL-PLANE-RUNTIME.md#concurrency-idempotency-and-uncertain-outcomes) prevents repeated financial dispatch and records uncertain results for reconciliation. Batch HTTP execution is sequential, not an atomic transaction.

See [MCP service API](../mcp-service/README.md), [HTTP client](src/services/mcpClient.js), [SDK client](src/services/trueMCPClient.js), and [Node transport](src/services/serviceWebSocketTransport.js). Run service suites with synthetic fixtures; the historical integration scripts may require a live deployment and must not be treated as isolated tests.
