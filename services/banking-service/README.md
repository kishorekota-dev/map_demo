# Banking service

The current Express service owns database-backed account, transaction, card,
transfer, fraud-alert, dispute, and password-authentication operations. It listens
on **port 3005** by default. The customer browser normally reaches business
operations through the gateway and orchestration layer, not direct banking forms.

Start with the [documentation index](../../docs/README.md). The route mounts in
[server.js](server.js), the [API quick reference](API-QUICK-REFERENCE.md), and
[database guide](database/README.md) describe the current implementation.

## Start locally

Use Node.js 22+ and npm 10+ at the repository root. Configure a disposable local
PostgreSQL database and root environment before running:

```bash
npm ci
./scripts/run-with-env.sh node services/banking-service/database/scripts/check-connection.js
./scripts/run-with-env.sh npm run db:migrate -w services/banking-service
npm run dev:banking
```

The root launcher loads `.env.development`; `APP_ENV_FILE` selects another reviewed
environment file. Direct `npm start -w services/banking-service` starts the server
without running container bootstrap. Migrate first when running that way.

Optional **non-production** demo data is loaded with:

```bash
./scripts/run-with-env.sh npm run db:seed -w services/banking-service
```

Seeding requires empty business tables on its first run. The entire seed bundle
runs in one transaction; a matching previously applied bundle is a no-op. A changed
bundle or pre-existing business data is rejected. Production seeding is disabled.
Do not use seeded sample accounts as enterprise identity provisioning.

## Container startup

[docker-entrypoint.sh](docker-entrypoint.sh) calls the Node
[bootstrap runner](database/scripts/bootstrap.js). It validates production JWT
configuration, waits for a bounded database connection, runs enabled migrations,
and starts the application only after success. It needs neither `psql` nor `nc`.

| Setting | Default and behavior |
| --- | --- |
| `BANKING_RUN_MIGRATIONS` | `true`; set `false` only when a separate deployment migration job owns schema updates |
| `BANKING_SEED_DEMO_DATA` | `false`; explicit `true` enables demo seed outside production only |
| `BANKING_DB_READY_TIMEOUT_MS` | 30,000; accepted range 1,000–300,000 |
| `PORT` | 3005 |
| `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Explicit nonempty values required in production before any pool, migration, bootstrap, or server starts; development retains local defaults |
| `DB_PORT` | PostgreSQL port; defaults to 5432 |
| `DB_SSL` | `true` enables TLS with certificate verification |
| `DB_SSL_CA_FILE` | Optional trusted CA certificate file |
| `DB_SSL_REJECT_UNAUTHORIZED` | `false` is an explicit development/test exception and is rejected in production |
| `JWT_SECRET` | Shared explicit signing/verification key; production rejects missing, known-placeholder, or shorter-than-32-character values |
| `JWT_EXPIRES_IN` | Access-token lifetime; default `15m` |
| `REFRESH_TOKEN_EXPIRES_IN` | Refresh JWT lifetime; default `7d` |
| `DEPLOYMENT_TENANT_ID` | Deployment binding in issued access tokens |
| `ALLOWED_ORIGINS` | Comma-separated browser origins |

The current database pool reads `DB_*`, not `DATABASE_URL`. The latter appears in
legacy Flyway metadata and other services; it does not replace banking pool
settings. The committed environment example is a template, not production secrets.
Production startup fails with the missing setting names when any required `DB_*`
value is absent or blank; configured values and passwords are not included in that
error.

## Health and API boundaries

```bash
curl --fail http://localhost:3005/health/live
curl --fail http://localhost:3005/health/ready
```

`/health/ready` returns 503 when the database is unhealthy. `/health` includes a
database status object but may still return 200 when that object is unhealthy;
use the readiness endpoint for deployment gating. Banking health does not test
LLM providers, voice, chat, or the full serving path.

Mounted business prefixes are `/api/v1/accounts`, `/transactions`, `/cards`,
`/transfers`, `/fraud`, and `/disputes`, each beneath `/api/v1`. Authentication is
under `/api/v1/auth`. Customer/KYC tables exist, but the older `/customers` and
customer-KYC APIs in historical documents are not mounted by this server.
The served `openapi.yaml` retains older paths/ports and is not a complete current
route contract. See [API documentation](API-DOCUMENTATION.md).

## Servicing roles and model boundary

An empty production database needs an explicitly provisioned administrator before
OIDC mappings can be managed. After migrations, use the one-shot
[administrator bootstrap CLI](database/scripts/bootstrap-admin.js). Configure
`BANKING_ADMIN_EMAIL`, optional `BANKING_ADMIN_USERNAME`, and
`BANKING_ADMIN_TENANT_ID` equal to the explicit `DEPLOYMENT_TENANT_ID` in the
selected deployment environment. Select the intended file through `APP_ENV_FILE`;
do not rely on a development environment fallback for production.
Host bootstrap requires explicit `DB_HOST`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`
for a database reachable from that host, plus `DB_PORT` when it differs from 5432.
The root production template's servicing URLs do not supply these banking settings.
Alternatively, execute the CLI inside the configured banking container, where
Compose already supplies its private database settings.

