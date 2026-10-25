# Banking API quick reference

Default direct base: `http://localhost:3005/api/v1`. Run the service using the
[README](README.md); see [API behavior and specification limits](API-DOCUMENTATION.md).
The table below lists actual non-commented route registrations, grouped by their
mount in [server.js](server.js). Resource identifiers are validated by the server.

| Module | Method | Path beneath `/api/v1` |
| --- | --- | --- |
| [auth](routes/auth.js) | `POST` | `/auth/login` |
| [auth](routes/auth.js) | `POST` | `/auth/refresh` |
| [auth](routes/auth.js) | `POST` | `/auth/logout` |
| [auth](routes/auth.js) | `GET` | `/auth/me` |
| [accounts](routes/accounts.js) | `GET` | `/accounts` |
| [accounts](routes/accounts.js) | `GET` | `/accounts/:accountId` |
| [accounts](routes/accounts.js) | `POST` | `/accounts` |
| [accounts](routes/accounts.js) | `PUT` | `/accounts/:accountId` |
| [accounts](routes/accounts.js) | `DELETE` | `/accounts/:accountId` |
| [accounts](routes/accounts.js) | `GET` | `/accounts/:accountId/balance` |
| [accounts](routes/accounts.js) | `GET` | `/accounts/:accountId/transactions` |
| [accounts](routes/accounts.js) | `GET` | `/accounts/:accountId/statements` |
| [accounts](routes/accounts.js) | `POST` | `/accounts/:accountId/freeze` |
| [accounts](routes/accounts.js) | `POST` | `/accounts/:accountId/unfreeze` |
| [accounts](routes/accounts.js) | `GET` | `/accounts/:accountId/activity` |
| [transactions](routes/transactions.js) | `GET` | `/transactions` |
| [transactions](routes/transactions.js) | `GET` | `/transactions/pending` |
| [transactions](routes/transactions.js) | `GET` | `/transactions/search` |
| [transactions](routes/transactions.js) | `GET` | `/transactions/summary` |
| [transactions](routes/transactions.js) | `GET` | `/transactions/categories` |
| [transactions](routes/transactions.js) | `GET` | `/transactions/:transactionId` |
| [transactions](routes/transactions.js) | `POST` | `/transactions` |
| [transactions](routes/transactions.js) | `POST` | `/transactions/:transactionId/cancel` |
| [transactions](routes/transactions.js) | `POST` | `/transactions/:transactionId/receipt` |
| [cards](routes/cards.js) | `GET` | `/cards` |
| [cards](routes/cards.js) | `GET` | `/cards/:cardId` |
| [cards](routes/cards.js) | `POST` | `/cards` |
| [cards](routes/cards.js) | `PUT` | `/cards/:cardId` |
| [cards](routes/cards.js) | `POST` | `/cards/:cardId/block` |
| [cards](routes/cards.js) | `POST` | `/cards/:cardId/unblock` |
| [cards](routes/cards.js) | `POST` | `/cards/:cardId/replace` |
| [cards](routes/cards.js) | `POST` | `/cards/:cardId/activate` |
| [transfers](routes/transfers.js) | `GET` | `/transfers` |
| [transfers](routes/transfers.js) | `GET` | `/transfers/:transferId` |
| [transfers](routes/transfers.js) | `POST` | `/transfers` |
| [transfers](routes/transfers.js) | `POST` | `/transfers/:transferId/cancel` |
| [fraud](routes/fraud.js) | `GET` | `/fraud/alerts` |
| [fraud](routes/fraud.js) | `GET` | `/fraud/alerts/:alertId` |
| [fraud](routes/fraud.js) | `POST` | `/fraud/alerts` |
| [fraud](routes/fraud.js) | `PUT` | `/fraud/alerts/:alertId` |
| [fraud](routes/fraud.js) | `POST` | `/fraud/alerts/:alertId/confirm` |
| [fraud](routes/fraud.js) | `POST` | `/fraud/alerts/:alertId/false-positive` |
| [fraud](routes/fraud.js) | `POST` | `/fraud/alerts/:alertId/verify` |
| [disputes](routes/disputes.js) | `GET` | `/disputes` |
| [disputes](routes/disputes.js) | `GET` | `/disputes/:disputeId` |
| [disputes](routes/disputes.js) | `POST` | `/disputes` |
| [disputes](routes/disputes.js) | `PUT` | `/disputes/:disputeId` |
| [disputes](routes/disputes.js) | `POST` | `/disputes/:disputeId/evidence` |
| [disputes](routes/disputes.js) | `POST` | `/disputes/:disputeId/resolve` |
| [disputes](routes/disputes.js) | `POST` | `/disputes/:disputeId/withdraw` |

`POST /auth/login` and `/auth/refresh` are unauthenticated entrypoints. `/auth/me`,
`/auth/logout`, and business routes require a valid access token; ownership and
administrative checks vary by route. Customer/KYC, card PIN/limit, and recurring
transfer examples in old documents are not mounted endpoints.

Read-only example, with `ACCESS_TOKEN` set from the deployment's authenticated login:

```bash
curl --fail http://localhost:3005/api/v1/accounts \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Public service paths outside `/api/v1` are `/health`, `/health/ready`, `/health/live`,
`/api/docs`, `/openapi.yaml`, and static documentation assets. Use `/health/ready`
for database readiness. The OpenAPI document retains legacy coverage; source
routes take precedence until it is reconciled.

Servicing design, identity federation, model provider configuration, and adapter
operations are separate APIs. See the [studio operator guide](../frontend/OPERATIONS-CONSOLE.md)
and [system documentation](../../docs/README.md).
