# Quick start

Run commands from the repository root. Use Node.js 22 and npm 10 or later; PostgreSQL 15 and Redis 7 are the versions used by the current Compose files. The application has eight services. A model server is optional for the default deterministic servicing flow.

## Install and configure

```bash
git clone https://github.com/kishorekota-dev/map_demo.git
cd map_demo
node --version
npm --version
# Preserve an existing development configuration.
test -f .env.development || cp .env.example .env.development
npm ci
```

The root development configuration is loaded by `scripts/run-with-env.sh`. Before starting, review it against [Configuration](configuration.md). For the local persistent setup, set these non-secret options in that file:

```dotenv
CHAT_PERSISTENCE_ENABLED=true
HANDOFF_STORAGE=postgres
WORKFLOW_DURABLE_EXECUTION=true
MOCK_DIALOGFLOW=true
MOCK_EXTERNAL_AI_SERVICES=true
```

The mock flags apply to the legacy NLU integration. Published model profiles are configured separately. Keep credentials in local configuration or a secret store, never in browser runtime config. Use the development database credentials matching the supplied Compose PostgreSQL service; do not reuse them for enterprise deployments.

## Option A: application processes on the host

Start infrastructure, then initialize the development databases. Install the PostgreSQL client tools (`psql` and `createdb`) on the host first.

```bash
./scripts/run-with-env.sh docker compose -f docker/docker-compose.local.yml up -d postgres redis
./scripts/run-with-env.sh npm run db:setup
./scripts/run-with-env.sh npm run db:seed
npm run dev
```

Wait for PostgreSQL to be ready before database setup. `db:setup` creates `poc_banking`, `poc_chat` and `ai_orchestrator`; chat and orchestrator startup initialize their model tables. Gateway configuration/operations and durable runtime/handoff tables have separate schema management, described in [Deployment](../guides/deployment.md#database-initialization-and-upgrades).

`npm run dev` starts frontend, gateway, chat, banking, NLU, MCP, orchestrator and agent UI. Individual commands include `dev:frontend`, `dev:gateway`, `dev:chat`, `dev:banking`, `dev:nlu`, `dev:mcp`, `dev:ai` and `dev:agent`. Keep infrastructure running while using them. Stop the foreground development command with Ctrl-C.

## Option B: all services in Docker

Choose one Compose stack; do not run it alongside host application processes on the same ports.

```bash
npm run docker:build
npm run docker:up
./scripts/run-with-env.sh docker compose -f docker/docker-compose.local.yml ps
```

Both current Compose files contain PostgreSQL, Redis and all eight application services. The local file uses the Vite development frontend; `npm run docker:full` builds and starts the static frontend variant. These are development/reference stacks with sample credentials, not finished enterprise deployment manifests.

On an empty PostgreSQL volume, initialization creates the three databases. The local banking container runs migrations and explicitly enabled demo seeds, and stops on failure. Production forbids demo seeding and uses separate migration jobs.

Use `npm run docker:logs` to inspect startup. `npm run docker:down` stops/removes local-stack containers while preserving named data volumes. PostgreSQL initialization scripts do not rerun merely because an existing volume's container is recreated.

## Open the application

| Surface | Default address |
| --- | --- |
| Customer application | http://localhost:3000 |
| Servicing Studio and operations console | http://localhost:3000/control-plane |
| API gateway | http://localhost:3001 |
| Agent dashboard | http://localhost:8081 |
| Banking API documentation | http://localhost:3005/api/docs |

For the **local demo only**, banking seeds create customer `james.patterson` with password `Password123!`. This customer does not have operator privileges. Servicing Studio requires a signed administrator or control-plane role. Migration V9 creates role definitions; use the offline [administrator bootstrap](../guides/platform-readiness.md#bootstrap-the-first-administrator) for a new deployment, then sign in again. Existing authorized administrators can assign roles through the database administration procedure. See [Control plane](../guides/control-plane.md).

## Verify and configure models

```bash
npm run health
curl --fail http://localhost:3001/health/services
# Read sanitized registry configuration without contacting a model.
npm run llm:probe -- --list
```

Health checks show service availability; they do not prove a customer journey, external fulfillment adapter, identity provider or model is ready. Test a signed customer session and the relevant governed journey before use.

Follow [Model providers](../guides/llm-providers.md) for Qwen on a separate Mac Studio, LM Studio/vLLM or cloud adapters. The example hostname and model tag must match your actual server. Provider discovery contacts that server; inference requires an explicit test or published enabled model profile. The default published model configuration is disabled, so ordinary startup does not establish model connectivity.

Next: [Development](../guides/development.md), [Deployment](../guides/deployment.md), [Servicing operations](../guides/servicing-operations.md), and [Troubleshooting](../reference/troubleshooting.md).
