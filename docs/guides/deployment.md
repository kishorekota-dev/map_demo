# Deployment

The repository supports host development, local Docker Compose and a dedicated production Compose overlay. The overlay provides configuration checks, private service networking, explicit migrations and bounded resources; it still requires your TLS ingress, secret distribution, provider integration and operational qualification. It is not a hosted multitenant SaaS installer.

## Choose the deployment path

| Path | Current behavior |
| --- | --- |
| Host development | Node 22 processes through root npm scripts; PostgreSQL/Redis separately |
| `docker-compose.local.yml` | All eight applications plus PostgreSQL/Redis; Vite development frontend and demo settings |
| `docker-compose-full-stack.yml` | Same topology with static frontend; service mode follows `NODE_ENV` (development by default) |
| Full-stack + `docker-compose.production.yml` | Dedicated production overlay with required secrets, private internal services, mounted config, authenticated Redis and explicit schema ownership |
| PM2 ecosystem | Seven server processes; frontend deployed separately; requires completed per-service configuration and migrations |

`docker/docker-compose.yml` and `docker/docker-compose-enterprise.yml` contain legacy layouts. Do not use them for the current `services/*` application. A profile's `kubernetes` deployment label does not generate an application chart or establish cluster readiness.

## Local Docker deployment

```bash
npm run docker:build
npm run docker:up
./scripts/run-with-env.sh docker compose -f docker/docker-compose.local.yml ps
npm run health
```

Use `npm run docker:logs` and `npm run docker:down` for this same stack. Named PostgreSQL/Redis volumes survive `down`. Both supported base Compose files expose the standard development ports: frontend 3000, gateway 3001, NLU 3003, MCP 3004, banking 3005, chat 3006, orchestrator 3007, agent UI 8081, PostgreSQL 5432 and Redis 6379. The production overlay removes internal host ports. Application containers run as non-root users with dropped capabilities; provision mounted secrets/configuration so the intended container user can read them, without making credentials public.

## Dedicated production deployment

Use Node 22/npm 10 for tooling and Docker Compose **2.24.4 or later**. The overlay uses `!reset`/`!override` to replace inherited port lists safely. Only frontend `127.0.0.1:3000` and gateway `127.0.0.1:3001` remain host-published. Put a controlled TLS ingress in front of them; databases, NLU, MCP, banking, chat, orchestrator and agent UI remain on the Compose network.

1. Copy [`.env.production.example`](../../.env.production.example) to a protected deployment path and complete it. Use distinct high-entropy JWT, internal service, session and audit keys, plus strong URL-safe PostgreSQL/Redis passwords. The template contains no usable credentials. Set a non-default deployment tenant and exact HTTPS browser origins.
2. Create PostgreSQL URLs targeting private service `postgres`, user `poc_user`: `poc_banking` for configuration/operations, `ai_orchestrator` for workflow/base AI tables and `poc_chat` for chat/handoff. Their passwords must match `POSTGRES_PASSWORD`. Configure authenticated `REDIS_URL` for private host `redis`, matching `REDIS_PASSWORD`.
3. Supply absolute host paths for `FRONTEND_RUNTIME_CONFIG_FILE`, `LLM_PROVIDERS_HOST_FILE` and `CONNECTOR_SECRET_HOST_DIR`. The secret directory may be empty. Mounts are read-only and refuse to create missing host paths. An empty [production registry example](../../config/product/llm-providers.production.example.json) keeps model adapters unconfigured until deliberately enabled.
4. Configure identity, public endpoints and any provider-specific mounts. The frontend config is public; it must not contain credentials. Set `features.allowTokenAuth=false`, the correct tenant/endpoints and `chatRequestTimeoutMs=420000` unless changing all timeout layers together.
5. Validate, provision infrastructure, migrate, then start the applications:

