# POC AI Orchestrator

AI Orchestrator service with LangGraph workflow engine, intent-based prompt selection, policy-engine guardrails, human-in-the-loop capabilities, and **Hybrid MCP Protocol Support** (official MCP SDK + HTTP fallback) for the Chat Banking application.

## 🎯 Overview

The AI Orchestrator is the intelligent brain of the chat banking system, responsible for:

- **LangGraph Workflow Execution**: State machine-based conversation flow management
- **Intent-Based Processing**: Dynamic prompt selection based on customer intent
- **Policy Engine Guardrails**: Ingress screening, pre-tool gating, and response sanitization
- **Human-in-the-Loop**: Interactive data collection and confirmation workflows
- **Hybrid MCP Integration**: Official MCP Protocol (SSE) with automatic HTTP fallback
- **Automatic Tool Discovery**: No manual tool configuration required
- **Session Management**: PostgreSQL-based persistent session storage
- **Conversation State**: Complete conversation history and context preservation

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      AI Orchestrator Service                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐    ┌──────────────┐    �┌────────────────┐   │
│  │  Workflow    │    │   Session    │    │   Enhanced     │   │
│  │   Service    │◄──►│   Manager    │◄──►│  MCP Client    │   │
│  └──────────────┘    └──────────────┘    │   (Hybrid)     │   │
│         │                     │            └────────┬───────┘   │
│         ▼                     ▼                    │             │
│  ┌──────────────┐    ┌──────────────┐            ▼             │
│  │  LangGraph   │    │  PostgreSQL  │    ┌──────────────────┐  │
│  │  Workflow    │    │   Database   │    │  True MCP (SSE)  │  │
│  └──────────────┘    └──────────────┘    │       OR         │  │
│         │                                  │  HTTP MCP        │  │
│         ▼                                  │  (Fallback)      │  │
│  ┌──────────────────────────────────────┐ └────────┬─────────┘  │
│  │         Intent Prompts               │          │            │
│  │  • Balance Inquiry                   │          ▼            │
│  │  • Transaction History               │  ┌──────────────┐    │
│  │  • Transfer Funds                    │  │ MCP Service  │    │
│  │  • Card Management                   │  │   (3004)     │    │
│  │  • Dispute Transaction               │  └──────────────┘    │
│  │  • Account Info                      │                       │
│  │  • General Inquiry                   │                       │
│  └──────────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

## ✨ New: Hybrid MCP Protocol Support

The AI Orchestrator now supports **both** official MCP Protocol and HTTP API:

### 🔥 Key Benefits
- ✅ **True MCP Protocol** - Industry-standard via `@modelcontextprotocol/sdk`
- ✅ **Automatic Tool Discovery** - No manual configuration
- ✅ **HTTP Fallback** - Seamless backward compatibility
- ✅ **Resource Access** - Beyond just tools
- ✅ **Prompt Management** - Server-managed prompts
- ✅ **Claude Desktop Ready** - Compatible with Claude Desktop
- ✅ **Zero Breaking Changes** - 100% backward compatible

### 📖 Documentation
See **[MCP-HYBRID-IMPLEMENTATION.md](./MCP-HYBRID-IMPLEMENTATION.md)** for complete details on:
- Architecture diagrams
- Configuration guide
- Migration path
- Testing procedures
- Best practices

## 🚀 Features

### 1. LangGraph Workflow Engine

State machine-based workflow with the following nodes:

- **analyze_intent**: Determines customer intent from query
- **check_required_data**: Validates if all required data is collected
- **request_human_input**: Requests missing data from customer
- **execute_tools**: Executes banking operations via MCP
- **handle_policy**: Returns policy-driven blocks before unsafe actions execute
- **generate_response**: Generates AI-powered responses
- **request_confirmation**: Requests user confirmation for sensitive operations
- **handle_error**: Error handling and recovery

### 2. Intent-Based Prompt Selection

Supports 7 banking intents with specialized prompts:

| Intent | Description | Required Data | Tools |
|--------|-------------|---------------|-------|
| `balance_inquiry` | Check account balance | account_id | get_account_balance |
| `transaction_history` | View transaction history | account_id, start_date, end_date | get_transactions |
| `transfer_funds` | Transfer money | from_account, to_account, amount | transfer_funds |
| `card_management` | Manage cards | card_id, action | manage_card |
| `dispute_transaction` | Dispute a transaction | transaction_id, reason | dispute_transaction |
| `account_info` | Get account information | account_id | get_account_info |
| `general_inquiry` | General banking questions | - | - |

### 3. Human-in-the-Loop

Interactive data collection workflow:

```
Customer Query → Missing Data? → Request Input → Collect Response → Validate → Execute
```

Supports:
- **Data Collection**: Request missing information (account numbers, amounts, dates)
- **Confirmation**: Request approval for sensitive operations
- **Validation**: Validate collected data before execution

### 4. Policy Engine

