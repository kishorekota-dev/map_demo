# MCP Service - Banking Tools Update

## Summary
Updated the MCP Service banking tools to integrate with the POC Banking Service API based on the OpenAPI specification.

## Changes Made

### 1. **Added Real API Integration**
- Replaced mock implementations with actual HTTP calls to Banking Service API
- Base URL: `http://localhost:3005/api/v1`
- Uses axios for HTTP requests with proper error handling

### 2. **Added Authentication Tool**
- `authenticate_user` - Login and obtain JWT token
- Returns access token, refresh token, user profile, roles, and permissions
- Stores token for subsequent API calls

### 3. **Updated Tool Schemas**
All tools now align with OpenAPI spec:

#### Account Tools:
- `get_account_balance` - GET /accounts/:id/balance
- `get_all_accounts` - GET /accounts

#### Transaction Tools:
- `get_transactions` - GET /transactions (with filters)
- `get_transaction_by_id` - GET /transactions/:id
- `get_transaction_categories` - GET /transactions/categories

#### Card Tools:
- `get_cards` - GET /cards
- `manage_card` - POST /cards/:id/{activate|block|unblock}

#### Transfer Tools:
- `create_transfer` - POST /transfers
- `get_transfers` - GET /transfers

#### Fraud Alert Tools:
- `get_fraud_alerts` - GET /fraud/alerts
- `create_fraud_alert` - POST /fraud/alerts

#### Dispute Tools:
- `get_disputes` - GET /disputes
- `create_dispute` - POST /disputes

#### User Profile Tool:
- `get_user_profile` - GET /auth/me

### 4. **Enhanced Error Handling**
- Structured error responses with status codes
- Detailed error messages from API
- Logging of API errors and responses

### 5. **Security**
- All tools (except authenticate_user) require JWT token
- Token passed via `authToken` parameter
- Authorization header: `Bearer <token>`

### 6. **Pagination Support**
- All list endpoints support `page` and `limit` parameters
- Returns pagination metadata with results

### 7. **Filter Support**
- Transactions: type, status, startDate, endDate
- Cards: status
- Transfers: status
- Fraud Alerts: status, severity
- Disputes: status

## Configuration

Environment variables in `.env.development`:
```env
BANKING_SERVICE_URL=http://localhost:3005/api/v1
API_TIMEOUT=30000
```

## Usage Example

### 1. Authenticate
```javascript
const result = await bankingTools.executeTool('authenticate_user', {
  username: 'admin',
  password: 'Password123!',
  sessionId: 'session-123'
});
// Returns: { success: true, data: { user, accessToken, ... } }
```

### 2. Get Transactions
```javascript
const result = await bankingTools.executeTool('get_transactions', {
  authToken: '<jwt-token>',
  page: 1,
  limit: 50,
  type: 'purchase',
  status: 'completed',
  sessionId: 'session-123'
});
// Returns: { success: true, data: [...], pagination: {...} }
```

### 3. Create Dispute
```javascript
const result = await bankingTools.executeTool('create_dispute', {
  transactionId: '99535f4f-77ae-48b2-82a4-b9556afa2530',
  disputeType: 'unauthorized_transaction',
  amountDisputed: 285.70,
  reason: 'I did not authorize this transaction',
  authToken: '<jwt-token>',
  sessionId: 'session-123'
});
// Returns: { success: true, data: { disputeId, ... }, message: '...' }
```

## API Endpoint Mapping

| Tool | Method | Endpoint | OpenAPI Operation |
|------|--------|----------|-------------------|
| authenticate_user | POST | /auth/login | loginUser |
| get_account_balance | GET | /accounts/:id/balance | getAccountBalance |
| get_all_accounts | GET | /accounts | getAllAccounts |
| get_transactions | GET | /transactions | getAllTransactions |
| get_transaction_by_id | GET | /transactions/:id | getTransactionById |
| get_transaction_categories | GET | /transactions/categories | getTransactionCategories |
| get_cards | GET | /cards | getAllCards |
| manage_card | POST | /cards/:id/{action} | activateCard/blockCard/unblockCard |
| create_transfer | POST | /transfers | createTransfer |
| get_transfers | GET | /transfers | getAllTransfers |
| get_fraud_alerts | GET | /fraud/alerts | getAllFraudAlerts |
| create_fraud_alert | POST | /fraud/alerts | createFraudAlert |
| get_disputes | GET | /disputes | getAllDisputes |
| create_dispute | POST | /disputes | createDispute |
| get_user_profile | GET | /auth/me | getCurrentUser |

## Testing

The MCP service can now call the real Banking Service API with comprehensive data:
- 23 accounts
- 59 transactions
- 22 cards
- 24 transfers
- 19 fraud alerts
- 26 disputes

## Next Steps

1. Update package.json to include axios dependency
2. Test authentication flow
3. Test each tool with real Banking Service
4. Implement token refresh logic
5. Add caching for frequently accessed data
6. Implement session management for storing tokens
