# Configuration

Configuration has three owners: deployment settings and secrets belong to the service environment; prompts, intents, channels and model profiles belong to governed control-plane releases; public branding/endpoints belong to the frontend runtime configuration. This guide covers the settings needed to run the current implementation, not every legacy option.

## Loading configuration

`npm run dev`, individual root `dev:*`/`start:*` commands, Docker npm scripts and `llm:probe` use [`scripts/run-with-env.sh`](../../scripts/run-with-env.sh). It reads `.env.development` from the repository root as dotenv data, exports its assignments, then runs the command without shell evaluation. If that file is absent it warns and falls back to `.env.example`.

```bash
# Create only when absent; preserve existing settings.
test -f .env.development || cp .env.example .env.development
# Select a different dotenv environment file.
APP_ENV_FILE=/absolute/path/deployment.env ./scripts/run-with-env.sh npm run start:gateway
```

Quote values containing spaces. Shell expressions and variable interpolation are not executed; generate secrets separately and store their actual values in the protected file. Assignments in the file override inherited environment variables. Service-level `dotenv` loads a working-directory `.env` without overriding already-exported values. Avoid contradictory root/service configurations. `.env.production` and `.env.test` are not selected automatically by `NODE_ENV`.

Root `db:migrate` and `db:seed` do not use the wrapper themselves:

```bash
./scripts/run-with-env.sh npm run db:migrate
./scripts/run-with-env.sh npm run db:seed
```

`db:setup` uses the same safe environment loader, stops on migration failure and rejects production mode; it is a local convenience bootstrap, not an enterprise migration runner. `npm run validate` checks toolchain and basic environment structure, not complete production readiness. To select another file for that validator use `npm run validate -- /absolute/path/deployment.env`.

Compose receives only variables referenced in its `environment`/interpolation definitions. A variable present in the host file is not automatically passed into a container. Validate without dumping resolved secrets:

```bash
./scripts/run-with-env.sh docker compose -f docker/docker-compose.local.yml config --quiet
```

## Service addresses

| Service | Host development address | Container service name |
| --- | --- | --- |
| Frontend | `http://localhost:3000` | `frontend` |
| Gateway | `http://localhost:3001` | `api-gateway:3001` |
| NLU / legacy NLP compatibility | `http://localhost:3003` | `nlu-service:3003` |
| MCP | `http://localhost:3004` | `mcp-service:3004` |
| Banking | `http://localhost:3005` | `banking-service:3005` |
| Chat | `http://localhost:3006` | `chat-backend:3006` |
| Orchestrator | `http://localhost:3007` | `ai-orchestrator:3007` |
| Agent UI | `http://localhost:8081` | `agent-ui:8081` |

Configure `API_GATEWAY_URL`, `BANKING_SERVICE_URL`, `CHAT_BACKEND_URL`, `NLU_SERVICE_URL`, `NLP_SERVICE_URL`, `MCP_SERVICE_URL` and `AI_ORCHESTRATOR_URL` for the caller's network. Browser URLs must be browser-reachable; Docker DNS names are for container-to-container traffic. Service base URLs normally omit API paths; `CONTROL_PLANE_URL` ends in `/api/control-plane`, and `OPERATIONS_URL` in `/api/operations`.

## Databases and persistence

PostgreSQL 15 is the reference database. Core banking, chat and orchestrator clients use `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` and service-specific `DB_NAME`; setting a shared `DATABASE_URL` is not a universal replacement. The host development defaults choose database names per service; do not set one root `DB_NAME` for all services.

| Data | Settings / default behavior |
| --- | --- |
| Banking | `DB_NAME=poc_banking`; versioned migrations under `services/banking-service/database/migrations` |
| Chat sessions/messages | `DB_NAME=poc_chat`; requires `CHAT_PERSISTENCE_ENABLED=true`; fails startup if enabled database is unavailable |
| Orchestrator sessions/workflows | `DB_NAME=ai_orchestrator`; model initialization requires PostgreSQL |
| Control-plane releases/drafts | `CONTROL_PLANE_DATABASE_URL` selects PostgreSQL; otherwise `CONTROL_PLANE_DATA_FILE` selects a file |
| Operations/jobs/identity/evidence | `OPERATIONS_DATABASE_URL`, then `CONTROL_PLANE_DATABASE_URL`, then `DATABASE_URL`; PostgreSQL required |
| Graph checkpoints | `CHECKPOINT_ENABLED=true`, `CHECKPOINT_BACKEND=postgres`; `CHECKPOINT_DATABASE_URL` falls back to `WORKFLOW_DATABASE_URL` / orchestrator DB settings. Memory mode is development-only. |
| Financial dispatch ledger | `WORKFLOW_DURABLE_EXECUTION=true`; `WORKFLOW_DATABASE_URL` or orchestrator `DB_*` configuration |
| Cross-channel grants | `HANDOFF_STORAGE=postgres`; `HANDOFF_DATABASE_URL` or chat `DB_*` configuration |

