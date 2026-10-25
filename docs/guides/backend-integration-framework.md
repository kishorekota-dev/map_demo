# Generic backend integration framework

How a company plugs its own backend into the Digital Assistant without a
new hard-coded tool class per company. Implemented in the MCP service
(port 3004), beside the existing banking tools, which are unchanged.

## What it is

A **backend adapter** is a server-side declaration of one company's backend
system: its base URL, how the platform authenticates to it, and the tools
it exposes (method, path template, input schema, read-only vs mutating).
Adapters are discovered as namespaced tools — `<adapterId>_<toolName>` —
so tools from different companies can never collide with each other or
with the existing banking tools.

Example: a CRM adapter `example-crm` exposing `example_crm_get_customer`
and `example_crm_create_case`.

## What it is not

- Not a plugin marketplace and not a claim that any CRM, ticketing, or core
  system is integrated. An adapter is only as real as the backend it points
  to and the pilot that exercises it.
- Not a way for a caller to register an endpoint at runtime. There is
  deliberately **no API route that registers an adapter**. A caller who
  could declare a baseUrl could redirect service credentials and customer
  data to any host.
- Not the customer-ownership check. The backend still enforces which
  customer records the service credential may touch, and the orchestrator's
  confirmation and effect-ledger controls still gate mutations. The
  adapter is the transport and dedupe layer, not the authorization layer.

## Plugging in a backend (operator steps)

1. Copy `services/mcp-service/adapters.example.json` to a server-side file
   (never a path a request handler can write to) and replace it with the
   company's adapter definition.
2. Set the credential environment variables named in the definition
   (`apiKey` / `bearer` / `basic` / `oauth2-client-credentials`). Values
   are never written in the config file and never accepted in a request.
3. Set `ADAPTERS_CONFIG_PATH` to that file and start the MCP service.
   A missing file or an invalid definition fails startup loudly instead
   of running without the backends an operator expected.
4. Verify discovery: `GET /api/adapters` (lists adapters, no secrets) and
   `GET /api/adapters/:adapterId/tools`.

## API (all under the service's internal-service authentication)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/adapters` | List registered adapters (sanitized) |
| GET | `/api/adapters/:adapterId/tools` | List that adapter's namespaced tools |
| GET | `/api/adapters/:adapterId/tools/:toolName` | One tool definition |
| POST | `/api/adapters/:adapterId/tools/:toolName/execute` | Execute `{ parameters, idempotencyKey?, sessionId? }` |
| POST | `/api/adapters/:adapterId/reconcile` | Reconcile `{ tool, idempotencyKey }` |
| GET | `/api/adapters/:adapterId/health` | Backend health (if `healthPath` is declared) |

## Idempotency and reconciliation (the part that matters)

Mutating tools **require** a caller-supplied `idempotencyKey`:

- The adapter forwards it as an `Idempotency-Key` header, so a backend
  that honours that header dedupes even if this process restarts.
- The adapter also caches completed results in-process (see limit below)
  and replays them verbatim with `replayed: true` instead of calling the
  backend again.
- A definitive backend failure (4xx/5xx, or a request that never reached
  the backend) is **not** cached, so the same key can be retried.

Execution outcomes are explicit:

- `completed` (HTTP 200) — backend responded 2xx.
- `failed` (backend status, else 502) — definitive error, safe to retry
  with the same key.
- `uncertain` (HTTP 202, with `reconciliationReference`) — the request
  may have reached the backend but no response arrived (timeout, reset
  after send). **Never retry an uncertain call with a new key.** Call
  `POST /api/adapters/:adapterId/reconcile` instead: if the tool declares
  a `statusPath`, the backend's own status is authoritative; if it does
  not, reconciliation returns manual lookup steps. An uncertain result is
  replayed as uncertain on a repeat with the same key.

Automatic retries happen only for read-only tools, on network errors or
5xx, up to `retry.maxAttempts` (max 3). Mutating tools are never
auto-retried.

## Limits, stated plainly

- The idempotency cache is **per-process and in-memory**. It protects
  against duplicates within one running instance; it does not survive a
  restart or span instances. For financial mutations, the durable dedupe
  is the backend's `Idempotency-Key` support plus the orchestrator's
  effect ledger — a shared store is future work, not a v1 claim.
- No inbound webhook handling in v1. A backend that needs to push events
  back needs a signed-webhook receiver, which is a separate, separately
  reviewed piece of work.
- OAuth2 support is client-credentials only, with in-memory token caching.
  User-delegated OAuth (authorization code, refresh tokens) is not in v1.
- Production adapters must use `https` base URLs (enforced by validation
  when `NODE_ENV=production`).
- Adapters do not validate customer ownership by themselves; that stays
  with the backend and the orchestrator.

## Files

- `services/mcp-service/src/adapters/adapterContract.js` — definition
  validation, parameter validation, sanitized views.
- `services/mcp-service/src/adapters/credentialResolver.js` — env-only
  credential resolution (apiKey, bearer, basic, OAuth2 client-credentials).
- `services/mcp-service/src/adapters/genericHttpAdapter.js` — HTTP
  execution, idempotent replay, uncertain outcomes, reconciliation, health.
- `services/mcp-service/src/adapters/idempotencyStore.js` — in-memory
  idempotency cache (see limits above).
- `services/mcp-service/src/adapters/adapterRegistry.js` — registry
  (singleton shared by routes and the startup loader).
- `services/mcp-service/src/adapters/adapterLoader.js` — startup config
  loading from `ADAPTERS_CONFIG_PATH`.
- `services/mcp-service/src/routes/adapterApi.routes.js` — HTTP API.
- `services/mcp-service/src/adapters/__tests__/adapterFramework.test.js` —
  14 tests: validation, credentials, replay, uncertain, failure,
  reconciliation, registry.
- `services/mcp-service/adapters.example.json` — commented example
  (fictional `crm.example.invalid` host; not loaded by default).