The workflow now applies policy enforcement at three stages:

- **Ingress**: Blocks prompt-injection attempts, oversized requests, and unauthenticated protected intents before the workflow executes
- **Pre-tool**: Enforces confirmation before sensitive tool execution and blocks requests that exceed automated policy limits
- **Response**: Redacts account data, tokens, and similar sensitive values before the final response is persisted or returned

The core settings are exposed through `POLICY_ENGINE_ENABLED`, `POLICY_BLOCK_PROMPT_INJECTION`, `POLICY_TRANSFER_CONFIRMATION_AMOUNT`, and `POLICY_TRANSFER_HARD_BLOCK_AMOUNT`.

### 5. Session Management

PostgreSQL-based persistent session storage:

- **Session State**: Stores complete workflow state
- **Conversation History**: Maintains full conversation context
- **Collected Data**: Tracks all user-provided data
- **Required Data**: Manages data collection checklist
- **Auto-Cleanup**: Automatic expiration of old sessions

## 📋 Prerequisites

- Node.js v18.0.0 or higher
- PostgreSQL v15 or higher
- OpenAI API key
- MCP Service running on port 3004

## 🔧 Installation

1. **Clone the repository**

```bash
cd poc-ai-orchestrator
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment variables**

```bash
cp .env.example .env.development
```

Edit `.env.development`:

```env
# Server
NODE_ENV=development
PORT=3007

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_orchestrator_dev
DB_USER=postgres
DB_PASSWORD=postgres

# OpenAI
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4

# MCP Service
MCP_SERVICE_URL=http://localhost:3004/api/tools
```

4. **Initialize database**

```bash
psql -U postgres -f ../scripts/init-ai-orchestrator-db.sql
```

5. **Start the service**

```bash
npm start
```

## 🎮 Usage

### API Endpoints

#### 1. Process Message

Process a customer message through the workflow.

```bash
POST /api/orchestrator/process
Content-Type: application/json

{
  "sessionId": "session-123",
  "userId": "user-456",
  "message": "What is my account balance?",
  "intent": "balance_inquiry"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "response": "I'll help you check your account balance. Which account would you like to check?",
    "status": "awaiting_input",
    "requiresHumanInput": true,
    "requiredFields": ["account_id"],
    "executionId": "exec-789"
  }
}
```

#### 2. Provide Feedback

Provide requested data or confirmation.

```bash
POST /api/orchestrator/feedback
Content-Type: application/json

{
  "sessionId": "session-123",
  "executionId": "exec-789",
  "feedback": "My savings account - 12345"
}
```

#### 3. Get Session

Retrieve session details.

```bash
GET /api/orchestrator/session/:sessionId
```

#### 4. Get User Sessions

Get all sessions for a user.

```bash
GET /api/orchestrator/user/:userId/sessions
```

## 🔄 Workflow Examples

### Example 1: Balance Inquiry

```
1. User: "What is my balance?"
   ↓
2. System: Analyzes intent → balance_inquiry
   ↓
3. System: Checks required data → account_id missing
   ↓
4. System: "Which account would you like to check?"
   ↓
5. User: "Savings account 12345"
   ↓
6. System: Collects data → account_id: "12345"
   ↓
7. System: Executes tool → get_account_balance
   ↓
8. System: "Your savings account balance is $5,234.50"
```

### Example 2: Fund Transfer

```
1. User: "Transfer $100 to my friend"
   ↓
2. System: Analyzes intent → transfer_funds
   ↓
3. System: Checks required data → from_account, to_account, amount missing
   ↓
4. System: "I'll help you transfer funds. Which account should I transfer from?"
   ↓
5. User: "Checking account 12345"
   ↓
6. System: "What's the recipient account number?"
   ↓
7. User: "67890"
   ↓
8. System: "How much would you like to transfer?"
   ↓
9. User: "$100"
   ↓
10. System: "Please confirm: Transfer $100 from 12345 to 67890?"
    ↓
11. User: "Yes"
    ↓
12. System: Executes tool → transfer_funds
    ↓
13. System: "Transfer completed successfully!"
```

## 🗂️ Project Structure

```
poc-ai-orchestrator/
├── src/
│   ├── config/
│   │   └── index.js              # Configuration management
│   ├── middleware/
│   │   └── errorHandlers.js      # Error handling middleware
│   ├── models/
│   │   ├── database.js           # Sequelize connection
│   │   ├── Session.js            # Session model
│   │   ├── WorkflowExecution.js  # Execution tracking
│   │   ├── HumanFeedback.js      # Feedback tracking
│   │   └── index.js              # Model exports
│   ├── prompts/
│   │   └── intentPrompts.js      # Intent-based prompts
│   ├── routes/
│   │   ├── health.js             # Health check
│   │   └── orchestrator.routes.js # API routes
│   ├── services/
│   │   ├── mcpClient.js          # MCP service client
│   │   ├── sessionManager.js     # Session management
│   │   └── workflowService.js    # Workflow orchestration
│   ├── utils/
│   │   └── logger.js             # Winston logger
│   ├── workflows/
│   │   └── bankingChatWorkflow.js # LangGraph workflow
│   └── server.js                 # Express server
├── logs/                         # Log files
├── .env.development              # Development config
├── .env.example                  # Example config
├── .gitignore
├── Dockerfile
├── package.json
└── README.md
```

## 🧪 Testing

### Manual Testing

```bash
# Test health endpoint
curl http://localhost:3007/health

