# Platform services

These are the canonical services for a dedicated-enterprise servicing deployment. Banking is the current reference domain; control-plane configuration, operational cases/evidence, and provider registries are reusable platform capabilities. Health checks and historical completion reports are not production-readiness certificates.

| Service | Default port | Current documentation |
| --- | --- | --- |
| React/Vite frontend and control-plane console | 3000 | [frontend](frontend/README.md) |
| API gateway, control plane, identity, operations | 3001 | [gateway](api-gateway/platform/README.md) |
| Legacy NLU and NLP compatibility | 3003 | [NLU](nlu-service/README.md) |
| Banking tool adapter | 3004 | [MCP](mcp-service/README.md) |
| Authoritative banking APIs | 3005 | [banking](banking-service/README.md) |
| Customer REST/Socket.IO sessions | 3006 | [chat](chat-backend/README.md) |
| Governed workflow and model runtime | 3007 | [orchestrator](ai-orchestrator/README.md) |
| Express/static agent interface | 8081 | [agent UI](agent-ui/server.js) |

There is no separate `nlp-service`; legacy NLP variables/routes resolve to NLU compatibility endpoints. The control plane and operations run inside the gateway process, not on additional service ports.

## Start and verify

Use Node 22 and the repository's root environment/launch workflow:

```bash
npm install
npm run dev
```

Configure dependencies and secrets first using the [setup documentation](../docs/getting-started/configuration.md). Supported root Compose entry points are [local](../docker/docker-compose.local.yml) and [full stack](../docker/docker-compose-full-stack.yml). Service-specific historical Docker scripts are not substitutes for those deployment contracts.

Run an individual workspace test suite with `npm test -w services/<service> -- --runInBand`. Database recovery tests need an isolated `RUNTIME_TEST_DATABASE_URL`; provider fixture tests do not contact a real model host.

## Architecture and governance

Start with the [architecture overview](../docs/architecture/overview.md), [published runtime contract](ai-orchestrator/CONTROL-PLANE-RUNTIME.md), [productization guide](../docs/guides/productization.md), and [LLM provider guide](../docs/guides/llm-providers.md). The model target for initial Qwen validation is the separate Mac Studio; its reachable address/model must be configured and verified explicitly.

Documents marked **Historical** preserve earlier implementation notes and test evidence. Follow their linked current references for live routes, ports, security, persistence, and deployment behavior.
