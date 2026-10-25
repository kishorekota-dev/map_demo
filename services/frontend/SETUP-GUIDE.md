# Frontend setup and troubleshooting

Use the [repository documentation index](../../docs/README.md) for full-stack
setup. All commands below run from the repository root unless stated otherwise.
Node.js 22+ and npm 10+ are required by the workspace packages.

## Start the browser application

1. Configure the root environment using the current
   [deployment guide](../../docs/guides/productization.md). Keep real credentials
   out of `VITE_*` variables and runtime JSON, which are browser-visible.
2. Install workspace dependencies with `npm ci`.
3. Start the required backend services using the root deployment instructions.
4. Run `npm run dev:frontend`, then open `http://localhost:3000`.

`npm run dev:frontend` loads `.env.development`; set `APP_ENV_FILE` to select a
reviewed alternative environment file. Running `npm run dev -w services/frontend`
directly bypasses that root wrapper. Vite's default port is 3000; `PORT` can
change it. `--strictPort` makes a port conflict fail visibly.

## Connect the correct endpoints

| Component | Default local endpoint | Browser use |
| --- | --- | --- |
| Frontend | `http://localhost:3000` | Application |
| API gateway | `http://localhost:3001/api` | Chat, sessions, control plane, operations, and orchestrator proxy |
| Banking service | `http://localhost:3005/api/v1` | Default password authentication base |
| Chat backend | `http://localhost:3006` | Gateway upstream; usually not the browser's API base |
| Orchestrator | `http://localhost:3007` | Gateway upstream; model credentials stay here |

Port 3010 in older documents belongs to a previous customer-service topology.
Do not use it as the current banking default. The Vite `/api` development proxy
forwards relative requests to port 3001; absolute runtime API URLs bypass it.
Configure server CORS for the actual browser origin.

Serve a valid `/runtime-config.json`, or use the build-time fallbacks described
in the [README](README.md#runtime-configuration). Check it directly in the browser:
it must be JSON, not the SPA's `index.html`. A changed runtime file takes effect
when the application reloads. Backend addresses must resolve from the browser;
Docker hostnames such as `api-gateway` usually do not.

## Sign in and access the studio

Password login uses the configured authentication API. Provision users and roles
in the deployment; this UI does not create operator accounts. The banking
[database guide](../banking-service/database/README.md) explains demo seeds and
the V9 servicing roles. Demo data is not production identity provisioning.

Enterprise login is offered only when `/api/identity/config` reports it enabled.
After the provider handshake, `/auth?enterprise=1` retrieves a server-issued
session token with credentials included. See
[identity operations](OPERATIONS-CONSOLE.md#access-and-identity).

Manual access-token entry is controlled by `features.allowTokenAuth`. A typed
profile or role is not server authorization. A valid customer may access chat
while receiving a permission error from studio APIs; grant an appropriate
servicing role through the trusted identity system.

## Models and IVR

Follow [LLM provider setup](../../docs/guides/llm-providers.md) for the remote Mac
Studio Qwen provider. The starter model name is an example, and the host must be
configured before discovery or testing. The current computer's local Ollama is
not assumed to be the target. Publishing `llm.enabled: false` disables model
calls; a missing `llm` section retains legacy behavior.

IVR requires a configured voice adapter and its provider prerequisites. Enabling
an IVR channel in the console changes policy, not telephony connectivity.

## Verify a change

```bash
npm run typecheck -w services/frontend
npm run lint -w services/frontend
npm run test -w services/frontend
npm run build -w services/frontend
npm run preview -w services/frontend
```

Stop the development server before previewing on the same port. Frontend unit
tests cover request/authentication contracts and timeout normalization; they do
not certify a live banking or model provider. Use an isolated deployment for
write-flow verification and contract evaluations. Inspect real panel and input
bounds at mobile widths; an outer clipped container can conceal overflow.

## Troubleshooting

| Symptom | Inspect |
| --- | --- |
| App cannot load | Port conflict, Vite output, `dist` build, SPA fallback, and runtime JSON |
| API returns HTML | `apiBaseUrl` and gateway route; HTML is rejected as an invalid API response |
| Password login fails | Banking `/health/ready`, migrated schema, supplied credentials, and shared explicit JWT configuration |
| Studio returns 403 | Signed servicing roles and required scopes; local profile edits cannot grant them |
| Save returns 409 | Preserve local config JSON, refresh the server revision, then reconcile and save |
| Model test unavailable | Registered provider's enabled/configured state and allowed model; no implicit cloud fallback |
| Chat times out | `chatRequestTimeoutMs`, gateway/chat deadlines, and per-profile model-call budgets |
| Old session behavior after publish | Sessions retain their pinned release; start a new conversation to adopt environment routing |

See [architecture](ARCHITECTURE.md) for request ownership and
[operator flows](OPERATIONS-CONSOLE.md) for draft/publish, approvals, and recovery.
