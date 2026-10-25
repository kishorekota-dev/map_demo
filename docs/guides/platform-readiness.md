# Platform readiness and reusable solutions

The supported platform is a dedicated enterprise deployment. Its control plane
owns versioned business configuration; code-owned adapters, tools and credential
registries supply execution. The **Platform & solutions** workspace adds runtime
diagnostics and reusable configuration packages to the same release process.

## Prepare a deployment

Follow [Deployment](deployment.md) for the complete Compose migration/start order.
Use a protected completed environment file and set `APP_ENV_FILE` to its absolute
path. Environment files contain dotenv data, with no shell substitution or
variable expansion. Do not use `source` to load generated files.

```bash
export APP_ENV_FILE=/absolute/path/deployment.env
npm run production:preflight -- --env "$APP_ENV_FILE" --compose
```

The preflight rejects development credentials, missing durability, unsafe browser
origins, inconsistent timeouts, unresolved model credentials and invalid public
runtime files/mounts. It also renders the merged production Compose configuration
without exposing the rendered secret values. It makes no database, identity,
connector or model calls. Blank production template values intentionally fail.
Compose 2.24.4+ is required for the overlay's inherited port removal.

Provision PostgreSQL/Redis, back up existing data, then run the separate banking
and servicing migration jobs before application startup. The servicing runner
applies configuration/operations, AI base tables and effect ledger, and chat base
and handoff schemas. Database locks serialize runners; transactions stop on
failure. Production processes use `DATABASE_MANAGE_SCHEMA=false` and the other
schema-management flags in the template, verifying required tables/columns
instead of applying ORM synchronization. Use a migration identity with DDL rights
and a runtime identity with only the required data permissions.

For host tooling, `npm run platform:migrate` expects database URLs already loaded:

```bash
./scripts/run-with-env.sh npm run platform:migrate
```

For bundled containers, use the separate jobs in the deployment guide; private
Compose database URLs cannot be reached directly from host tooling. Production
forbids demo seeding and database reset. `npm run docker:production` is the final
application startup convenience command **after** preflight and migrations; it
repeats static preflight but does not run migrations automatically.

## Bootstrap the first administrator

After banking migrations, use the offline deployment CLI with direct access to
the intended banking database. Host execution requires explicit `DB_HOST`,
`DB_NAME`, `DB_USER` and `DB_PASSWORD` (plus port/TLS settings as needed); the
banking CLI does not read the other services' PostgreSQL URL variables. The bundled
production Compose service already injects these settings, so run the one-shot
CLI inside that configured banking service when using private Compose databases.
Set `DEPLOYMENT_TENANT_ID` and confirm it with the
identical `BANKING_ADMIN_TENANT_ID`; supply `BANKING_ADMIN_EMAIL` and optionally
`BANKING_ADMIN_USERNAME`. For a new identity use a 16–72 byte password containing
upper/lowercase letters, a number and a symbol through `BANKING_ADMIN_PASSWORD`
or standard input. Avoid command arguments or shell history containing passwords.

```bash
npm run platform:bootstrap -- --password-stdin
# Or grant only an already active local identity; no password is changed:
npm run platform:bootstrap -- --existing-only
```

