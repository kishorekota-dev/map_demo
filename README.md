# Credit Card Enterprise Backend API

A comprehensive mock API system for simulating a credit card enterprise backend with full CRUD operations, JWT authentication, and realistic financial data handling.

## 🚀 Features

### Core Services
- **Authentication & User Management** - JWT-based secure authentication
- **Account Management** - Credit/Debit account operations
- **Transaction Processing** - Purchase, refund, transfer operations
- **Balance Transfers** - Inter-account and promotional transfers
- **Dispute Management** - Transaction dispute handling
- **Fraud Protection** - Fraud case creation and monitoring
- **Card Management** - Card issuance, blocking, and maintenance

### Security Features
- JWT token authentication
- Password hashing with bcrypt
- Request validation with Joi
- Fraud detection and alerts
- Transaction blocking capabilities
- Comprehensive audit trails

### API Features
- RESTful API design
- Comprehensive error handling
- Pagination support
- Search and filtering
- Rate limiting ready
- CORS enabled
- Detailed logging

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm or yarn

## 🛠️ Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd map_demo
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configurations
```

4. Start the server:
```bash
# Development mode
npm run dev

# Production mode
npm start
```

The API will be available at `http://localhost:3000`

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api/v1
```

### Authentication
All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### Sample Test Users
```json
{
  "email": "john.doe@example.com",
  "password": "password123"
}
{
  "email": "jane.smith@example.com", 
  "password": "password123"
}
```

## 🔐 Authentication Endpoints

### Register User
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1-555-0123"
}
```

### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### Get Profile
```http
GET /api/v1/auth/profile
Authorization: Bearer <token>
```

## 💳 Account Management

### Get All Accounts
```http
GET /api/v1/accounts?page=1&limit=10&status=ACTIVE
Authorization: Bearer <token>
```

### Get Account Details
```http
GET /api/v1/accounts/{accountId}
Authorization: Bearer <token>
```

### Create New Account
```http
POST /api/v1/accounts
Authorization: Bearer <token>
Content-Type: application/json

{
  "accountType": "CREDIT",
  "creditLimit": 5000.00
}
```

### Get Account Balance
```http
GET /api/v1/accounts/{accountId}/balance
Authorization: Bearer <token>
```

### Get Account Statement
```http
GET /api/v1/accounts/{accountId}/statement?startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer <token>
```

## 💰 Transaction Management

### Get Transactions
```http
GET /api/v1/transactions?page=1&limit=10&type=PURCHASE&startDate=2024-01-01
Authorization: Bearer <token>
```

### Get Transaction Details
```http
GET /api/v1/transactions/{transactionId}
Authorization: Bearer <token>
```

### Create Transaction
```http
POST /api/v1/transactions
Authorization: Bearer <token>
Content-Type: application/json

{
  "accountId": "account-uuid",
  "amount": 100.50,
  "type": "PURCHASE",
  "merchantName": "Amazon",
  "description": "Online purchase",
  "location": {
    "city": "New York",
    "state": "NY",
    "country": "USA"
  }
}
```

### Search Transactions
```http
GET /api/v1/transactions/search?q=amazon&limit=10
Authorization: Bearer <token>
```

## 🔄 Balance Transfer Management

### Get Balance Transfers
```http
GET /api/v1/balance-transfers?page=1&limit=10&status=COMPLETED
Authorization: Bearer <token>
```

### Create Balance Transfer
```http
POST /api/v1/balance-transfers
Authorization: Bearer <token>
Content-Type: application/json

{
  "fromAccountId": "source-account-uuid",
  "toAccountId": "destination-account-uuid",
  "amount": 1000.00,
  "transferType": "BALANCE_TRANSFER",
  "description": "Balance transfer from Card A to Card B"
}
```

### Get Balance Transfer Offers
```http
GET /api/v1/balance-transfers/offers
Authorization: Bearer <token>
```

### Balance Transfer Calculator
```http
GET /api/v1/balance-transfers/calculator?amount=5000&fromRate=24.99&toRate=0.99&months=12
Authorization: Bearer <token>
```

## ⚖️ Dispute Management

### Get Disputes
```http
GET /api/v1/disputes?page=1&limit=10&status=UNDER_REVIEW
Authorization: Bearer <token>
```

### Create Dispute
```http
POST /api/v1/disputes
Authorization: Bearer <token>
Content-Type: application/json

{
  "transactionId": "transaction-uuid",
  "disputeType": "UNAUTHORIZED_CHARGE",
  "reason": "I did not make this transaction",
  "disputeAmount": 250.00,
  "evidence": [
    {
      "type": "EMAIL",
      "description": "Email showing I was out of town during transaction"
    }
  ]
}
```

### Get Dispute Types
```http
GET /api/v1/disputes/types
Authorization: Bearer <token>
```

### Withdraw Dispute
```http
POST /api/v1/disputes/{disputeId}/withdraw
Authorization: Bearer <token>
```

## 🛡️ Fraud Protection

### Get Fraud Cases
```http
GET /api/v1/fraud/cases?page=1&limit=10&status=UNDER_INVESTIGATION
Authorization: Bearer <token>
```

### Create Fraud Case
```http
POST /api/v1/fraud/cases
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "SUSPICIOUS_ACTIVITY",
  "description": "Noticed unusual transactions on my account",
  "affectedTransactions": ["transaction-uuid-1", "transaction-uuid-2"],
  "reportedToPolice": false,
  "evidence": [
    {
      "type": "SCREENSHOT",
      "description": "Screenshot of suspicious transactions"
    }
  ]
}
```