```bash
npm run platform:bootstrap -- --password-stdin
```

For a running production Compose banking container, use the same completed
`APP_ENV_FILE`; export the administrator email and tenant confirmation from your
approved deployment configuration before running:

```bash
./scripts/run-with-env.sh docker compose \
  -f docker/docker-compose-full-stack.yml -f docker/docker-compose.production.yml \
  exec -T -e BANKING_ADMIN_EMAIL -e BANKING_ADMIN_TENANT_ID banking-service \
  node database/scripts/bootstrap-admin.js --password-stdin
```

This container command inherits the deployed `DEPLOYMENT_TENANT_ID` and banking
`DB_*` settings. It does not expose the database port or change its configuration.

Supply the password through standard input from an approved secret source, or
use `BANKING_ADMIN_PASSWORD` in the process environment. Never put it in command
arguments. New users require a 16–72 byte password containing upper/lowercase,
a number, and a symbol; it is hashed with bcrypt. `--existing-only` grants the
role to an existing active, unlocked account with a username and requires no
password. An existing password is never changed by this command.

The CLI grants only `CONTROL_PLANE_ADMIN`, records the change transactionally
with actor `platform-bootstrap-cli`, and is idempotent. It does not pretend to
identify a human approver, create customer accounts, grant banking `ADMIN`, or
enable public registration. Tenant confirmation checks configuration agreement;
operators must still select the correct dedicated banking database.

[V9](database/migrations/V9__control_plane_roles.sql) defines administrator,
editor, operator, and viewer roles for the control plane without assigning them
to existing customers. Authentication signs database roles and the deployment
tenant into access tokens; refresh re-reads those roles. The gateway remains the
authority for control-plane permissions. A servicing role does not automatically
grant banking administrator actions.

Models do not run in this service. See [Servicing Studio](../frontend/OPERATIONS-CONSOLE.md),
[control plane](../../docs/guides/control-plane.md),
[operations](../../docs/guides/servicing-operations.md), and
[model providers](../../docs/guides/llm-providers.md).

## Tests and remaining boundaries

```bash
npm test -w services/banking-service -- --runInBand
```

[Testing instructions](README-TESTING.md) separate mocked unit tests, opt-in
PostgreSQL bootstrap tests, and older customer-service harnesses. Completion
reports and benchmark numbers in historical files are not current deployment
certification. The current bank data model is deployment-scoped; this service
does not provide isolation for multiple enterprises sharing one banking database.

## Confirmed, durable business mutations

Apply migration `V10__durable_mutation_results.sql` before starting the updated service. All POST/PUT/PATCH/DELETE routes under accounts, transactions, transfers, cards, fraud and disputes now require the authenticated customer JWT, a bounded caller `Idempotency-Key`, and `X-Servicing-Confirmation`. Customer login/refresh remains the authentication boundary. Old business clients that omit the new headers are rejected before dispatch.

The confirmation header is an HMAC attestation issued by trusted servicing code after the customer confirms the original request. It binds the verified customer and tenant, caller key, actual method/path/body, and a five-minute expiry. It is not a body boolean. Configure the same deployment-managed `SERVICING_SERVICE_TOKEN` (at least 32 bytes) in banking, MCP, orchestrator and operations; keep these services private and rotate their key together. The MCP adapter forwards the customer bearer token for bank ownership checks, not a server integration credential.

The mutation guard holds one PostgreSQL transaction across repository reads/writes and the result ledger. Nested repository transactions reuse it; direct connection acquisition from a mutation is rejected. The current business handlers return terminal JSON. Other response styles fail closed. A completed duplicate replays the original HTTP status and JSON bytes without repeating controllers or requiring a fresh proof. Changing arguments with the same owner/key returns 409. HTTP 4xx/5xx and confirmed pre-dispatch failures roll back and are not cached; an explicit retry retains its original key. There is no automatic mutation retry.

A lost COMMIT acknowledgement returns 202 with `outcome:uncertain`, the original reconciliation key, and `/api/v1/mutation-status/:key`. That authenticated GET is owner/tenant scoped: completed results return200; in-flight returns 202; authoritative absence returns 404 only after acquiring the same operation lock. Unavailable lookup does not establish absence. Reconcile the orchestrator ledger against this backend evidence before another action. Protect result-table access and retain active keys for the complete retry/reconciliation period; deleting a completed key early removes duplicate protection.

Verification uses `BANKING_TEST_DATABASE_URL` pointing to a disposable database named `banking_test`. Tests create/drop isolated fixture databases and use counters, not customer accounts or live financial effects. They cover concurrent replay, proof binding, rollback after 400/503, non-JSON rejection, in-flight lookup, and recovery after a simulated lost COMMIT acknowledgement.
