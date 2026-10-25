# Banking migration quick reference

See the [database operator guide](database/README.md) before changing persistent
state. Commands below run from the repository root.

```bash
./scripts/run-with-env.sh node services/banking-service/database/scripts/check-connection.js
./scripts/run-with-env.sh npm run db:migrate -w services/banking-service
```

| Operation | Current behavior |
| --- | --- |
| Migrate | Numeric version order; shared database lock; SQL and history commit together |
| Repeat migrate | Skips successful versions; validates checksums recorded by the current runner |
| Changed applied SQL | Fails; restore the file and add a new version |
| Legacy history without checksum | Reported explicitly; original source is not retroactively verified |
| `migrate:undo` | Fails because rollback is unsupported |
| Seed | Explicit non-production command; atomic bundle on an empty database, repeat matching bundle is a no-op |
| Reset | Explicit non-production guard and confirmation; removes banking-owned schema/data |

Container bootstrap defaults to migrations enabled and demo seeds disabled.
`BANKING_RUN_MIGRATIONS=false` delegates schema ownership to an external migration
job; it is not a way to bypass a failed migration. Never delete schema history to
make a migration appear successful.