### Get Fraud Settings
```http
GET /api/v1/fraud/settings?accountId=account-uuid
Authorization: Bearer <token>
```

### Update Fraud Settings
```http
PUT /api/v1/fraud/settings/{accountId}
Authorization: Bearer <token>
Content-Type: application/json

{
  "blockIncomingTransactions": true,
  "dailyTransactionLimit": 500.00,
  "internationalTransactionsBlocked": true,
  "notificationPreferences": {
    "email": true,
    "sms": true,
    "push": true
  }
}
```

### Block Transactions
```http
POST /api/v1/fraud/block-transactions/{accountId}
Authorization: Bearer <token>
Content-Type: application/json

{
  "block": true,
  "reason": "Suspected fraud"
}
```

### Get Fraud Alerts
```http
GET /api/v1/fraud/alerts?page=1&limit=10
Authorization: Bearer <token>
```

## 💳 Card Management

### Get Cards
```http
GET /api/v1/cards?page=1&limit=10&status=ACTIVE
Authorization: Bearer <token>
```

### Get Card Details
```http
GET /api/v1/cards/{cardId}
Authorization: Bearer <token>
```

### Request New Card
```http
POST /api/v1/cards/request
Authorization: Bearer <token>
Content-Type: application/json

{
  "accountId": "account-uuid",
  "cardType": "VISA",
  "deliveryMethod": "STANDARD",
  "deliveryAddress": {
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "USA"
  },
  "reason": "NEW_ACCOUNT"
}
```

### Block Card
```http
POST /api/v1/cards/{cardId}/block
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "LOST",
  "details": "Lost card at shopping mall",
  "requestReplacement": true
}
```

### Unblock Card
```http
POST /api/v1/cards/{cardId}/unblock
Authorization: Bearer <token>
```

### Change PIN
```http
POST /api/v1/cards/{cardId}/pin/change
Authorization: Bearer <token>
Content-Type: application/json

{
  "currentPin": "1234",
  "newPin": "5678"
}
```

### Get Card Limits
```http
GET /api/v1/cards/{cardId}/limits
Authorization: Bearer <token>
```

## 📊 Response Formats

### Success Response
```json
{
  "message": "Operation completed successfully",
  "data": { ... },
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 50,
    "itemsPerPage": 10,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

### Error Response
```json
{
  "error": "Error Type",
  "message": "Detailed error description"
}
```

## 🔍 Query Parameters

### Pagination
- `page` (integer): Page number (default: 1)
- `limit` (integer): Items per page (default: 10, max: 100)

### Filtering
- `status`: Filter by status
- `type`: Filter by type
- `startDate`: Filter from date (ISO format)
- `endDate`: Filter to date (ISO format)
- `minAmount`: Minimum amount filter
- `maxAmount`: Maximum amount filter

### Search
- `q`: Search query string

## 🏗️ Project Structure

```
├── server.js              # Main server file
├── routes/                 # API route handlers
│   ├── auth.js            # Authentication routes
│   ├── accounts.js        # Account management
│   ├── transactions.js    # Transaction handling
│   ├── balanceTransfers.js # Balance transfer operations
│   ├── disputes.js        # Dispute management
│   ├── fraud.js           # Fraud protection
│   └── cards.js           # Card management
├── middleware/            # Express middleware
│   ├── auth.js           # JWT authentication
│   └── validation.js     # Request validation
├── models/               # Data models and mock data
│   └── mockData.js       # In-memory data store
├── utils/                # Utility functions
│   └── helpers.js        # Helper functions
├── package.json          # Project dependencies
└── .env                  # Environment configuration
```

## 🧪 Testing

### Manual Testing with cURL

```bash
# Register a new user
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","firstName":"Test","lastName":"User","phone":"+1-555-0123"}'

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Get accounts (replace TOKEN with actual JWT)
curl -X GET http://localhost:3000/api/v1/accounts \
  -H "Authorization: Bearer TOKEN"
```

### Testing with Postman

1. Import the API endpoints into Postman
2. Set up environment variables for base URL and token
3. Use the authentication endpoints to get a valid JWT
4. Test all endpoints with proper authorization headers

## 🛡️ Security Features

### Authentication & Authorization
- JWT-based authentication
- Secure password hashing (bcrypt)
- Token expiration handling
- User session management

### Data Protection
- Input validation and sanitization
- SQL injection prevention (through parameterized queries)
- XSS protection via helmet
- CORS configuration

### Fraud Protection
- Real-time transaction monitoring
- Suspicious activity detection
- Automatic security measures
- Comprehensive audit trails

### Card Security
- Card number masking
- PIN encryption simulation
- Block/unblock functionality
- Replacement card workflow

## 📈 Performance Considerations

- Efficient data retrieval with pagination
- Optimized search algorithms
- Proper indexing strategies (for real database)
- Caching mechanisms ready
- Rate limiting preparation

## 🚀 Deployment

### Environment Variables
```bash
PORT=3000
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRY=24h
NODE_ENV=production
API_PREFIX=/api/v1
```

### Production Setup
1. Set secure JWT secret
2. Configure HTTPS
3. Set up proper logging
4. Configure database connections
5. Implement rate limiting
6. Set up monitoring and alerts

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 📞 Support

For support or questions, please contact the development team.

---

*This is a mock API system designed for demonstration and testing purposes. Do not use in production without proper security auditing and real database implementation.*