```bash
export APP_ENV_FILE=/absolute/path/deployment.env
npm run production:preflight -- --env "$APP_ENV_FILE" --compose

./scripts/run-with-env.sh docker compose \
  -f docker/docker-compose-full-stack.yml -f docker/docker-compose.production.yml \
  up -d postgres redis

# Explicit banking migrations; does not launch the banking server or seed demo data.
./scripts/run-with-env.sh docker compose \
  -f docker/docker-compose-full-stack.yml -f docker/docker-compose.production.yml \
  run --rm --build --no-deps --entrypoint node banking-service database/scripts/migrate.js

# Configuration, operations, AI base/ledger and chat base/handoff schemas.
./scripts/run-with-env.sh docker compose \
  -f docker/docker-compose-full-stack.yml -f docker/docker-compose.production.yml \
  run --rm --build servicing-migrations

./scripts/run-with-env.sh docker compose \
  -f docker/docker-compose-full-stack.yml -f docker/docker-compose.production.yml \
  up -d --build
```

Wait for PostgreSQL to be healthy before running the banking job. A failed migration stops its job; do not start application traffic until all jobs succeed. The default overlay disables banking runtime migrations, Sequelize schema management and servicing runtime DDL. Bootstrap the required banking/operator identities through your approved administrative process; production rejects demo seeding.

```bash
curl --fail http://127.0.0.1:3001/health/ready
./scripts/run-with-env.sh docker compose \
  -f docker/docker-compose-full-stack.yml -f docker/docker-compose.production.yml ps
```

The preflight is static and makes no model or database calls. `--compose` renders/validates the merged configuration without starting services or printing resolved credentials. Passing it does not prove live OIDC, model quality, connector contracts, restore capability or capacity. Readiness checks dependencies and schemas; qualify complete signed customer journeys separately.

The bundled database user owns the local Compose database. An enterprise using managed PostgreSQL should provision distinct migration/runtime roles, TLS and backups, then adapt the overlay to its topology. Do not point the bundled schema jobs at an unrelated shared database without reviewing ownership and migration effects.

## Database initialization and upgrades

| Owner | Schema source / command |
| --- | --- |
| Banking domain and roles | `services/banking-service/database/migrations`; `npm run db:migrate` under the banking `DB_*` environment |
| Control-plane releases, drafts and records | `services/api-gateway/control-plane/schema.sql`; `platform:migrate --component control-plane` |
| Operations, jobs, identity and evidence | `services/api-gateway/operations/schema.sql`; `platform:migrate --component operations` |
| AI model tables and financial dispatch ledger | `services/ai-orchestrator/migrations/V0__ai_model_tables.sql` and V1; `platform:migrate --component workflow` |
| Chat sessions/messages and resume grants | `services/chat-backend/migrations/V1` through V6; `platform:migrate --component handoff` |

For non-container deployments:

```bash
npm run platform:migrate -- --env /absolute/path/migration.env
```

The CLI requires explicit `CONTROL_PLANE_DATABASE_URL`, `OPERATIONS_DATABASE_URL`, `WORKFLOW_DATABASE_URL` and `HANDOFF_DATABASE_URL`. It applies each component in its own transaction with an advisory lock, stops on failure and emits sanitized status. It does not create databases, run banking migrations or seed identities. Use migration-owner credentials and grant the runtime only the required database access.

`DATABASE_MANAGE_SCHEMA=false` makes production chat/AI startup verify model tables/columns without calling Sequelize synchronization. `CONTROL_PLANE_MANAGE_SCHEMA=false`, `OPERATIONS_MANAGE_SCHEMA=false`, `WORKFLOW_SCHEMA_AUTO_MIGRATE=false` and `HANDOFF_SCHEMA_AUTO_MIGRATE=false` similarly require pre-applied servicing schemas. Keep the workflow/handoff migration URLs aligned with each service's base database. Root `db:setup` is a development bootstrap, not this production process.

Review migration history and upgrade behavior on staging backups before rollout. Do not modify deployed migration versions or drop volumes to force reinitialization. PostgreSQL Docker init scripts only run on empty volumes.

## Ingress, identity and models

