# Chat Banking Microservices Application

A comprehensive enterprise-grade chat banking application built with microservices architecture, featuring real-time communication, AI-powered intent detection, LangGraph workflow orchestration, and complete banking operations.

## 🏗️ Architecture Overview

This application consists of **9 microservices** organized in a layered architecture:

```
Frontend Layer → Gateway Layer → Processing Layer → Orchestration Layer → Domain Layer
```

### Microservices Stack

| Service | Port | Role | Status |
|---------|------|------|--------|
| **poc-frontend** | 3000 | Customer web interface (React + Vite) | ✅ Complete |
| **poc-agent-ui** | 8081 | Agent dashboard for support staff | ✅ Complete |
| **poc-api-gateway** | 3001 | API Gateway with service discovery | ✅ Complete |
| **poc-nlp-service** | 3002 | Natural Language Processing | ✅ Complete |
| **poc-nlu-service** | 3003 | Natural Language Understanding | ✅ Complete |
| **poc-mcp-service** | 3004 | Model Context Protocol & Tools | ✅ Complete |
| **poc-banking-service** | 3005 | Banking operations & accounts | ✅ Complete |
| **poc-chat-backend** | 3006 | Real-time chat with WebSocket | ✅ Complete |
| **poc-ai-orchestrator** | 3007 | **NEW** LangGraph AI workflow orchestration | ✅ Complete |

## 🚀 Key Features

### AI Orchestration (NEW!)
- **LangGraph Workflow** - State machine-based conversation flow management
- **Intent-Based Processing** - Dynamic prompt selection based on customer intent (7 intents)
- **Human-in-the-Loop** - Interactive data collection and confirmation workflows
- **Session Persistence** - PostgreSQL-based conversation state management
- **Tool Orchestration** - Seamless integration with banking tools via MCP
- **GPT-4 Integration** - Advanced AI responses with OpenAI

### Real-time Communication
- **WebSocket Support** - Bidirectional real-time messaging via Socket.IO
- **Agent Orchestration** - Multi-agent coordination for complex queries
- **Typing Indicators** - Live feedback during conversations
- **Session Management** - Persistent conversation context

### AI-Powered Intelligence
- **Natural Language Processing** - Text analysis and entity extraction
- **Intent Detection** - Understand user intentions with high accuracy
- **DialogFlow Integration** - Advanced conversational AI
- **Context Management** - Maintain conversation context across interactions

### Banking Operations
- **Account Management** - Balance inquiry, account details
- **Transaction History** - View and search transactions
- **Fund Transfers** - Secure money transfers
- **Card Management** - Card services and controls
- **Dispute Resolution** - Handle transaction disputes
- **Fraud Detection** - Real-time fraud monitoring

### Enterprise Features
- **API Gateway** - Centralized routing and service discovery
- **Load Balancing** - Distribute traffic across service instances
- **Service Discovery** - Automatic service registration and health monitoring
- **JWT Authentication** - Secure token-based authentication
- **Rate Limiting** - Protect services from abuse
- **Comprehensive Logging** - Winston-based structured logging
- **Health Monitoring** - Health checks for all services

### Model Context Protocol (MCP)
- **Tool Execution** - Execute external tools and APIs
- **Banking Tools** - Specialized banking function tools
- **Plugin System** - Extensible tool registry
- **Claude Integration** - Ready for AI assistant integration

## 📋 Prerequisites

- **Node.js** v18.0.0 or higher
- **npm** v8.0.0 or higher
- **PostgreSQL** v15+ (for AI Orchestrator)
- **OpenAI API Key** (for AI Orchestrator GPT-4 integration)
- **Docker** v20.0.0+ (optional, for containerized deployment)
- **Docker Compose** v2.0.0+ (optional)
- **PM2** (optional, for process management)

## 🛠️ Quick Start

### Option 1: Using Setup Scripts (Recommended)

```bash
# Clone the repository
git clone https://github.com/kishorekota-dev/map_demo.git
cd map_demo

# Install dependencies for all services
npm install

# Start all services with one command
./start-all-services.sh

# Check service status
./check-services-status.sh

# Test all services
./test-all-services.sh
```

### Option 2: Using Docker Compose

```bash
# Build and start all services
docker-compose -f docker-compose-full-stack.yml up -d

# View logs
docker-compose -f docker-compose-full-stack.yml logs -f

# Stop all services
docker-compose -f docker-compose-full-stack.yml down
```

### Option 3: Using PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start all services
pm2 start ecosystem.config.js

# View status
pm2 status