Both Compose stacks and the root environment templates enable persistent chat. Keep `CHAT_PERSISTENCE_ENABLED=true` for host development as well. `HANDOFF_STORAGE=memory` is a development-only mode and does not make chat sessions durable. The financial ledger defaults to durable in production; explicitly disabling it removes that guarantee.

Production gateway startup requires PostgreSQL configuration storage. File mode is available for development using `CONTROL_PLANE_DATA_FILE` with exactly one writer; operations still require PostgreSQL. `CONTROL_PLANE_SINGLE_WRITER=true` does not replace production PostgreSQL requirements. Keep `DEPLOYMENT_TENANT_ID` consistent across gateway, chat and orchestrator; browser `tenantId` is display configuration, not authorization.

Schema flags are `CONTROL_PLANE_MANAGE_SCHEMA`, `OPERATIONS_MANAGE_SCHEMA`, `WORKFLOW_SCHEMA_AUTO_MIGRATE`, `HANDOFF_SCHEMA_AUTO_MIGRATE` and `CHECKPOINT_SCHEMA_AUTO_MIGRATE`. Set them to `false` only after the owning migration process applies the corresponding schema. See [deployment schema ownership](../guides/deployment.md#database-initialization-and-upgrades). Chat/orchestrator base models use `DATABASE_MANAGE_SCHEMA`; production defaults to verification without synchronization. The production overlay disables all runtime schema management and requires explicit migrations.

`REDIS_URL` is used by several services; orchestrator and agent integrations also use `REDIS_HOST`/`REDIS_PORT`. Compose sets internal names. Verify the settings consumed by each service rather than assuming one URL changes every client. Database TLS behavior also differs between clients; test certificate validation with the deployed driver configuration.

## Identity and internal credentials

| Setting | Purpose |
| --- | --- |
| `JWT_SECRET` | Shared signing/verification key for local access tokens; replace all sample values together |
| `SERVICING_SERVICE_TOKEN` | Separate internal credential shared by gateway, chat and orchestrator; never put it in browser config |
| `DEPLOYMENT_TENANT_ID` | Server-side deployment tenant binding |
| `ALLOWED_ORIGINS` | Exact comma-separated browser origins for gateway/chat CORS |
| `FRONTEND_URL` | Fixed browser origin for enterprise login redirect |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID` | Expected provider issuer and client audience |
| `OIDC_AUTHORIZATION_ENDPOINT`, `OIDC_TOKEN_ENDPOINT`, `OIDC_JWKS_URI` | Explicit HTTPS provider endpoints |
| `OIDC_REDIRECT_URI` | Registered callback ending in `/api/identity/callback` |
| `OIDC_CLIENT_SECRET_REF` | Optional confidential-client secret reference, resolved by the gateway |

OIDC uses an authorization-code/PKCE broker and local mappings of exact issuer/subject to banking users and permitted roles. External group strings do not grant privileges. `AUTH_PROVIDER=oidc` or `OIDC_AUDIENCE` alone does not configure the broker. The profile generator accepts `saml` as metadata, but no SAML broker is implemented. `OIDC_ALLOW_LOCAL=true` permits localhost HTTP only outside production. Browser sessions use same-site cookies; deploy frontend/API accordingly.

Tracked environment templates omit working credentials and source code has no usable JWT/database credential fallback. Inject credentials before starting. `SERVICING_SERVICE_TOKEN` must also reach MCP and banking: it signs the short-lived proof binding a confirmed business mutation to the customer, tenant, caller idempotency key, method, path and original arguments. It must differ from `JWT_SECRET`. OIDC confidential clients support only `OIDC_CLIENT_SECRET_REF=env:OIDC_CLIENT_SECRET`; missing values and unsupported references fail startup. User login passwords and verified customer bearer tokens remain part of the established authentication protocol; this environment-only rule applies to server integration credentials.

Declare connector endpoints and credential references in the server's `CONNECTORS_CONFIG_PATH` file. Credentials use only `env:CONNECTOR_SECRET_NAME`; inject the named variables into the gateway explicitly. The console enables declared integrations and cannot register arbitrary endpoints or credentials. `CONNECTOR_ALLOWED_HOSTS` and `CONNECTOR_PRIVATE_HOSTS` control approved destinations. See [Servicing operations](../guides/servicing-operations.md) for connector, identity and audit settings.

## Model providers and recognition

Use [Model providers](../guides/llm-providers.md) as the authoritative setup guide. `LLM_PROVIDERS_FILE` selects a server-owned registry; a relative path resolves from `services/ai-orchestrator`, regardless of launch directory. A configured file takes precedence over `LLM_PROVIDERS_JSON`. With Compose set `LLM_PROVIDERS_FILE=` explicitly to use inline JSON.

The supplied registry enables a `mac-qwen` Ollama adapter at an example separate-host address. `LLM_OLLAMA_BASE_URL` overrides that address. Cloud entries remain disabled until configured. `LLM_OPENAI_API_KEY` and `LLM_GEMINI_API_KEY` are explicit credential references; Vertex requires an explicit `LLM_VERTEX_ACCESS_TOKEN` bearer-token environment reference; the operator owns refresh. Implicit ADC and credential files are not read by the model plugin. Enabled production providers require HTTPS, and missing/invalid named credentials fail startup. Custom registry files require explicit container mounts; Compose does not mount arbitrary host paths for you. Synthetic model test/evaluation HTTP endpoints are disabled in production.

Registry availability and published `llm.enabled` are separate. Publish profiles and task routes in Studio to use models for generation, extraction and/or recognition. `llm.enabled:false` disables plugin and legacy model calls; omitted `llm` retains compatibility behavior for old releases. Configured provider failure never silently switches to cloud. Legacy `OPENAI_ENABLED`, `SLM_ENABLED` and `SLM_BASE_URL` are compatibility settings, not the preferred product configuration.

For deterministic local NLU, keep `DIALOGFLOW_ENABLED=false`. Live Dialogflow requires `DIALOGFLOW_PROJECT_ID` and explicit server `DIALOGFLOW_CREDENTIALS_JSON` service-account credentials; no key-file or implicit ADC fallback is read. Enabled misconfiguration fails startup, and production wrapper calls cannot return demo responses. Adding these credentials does not configure the separate LLM registry. A semantic recognizer can use server-owned `RECOGNITION_PROVIDER_URL`/`RECOGNITION_PROVIDER_TOKEN`; publish its recognition policy separately.

## Timeout budgets

| Layer | Setting | Default | Accepted range |
| --- | --- | --- | --- |
| Model task | Published profile `timeoutMs` | Profile-specific | 1,000–120,000 ms |
| Optional legacy NLU | `NLU_REQUEST_TIMEOUT_MS` | 5,000 ms | 1,000–120,000 ms |
| Chat → orchestrator | `AGENT_RESPONSE_TIMEOUT` | 400,000 ms | 1,000–590,000 ms |
| Gateway servicing routes | `SERVICING_REQUEST_TIMEOUT_MS` | 410,000 ms | 1,000–600,000 ms |
| Browser chat send | Runtime `chatRequestTimeoutMs` / `VITE_CHAT_REQUEST_TIMEOUT_MS` | 420,000 ms | 1,000–600,000 ms |

Only gateway `/api/chat` and `/api/orchestrator` use the servicing budget. Ordinary proxy/browser requests retain their normal 30-second budget. Backend numeric bounds clamp valid integers; invalid strings use defaults. Frontend out-of-range values use its default. Tune all layers and ingress deadlines together, leaving room for NLU and up to three sequential model stages. These cold-model allowances are not IVR latency targets. Timeouts do not prove that a downstream action stopped and must not trigger blind financial retries.

Both supported Compose files pass the NLU, workflow and servicing settings. The gateway budget must cover NLU plus workflow plus overhead; the production preflight checks at least 1000ms of overhead.

## Frontend runtime configuration

The frontend fetches `/runtime-config.json` before rendering. Public fields include `tenantId`, `productName`, `tagline`, `supportEmail`, `apiBaseUrl`, `authBaseUrl`, `chatRequestTimeoutMs` and `features.allowTokenAuth`. They override Vite build-time defaults. The production Docker image serves this file from `/app/dist/runtime-config.json`; the development image uses `/app/public/runtime-config.json`.

`apiBaseUrl` normally ends in `/api`; `authBaseUrl` must reach the banking login API base: `/api/banking/v1` through the canonical gateway, `/api/v1` when connecting directly to banking, or an explicitly configured ingress rewrite with the same routes. The client appends `/auth/login` to this base. Do not put keys, database URLs, internal service tokens or connector credentials in this file. Hiding token login is a UI setting and does not replace server-side authorization.
