# Deployment tooling

Run these commands from the repository root with Node.js 22 and npm 10 or later. The tools separate profile generation, static configuration checks, explicit schema changes and intentional provider probes. See the complete [deployment guide](../docs/guides/deployment.md).

## Generate a deployment profile

```bash
npm run product:validate -- --profile config/product/enterprise-profile.example.json
npm run product:generate -- --profile /absolute/path/enterprise-profile.json \
  --output /absolute/path/generated-assets
```

Without arguments the profile is `config/product/enterprise-profile.example.json` and output is `deployment-scripts/output/example-enterprise`. Generation writes:

- `.env.enterprise.generated`: quoted dotenv **data**, without generated credentials.
- `frontend-runtime-config.json`: public branding, API/auth endpoints, display tenant and chat deadline.
- `enterprise-summary.md`: profile metadata and next deployment steps.

Validation checks required fields, identifiers, supported enums, URL shape and control characters. Supported identity selections are `jwt` and `oidc`; SAML has no implemented broker. Deployment mode labels are `docker-compose`, `pm2` and `kubernetes`, but generation does not produce an ingress, chart or cluster deployment.

Do not shell-source the generated file. The repository's `scripts/run-with-env.sh` calls `run-with-env.cjs`, which parses dotenv assignments without executing commands or expanding shell variables. Spaces, quotes and shell-looking characters remain data. The selected environment file overrides inherited keys; use `APP_ENV_FILE=/absolute/path/file` to select it. Complete all secrets, storage and identity settings before deployment.

## Production preflight

Start from [`.env.production.example`](../.env.production.example), complete it in a protected location and provide real absolute paths for public runtime JSON, the server model registry and connector secrets. For deterministic servicing, the [empty provider registry](../config/product/llm-providers.production.example.json) deliberately configures no models.

```bash
npm run production:preflight -- --env /absolute/path/deployment.env
npm run production:preflight -- --env /absolute/path/deployment.env --compose
```

`production-preflight.cjs` checks strong distinct secrets, deployment identity, durable PostgreSQL/Redis settings, production schema ownership, exact HTTPS origins, OIDC fields, timeout ordering and mounted file content. It uses the runtime's model registry parser without a network transport. Findings contain setting names and corrective actions, never credential values. Failure exits nonzero.

`--compose` also checks Docker Compose 2.24.4+ and validates the full-stack/production overlay with `config --quiet`. It starts no service and contacts no model. It does not test live database connectivity, schema presence, OIDC login, provider capabilities, backup/restore or production capacity. Runtime readiness and deployment acceptance tests remain separate.

The overlay removes all internal host port publication, leaving only frontend/gateway on loopback for TLS ingress. It mounts the public runtime JSON and private model registry separately, uses authenticated Redis and persistent volumes, and applies resource/capability limits. See [production launch instructions](../docs/guides/deployment.md#dedicated-production-deployment).

## Explicit servicing migrations

```bash
npm run platform:migrate -- --env /absolute/path/migration.env
# Limit a reviewed change to one component if appropriate.
npm run platform:migrate -- --env /absolute/path/migration.env --component operations
```

`migrate-servicing.cjs` requires explicit URLs and applies canonical SQL:

| Component | URL | Schema |
| --- | --- | --- |
| `control-plane` | `CONTROL_PLANE_DATABASE_URL` | Gateway configuration/release records |
| `operations` | `OPERATIONS_DATABASE_URL` | Jobs, cases, evidence and identity |
| `workflow` | `WORKFLOW_DATABASE_URL` | AI base tables and durable tool ledger |
| `handoff` | `HANDOFF_DATABASE_URL` | Chat base tables and resume grants |

Each component runs in a transaction under an advisory lock, stops on failure and prints sanitized status. Components may use separate databases, so the whole four-component deployment is not a cross-database atomic transaction. Databases must already exist. Banking migrations run separately; this tool never seeds demo users.

Use a migration-owner credential, grant required runtime permissions, and start production with runtime schema flags disabled. The production Compose `servicing-migrations` service packages this CLI and SQL into a one-shot image; see the deployment guide for the exact command and order.

## Model connectivity probe

```bash
# Configuration only; no network/model request.
npm run llm:probe -- --list
# These commands deliberately contact the selected provider.
npm run llm:probe -- --provider mac-qwen --models
npm run llm:probe -- --provider mac-qwen --model YOUR_INSTALLED_TAG --test --format json
```

`--test` sends a fixed synthetic prompt, with no customer data, bounded output and a deadline up to 120000ms. `--registry PATH` selects an explicit registry file. No provider fallback occurs. A successful connectivity test does not establish task quality, fulfillment correctness or voice latency. See [Model providers](../docs/guides/llm-providers.md).

## Storage probe

`verify-servicing-storage.cjs` writes synthetic evidence to an explicitly supplied disposable `TEST_OPERATIONS_DATABASE_URL`. It verifies event-chain continuity and pagination, prints timings and removes its test tenant. It does not contact a provider.

```bash
# Inject TEST_OPERATIONS_DATABASE_URL from a protected test environment first.
node deployment-scripts/verify-servicing-storage.cjs
```

`SERVICING_STORAGE_PROBE_COUNT` controls the bounded workload. Never target a production database; local timings are not a capacity/SLA claim.

## Verification

```bash
npm run test:deployment
```

The tests cover command-injection nonexecution, quoting/round trips, invalid profile inputs, secret redaction, missing file paths, canonical registry validation, timeout composition and transactional migration failure. Where Docker Compose is available, they render synthetic configuration and assert that internal ports remain unpublished. Optional PostgreSQL integration uses `DEPLOYMENT_TEST_DATABASE_URL` with permission to create a temporary database and applies migrations repeatedly; no provider calls are part of this suite.

`markdown-to-docx-with-mermaid.sh` is an independent documentation conversion helper; it is not part of application deployment or preflight.
