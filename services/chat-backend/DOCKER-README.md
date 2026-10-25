# Chat deployment

Use the root [local Compose](../../docker/docker-compose.local.yml) or [full-stack Compose](../../docker/docker-compose-full-stack.yml), plus the supported production overlay/preflight when targeting production. Service port is 3006; gateway REST is 3001. Socket.IO clients need the chat `/socket.io` endpoint routed by the deployment ingress.

Configure verified JWT/tenant identity, allowed origins, shared `SERVICING_SERVICE_TOKEN`, AI/NLU service URLs, and `CHAT_PERSISTENCE_ENABLED=true`. Production requires PostgreSQL for chat state and one-time grants. Apply [migrations V1–V6](migrations/) in order using the controlled migration job. Set `DATABASE_MANAGE_SCHEMA=false` and `HANDOFF_SCHEMA_AUTO_MIGRATE=false` after migration; startup then verifies required tables/columns without creating them. The default schema management mode is false in production, true otherwise.

`HANDOFF_DATABASE_URL` must address the intended chat database; fallback uses `DB_*`. Application users should have the privileges needed for data and advisory locks, with DDL owned by the migration identity. Existing legacy timestamp types are not silently rewritten by repeatable creation SQL; assess migration needs before upgrading an older database.

NLU requests carry the server internal credential and never redirect it. Orchestrator requests carry the customer JWT. The default orchestration budget is 400000 ms and NLU budget 5000 ms; coordinate ingress/browser timeouts with provider profiles. Do not add automatic retry after an ambiguous financial outcome.

Health is liveness/operational evidence, not a production certificate. Persistent messages alone do not distribute socket rooms or process caches. Test real database recovery, identity-bound handoff, ingress routing, and selected external providers in the target environment. Run `npm test -w services/chat-backend -- --runInBand`, with an isolated `RUNTIME_TEST_DATABASE_URL` for PostgreSQL tests.

See [API and configuration](README.md), [architecture](ARCHITECTURE.md), [handoff recovery](SESSION-RESUME-FLOW.md), and [servicing runtime](../ai-orchestrator/CONTROL-PLANE-RUNTIME.md).
