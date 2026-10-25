# Generic backend adapter transport

Reviewed October 24, 2026 against the canonical MCP service. This is a server-owned,
private administrative HTTP adapter interface beside the existing banking tools.
It supplies declarations, bounded transport, discovery metadata and pilot replay
handling. It is not an automatic connection to a company's system.

## Supported execution boundary

The interface lives at the MCP service's `/api/adapters` paths. It is **not** wired
into the existing MCP protocol/tool catalog, the control plane's registered action
contracts, customer ownership checks, confirmation policy or durable financial
effect ledger. Configuring an adapter therefore does not create a customer-facing
intent or authorize an assistant to call it. An inbound customer bearer token is
not adapter authorization and is never forwarded as the backend credential.

Production executes **GET tools only**. Every generic mutation returns 403 in
production, even if the pilot flag is set. Non-production mutations require
`ADAPTER_PILOT_MUTATIONS_ENABLED=true`, trusted service identity and an idempotency
key. They are intended for synthetic fixtures or a separately qualified sandbox.
Keep this API private. The backend must authorize the service account's access;
there is no customer-specific authorization policy in this administrative API.

Before exposing generic mutations in a product workflow, implement registered
action contracts, customer/session ownership and confirmation, durable operation
identity, authoritative outcomes and reconciliation in the established orchestrator
architecture. A server-registered URL or in-memory cache cannot provide these
controls by itself. Existing banking tools retain their current authorization and
ledger path.

## Operator configuration

1. Copy [the fictional example](../../services/mcp-service/adapters.example.json)
   to a protected server-side JSON file. Replace its endpoints and declarations
   after reviewing the backend contract. A missing/invalid config fails startup.
2. Put credentials in the environment variables named by `auth`, never in the
   JSON declaration, request body, frontend or public runtime configuration.
3. Supply a strong `SERVICING_SERVICE_TOKEN` of at least 32 bytes. Adapter routes
   require it in `X-Servicing-Service-Token` in **every environment**, even when
   ordinary development internal-service authentication is disabled. A missing
   server identity returns 503; missing/incorrect caller credentials return 401.
4. Set `ADAPTERS_CONFIG_PATH` for the MCP process. Container deployments must mount
   the private config and explicitly pass its path/credential variables through
   a reviewed Compose override; setting host variables alone does not do that.
5. Discover declarations and explicitly request a read/health check. No inference,
   provider discovery or tool execution runs automatically at startup.

Adapter IDs are lowercase letters/digits/hyphens; tool names use lowercase
letters/digits/underscores. `banking` is a reserved adapter namespace. Discovery
names use `<adapter-id-with-underscores>_<tool-name>`; collisions across declared
adapters are rejected. Definitions are copied and frozen when registered.

## Contract and validation

Definitions accept `id`, `name`, `version`, `baseUrl`, `auth`, optional static
`headers`/`healthPath`, and 1–100 tools. Unknown fields are rejected. Supported
authentication is `none`, `apiKey`, `bearer`, `basic`, and OAuth2 client credentials.
Credential fields reference environment variable names. OAuth accepts a server-owned
`tokenUrl` and optional `scope`. Embedded URL credentials and literal auth secrets
are rejected. Static headers cannot override credential, routing, hop-by-hop,
content-length or idempotency headers; names/values cannot contain header injection.

Tools accept `name`, `description`, `method`, `path`, `inputSchema`, optional
`readOnly`, `idempotency`, `timeoutMs`, `retry` and `statusPath`. Only GET is read-only;
other supported methods require idempotency and cannot declare automatic retries.
Timeouts are 1,000–120,000 ms. Read retries are bounded to 1–3 attempts; mutations
always dispatch at most once per pilot execution.

The supported schema subset is explicit, not a full JSON Schema implementation:

- Root and nested `object`: declared `properties`, optional `required` and
  `additionalProperties: false` (also the default). Unknown arguments are rejected.
- `string`, `number`, `integer`, `boolean`, `null`: type checks; primitive `enum`;
  finite numeric `minimum`/`maximum`; string `minLength`/`maxLength` up to 4,000.
- `array`: recursively validated `items`, `minItems`/`maxItems` up to 100.
- Optional bounded `description` metadata. Nesting is limited to five levels,
  with at most 64 properties per object. Unsupported schema keywords fail validation.

