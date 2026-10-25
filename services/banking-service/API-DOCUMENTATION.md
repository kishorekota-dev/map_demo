# Banking API contract guide

The current route inventory is [API-QUICK-REFERENCE.md](API-QUICK-REFERENCE.md),
derived from [server.js](server.js) and the mounted [route modules](routes).
The default direct base is `http://localhost:3005/api/v1`.

## Authentication and authorization

`POST /auth/login` accepts JSON `{ "username": "...", "password": "..." }`.
A successful response uses `data.user`, `data.tokens`, `data.roles`, and
`data.permissions`. `data.tokens.accessToken` is the bearer token. Role names and
the deployment tenant in the token come from trusted server/database state, not
request-supplied role fields. `POST /auth/refresh` accepts `{ "refreshToken": "..." }`
and re-reads current roles. `/auth/me` and `/auth/logout` require authentication.

Send `Authorization: Bearer <access-token>` on protected calls. The current
middleware rejects missing, invalid or expired access tokens with 401; role and
ownership denials use 403. Clients must inspect the returned error as well as status.
Individual routes apply ownership, validation, rate limits, and administrative
checks. Do not assume every signed role is a banking administrator.

Every environment requires an explicit JWT key shared by signing and verification;
production additionally requires a non-placeholder key of at least 32 characters.
Access JWT expiry defaults to `15m`, refresh JWT expiry to `7d`.
The current persisted refresh-token expiry is also written as seven days, so
changing only the refresh-JWT setting does not change that database retention.

## Confirmed business mutations and outcome lookup

All POST/PUT/PATCH/DELETE routes under accounts, transactions, transfers, cards,
fraud and disputes require both `Idempotency-Key` and `X-Servicing-Confirmation`
in addition to the customer's access token. Authentication/login/refresh follows
its existing protocol. Apply migration V10 before starting this service.

The trusted servicing runtime issues a short-lived confirmation proof for the
original customer, tenant, caller key, method, path and body. A browser Boolean
is not confirmation proof. The existing orchestrator/MCP path supplies these
headers after confirmed workflow execution; external business clients must adopt
the same reviewed contract. See [durable mutation details](README.md#confirmed-durable-business-mutations)
and [the owning guard](middleware/durableMutation.js).

A completed exact-key retry replays the original response without executing the
controller again. Changed arguments return 409. Definitive failures roll back and
allow explicit exact-key retry; mutations are never automatically retried. A lost
commit acknowledgement returns 202 with an uncertain outcome, reconciliation
reference and `/api/v1/mutation-status/:key`. This authenticated owner/tenant-bound
GET returns completed evidence, in-progress uncertainty, or authoritative absence
after acquiring the operation lock. Through the gateway its path is
`/api/banking/v1/mutation-status/:key`. Reconcile uncertainty before another action.

## Response and validation behavior

Authentication commonly returns `{ status, data, metadata }`; banking controllers
also return their own `{ success, data, ... }` envelopes. Errors may expose a string
`error` or an object with `code` and `message`. There is no single enforced response
schema across all routes. Use the actual controller and existing client adapters
when integrating.

[middleware/validation.js](middleware/validation.js) defines accepted bodies,
identifiers, and pagination. [middleware/auth.js](middleware/auth.js) and the
individual route module define authorization. A route's existence does not certify
end-to-end settlement, provider connectivity, or production readiness.

## Specification status

[openapi.yaml](openapi.yaml) is served at `/openapi.yaml`. Outside production the
static API UI at `/api-docs.html` loads it; production disables static test/UI
assets. It still contains legacy customer/KYC endpoints and old
server addresses and omits parts of the current banking routes. Treat it as an
incomplete historical specification until reconciled; the route inventory and
source take precedence. `/api/docs` returns a service endpoint summary, not the
complete OpenAPI document.

Customer/KYC tables created by V8 support authentication data, but the current
server does not mount `/api/v1/customers` or its KYC routes. Commented examples in
route files are not implemented endpoints. Scheduled/recurring transfer APIs,
card PIN/limit APIs, and several fraud/report endpoints remain commented out.

## Servicing integration

Banking tools are reached through the established MCP/orchestrator path. The
control plane, enterprise identity, provider registry, and fulfillment adapters
are separate gateway/runtime modules. See
[control plane](../../docs/guides/control-plane.md),
[operations](../../docs/guides/servicing-operations.md), and
[model providers](../../docs/guides/llm-providers.md).
The [testing guide](README-TESTING.md) distinguishes current route tests from
legacy customer-service test harnesses.
