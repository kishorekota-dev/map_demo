# Banking database operations

This module uses `pg` and versioned SQL files. The migration runner is Node code;
it is **not the Flyway CLI**, despite the compatible history-table name
`flyway_schema_history`. See the [banking README](../README.md) and
[documentation index](../../../docs/README.md).

## Connection and commands

Use Node.js 22+ and run from the repository root. Provision the database before
running migrations; the runner does not create it.

```bash
./scripts/run-with-env.sh node services/banking-service/database/scripts/check-connection.js
./scripts/run-with-env.sh npm run db:migrate -w services/banking-service
```

The wrapper exports `.env.development` before npm changes working directories.
Set `APP_ENV_FILE` for another reviewed environment. `database/config.js` reads
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`. Development defaults
are localhost, 5432, `poc_banking`, and the development PostgreSQL user/password.
Production requires explicit nonempty `DB_HOST`, `DB_NAME`, `DB_USER`, and
`DB_PASSWORD`; only the port may default to 5432. Missing or blank settings stop
configuration loading before a pool or any migration/bootstrap/server starts.
Set them for the intended database. Pool limits use `DB_POOL_MIN`, `DB_POOL_MAX`,
`DB_IDLE_TIMEOUT`, and `DB_CONNECTION_TIMEOUT`. `DATABASE_URL` is not the banking
pool's connection source. Host administrative commands must supply the banking
`DB_*` values separately from the root production template's servicing URLs, or
run inside the configured banking container using the
[administrator instructions](../README.md#servicing-roles-and-model-boundary).

`DB_SSL=true` enables certificate verification. Set `DB_SSL_CA_FILE` to a trusted
CA PEM file where needed. `DB_SSL_REJECT_UNAUTHORIZED=false` is permitted only
outside production; it is rejected in production rather than silently weakening
TLS. `DB_SSL=false` disables TLS and must be chosen only for an appropriate
network/deployment configuration.

## Migration contract

[scripts/migrate.js](scripts/migrate.js) discovers `V<number>__<description>.sql`,
orders versions numerically, and rejects duplicate versions. A shared PostgreSQL
advisory lock serializes migration, seed, and reset maintenance. Each migration
and its history insertion run in one transaction. Failure rolls back that
migration and exits unsuccessfully; container startup then stops.

New records include a SHA-256 source checksum. Changing an applied migration is
rejected: add a new version instead. Older successful history rows without a
checksum are reported as legacy records; their original source cannot be verified
retroactively. Already-applied migrations are skipped.

| Version | Schema area |
| --- | --- |
| V1 | Users and update timestamp function |
| V2 | Accounts and account-number function |
| V3 | Transactions and reference-number function |
| V4 | Cards |
| V5 | Transfers |
| V6 | Fraud alerts |
| V7 | Disputes and case-number function |
| V8 | Roles, permissions, refresh tokens, audit, customer tables, and authentication columns |
| V9 | Control-plane role definitions; no automatic grants to customers |

The migrations are in [migrations](migrations). Back up persistent databases and
review DDL before deployment. `migrate:undo` is a legacy package-script name: its
argument is explicitly rejected, because reverse migration is not implemented.
Use a reviewed forward migration or tested backup restoration.

## Optional demo seeds

```bash
./scripts/run-with-env.sh npm run db:seed -w services/banking-service
```

[scripts/seed.js](scripts/seed.js) rejects production mode, checks for an empty set
of banking business tables, and applies all bundled SQL in one transaction. Seed
filenames are sorted: `000` system roles/permissions, `001` customers, `002`
authentication users, `003` their accounts, then the `01`–`06` banking fixtures.
V8 supplies the customer and authentication columns these seeds require.

A checksum marker in `banking_demo_seed_history` makes a repeat of the identical
bundle a no-op, preserving balances and other later changes. A changed bundle or
an unmarked database containing business data is rejected. This avoids partially
seeding existing installations. Do not insert a marker manually to bypass review.
The fixtures contain sample identities and documented demo password hashes; they
are not production provisioning.

For an initial production operator, use the
[administrator bootstrap procedure](../README.md#servicing-roles-and-model-boundary).
It works without demo seeds, confirms the deployment tenant, creates a strong
bcrypt-backed identity or grants an existing active identity, and records only
the explicit control-plane role change. Passwords are accepted from environment
or standard input and never reset for an existing user.

Container startup never seeds by default. `BANKING_SEED_DEMO_DATA=true` opts into
this same guarded operation outside production. The service-level `db:setup`
script runs migrations **and** seeds; the repository root `db:setup` is a separate
infrastructure helper. Prefer explicit commands so the intended effects are clear.

## Reset and recovery

Reset is destructive and intended only for disposable development/test databases.
The CLI requires `BANKING_ALLOW_DATABASE_RESET=true` and a typed `yes`, or an
explicit `--yes` argument. It refuses production mode. From the database directory,
the existing `npm run reset` command invokes [scripts/reset.js](scripts/reset.js).
The root workspace alias is `npm run db:reset -w services/banking-service`.

The reset transaction removes all banking-owned tables, including V8 authentication
and customer tables, seed/history tables, and the four helper functions. It does
not recreate or seed them. Run migrations afterward. Restore persistent data from
an approved backup instead of using reset as a migration-repair procedure.

Inspect migration evidence with:

```sql
SELECT version, script, installed_on, success, checksum_sha256
FROM flyway_schema_history ORDER BY installed_rank;
```

If a legacy installation has partial DDL or an untrusted history, inspect and
repair it deliberately; deleting history and replaying SQL is not a safe shortcut.
The old [setup-banking-tables.sql](setup-banking-tables.sql) is a historical manual
schema path and does not replace the versioned runner.

## Verification

[Bootstrap integration tests](scripts/__tests__/bootstrap.integration.test.js)
exercise actual disposable PostgreSQL: concurrent maintenance, numeric ordering,
transaction rollback, source drift, seed repetition and refusal, reset/remigration,
and startup failure propagation. See [testing](../README-TESTING.md) for the opt-in
connection contract. Unit tests also check JWT and TLS settings. No test result
establishes restore time, production capacity, or live financial-provider behavior.