HTTP request bodies and validated parameters are limited to 64 KiB. POST requires
`application/json`. Tool path placeholders must reference declared scalar fields;
values cannot contain traversal segments, slashes, percent encodings or controls.
`healthPath` is literal; `statusPath` must bind `{idempotencyKey}` and no other field. URL query,
fragment and encoded traversal/route escapes are rejected in declarations.

## Egress and credentials

HTTPS is required by default for both backend and OAuth URLs. Production cannot
enable plain HTTP. Non-production `ADAPTER_ALLOW_LOCAL=true` explicitly enables
local/private fixture HTTP; do not use it to represent a production deployment.

The native HTTP client resolves once and pins that result to the socket, rejects
restricted addresses, follows no redirects, ignores proxy environment variables,
verifies TLS certificates, caps responses at 1 MiB and enforces a total per-request
DNS/connect/response deadline. Enterprise RFC1918/ULA backends require their exact
hostname in `ADAPTER_PRIVATE_HOSTS`; this does not permit loopback, link-local or
metadata addresses in production. OAuth token requests use the same transport.

OAuth token cache identity includes the actual client ID/secret, endpoint, scope
and deployment tenant. Secret removal/rotation and scope changes do not reuse an
older token. Tokens are not cached beyond their reported validity; an absent
`expires_in` does not invent a cache lifetime. Configured credential values and
raw provider error bodies are not copied into API errors or logs. Successful read
payloads intentionally contain backend data and must be handled as restricted
administrative responses; this is not automatic data classification/redaction.

## API

All paths are private service APIs, with `Cache-Control: no-store` after identity
validation. None accepts caller-supplied URL, credential, adapter definition or
arbitrary executable code.

| Method/path | Purpose |
| --- | --- |
| `GET /api/adapters` | Sanitized declarations, without configured credential values |
| `GET /api/adapters/:adapterId/tools` | Namespaced tool metadata |
| `GET /api/adapters/:adapterId/tools/:toolName` | One raw-name tool declaration |
| `POST /api/adapters/:adapterId/tools/:toolName/execute` | `{parameters, idempotencyKey?, sessionId?}`; sessionId is only a caller trace reference, not verified ownership |
| `POST /api/adapters/:adapterId/reconcile` | `{tool, idempotencyKey}`; bounded read of the configured status endpoint |
| `GET /api/adapters/:adapterId/health` | Explicit backend health request when a healthPath is declared |

Execution returns `completed` for a successful read or terminal pilot transport
response. It means HTTP completion, not independently proven business fulfillment.
A pilot mutation returning 202, non-2xx or an unconfirmed dispatched transport error
stays `uncertain` (API 202), because even an HTTP 5xx/4xx does not establish rollback.
Only a transport preflight known not to dispatch can report a failed mutation.
Raw upstream errors are replaced with safe messages.

`reconcile` never repeats the original mutation. It reads `statusPath` and accepts
only an authoritative 2xx response with `status: completed` or `status: failed`.
Other results remain uncertain. Without a status endpoint, it returns manual
lookup instructions. Do not retry uncertain work with a new key.

## Replay limits and verification

The pilot cache binds a key to canonical arguments, reserves it before dispatch,
and shares concurrent attempts. Changed arguments return 409. An active execution
cannot race a status lookup into a conflicting cached result. Capacity is bounded
and refuses new keyed work before dispatch rather than evicting unexpired entries.
Completed/failed/uncertain results can be replayed during the cache lifetime.

This is still a **single-process, in-memory, 24-hour cache**, not durable dedupe.
It is lost on restart, does not coordinate replicas and expires old records.
Qualified backend idempotency and the orchestrator's durable effect ledger remain
necessary before customer mutations can be supported. There is no webhook receiver,
customer-delegated OAuth, production mutation switch or generic action installer.

The MCP regression suite covers malformed declarations, nested/unknown arguments,
namespace collisions, mandatory service identity, production mutation denial,
concurrent replay/argument conflicts, uncertain outcomes, bounded read retries,
OAuth rotation/scope/expiry, restricted DNS, pinned fixture sockets, redirect refusal
and response limits. Tests use deterministic transports and local synthetic HTTP
servers; they do not qualify an enterprise CRM, live provider or billing outcome.
Run `npm test -w services/mcp-service -- --runInBand` with Node 22.
