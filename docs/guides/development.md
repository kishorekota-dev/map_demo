# Development

Use Node.js 22 and npm 10 or later. The root workspace includes eight application services; PostgreSQL 15 and Redis 7 are the reference infrastructure. Start with [Quick start](../getting-started/quick-start.md).

## Repository map

| Path | Responsibility |
| --- | --- |
| `services/frontend` | React/Vite customer application and Servicing Studio |
| `services/api-gateway` | Routing, control-plane releases, operations, identity and readiness |
| `services/chat-backend` | Authenticated chat/Socket.IO, session persistence and handoff grants |
| `services/banking-service` | Authoritative domain APIs, local authentication and banking migrations |
| `services/nlu-service` | Legacy NLU/intent integration |
| `services/mcp-service` | Registered banking tool contracts |
| `services/ai-orchestrator` | Governed workflows, model adapters and durable financial dispatch |
| `services/agent-ui` | Separate support-agent dashboard |
| `deployment-scripts` | Profile generation, preflight, explicit migrations and probes |

## Start the development stack

```bash
test -f .env.development || cp .env.example .env.development
npm ci
./scripts/run-with-env.sh docker compose -f docker/docker-compose.local.yml up -d postgres redis
npm run db:setup
./scripts/run-with-env.sh npm run db:seed
npm run dev
```

The environment loader parses dotenv data without executing shell expressions. It exports the selected file's values to child processes. Set `APP_ENV_FILE` to choose another file; see [Configuration](../getting-started/configuration.md). Do not use a production database for bootstrap or test commands.

`npm run dev` starts all eight applications. The individual commands are `dev:frontend`, `dev:gateway`, `dev:chat`, `dev:banking`, `dev:nlu`, `dev:mcp`, `dev:ai` and `dev:agent`. Use Ctrl-C to stop foreground development. `npm run health` checks the fixed default host ports; inspect gateway `/health/ready` for readiness and `/health/live` for liveness.

Both current Docker stacks also contain all eight applications. `npm run docker:build` then `npm run docker:up` uses the local development frontend; `npm run docker:full` uses its static build. The full-stack service mode follows `NODE_ENV` and defaults to development. The dedicated [production overlay](deployment.md#dedicated-production-deployment) is the supported starting point for hardened deployment. Avoid running host and container copies on identical ports.

## Workspace commands and checks

```bash
npm run test -w services/api-gateway -- --runInBand
npm run test -w services/chat-backend -- --runInBand
npm run test -w services/ai-orchestrator -- --runInBand
npm run test -w services/frontend
npm run build -w services/frontend
npm run lint
npm run typecheck
node --test deployment-scripts/__tests__/*.test.cjs
```

Root `npm test` runs workspace tests; not every suite is a live integration test. The CI workflow uses Node 22, service Jest suites, frontend Vitest/build and a separate disposable PostgreSQL job. Database-backed tests skip unless their explicit test URLs are present:

| Test group | Variable |
| --- | --- |
| Control-plane persistence | `TEST_CONTROL_PLANE_DATABASE_URL` |
| Operations, identity, replicas | `TEST_OPERATIONS_DATABASE_URL` (falls back to the control-plane test URL) |
| Runtime ledger and handoff grants | `RUNTIME_TEST_DATABASE_URL` |

Provision a **disposable** test database and inject these URLs through your local environment. The tests create/update/delete synthetic data and schemas. Run the matching workspace suite with `--runInBand`. Passing skipped suites is not evidence of PostgreSQL behavior. Provider protocol tests use fixtures; no live model availability or quality is established by them.

`npm run validate` checks basic environment/toolchain structure. `npm run product:validate` checks an enterprise profile's shape. `npm run production:preflight -- --env /absolute/path/deployment.env --compose` checks the complete deployment configuration and merged production Compose manifest. These are different checks.

## Database changes

Banking migrations live in `services/banking-service/database/migrations/V<number>__<description>.sql`. The Node migration runner records successful versions in `flyway_schema_history`; root `npm run db:migrate` affects banking only. Run it through the environment loader:

```bash
./scripts/run-with-env.sh npm run db:migrate
```

Use a new version for schema changes; do not edit an already-deployed migration to change its meaning. Seeds are local demo data. Production startup rejects demo seeding.

Control-plane/operations schemas, the financial dispatch ledger and resume grants have separate owners. `npm run platform:migrate -- --env /absolute/path/migration.env` applies their canonical SQL under transactions and advisory locks. Base chat/orchestrator tables have their own schema commands described in [Deployment](deployment.md#database-initialization-and-upgrades). Keep schema ownership separate from application runtime credentials and verify upgrades on restored staging data.

## Governed behavior changes

Prompts, intent examples, field collection, channel policy and model profiles should change through a draft release, diff, evaluation, approval and publication. A prompt cannot create a new MCP tool or bypass confirmation/ownership checks. Adding a new executable intent requires matching code/catalog/tool contracts and tests. See [Control plane](control-plane.md) and [Model providers](llm-providers.md).

Model connectivity tests are explicit administrative actions. `npm run llm:probe -- --list` reads sanitized configuration only; `--models` contacts a provider, and `--test` performs inference. Never treat an endpoint health check as a quality evaluation.

## Debugging and changes

Run service-specific development commands for readable logs. For a Node inspector, load the environment and invoke the correct service entrypoint from its workspace directory; remember that root wrappers change the working directory to the repository root. Avoid attaching a debugger to production traffic.

Use existing ESLint/TypeScript conventions and run focused tests appropriate to the behavior changed. `npm run format` rewrites matching files repository-wide; prefer formatting only your edited files during a scoped change. Keep generated deployment outputs, runtime data, credentials and local logs out of commits.

For failures, use the [Troubleshooting guide](../reference/troubleshooting.md) before deleting dependencies, resetting databases or changing schemas manually.
