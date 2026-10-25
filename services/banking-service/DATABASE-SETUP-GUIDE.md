# Banking database setup guide

The maintained procedure is [database/README.md](database/README.md). It documents
connection settings, numeric versioned migrations, explicit non-production demo
seeding, reset safeguards, and recovery. Full-stack provisioning starts at the
[repository documentation index](../../docs/README.md).

From the repository root, after provisioning the intended PostgreSQL database:

```bash
./scripts/run-with-env.sh node services/banking-service/database/scripts/check-connection.js
./scripts/run-with-env.sh npm run db:migrate -w services/banking-service
```

For an empty disposable development/test database only:

```bash
./scripts/run-with-env.sh npm run db:seed -w services/banking-service
```

The root wrapper loads `.env.development`; `APP_ENV_FILE` selects another reviewed
file. Banking reads `DB_*` connection settings, not `DATABASE_URL`. Production
container startup requires an explicit strong JWT secret, blocks demo seeding,
and stops on migration failure. TLS certificate verification is enabled whenever
`DB_SSL=true`; a CA file can be supplied.

Migration history, not a customer count or an old completion report, establishes
which schema versions were applied. A successful connection alone does not prove
that schema, identities, roles, or application serving paths are ready.