The CLI creates/grants only `CONTROL_PLANE_ADMIN`, uses bcrypt for new identities,
serializes database changes and records a deployment-CLI audit event. Existing
locked/inactive identities are rejected. Repeated grants are idempotent; the CLI
does not reset existing passwords. This is an authorized deployment operator
procedure, with no public registration/bootstrap HTTP endpoint. Sign in again to
obtain current signed roles. See [banking operator guide](../../services/banking-service/README.md#servicing-roles-and-model-boundary)
for container execution and identity mapping details.

## Read runtime diagnostics

Open Servicing Studio → **Platform & solutions**. Viewer, operator, editor and
administrator roles can read/export the sanitized report. Checks cover:

- Configuration and operational database access and required normalized schemas.
- Banking readiness and chat, orchestrator, MCP and NLU health contracts.
- The gateway's connected shared Redis rate limiter.
- Minimum gateway production settings: distinct signing/service keys, durable
  stores, HTTPS browser origins and disabled development network exceptions.

The gateway configuration list is narrower than the static deployment preflight.
In development it can show unmet production settings while runtime availability
passes. In production both lists must pass for gateway readiness. Gateway startup
validates minimum configuration and its own durable stores before listening;
downstream service order is handled by readiness instead of a startup dependency
cycle. MCP/NLU require `X-Servicing-Service-Token` in production; gateway and
orchestrator/chat callers attach the trusted server token. Customer JWTs still
authorize banking actions.

Public `/health` and `/health/live` are liveness probes. `/health/ready` and
`/health/services` return only `{ready,checkedAt}` with 200/503. Detailed checks
require a signed operator at `/api/platform/readiness`. HTTP dependency probes
run concurrently with deadlines and no redirects, and successful HTTP HTML is
rejected. Reports are cached for five seconds to avoid probe storms. Storage probes also have a four-second response deadline; a blocked probe is
reused instead of accumulating pool work across refreshes. Database queries retain
their store timeout limits. Reports contain no endpoint URLs,
credentials, raw dependency errors or customer records.

A passing report proves the checked infrastructure contracts at that moment. It
does not prove live call media/transfer, connector semantics, IdP access, model
quality, customer journey completion, capacity, recovery objectives or compliance.
Export reports for support alongside the relevant release/version and sanitized
operational evidence; never attach raw production environment files.

## Install a reusable solution draft

The catalog includes a banking baseline, service desk fulfillment and a knowledge
assistant. Service desk and knowledge packages add typed intents, journeys and
queues; they do not configure enterprise credentials or ingest approved documents.

1. Save or discard local unsaved configuration edits before opening a package.
2. Select a built-in solution or import a JSON package no larger than 512,000 bytes.
3. Preview its semantic diff and fingerprints. Preview is read-only.
4. Review any conflicting IDs/sections. Explicitly allow replacement only when
   intending to replace those existing settings, and enter a change note.
5. Apply to the draft. A changed draft/package returns 409; refresh and preview
   again rather than replaying stale evidence.
6. Complete contract evaluation, independent approval and publication/promotion
   under the deployment's configured gates. Application never publishes.

Exports can use draft or published configuration. Transfer approved exports through
the enterprise's normal artifact review process; package digests establish content
identity, not authorship/signature trust. No public package marketplace or arbitrary
plugin-code installer is provided.

Schema version 1 accepts `manifest` and `configuration`. Configuration lists merge
by ID without deleting existing entries; supplied prompt properties merge;
recognition/model sections replace as a whole. The entire resulting draft must
pass the strict existing validator. Canonical required financial fields,
confirmation floors and registered tool allowlists remain mandatory. Packages
cannot add executable scripts, new tool implementations, secrets or endpoints.
Audit records retain package ID/version/digest, actor and note. Active sessions
keep their pinned published release throughout this workflow.

See the [API contract](../../services/api-gateway/platform/README.md) for exact
payloads and the [control-plane guide](control-plane.md) for release governance.

## Extend the platform

| Extension | Code/configuration boundary |
| --- | --- |
| Model provider | Server registry adapter with bounded text/JSON, explicit credentials, trusted endpoints and no model tool execution |
| Case adapter | Idempotent operation IDs, signed callbacks, timeout/unknown-outcome reconciliation |
| Voice adapter | Signed speech/DTMF turns, replay protection, interruption/transfer actions and enterprise customer identity |
| Knowledge adapter | Trusted permissioned text, source IDs, revisions, expiry and ACL mapping |
| Domain tool | Reviewed code-owned tool schema and authorization, exposed through MCP and the orchestrator tool registry |
| Solution package | Validated business configuration, reviewed draft merge and normal release governance |

The banking accelerator remains the implemented financial domain. A new industry
requires reviewed domain APIs/tools and enterprise mappings; a solution package
alone cannot create a new authenticated system integration. Shared SaaS billing,
SCIM, a general workflow-code marketplace and managed telephony are separate work.

## Upgrade and recovery

Keep environment/registry references, database backups, schema versions and the
current release fingerprint with each deployed application revision. Test upgrades
against a restored representative database before changing production. Run
migrations once before starting a version that requires them. Never roll code
back across incompatible database changes without a reviewed restore/migration
plan. Configuration rollback restores a release, not the database or an external
financial effect.

During recovery, pause fulfillment workers, restore the owning stores, inspect
leased/dispatched/uncertain operations and reconcile external outcomes before
resuming. Preserve replay tombstones and idempotency records. Execute and measure
a customer-approved backup/restore rehearsal; this repository does not establish
RPO/RTO merely by retaining durable records. See the [recovery runbook](servicing-operations.md).