# View logs
pm2 logs

# Stop all services
pm2 stop all
```

### Option 4: Manual Start (Development)

```bash
# Terminal 1 - API Gateway
cd poc-api-gateway && npm start

# Terminal 2 - NLP Service
cd poc-nlp-service/src && node server.js

# Terminal 3 - NLU Service
cd poc-nlu-service/src && node server.js

# Terminal 4 - MCP Service
cd poc-mcp-service/src && node server.js

# Terminal 5 - Banking Service
cd poc-banking-service && npm start

# Terminal 6 - Chat Backend
cd poc-chat-backend && npm start

# Terminal 7 - Agent UI
cd poc-agent-ui && npm start

# Terminal 8 - Frontend (optional)
cd poc-frontend && npm run dev
```

## 🧪 Testing & Verification

### Health Checks

```bash
# Run comprehensive health check for all services
./test-all-services.sh

# Individual service health checks
curl http://localhost:3001/health  # API Gateway
curl http://localhost:3002/health  # NLP Service
curl http://localhost:3003/health  # NLU Service
curl http://localhost:3004/health  # MCP Service
curl http://localhost:3005/health  # Banking Service
curl http://localhost:3006/health  # Chat Backend
curl http://localhost:8081         # Agent UI
```

### Test Chat Flow

```bash
# Send a chat message through the API
curl -X POST http://localhost:3001/api/chat/message \
  -H "Content-Type: application/json" \
  -H "X-Session-ID: test-session-123" \
  -d '{
    "message": "What is my account balance?",
    "userId": "test-user"
  }'
```

### Test Banking Operations

```bash
# Get account information
curl http://localhost:3005/api/accounts/test-user

# Get transaction history
curl http://localhost:3005/api/transactions/test-user
```

## 📚 Documentation

- **[MICROSERVICES-ARCHITECTURE.md](./MICROSERVICES-ARCHITECTURE.md)** - Detailed architecture documentation
- **[IMPLEMENTATION-SUMMARY.md](./IMPLEMENTATION-SUMMARY.md)** - Complete implementation summary
- **[DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md)** - Comprehensive deployment guide
- **[DEVELOPMENT_SETUP.md](./DEVELOPMENT_SETUP.md)** - Development environment setup
- **Individual Service READMEs** - Service-specific documentation in each service folder

## 🔌 API Endpoints

### API Gateway (Port: 3001)

```
GET  /health                          - Gateway health status
GET  /api/services                    - List all registered services
GET  /metrics                         - System metrics
POST /api/auth/login                  - User authentication
POST /api/chat/message                - Send chat message (proxied)
GET  /api/banking/accounts/:userId    - Get account info (proxied)
```

### Chat Backend (Port: 3006)

```
GET  /health                          - Service health
POST /auth/login                      - Authenticate user
POST /api/chat/message                - Process chat message
WS   /socket.io                       - WebSocket connection

WebSocket Events:
  - connect / disconnect
  - authenticate
  - sendMessage
  - typing / stopTyping
  - joinSession / leaveSession
