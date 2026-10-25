# Banking test architecture

The maintained entrypoint is the workspace Jest command in
[package.json](package.json). See [testing instructions](README-TESTING.md).

| Layer | Source | Evidence boundary |
| --- | --- | --- |
| JWT/TLS settings | [security tests](database/scripts/__tests__/security.test.js) | Configuration guards; no provider traffic |
| Signed role claims | [auth tests](routes/__tests__/auth-control-plane-claims.test.js) | Tokens reflect trusted mocked database roles |
| Route ordering | [transaction routes](routes/__tests__/transactions.route-order.test.js) | Static routes precede parameter routes |
| Ownership and validation | [middleware tests](middleware/__tests__) | Authorization/validation branches with fixtures |
| Transaction repository | [repository tests](database/repositories/__tests__/TransactionRepository.test.js) | Atomic callback/query behavior with a mocked database |
| Bootstrap integration | [PostgreSQL tests](database/scripts/__tests__/bootstrap.integration.test.js) | Real isolated SQL, locks, rollback, seeds, reset, and startup exit behavior |

The integration suite creates separate disposable databases from an explicitly
supplied `BANKING_TEST_DATABASE_URL`; it does not use customer fixtures from an
existing deployment. CLI failure tests replace the application command with a
marker, proving that failed bootstrap never reaches the command.

Historical customer-service E2E scripts are a separate, obsolete topology. They
are retained for recordkeeping and are not invoked by the current workspace Jest
suite. Frontend, gateway, orchestrator, connector, and live-provider tests belong
to their own workspaces. No single layer proves the whole serving path.
