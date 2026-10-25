# Customer chat and Servicing Studio frontend

This React application provides authenticated customer chat at `/chat` and the
servicing control plane at `/control-plane`. Start with the repository
[documentation index](../../docs/README.md) for the supported deployment path.

## Start and verify

Run these commands from the repository root with Node.js 22+ and npm 10+:

```bash
npm ci
npm run dev:frontend
```

The root development command loads `.env.development` through
[run-with-env.sh](../../scripts/run-with-env.sh). Vite listens on port **3000**
by default and refuses to silently switch ports. The frontend alone does not
start the gateway, banking database, chat backend, or model providers. Follow
[setup](SETUP-GUIDE.md) to connect those services.

```bash
npm run typecheck -w services/frontend
npm run lint -w services/frontend
npm run test -w services/frontend
npm run build -w services/frontend
npm run preview -w services/frontend
```

Build output is `services/frontend/dist`; preview serves that existing build on
port 3000. Vite preview is a local verification server. A deployed static host
must route `/auth`, `/chat`, and `/control-plane` back to `index.html` and serve
`/runtime-config.json` without replacing it with the HTML fallback.

## Application surfaces

| Surface | Behavior |
| --- | --- |
| `/auth` | Password login, optional access-token entry, or configured enterprise identity |
| `/chat` | HTTP chat requests, canonical backend sessions, history, and new-conversation controls |
| `/control-plane` | Channels, every configured intent and prompt, model profiles, journeys, fulfillment, releases, provider connections, evaluations, knowledge, traces, environments, identity, operations, and platform diagnostics/solution packages |

The studio link is shown for servicing roles. API authorization is enforced on
the server; route visibility and locally stored user profiles do not grant access.
The interface shows actual configured/tested/unavailable states. Enabling IVR
policy does not connect a telephony provider, and naming a model does not install
or verify it.

## Runtime configuration

[main.tsx](src/main.tsx) loads runtime configuration before importing the app.
[RuntimeConfig](src/config/runtimeConfig.ts) supplies defaults and merges the
served JSON. A typical local configuration is:

```json
{
  "tenantId": "default-enterprise",
  "productName": "Servicing Studio",
  "tagline": "Customer servicing",
  "supportEmail": "support@example.com",
  "apiBaseUrl": "http://localhost:3001/api",
  "authBaseUrl": "http://localhost:3005/api/v1",
  "chatRequestTimeoutMs": 420000,
  "features": { "allowTokenAuth": false }
}
```

The API base includes `/api`; the banking authentication base includes `/api/v1`.
Use browser-reachable origins, not internal Docker service names. Runtime JSON
contains public settings only. Provider URLs and credentials belong in server
configuration. The chat timeout accepts 1,000–600,000 milliseconds; omitted or
invalid values use the configured fallback, normally 420,000. Ordinary Axios API
requests retain their 30-second timeout.

Build-time fallbacks include `VITE_TENANT_ID`, `VITE_APP_NAME`,
`VITE_APP_TAGLINE`, `VITE_SUPPORT_EMAIL`, `VITE_API_BASE_URL`,
`VITE_AUTH_API_BASE_URL`, `VITE_ALLOW_TOKEN_AUTH`, and
`VITE_CHAT_REQUEST_TIMEOUT_MS`. `VITE_BANKING_SERVICE_URL` is a compatibility
fallback for the authentication base. Runtime JSON takes precedence. See the
[enterprise generator guide](../../docs/guides/productization.md).

## Code map and boundaries

| Source | Responsibility |
| --- | --- |
| [App.tsx](src/App.tsx) | Browser routes and header navigation |
| [authService.ts](src/services/authService.ts) | Password/token login, enterprise session handoff, refresh, and logout |
| [api.ts](src/services/api.ts) | Customer chat, sessions, history, and NLU requests |
| [useChat.tsx](src/hooks/useChat.tsx) | Customer conversation state |
| [ControlPlanePage.tsx](src/pages/ControlPlanePage.tsx) | Configuration workspace and shared draft lifecycle |
| [control-plane components](src/components/control-plane) | Design, model, and operational modules |
| [controlPlaneService.ts](src/services/controlPlaneService.ts) | Authenticated gateway requests and conflict errors |
| [modelProviderService.ts](src/services/modelProviderService.ts) | Sanitized provider discovery and synthetic checks |

The app uses React 18, TypeScript, Vite, React Router, Zustand for authentication,
and regular imported CSS. Chat state is maintained by the chat hook; the console
uses component state and backend revisions. This frontend does not stream model
tokens or execute banking tools in the browser.

## Guides

- [Setup and troubleshooting](SETUP-GUIDE.md)
- [Frontend architecture](ARCHITECTURE.md)
- [Command and endpoint quick reference](QUICK-REFERENCE.md)
- [Servicing Studio operator guide](OPERATIONS-CONSOLE.md)
- [Control-plane contract](../../docs/guides/control-plane.md)
- [Operations and provider adapters](../../docs/guides/servicing-operations.md)
- [Platform readiness and solution packages](../../docs/guides/platform-readiness.md)
- [LLM provider configuration and remote Mac Studio setup](../../docs/guides/llm-providers.md)

`README.old.md`, `IMPLEMENTATION-SUMMARY.md`, and `FIX-SUMMARY.md` are historical
records. Their old ports, screenshots, completion claims, and dependency versions
are not the current setup contract.