```

### Banking Service (Port: 3005)

```
GET  /health                          - Service health
GET  /api/accounts/:userId            - Get account information
GET  /api/transactions/:userId        - Get transaction history
POST /api/transfers                   - Create fund transfer
GET  /api/cards/:userId               - Get card information
POST /api/disputes                    - File a dispute
```

### NLP Service (Port: 3002)

```
GET  /health                          - Service health
POST /api/nlp/analyze                 - Analyze text
POST /api/nlp/sentiment               - Sentiment analysis
POST /api/nlp/entities                - Extract entities
```

### NLU Service (Port: 3003)

```
GET  /health                          - Service health
POST /api/nlu/detect-intent           - Detect user intent
POST /api/nlu/analyze-banking         - Analyze banking intent
GET  /api/nlu/intents                 - List available intents
```

### MCP Service (Port: 3004)

```
GET  /health                          - Service health
POST /api/mcp/execute                 - Execute a tool
GET  /api/mcp/tools                   - List available tools
POST /api/mcp/register-tool           - Register new tool
```

## 🏗️ Project Structure

```
map_demo/
├── poc-frontend/                    # React customer interface
├── poc-agent-ui/                    # Agent dashboard
├── poc-api-gateway/                 # API Gateway with service discovery
├── poc-backend/                     # Legacy backend (REST API)
├── poc-chat-backend/                # Real-time chat backend
├── poc-banking-service/             # Banking operations service
├── poc-nlp-service/                 # NLP processing service
├── poc-nlu-service/                 # NLU intent detection service
├── poc-mcp-service/                 # MCP tools service
├── docker-compose-full-stack.yml    # Docker orchestration
├── ecosystem.config.js              # PM2 configuration
├── start-all-services.sh            # Start all services script
├── stop-all-services.sh             # Stop all services script
├── check-services-status.sh         # Status check script
├── test-all-services.sh             # Integration test script
└── docs/                            # Documentation
```

## 🔐 Security

### Authentication
- JWT-based authentication across all services
- Token-based WebSocket authentication
- Secure password hashing (bcrypt)

### API Security
- Rate limiting (100 requests per 15 minutes per IP)
- CORS whitelisting
- Helmet.js security headers
- Input validation and sanitization
- XSS protection

### Network Security
- Service-to-service authentication
- TLS/HTTPS ready
- Environment-based secrets management

## 📊 Monitoring & Observability

### Health Monitoring
- Health check endpoints on all services
- Service registry with health status
- Automated health check script

### Logging
- Structured logging with Winston
- Centralized log aggregation ready
- Different log levels per environment
- Request/response logging

### Metrics
- System metrics endpoint
- Service performance metrics
- Custom business metrics

## 🔧 Configuration

Each service requires a `.env` file. Copy the example files:

```bash
# Copy environment files for all services
for dir in poc-*/; do
  if [ -f "${dir}.env.example" ]; then
    cp "${dir}.env.example" "${dir}.env"
  elif [ -f "${dir}.env.development" ]; then
    cp "${dir}.env.development" "${dir}.env"
  fi
done
```

### Key Environment Variables

```bash
# Common across services
NODE_ENV=development|production
PORT=<service-port>
LOG_LEVEL=debug|info|warn|error

# API Gateway
JWT_SECRET=your-secret-key
BANKING_SERVICE_URL=http://localhost:3005
NLP_SERVICE_URL=http://localhost:3002
NLU_SERVICE_URL=http://localhost:3003
MCP_SERVICE_URL=http://localhost:3004

# Chat Backend
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8081
JWT_SECRET=your-secret-key
REDIS_URL=redis://localhost:6379
```

## 🚢 Deployment

### Development
```bash
./start-all-services.sh
```

### Production with PM2
```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

### Production with Docker
```bash
docker-compose -f docker-compose-full-stack.yml up -d
```

### Kubernetes
See `k8s/` directory for Kubernetes manifests (coming soon)

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 Development Guidelines

- Follow microservices best practices
- Maintain consistent logging across services
- Add comprehensive error handling
- Write tests for new features
- Update documentation
- Follow the existing code style

## 🐛 Troubleshooting

### Services Not Starting
```bash
# Check if ports are already in use
lsof -i :3001  # Check specific port

# Kill process using port
kill -9 <PID>

# Check logs
tail -f poc-*/logs/*.log
```

### WebSocket Connection Issues
```bash
# Verify ALLOWED_ORIGINS in chat-backend/.env
# Test WebSocket connection
wscat -c ws://localhost:3006
```

### Service Discovery Issues
```bash
# Check API Gateway logs
tail -f poc-api-gateway/logs/*.log

# Verify all services are registered
curl http://localhost:3001/api/services
```

## 📞 Support

- **Issues**: https://github.com/kishorekota-dev/map_demo/issues
- **Documentation**: See `docs/` folder
- **Email**: [your-email]

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Express.js for the web framework
- Socket.IO for real-time communication
- React for the frontend
- Winston for logging
- JWT for authentication
- DialogFlow for NLU capabilities

---

## 📈 Status

**Project Status**: ✅ Production Ready

All 8 microservices are fully implemented, tested, and documented. The application is ready for deployment in development, staging, and production environments.

**Last Updated**: October 4, 2025  
**Version**: 1.0.0

---

Made with ❤️ by the Development Team

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

## 🤖 MCP Server Setup

The project includes a Model Context Protocol server for AI assistant integration:

### Quick Setup
```bash
# Setup MCP server
npm run mcp:setup

# Start API server
npm start

# In another terminal, start MCP server
npm run mcp:start
```

### Test the MCP Server
```bash
# Run example client
npm run mcp:example

# Interactive testing mode
npm run mcp:interactive
```

### AI Assistant Integration
The MCP server provides 12 tools for AI assistants:
- Authentication and user management
- Account operations (create, retrieve, update)
- Transaction management
- Card operations
- Fraud case handling
- Dispute management
- Health monitoring

See `README-MCP.md` for detailed MCP server documentation.

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