# OpenAPI Spec - Missing Endpoints Analysis

## Current State
The `openapi.yaml` file only includes:
- ✅ Authentication endpoints (`/auth/*`)
- ✅ Customer endpoints (`/customers/*`)
- ✅ KYC endpoints (`/customers/{id}/kyc/*`)
- ✅ Health endpoint (`/health`)

## Missing Endpoints

### 1. Accounts Endpoints (`/api/v1/accounts`)
- `GET /accounts` - Get all accounts for user
- `GET /accounts/:id` - Get specific account
- `GET /accounts/:id/balance` - Get account balance
- `GET /accounts/:id/statement` - Get account statement
- `POST /accounts` - Create new account
- `PUT /accounts/:id` - Update account
- `POST /accounts/:id/close` - Close account

### 2. Transactions Endpoints (`/api/v1/transactions`) ❌ MISSING
- `GET /transactions` - Get all transactions
- `GET /transactions/:transactionId` - Get specific transaction
- `POST /transactions` - Create new transaction
- `GET /transactions/pending` - Get pending transactions
- `POST /transactions/:transactionId/cancel` - Cancel transaction
- `GET /transactions/search` - Search transactions
- `GET /transactions/summary` - Get transaction summary
- `POST /transactions/:transactionId/receipt` - Generate receipt
- `GET /transactions/categories` - Get transaction categories

### 3. Cards Endpoints (`/api/v1/cards`)
- `GET /cards` - Get all cards for user
- `GET /cards/:cardId` - Get specific card
- `POST /cards` - Create/request new card
- `PUT /cards/:cardId` - Update card details
- `POST /cards/:cardId/activate` - Activate card
- `POST /cards/:cardId/block` - Block card
- `POST /cards/:cardId/unblock` - Unblock card
- `PUT /cards/:cardId/pin` - Update PIN
- `PUT /cards/:cardId/limits` - Update card limits

### 4. Transfers Endpoints (`/api/v1/transfers`)
- `GET /transfers` - Get all transfers
- `GET /transfers/:transferId` - Get specific transfer
- `POST /transfers` - Create new transfer
- `POST /transfers/internal` - Internal transfer
- `POST /transfers/external` - External transfer
- `POST /transfers/p2p` - Peer-to-peer transfer
- `GET /transfers/pending` - Get pending transfers
- `POST /transfers/:transferId/cancel` - Cancel transfer

### 5. Fraud Alert Endpoints (`/api/v1/fraud`) ❌ MISSING
- `GET /fraud/alerts` - Get fraud alerts
- `GET /fraud/alerts/:alertId` - Get specific alert
- `POST /fraud/alerts` - Create/report fraud alert
- `PUT /fraud/alerts/:alertId` - Update alert status (Admin)
- `POST /fraud/alerts/:alertId/confirm` - Confirm fraud (Admin)
- `POST /fraud/alerts/:alertId/false-positive` - Mark as false positive (Admin)

### 6. Disputes Endpoints (`/api/v1/disputes`) ❌ MISSING
- `GET /disputes` - Get all disputes
- `GET /disputes/:disputeId` - Get specific dispute
- `POST /disputes` - Create new dispute
- `PUT /disputes/:disputeId` - Update dispute
- `POST /disputes/:disputeId/evidence` - Add evidence

## Summary
**Total Endpoints in Routes**: ~50+
**Documented in OpenAPI**: ~12
**Missing**: ~38 endpoints

## Priority
🔴 **HIGH PRIORITY** - Add missing core endpoints:
1. Transactions (9 endpoints)
2. Fraud Alerts (6 endpoints)
3. Disputes (5 endpoints)

🟡 **MEDIUM PRIORITY**:
4. Accounts (7 endpoints)
5. Cards (9 endpoints)
6. Transfers (8 endpoints)

## Next Steps
Generate complete OpenAPI spec sections for:
1. Transactions endpoints with schemas
2. Fraud alerts endpoints with schemas
3. Disputes endpoints with schemas
4. Accounts endpoints (if not already complete)
5. Cards endpoints
6. Transfers endpoints

## Tags Needed
Add these tags to the OpenAPI spec:
- `Accounts` - Account management
- `Transactions` - Transaction operations
- `Cards` - Card management
- `Transfers` - Money transfers
- `Fraud` - Fraud detection and alerts
- `Disputes` - Dispute management
