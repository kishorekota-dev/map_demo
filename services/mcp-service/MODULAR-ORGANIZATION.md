# MCP service source map

| File | Responsibility |
| --- | --- |
| [src/server.js](src/server.js) | HTTP/WebSocket host, safe liveness, internal authentication, route mounts |
| [src/config/config.js](src/config/config.js) | Active server configuration (`MCP_SERVICE_PORT`, default 3004) |
| [internalServiceAuth.js](src/middleware/internalServiceAuth.js) | Mandatory production service-token validation for HTTP and WebSocket upgrades |
| [mcpApi.routes.js](src/routes/mcpApi.routes.js) | `/api/mcp` discovery, validation, execution, sequential batch |
| [mcpProtocolServer.js](src/mcp/mcpProtocolServer.js) | Repository JSON-RPC WebSocket protocol implementation |
| [completeBankingTools.js](src/tools/completeBankingTools.js) | 29 reviewed banking tool definitions, parameter checks, fixed domain HTTP calls |

The service is an adapter to banking, not an independent authorization or workflow engine. Banking receives the customer's domain bearer token and applies its own policy. Internal service secrets are never forwarded to banking or a model provider. New domains require reviewed adapters; changing prompt text cannot create executable tools.

Some legacy configuration/helper files remain in the tree. The server imports shown above are authoritative. See [API contract](README.md), [deployment](DEPLOYMENT.md), and [orchestrator integration](../ai-orchestrator/MCP-INTEGRATION-README.md).
