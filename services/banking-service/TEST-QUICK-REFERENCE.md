# Banking test quick reference

See [README-TESTING.md](README-TESTING.md) for scope and prerequisites.

```bash
npm test -w services/banking-service -- --runInBand
npm test -w services/banking-service -- --runInBand routes/__tests__
npm test -w services/banking-service -- --runInBand middleware/__tests__
npm test -w services/banking-service -- --runInBand database/scripts/__tests__
```

The last command runs live PostgreSQL bootstrap tests only when
`BANKING_TEST_DATABASE_URL` names an isolated `banking_test` database. Otherwise
that suite is skipped. These tests create/drop temporary databases and must not
use an application database.

For a running banking service:

```bash
curl --fail http://localhost:3005/health/live
curl --fail http://localhost:3005/health/ready
```

Use the [current API inventory](API-QUICK-REFERENCE.md) with a valid access token
for functional checks. Legacy scripts targeting customer port 3010 are described
in [tests/README.md](tests/README.md); their old success counts are not current
acceptance criteria.
