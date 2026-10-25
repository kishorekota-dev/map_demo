# Historical customer-service test harnesses

> **Historical scope.** These scripts target the earlier customer API topology,
> commonly at port 3010. Current banking routes run at port 3005 and do not mount
> the customer/KYC APIs expected here. Use [current testing instructions](../README-TESTING.md)
> and the [API inventory](../API-QUICK-REFERENCE.md) for maintained verification.

| Retained file | Behavior and limitation |
| --- | --- |
| `e2e-api-test.js` | Uses `API_GATEWAY` and `CUSTOMER_SERVICE` overrides, defaults to 3001/3010, and writes customer-service reports |
| `e2e-api-test.sh` | Bash/cURL customer-service scenarios with embedded legacy addresses |
| `e2e-api-test-simple.sh` | Direct port-3010 customer API scenarios |
| `test-authentication.sh` | Authentication scenarios with embedded port-3010 base and fixture credentials |
| `test-data.json` | Historical customer fixture data |
| `package.json` | Standalone Node/Bash harness commands, distinct from workspace Jest |

These scripts can create, update, or delete fixture records and generate reports.
Do not run them against production or assume that substituting port 3005 makes
their contracts current. A previous report's pass count or timing is a historical
observation, not a guarantee for the present build.

The maintained bootstrap SQL tests live at
[database/scripts/__tests__](../database/scripts/__tests__) and use explicitly
provisioned disposable databases. See [database operations](../database/README.md)
for current migration and seed behavior.
