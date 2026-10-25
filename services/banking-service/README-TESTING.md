# Banking verification guide

Run from the repository root with Node.js 22+ and installed workspace dependencies:

```bash
npm test -w services/banking-service -- --runInBand
```

Current Jest tests cover route ordering, validation, ownership, transaction
repository behavior, signed operator claims, and bootstrap security. Most use
mocks and do not require a live banking deployment. They do not establish database
integration, model quality, provider settlement, or production performance.

## Disposable PostgreSQL integration

The bootstrap integration suite is opt-in. Provision a separate PostgreSQL 15+
instance and an empty database named **banking_test**. The test principal must be
able to create and drop disposable databases. Set `BANKING_TEST_DATABASE_URL` to
that isolated instance, then run:

```bash
npm test -w services/banking-service -- --runInBand database/scripts/__tests__
```

With the variable absent, the PostgreSQL suite is skipped. With it present, tests
require the database name `banking_test`, create temporary `banking_test_*`
databases, and drop them afterward. Do not point this configuration at application
or production data. Choose a free host port instead of disturbing a database
already bound to 5432.

The suite verifies real concurrent migration/seed execution, V2/V10 order, migration
and seed rollback, checksum drift, preservation of balances on repeat seeds,
refusal to seed existing business records, reset/remigration, production seed/reset
guards, and entrypoint failure propagation. See the
[test source](database/scripts/__tests__/bootstrap.integration.test.js).
It also provisions an initial administrator without demo data and verifies
tenant confirmation, password hashing, idempotency, role scope, audit identity,
and refusal to alter an existing password or grant a locked account.
The standard-input CLI check then performs real password login and an authenticated
`/auth/me` request against the migrated database, confirming issued JWTs work with
the current banking middleware and user schema.

The database configuration tests also launch isolated child processes to verify
that missing/blank production `DB_*` settings fail before a connection can be
created, a servicing `DATABASE_URL` cannot activate local defaults, complete
explicit production settings load, and development defaults remain supported.

## Live application verification

Use an isolated deployment and authenticated sample identities. Check
`/health/ready` first, then the [mounted API routes](API-QUICK-REFERENCE.md), ownership,
role denial, and required mutation confirmations. Record the build/revision,
configuration, test data, and results. A mocked route test or historical report
is not evidence that a live account action succeeded.

## Historical harnesses

The scripts under [tests](tests/README.md), `run-tests.sh`, and `setup-and-test.sh`
were written for the earlier customer service on port 3010 and archived Compose
layouts. They are not the current service acceptance suite. Changing only their
base URL does not update missing customer/KYC contracts or authentication.

`test-api.sh` and `test-banking-api.sh` are manual development helpers; inspect
endpoints, credentials, and write effects before using them on a disposable
instance. Current readiness must be measured by the current application, not
copied from `VALIDATION-RESULTS.md` or `TESTING-SUMMARY.md`.
