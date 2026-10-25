# Troubleshooting

Start with the failing component and a sanitized error code. Keep configuration values, access tokens, connection strings, provider keys and customer transcripts out of terminal captures and issue reports.

## Basic diagnostics

```bash
node --version
npm --version
npm run health
curl --fail http://localhost:3001/health/ready
curl --fail http://localhost:3005/health/ready
lsof -nP -iTCP -sTCP:LISTEN
```

Use Node.js 22 with npm 10 or later. `npm run health` assumes default host ports; a production overlay intentionally does not expose internal services. Gateway `/health/live` is process liveness; `/health/ready` reports whether configured dependencies are available. Authorized operators can inspect detailed sanitized platform readiness in the console/API. Neither endpoint proves model quality or external provider readiness.

## Installation or environment loading

For an incompatible Node version, select Node 22 with your version manager and rerun `npm ci`. Keep the committed lockfiles. An npm registry/network failure should be diagnosed from its error; deleting lockfiles, forcing legacy peer dependencies or clearing every cache is not the default repair.

The root environment wrapper reads `.env.development`, or `APP_ENV_FILE` when set. It treats values as dotenv data, not shell commands. Quote values containing spaces. Shell command substitutions and environment-variable interpolation are not evaluated. Generate secrets separately and put their actual values in the protected file.

```bash
npm run validate
npm run production:preflight -- --env /absolute/path/deployment.env --compose
```

Preflight failure identifies the setting or component without echoing its value. A missing file, blank secret, placeholder credential, invalid URL, incorrect public runtime config or incompatible timeout order must be fixed before deployment. Do not print an entire environment file or run unrestricted `env` output to diagnose it.

## Port already in use

Use `lsof -nP -iTCP:<port> -sTCP:LISTEN` to identify the owner. Stop the known development command with Ctrl-C, or use the matching Compose `stop <service>` command. Do not kill every Node process or force-kill an unidentified PID. If changing a port, update its consumers, frontend runtime endpoints and health checks together; some workspace scripts explicitly pin their port.

## Database and migration failures

Check infrastructure status first:

```bash
./scripts/run-with-env.sh docker compose -f docker/docker-compose.local.yml ps
./scripts/run-with-env.sh docker compose -f docker/docker-compose.local.yml logs --tail=100 postgres
pg_isready -h localhost -p 5432
```

For a host development stack, `npm run db:setup` creates `poc_banking`, `poc_chat` and `ai_orchestrator`. It is a development-only bootstrap and now stops on banking migration failure. To rerun banking migrations explicitly:

```bash
./scripts/run-with-env.sh npm run db:migrate
```

Missing control-plane, operations, dispatch-ledger or handoff tables require the corresponding servicing migrations; `db:migrate` does not create them. Production uses `npm run platform:migrate` or its one-shot container. Confirm the correct database and migration role before applying changes. PostgreSQL's Docker initialization scripts run only on an empty volume; container restart does not upgrade an existing database.

`CHAT_PERSISTENCE_ENABLED=true` intentionally makes chat startup fail when its database is unavailable. `HANDOFF_STORAGE=postgres` also requires its store. Disabling persistence to make startup appear healthy loses the behavior the deployment is meant to provide. Production schema-management flags require schemas to exist before runtime starts.

Do not reset a database or remove Docker volumes to repair a migration error. Preserve the error and backup, inspect migration history, and apply the reviewed upgrade. A restore requires coordinated recovery of configuration, sessions, operations and external effects; see [Servicing operations](../guides/servicing-operations.md#evidence-privacy-and-recovery).

## Authentication and operator access

For `401`, verify bearer-token format, expiry and that the services share the intended signing key. Sign in again after a key or role change. Do not paste a live token into a public decoder. Banking login uses the documented username/password contract; a public health endpoint does not validate a token.

For `403` in Studio, the customer seed is not an operator. Banking migration V9 creates control-plane role definitions; it does not promote every user. Assign an appropriate role through the authorized administration process and obtain a new signed token. A browser-supplied role or tenant field cannot authorize access.

Production NLU/MCP calls require `X-Servicing-Service-Token` from trusted server callers, with a separate strong `SERVICING_SERVICE_TOKEN` consistent across gateway, chat, orchestrator, NLU and MCP. A browser should never receive this token. Missing/weak internal credentials fail startup or protected requests.

For OIDC, configure all issuer/client/authorization/token/JWKS/callback fields and the fixed frontend origin. Register the exact `/api/identity/callback` URI and map the exact issuer/subject to an enabled local banking user. External groups do not grant local roles. `AUTH_PROVIDER=oidc` alone is insufficient. Check same-site HTTPS cookie behavior and deployment CORS; the default cookie policy is not a cross-site federation configuration. No SAML broker is implemented.

## Model or recognition failures

First inspect sanitized server registry configuration:

```bash
npm run llm:probe -- --list
```

This does not contact a provider. Follow [Model providers](../guides/llm-providers.md) for an intentional discovery or synthetic inference test. Registry file paths resolve from the orchestrator service root; custom container paths must be mounted and readable by the runtime user. A host environment variable is not automatically passed into a container.

For a separate Mac Studio, `localhost` inside Docker is the app container, and `host.docker.internal` is the Docker host. Neither identifies another machine. Use the Studio's real network address and exact installed model tag. `.local` discovery may need a private IP in Docker.

A registry provider can be available while published `llm.enabled` remains false. Conversely, enabled profiles with unavailable credentials/models produce `model_unavailable`; they do not silently switch to a cloud model. Pending customer confirmation is preserved for a safe subsequent attempt when no action ran. Inspect the release and workflow state before retrying a failed financial action.

The optional legacy NLU request defaults to five seconds. Model tasks may run sequentially; align chat, gateway, browser and ingress budgets. A timeout can occur after downstream dispatch, so it is not proof that an action failed. Preserve interaction IDs, inspect the operation ledger, and use the reconciliation process for uncertain outcomes.

## Socket.IO or cross-channel continuation

Confirm chat readiness, the `/socket.io` route, matching browser origins and authenticated connection setup. A raw WebSocket command against `/` does not test the Socket.IO protocol. Inspect browser Network/Console errors without copying credentials.

Resume grants are short-lived, single-use and bound to the customer, deployment tenant, session and target channel. `409` can mean expired, consumed or unauthorized. Request a new grant through the authenticated session when appropriate; do not reuse a consumed grant or edit ownership fields. Voice ingress additionally requires the provider signature and verified customer token.

## Docker diagnostics

Use the same files and environment used to launch the stack:

```bash
./scripts/run-with-env.sh docker compose -f docker/docker-compose.local.yml ps
./scripts/run-with-env.sh docker compose -f docker/docker-compose.local.yml logs --tail=100 banking-service api-gateway
./scripts/run-with-env.sh docker compose -f docker/docker-compose.local.yml config --quiet
```

For production, add `-f docker/docker-compose.production.yml` to the full-stack base and set `APP_ENV_FILE` to the completed deployment file. Use Compose 2.24.4 or later; older versions cannot safely merge the production port overrides. `config --quiet` validates syntax without printing resolved credentials.

Container callers use service names such as `postgres`, `redis` and `mcp-service`. Browser callers use public HTTPS addresses. Read-only bind mounts require real existing host files/directories and correct permissions. Do not use `docker system prune`, `down -v`, or volume deletion as routine troubleshooting.

## Sharing a useful report

Include the commit/version, Node/npm/Compose versions, affected service, sanitized status/error code, reproduction steps and relevant test result. State whether the failure is in configuration validation, startup, dependency readiness, a model test or a customer workflow. Remove secrets, customer content and raw connection URLs from logs before sharing.