Route the browser application to frontend and `/api` to the gateway while preserving API paths. If using Socket.IO, route `/socket.io` with upgrade/polling support to chat through a deliberately configured private ingress route. The production overlay does not publish the chat port directly. The separate agent UI likewise needs an explicit authenticated ingress route if used.

The gateway exposes banking routes under `/api/banking`; when using that route, a public banking authentication base is `/api/banking/v1`. Verify the actual ingress rewrites against login/refresh/logout and OIDC callbacks. Avoid frontend URLs that name Docker services or inaccessible internal banking ports.

Use same-site HTTPS frontend/API deployment for the OIDC cookie policy. Supply the explicit issuer, client ID, authorization/token/JWKS endpoints and `/api/identity/callback` redirect. Local mappings bind an exact issuer/subject to an authorized banking user and roles. `AUTH_PROVIDER` is metadata, not automatic federation setup. SAML is unsupported by the current broker. See [Servicing operations](servicing-operations.md#enterprise-identity).

Follow [Model providers](llm-providers.md) to enable Qwen or other adapters. Model registry files, Vertex ADC, optional signing keys and connector secrets must exist at their configured runtime paths. The overlay mounts the registry and connector secret directory; additional ADC/signing-key mounts require a reviewed override. Model/connector credentials stay in server environments or mounted secret files, never in frontend config.

For cold model development, the default task/turn budgets are up to 120 seconds per model task, 400 seconds chat→orchestrator, 410 seconds gateway servicing proxy and 420 seconds browser chat. Set ingress deadlines above the intended turn budget. Live IVR needs separately measured latency targets; these maximums are not a voice SLA. Preserve interaction IDs and reconcile uncertain financial outcomes instead of retrying blindly.

## Enterprise profile generation

```bash
npm run product:validate -- --profile /absolute/path/enterprise-profile.json
npm run product:generate -- --profile /absolute/path/enterprise-profile.json \
  --output /absolute/path/generated-assets
```

Generation produces quoted dotenv data, public frontend runtime JSON and a summary. It checks supported enums, endpoints, required fields and control characters. It does not generate secrets, OIDC client registration, identity mappings, connector adapters or Kubernetes manifests. Load its dotenv output through the data-only environment loader or deployment tooling; never shell-source it. Complete the production environment template and run production preflight before deployment. See [Deployment scripts](../../deployment-scripts/README.md).

## PM2 and static frontend hosting

Install PM2 through your approved runtime tooling, build the frontend with development build dependencies available, and complete migrations before starting servers:

```bash
npm ci
npm run build:frontend
APP_ENV_FILE=/absolute/path/deployment.env ./scripts/run-with-env.sh \
  pm2 start ecosystem.config.js --env production
```

The ecosystem starts gateway, NLU, MCP, banking, chat, orchestrator and agent UI; it does **not** serve the frontend. Serve `services/frontend/dist` with your static host and SPA fallback, placing public configuration at its `/runtime-config.json`. The frontend workspace `start` script is Vite preview, not a complete enterprise web server.

Configure service-specific `DB_NAME` values; one shared root `DB_NAME` is incorrect for all processes. In production, the gateway requires PostgreSQL control-plane storage; the ecosystem's development single-writer file settings are not a substitute. Review socket/session coordination before increasing replicas and run the PostgreSQL concurrency tests. PM2 process persistence alone is not a backup or recovery design.

## Operations and recovery

Keep persistent PostgreSQL/Redis volumes, restricted backups, external audit archives and measured restore procedures. Readiness separates dependency availability from process liveness. Inspect the platform console for schema/storage/dependency failures, and monitor worker backlog, reconciliation-required operations, provider errors and latency.

For restore, stop traffic/workers, restore consistent configuration/operations/session/runtime state, verify evidence continuity, reconcile dispatched external effects, then resume workers and traffic. A database rollback does not undo a bank transfer. See [Servicing operations](servicing-operations.md#evidence-privacy-and-recovery) and [Troubleshooting](../reference/troubleshooting.md).