# Test process endpoint
curl -X POST http://localhost:3007/api/orchestrator/process \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session",
    "userId": "test-user",
    "message": "What is my balance?",
    "intent": "balance_inquiry"
  }'
```

### Integration Testing

Create a test script:

```javascript
const axios = require('axios');

const baseURL = 'http://localhost:3007';

async function testWorkflow() {
  // 1. Process initial message
  const processRes = await axios.post(`${baseURL}/api/orchestrator/process`, {
    sessionId: 'test-session-' + Date.now(),
    userId: 'test-user',
    message: 'What is my balance?',
    intent: 'balance_inquiry'
  });
  
  console.log('Process Response:', processRes.data);
  
  // 2. Provide feedback
  if (processRes.data.data.requiresHumanInput) {
    const feedbackRes = await axios.post(`${baseURL}/api/orchestrator/feedback`, {
      sessionId: processRes.data.data.sessionId,
      executionId: processRes.data.data.executionId,
      feedback: '12345'
    });
    
    console.log('Feedback Response:', feedbackRes.data);
  }
}

testWorkflow().catch(console.error);
```

## 🐳 Docker Deployment

### Build Image

```bash
docker build -t poc-ai-orchestrator .
```

### Run Container

```bash
docker run -d \
  --name ai-orchestrator \
  -p 3007:3007 \
  -e NODE_ENV=production \
  -e DB_HOST=postgres \
  -e OPENAI_API_KEY=your_key \
  poc-ai-orchestrator
```

### Docker Compose

The service is included in `docker/docker-compose-full-stack.yml`:

```bash
docker compose -f docker/docker-compose-full-stack.yml up ai-orchestrator
```

## 📊 Monitoring

### Health Check

```bash
curl http://localhost:3007/health
```

Response:

```json
{
  "status": "healthy",
  "service": "poc-ai-orchestrator",
  "version": "1.0.0",
  "uptime": 3600,
  "checks": {
    "database": { "status": "up" },
    "mcpService": { "status": "up" }
  }
}
```

### Logs

Logs are stored in the `logs/` directory:

- `error.log`: Error logs only
- `combined.log`: All logs

## 🔒 Security

- **Input Validation**: All inputs are validated
- **Rate Limiting**: 100 requests per minute
- **CORS**: Configured for specific origins only
- **Helmet**: Security headers enabled
- **SQL Injection**: Protected by Sequelize parameterized queries
- **Sensitive Data**: Not logged in production

## 🤝 Integration with Chat Backend

The chat backend integrates with the AI Orchestrator:

```javascript
// In poc-chat-backend
const axios = require('axios');

async function processWithOrchestrator(sessionId, userId, message, intent) {
  const response = await axios.post(
    'http://localhost:3007/api/orchestrator/process',
    { sessionId, userId, message, intent }
  );
  
  return response.data;
}
```

## 📚 API Documentation

### Process Message

**POST** `/api/orchestrator/process`

Process a customer message through the LangGraph workflow.

**Request Body:**
```typescript
{
  sessionId: string;      // Unique session identifier
  userId: string;         // User identifier
  message: string;        // Customer message
  intent: string;         // Detected intent
  metadata?: object;      // Optional metadata
}
```

**Response:**
```typescript
{
  success: boolean;
  data: {
    response: string;           // AI-generated response
    status: string;             // Workflow status
    requiresHumanInput: boolean;
    requiredFields?: string[];
    toolResults?: object[];
    executionId: string;
    sessionId: string;
  }
}
```

### Provide Feedback

**POST** `/api/orchestrator/feedback`

Provide requested data or confirmation.

**Request Body:**
```typescript
{
  sessionId: string;
  executionId: string;
  feedback: string;
}
```

## 🛠️ Development

### Run in Development Mode

```bash
npm run dev
```

### Debug Mode

```bash
DEBUG=* npm start
```

### Code Style

```bash
npm run lint
npm run format
```

## 📝 License

MIT

## 👥 Authors

POC Banking Team

## 🔗 Related Services

- **poc-chat-backend** (Port 3006): Chat WebSocket server
- **poc-mcp-service** (Port 3004): MCP tool execution service
- **poc-banking-service** (Port 3005): Banking operations
- **poc-nlu-service** (Port 3003): DialogFlow NLU

## 📞 Support

For issues or questions, please contact the development team.
