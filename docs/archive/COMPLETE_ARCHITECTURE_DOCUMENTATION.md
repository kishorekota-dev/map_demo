# Credit Card Enterprise System - Complete Architecture Documentation

## 🏗️ System Overview

The Credit Card Enterprise System is a comprehensive financial services platform built with modern microservices architecture, featuring AI-powered chatbot interfaces, Model Context Protocol (MCP) integration, and enterprise-grade security. The system enables seamless credit card operations, fraud management, transaction processing, and customer service through multiple interfaces.

## 📋 Table of Contents

1. [System Architecture](#system-architecture)
2. [MCP (Model Context Protocol) Integration](#mcp-model-context-protocol-integration)
3. [Chatbot & NLP Components](#chatbot--nlp-components)
4. [Backend API Services](#backend-api-services)
5. [Sequence Diagrams](#sequence-diagrams)
6. [Code Structure Analysis](#code-structure-analysis)
7. [Security Architecture](#security-architecture)
8. [Deployment Architecture](#deployment-architecture)

---

## 🏢 System Architecture

### High-Level Architecture Overview

```mermaid
graph TB
    subgraph "Client Layer"
        WEB[Web UI]
        MOBILE[Mobile App]
        CHATBOT[Chatbot UI]
        ADMIN[Admin Panel]
    end
    
    subgraph "AI & Communication Layer"
        DF[DialogFlow NLP]
        LC[LangChain Agents]
        MCP_CLIENT[MCP Client]
    end
    
    subgraph "Gateway & Protocol Layer"
        API_GW[API Gateway]
        MCP_SERVER[MCP Server]
        AUTH[Authentication Service]
    end
    
    subgraph "Application Services Layer"
        ACCOUNT[Account Service]
        TRANSACTION[Transaction Service]
        FRAUD[Fraud Service]
        DISPUTE[Dispute Service]
        CARD[Card Service]
        BALANCE[Balance Transfer Service]
    end
    
    subgraph "Data Layer"
        POSTGRES[(PostgreSQL)]
        REDIS[(Redis Cache)]
        LOGS[(Log Storage)]
    end
    
    subgraph "External Services"
        PAYMENT[Payment Gateway]
        KYC[KYC Service]
        SMS[SMS Service]
        EMAIL[Email Service]
    end
    
    WEB --> API_GW
    MOBILE --> API_GW
    CHATBOT --> DF
    CHATBOT --> LC
    ADMIN --> API_GW
    
    DF --> MCP_CLIENT
    LC --> MCP_CLIENT
    MCP_CLIENT --> MCP_SERVER
    
    API_GW --> AUTH
    MCP_SERVER --> AUTH
    
    AUTH --> ACCOUNT
    AUTH --> TRANSACTION
    AUTH --> FRAUD
    AUTH --> DISPUTE
    AUTH --> CARD
    AUTH --> BALANCE
    
    ACCOUNT --> POSTGRES
    TRANSACTION --> POSTGRES
    FRAUD --> POSTGRES
    DISPUTE --> POSTGRES
    CARD --> POSTGRES
    BALANCE --> POSTGRES
    
    ACCOUNT --> REDIS
    TRANSACTION --> REDIS
    
    FRAUD --> SMS
    FRAUD --> EMAIL
    TRANSACTION --> PAYMENT
    ACCOUNT --> KYC
    
    style WEB fill:#e1f5fe
    style CHATBOT fill:#f3e5f5
    style MCP_SERVER fill:#fff3e0
    style POSTGRES fill:#e8f5e8
```

### Component Architecture Details

```mermaid
graph LR
    subgraph "Frontend Components"
        A[React Components]
        B[Next.js Pages]
        C[TypeScript Types]
        D[Tailwind Styles]
    end
    
    subgraph "AI Components"
        E[DialogFlow SDK]
        F[LangChain Agents]
        G[Intent Recognition]
        H[Context Manager]
    end
    
    subgraph "MCP Components"
        I[MCP Client SDK]
        J[Tool Definitions]
        K[Protocol Handler]
        L[Error Manager]
    end
    
    subgraph "Backend Components"
        M[Express Routes]
        N[Middleware Stack]
        O[Service Layer]
        P[Data Models]
    end
    
    A --> E
    B --> F
    C --> I
    E --> I
    F --> I
    I --> K
    K --> M
    M --> N
    N --> O
    O --> P
```

---

## 🔗 MCP (Model Context Protocol) Integration

### MCP Architecture Overview

The Model Context Protocol serves as the communication bridge between AI components and backend services, providing a standardized way for AI agents to interact with enterprise systems.

```mermaid
graph TD
    subgraph "MCP Client Layer"
        CHAT[Chatbot Interface]
        AGENT[LangChain Agent]
        DF_INT[DialogFlow Integration]
    end
    
    subgraph "MCP Protocol Layer"
        MCP_SDK[MCP SDK]
        TOOLS[Tool Registry]
        SCHEMA[Schema Validator]
        TRANSPORT[Transport Layer]
    end
    
    subgraph "MCP Server Layer"
        MCP_SRV[MCP Server]
        TOOL_HANDLER[Tool Handlers]
        API_CLIENT[API Client]
        AUTH_MGR[Auth Manager]
    end
    
    subgraph "Enterprise API Layer"
        ACC_API[Account API]
        TXN_API[Transaction API]
        FRAUD_API[Fraud API]
        CARD_API[Card API]
        DISPUTE_API[Dispute API]
    end
    
    CHAT --> MCP_SDK
    AGENT --> MCP_SDK
    DF_INT --> MCP_SDK
    
    MCP_SDK --> TOOLS
    MCP_SDK --> SCHEMA
    MCP_SDK --> TRANSPORT
    
    TRANSPORT --> MCP_SRV
    MCP_SRV --> TOOL_HANDLER
    TOOL_HANDLER --> API_CLIENT
    API_CLIENT --> AUTH_MGR
    
    AUTH_MGR --> ACC_API
    AUTH_MGR --> TXN_API
    AUTH_MGR --> FRAUD_API
    AUTH_MGR --> CARD_API
    AUTH_MGR --> DISPUTE_API
    
    style MCP_SDK fill:#fff3e0
    style MCP_SRV fill:#fff3e0
    style TOOL_HANDLER fill:#e8f5e8
```

### MCP Tool Registry

```mermaid
graph LR
    subgraph "Authentication Tools"
        AUTH_LOGIN[authenticate]
        AUTH_LOGOUT[logout]
        AUTH_REFRESH[refresh_token]
    end
    
    subgraph "Account Tools"
        ACC_LIST[get_accounts]
        ACC_CREATE[create_account]
        ACC_DETAILS[get_account_details]
        ACC_BALANCE[get_account_balance]
        ACC_STATEMENT[get_account_statement]
    end
    
    subgraph "Transaction Tools"
        TXN_LIST[get_transactions]
        TXN_CREATE[create_transaction]
        TXN_SEARCH[search_transactions]
        TXN_STATUS[update_transaction_status]
    end
    
    subgraph "Card Tools"
        CARD_LIST[get_cards]
        CARD_CREATE[request_card]
        CARD_BLOCK[block_card]
        CARD_UNBLOCK[unblock_card]
        CARD_LIMITS[get_card_limits]
    end
    
    subgraph "Fraud Tools"
        FRAUD_CASES[get_fraud_cases]
        FRAUD_CREATE[create_fraud_case]
        FRAUD_SETTINGS[get_fraud_settings]
        FRAUD_BLOCK[block_transactions]
        FRAUD_ALERTS[get_fraud_alerts]
    end
    
    subgraph "Dispute Tools"
        DISPUTE_LIST[get_disputes]
        DISPUTE_CREATE[create_dispute]
        DISPUTE_TYPES[get_dispute_types]
        DISPUTE_WITHDRAW[withdraw_dispute]
    end
    
    subgraph "Balance Transfer Tools"
        BT_LIST[get_balance_transfers]
        BT_CREATE[create_balance_transfer]
        BT_OFFERS[get_balance_transfer_offers]
        BT_CALC[balance_transfer_calculator]
    end
    
    subgraph "System Tools"
        SYS_HEALTH[health_check]
        SYS_STATUS[get_system_status]
    end
```

---

## 🤖 Chatbot & NLP Components

### DialogFlow NLP Integration

```mermaid
graph TD
    subgraph "User Input Processing"
        USER_INPUT[User Message]
        PREPROCESSOR[Text Preprocessor]
        INTENT_DETECTOR[Intent Detection]
        ENTITY_EXTRACTOR[Entity Extraction]
    end
    
    subgraph "DialogFlow Processing"
        DF_AGENT[DialogFlow Agent]
        INTENT_MATCH[Intent Matching]
        CONTEXT_MGR[Context Management]
        FULFILLMENT[Fulfillment Logic]
    end
    
    subgraph "LangChain Integration"
        LC_AGENT[LangChain Agent]
        MEMORY[Conversation Memory]
        CHAIN[Processing Chain]
        TOOL_SELECTOR[Tool Selection]
    end
    
    subgraph "Response Generation"
        RESPONSE_GEN[Response Generator]
        TEMPLATE_ENGINE[Template Engine]
        FORMATTER[Response Formatter]
        OUTPUT[User Response]
    end
    
    USER_INPUT --> PREPROCESSOR
    PREPROCESSOR --> INTENT_DETECTOR
    INTENT_DETECTOR --> ENTITY_EXTRACTOR
    
    ENTITY_EXTRACTOR --> DF_AGENT
    DF_AGENT --> INTENT_MATCH
    INTENT_MATCH --> CONTEXT_MGR
    CONTEXT_MGR --> FULFILLMENT
    
    FULFILLMENT --> LC_AGENT
    LC_AGENT --> MEMORY
    MEMORY --> CHAIN
    CHAIN --> TOOL_SELECTOR
    
    TOOL_SELECTOR --> RESPONSE_GEN
    RESPONSE_GEN --> TEMPLATE_ENGINE
    TEMPLATE_ENGINE --> FORMATTER
    FORMATTER --> OUTPUT
    
    style DF_AGENT fill:#e3f2fd
    style LC_AGENT fill:#f3e5f5
    style TOOL_SELECTOR fill:#fff3e0
```

### Intent Classification System

```mermaid
graph LR
    subgraph "Banking Intents"
        ACCOUNT_INTENT[Account Inquiry]
        BALANCE_INTENT[Balance Check]
        TRANSACTION_INTENT[Transaction History]
        TRANSFER_INTENT[Fund Transfer]
    end
    
    subgraph "Card Intents"
        CARD_STATUS[Card Status]
        CARD_BLOCK[Block Card]
        CARD_REQUEST[Request Card]
        CARD_LIMIT[Card Limits]
    end
    
    subgraph "Fraud Intents"
        FRAUD_REPORT[Report Fraud]
        FRAUD_SETTINGS[Fraud Settings]
        FRAUD_ALERTS[Fraud Alerts]
        SUSPICIOUS[Suspicious Activity]
    end
    
    subgraph "Dispute Intents"
        DISPUTE_CREATE[Create Dispute]
        DISPUTE_STATUS[Dispute Status]
        DISPUTE_TYPES[Dispute Types]
        DISPUTE_WITHDRAW[Withdraw Dispute]
    end
    
    subgraph "Support Intents"
        HELP[Help & Support]
        FAQ[Frequently Asked]
        CONTACT[Contact Support]
        ESCALATE[Escalate Issue]
    end
```

---

## 🔧 Backend API Services

### Service Architecture

```mermaid
graph TB
    subgraph "API Gateway Layer"
        GW[Express Gateway]
        CORS[CORS Handler]
        RATE_LIMIT[Rate Limiter]
        LOG[Request Logger]
    end
    
    subgraph "Authentication Layer"
        JWT[JWT Middleware]
        AUTH_SVC[Auth Service]
        RBAC[Role-Based Access]
        SESSION[Session Manager]
    end
    
    subgraph "Business Logic Layer"
        ACCOUNT_SVC[Account Service]
        TRANSACTION_SVC[Transaction Service]
        FRAUD_SVC[Fraud Service]
        CARD_SVC[Card Service]
        DISPUTE_SVC[Dispute Service]
        BALANCE_SVC[Balance Transfer Service]
    end
    
    subgraph "Data Access Layer"
        ACCOUNT_DAO[Account DAO]
        TRANSACTION_DAO[Transaction DAO]
        FRAUD_DAO[Fraud DAO]
        CARD_DAO[Card DAO]
        DISPUTE_DAO[Dispute DAO]
        BALANCE_DAO[Balance Transfer DAO]
    end
    
    subgraph "Database Layer"
        POSTGRES[(PostgreSQL)]
        REDIS[(Redis Cache)]
        SEARCH[(Elasticsearch)]
    end
    
    GW --> CORS
    CORS --> RATE_LIMIT
    RATE_LIMIT --> LOG
    LOG --> JWT
    
    JWT --> AUTH_SVC
    AUTH_SVC --> RBAC
    RBAC --> SESSION
    
    SESSION --> ACCOUNT_SVC
    SESSION --> TRANSACTION_SVC
    SESSION --> FRAUD_SVC
    SESSION --> CARD_SVC
    SESSION --> DISPUTE_SVC
    SESSION --> BALANCE_SVC
    
    ACCOUNT_SVC --> ACCOUNT_DAO
    TRANSACTION_SVC --> TRANSACTION_DAO
    FRAUD_SVC --> FRAUD_DAO
    CARD_SVC --> CARD_DAO
    DISPUTE_SVC --> DISPUTE_DAO
    BALANCE_SVC --> BALANCE_DAO
    
    ACCOUNT_DAO --> POSTGRES
    TRANSACTION_DAO --> POSTGRES
    FRAUD_DAO --> POSTGRES
    CARD_DAO --> POSTGRES
    DISPUTE_DAO --> POSTGRES
    BALANCE_DAO --> POSTGRES
    
    ACCOUNT_DAO --> REDIS
    TRANSACTION_DAO --> REDIS
    FRAUD_DAO --> SEARCH
    
    style JWT fill:#ffebee
    style POSTGRES fill:#e8f5e8
    style REDIS fill:#fff3e0
```

### API Endpoint Structure

```mermaid
graph LR
    subgraph "Authentication API"
        A1[POST /auth/register]
        A2[POST /auth/login]
        A3[GET /auth/profile]
        A4[PUT /auth/profile]
        A5[POST /auth/logout]
    end
    
    subgraph "Account API"
        B1[GET /accounts]
        B2[POST /accounts]
        B3[GET /accounts/:id]
        B4[PUT /accounts/:id]
        B5[GET /accounts/:id/balance]
        B6[GET /accounts/:id/statement]
    end
    
    subgraph "Transaction API"
        C1[GET /transactions]
        C2[POST /transactions]
        C3[GET /transactions/:id]
        C4[PUT /transactions/:id/status]
        C5[GET /transactions/search]
    end
    
    subgraph "Card API"
        D1[GET /cards]
        D2[POST /cards/request]
        D3[GET /cards/:id]
        D4[PUT /cards/:id]
        D5[POST /cards/:id/block]
        D6[POST /cards/:id/unblock]
    end
    
    subgraph "Fraud API"
        E1[GET /fraud/cases]
        E2[POST /fraud/cases]
        E3[GET /fraud/settings]
        E4[PUT /fraud/settings/:id]
        E5[POST /fraud/block-transactions/:id]
        E6[GET /fraud/alerts]
    end
    
    subgraph "Dispute API"
        F1[GET /disputes]
        F2[POST /disputes]
        F3[GET /disputes/:id]
        F4[PUT /disputes/:id]
        F5[POST /disputes/:id/withdraw]
        F6[GET /disputes/types]
    end
```

---

## 📊 Sequence Diagrams

### User Authentication Flow

```mermaid
sequenceDiagram
    participant U as User
    participant CB as Chatbot UI
    participant DF as DialogFlow
    participant MCP as MCP Client
    participant MCPS as MCP Server
    participant API as Auth API
    participant DB as Database
    
    U->>CB: "I want to check my balance"
    CB->>DF: Process natural language
    DF->>CB: Intent: check_balance
    CB->>MCP: Request authentication
    MCP->>MCPS: authenticate(email, password)
    MCPS->>API: POST /auth/login
    API->>DB: Validate credentials
    DB-->>API: User data
    API-->>MCPS: JWT Token
    MCPS-->>MCP: Authentication result
    MCP-->>CB: Auth token stored
    CB->>MCP: get_accounts()
    MCP->>MCPS: Call with auth token
    MCPS->>API: GET /accounts (with JWT)
    API->>DB: Fetch account data
    DB-->>API: Account information
    API-->>MCPS: Account details
    MCPS-->>MCP: Formatted response
    MCP-->>CB: Account balance data
    CB->>DF: Generate response
    DF-->>CB: Natural language response
    CB-->>U: "Your current balance is $1,250.50"
```

### Transaction Processing Flow

```mermaid
sequenceDiagram
    participant U as User
    participant CB as Chatbot
    participant MCP as MCP Client
    participant MCPS as MCP Server
    participant TXN as Transaction API
    participant FRAUD as Fraud Service
    participant CARD as Card Service
    participant DB as Database
    participant EXT as External Services
    
    U->>CB: "Transfer $500 to my savings"
    CB->>MCP: create_transaction()
    MCP->>MCPS: Transaction request
    MCPS->>TXN: POST /transactions
    TXN->>FRAUD: Check fraud rules
    FRAUD->>DB: Validate transaction patterns
    DB-->>FRAUD: Pattern analysis
    FRAUD-->>TXN: Fraud check passed
    TXN->>CARD: Validate card limits
    CARD->>DB: Check daily/monthly limits
    DB-->>CARD: Limit validation
    CARD-->>TXN: Limits OK
    TXN->>DB: Create transaction record
    DB-->>TXN: Transaction ID
    TXN->>EXT: Process payment
    EXT-->>TXN: Payment confirmation
    TXN->>DB: Update transaction status
    TXN-->>MCPS: Transaction created
    MCPS-->>MCP: Success response
    MCP-->>CB: Transaction details
    CB-->>U: "Transfer completed successfully"
```

### Fraud Detection Flow

```mermaid
sequenceDiagram
    participant TXN as Transaction
    participant FRAUD as Fraud Engine
    participant ML as ML Models
    participant RULES as Rule Engine
    participant ALERT as Alert System
    participant USER as User
    participant BLOCK as Auto Block
    
    TXN->>FRAUD: Transaction submitted
    FRAUD->>ML: Analyze transaction pattern
    ML-->>FRAUD: Risk score (0.85)
    FRAUD->>RULES: Apply business rules
    RULES-->>FRAUD: Rule violations found
    FRAUD->>ALERT: High risk transaction
    ALERT->>USER: Send SMS/Email alert
    FRAUD->>BLOCK: Auto-block if score > 0.9
    BLOCK->>TXN: Block transaction
    FRAUD-->>TXN: Fraud analysis complete
    
    Note over FRAUD: Risk Score > 0.8 triggers<br/>immediate review
    Note over ALERT: Real-time notifications<br/>sent to user
```

### Dispute Resolution Flow

```mermaid
sequenceDiagram
    participant U as User
    participant CB as Chatbot
    participant MCP as MCP Client
    participant DISPUTE as Dispute API
    participant TXN as Transaction API
    participant FRAUD as Fraud Service
    participant REVIEW as Review Team
    participant BANK as Banking Partner
    
    U->>CB: "I want to dispute a transaction"
    CB->>MCP: create_dispute()
    MCP->>DISPUTE: POST /disputes
    DISPUTE->>TXN: Mark transaction as disputed
    TXN-->>DISPUTE: Transaction updated
    DISPUTE->>FRAUD: Check for fraud patterns
    FRAUD-->>DISPUTE: Risk assessment
    
    alt High Priority Dispute
        DISPUTE->>U: Issue provisional credit
        DISPUTE->>REVIEW: Assign to specialist
    else Standard Dispute
        DISPUTE->>REVIEW: Add to review queue
    end
    
    REVIEW->>BANK: Request merchant response
    BANK-->>REVIEW: Merchant documentation
    REVIEW->>DISPUTE: Update dispute status
    DISPUTE->>U: Resolution notification
```

---

## 💻 Code Structure Analysis

### Project Architecture

```
credit-card-enterprise/
├── packages/
│   ├── backend/                 # Express.js Backend API
│   │   ├── routes/             # API Routes
│   │   │   ├── auth.js         # Authentication endpoints
│   │   │   ├── accounts.js     # Account management
│   │   │   ├── transactions.js # Transaction processing
│   │   │   ├── cards.js        # Card operations
│   │   │   ├── fraud.js        # Fraud management
│   │   │   └── disputes.js     # Dispute handling
│   │   ├── middleware/         # Express middleware
│   │   │   ├── auth.js         # JWT authentication
│   │   │   └── validation.js   # Request validation
│   │   ├── models/             # Data models
│   │   ├── services/           # Business logic
│   │   └── utils/              # Helper functions
│   │
│   ├── chatbot-ui/             # React Chatbot Interface
│   │   ├── src/
│   │   │   ├── components/     # React components
│   │   │   │   ├── Chat/       # Chat interface
│   │   │   │   ├── Auth/       # Authentication
│   │   │   │   └── Banking/    # Banking operations
│   │   │   ├── services/       # API services
│   │   │   │   ├── mcp.js      # MCP client
│   │   │   │   ├── dialogflow.js # DialogFlow integration
│   │   │   │   └── langchain.js  # LangChain agents
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   └── utils/          # Utility functions
│   │   └── pages/              # Next.js pages
│   │
│   ├── web-ui/                 # Main Web Application
│   └── shared/                 # Shared utilities and types
│
├── mcp-server.js               # MCP Server implementation
├── docker-compose.yml          # Docker orchestration
└── config/                     # Configuration files
```

### Key Components Deep Dive

#### 1. MCP Server Implementation

```javascript
// mcp-server.js - Core MCP Server
class CreditCardMCPServer {
  constructor() {
    this.server = new Server({
      name: 'credit-card-enterprise-mcp',
      version: '1.0.0',
    }, {
      capabilities: { tools: {} }
    });
    
    this.apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000/api/v1';
    this.authToken = null;
    
    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  // Tool registration and handling
  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: this.getToolDefinitions() };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return await this.handleToolCall(request.params.name, request.params.arguments);
    });
  }

  // Authentication handler
  async handleAuthentication(args) {
    const response = await axios.post(`${this.apiBaseUrl}/auth/login`, {
      email: args.email,
      password: args.password
    });
    
    this.authToken = response.data.token;
    return {
      content: [{
        type: 'text',
        text: `Authentication successful. Token expires in ${response.data.expiresIn}`
      }]
    };
  }

  // Account operations
  async handleGetAccounts(args) {
    const params = new URLSearchParams(args);
    const response = await axios.get(`${this.apiBaseUrl}/accounts?${params}`, {
      headers: { Authorization: `Bearer ${this.authToken}` }
    });
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data, null, 2)
      }]
    };
  }
}
```

#### 2. Chatbot Integration

```typescript
// src/services/mcp.js - MCP Client Integration
export class MCPClient {
  private client: Client;
  private transport: StdioClientTransport;

  constructor() {
    this.transport = new StdioClientTransport({
      command: 'node',
      args: ['../../mcp-server.js']
    });
    this.client = new Client({ name: 'chatbot-client', version: '1.0.0' }, {
      capabilities: {}
    });
  }

  async connect(): Promise<void> {
    await this.client.connect(this.transport);
  }

  async authenticate(email: string, password: string): Promise<any> {
    return await this.client.request({
      method: 'tools/call',
      params: {
        name: 'authenticate',
        arguments: { email, password }
      }
    });
  }

  async getAccounts(filters?: AccountFilters): Promise<any> {
    return await this.client.request({
      method: 'tools/call',
      params: {
        name: 'get_accounts',
        arguments: filters || {}
      }
    });
  }
}
```

#### 3. DialogFlow Integration

```typescript
// src/services/dialogflow.js - NLP Processing
export class DialogFlowService {
  private sessionClient: SessionsClient;
  private projectId: string;
  private sessionId: string;

  constructor() {
    this.sessionClient = new SessionsClient();
    this.projectId = process.env.DIALOGFLOW_PROJECT_ID!;
    this.sessionId = crypto.randomUUID();
  }

  async detectIntent(query: string, languageCode: string = 'en'): Promise<IntentResult> {
    const sessionPath = this.sessionClient.projectAgentSessionPath(
      this.projectId,
      this.sessionId
    );

    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: query,
          languageCode: languageCode,
        },
      },
    };

    const [response] = await this.sessionClient.detectIntent(request);
    
    return {
      intentName: response.queryResult?.intent?.displayName || 'Default',
      parameters: response.queryResult?.parameters || {},
      fulfillmentText: response.queryResult?.fulfillmentText || '',
      confidence: response.queryResult?.intentDetectionConfidence || 0
    };
  }

  async processWithContext(query: string, context: ConversationContext): Promise<ProcessedResult> {
    const intentResult = await this.detectIntent(query);
    
    // Map intents to MCP tool calls
    const toolMapping = {
      'check.balance': 'get_accounts',
      'transfer.money': 'create_transaction',
      'block.card': 'block_card',
      'report.fraud': 'create_fraud_case',
      'dispute.transaction': 'create_dispute'
    };

    const toolName = toolMapping[intentResult.intentName];
    if (toolName) {
      return {
        ...intentResult,
        mcpTool: toolName,
        parameters: this.extractParameters(intentResult.parameters)
      };
    }

    return intentResult;
  }
}
```

#### 4. LangChain Agent Implementation

```typescript
// src/services/langchain.js - Conversation Management
export class BankingAgent {
  private agent: AgentExecutor;
  private memory: ConversationBufferMemory;
  private mcpClient: MCPClient;

  constructor(mcpClient: MCPClient) {
    this.mcpClient = mcpClient;
    this.memory = new ConversationBufferMemory({
      memoryKey: "chat_history",
      returnMessages: true
    });

    this.agent = this.createAgent();
  }

  private createAgent(): AgentExecutor {
    const tools = [
      new Tool({
        name: "get_account_balance",
        description: "Get current account balance for the user",
        func: async (input: string) => {
          const accounts = await this.mcpClient.getAccounts();
          return JSON.stringify(accounts);
        }
      }),
      new Tool({
        name: "transfer_funds",
        description: "Transfer money between accounts",
        func: async (input: string) => {
          const params = JSON.parse(input);
          return await this.mcpClient.createTransaction(params);
        }
      }),
      new Tool({
        name: "report_fraud",
        description: "Report fraudulent activity",
        func: async (input: string) => {
          const params = JSON.parse(input);
          return await this.mcpClient.createFraudCase(params);
        }
      })
    ];

    const prompt = ChatPromptTemplate.fromTemplate(`
      You are a helpful banking assistant. Use the available tools to help users with their banking needs.
      
      Previous conversation:
      {chat_history}
      
      Current request: {input}
      
      Available tools: {tools}
      
      Thought: {agent_scratchpad}
    `);

    return AgentExecutor.fromAgentAndTools({
      agent: new OpenAIFunctionsAgent({
        llm: new ChatOpenAI({ temperature: 0 }),
        tools,
        prompt
      }),
      tools,
      memory: this.memory,
      verbose: true
    });
  }

  async processMessage(message: string): Promise<AgentResponse> {
    try {
      const result = await this.agent.call({
        input: message,
        chat_history: this.memory.chatHistory
      });

      return {
        response: result.output,
        toolsUsed: result.intermediateSteps?.map(step => step.action.tool) || [],
        confidence: 0.9
      };
    } catch (error) {
      return {
        response: "I apologize, but I encountered an error processing your request. Please try again.",
        toolsUsed: [],
        confidence: 0.0,
        error: error.message
      };
    }
  }
}
```

#### 5. Backend API Service Layer

```javascript
// routes/accounts.js - Account Management API
const express = require('express');
const { auth } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const accountService = require('../services/accountService');

const router = express.Router();

// GET /api/v1/accounts - Retrieve user accounts
router.get('/', auth, async (req, res) => {
  try {
    const { page, limit, status, accountType } = req.query;
    const filters = { page, limit, status, accountType };
    
    const accounts = await accountService.getUserAccounts(
      req.user.userId, 
      filters
    );
    
    res.json({
      message: 'Accounts retrieved successfully',
      data: accounts.data,
      pagination: accounts.pagination
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve accounts',
      message: error.message
    });
  }
});

// POST /api/v1/accounts - Create new account
router.post('/', auth, validateRequest(createAccountSchema), async (req, res) => {
  try {
    const accountData = {
      ...req.body,
      userId: req.user.userId
    };
    
    const newAccount = await accountService.createAccount(accountData);
    
    res.status(201).json({
      message: 'Account created successfully',
      account: newAccount
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create account',
      message: error.message
    });
  }
});
```

---

## 🔒 Security Architecture

### Security Layer Implementation

```mermaid
graph TB
    subgraph "Frontend Security"
        CSP[Content Security Policy]
        XSS[XSS Protection]
        HTTPS[HTTPS Enforcement]
        TOKEN[Token Storage]
    end
    
    subgraph "API Security"
        JWT_AUTH[JWT Authentication]
        RATE_LIM[Rate Limiting]
        INPUT_VAL[Input Validation]
        CORS_SEC[CORS Security]
    end
    
    subgraph "MCP Security"
        MCP_AUTH[MCP Authentication]
        TOOL_PERM[Tool Permissions]
        SECURE_COMM[Secure Communication]
        ERROR_HAND[Error Handling]
    end
    
    subgraph "Data Security"
        ENCRYPT[Data Encryption]
        HASH[Password Hashing]
        MASK[Data Masking]
        AUDIT[Audit Logging]
    end
    
    subgraph "Infrastructure Security"
        FIREWALL[Firewall Rules]
        VPN[VPN Access]
        MONITOR[Security Monitoring]
        BACKUP[Secure Backups]
    end
    
    CSP --> JWT_AUTH
    XSS --> INPUT_VAL
    HTTPS --> SECURE_COMM
    TOKEN --> MCP_AUTH
    
    JWT_AUTH --> ENCRYPT
    RATE_LIM --> AUDIT
    INPUT_VAL --> HASH
    CORS_SEC --> MASK
    
    MCP_AUTH --> FIREWALL
    TOOL_PERM --> VPN
    SECURE_COMM --> MONITOR
    ERROR_HAND --> BACKUP
```

### Authentication & Authorization Flow

```mermaid
graph LR
    subgraph "Client Authentication"
        LOGIN[User Login]
        VALIDATE[Credential Validation]
        JWT_GEN[JWT Generation]
        TOKEN_STORE[Token Storage]
    end
    
    subgraph "API Authorization"
        TOKEN_CHECK[Token Verification]
        ROLE_CHECK[Role Validation]
        PERMISSION[Permission Check]
        ACCESS_GRANT[Access Granted]
    end
    
    subgraph "MCP Authorization"
        MCP_TOKEN[MCP Token Check]
        TOOL_AUTH[Tool Authorization]
        RATE_CHECK[Rate Limiting]
        AUDIT_LOG[Audit Logging]
    end
    
    LOGIN --> VALIDATE
    VALIDATE --> JWT_GEN
    JWT_GEN --> TOKEN_STORE
    
    TOKEN_STORE --> TOKEN_CHECK
    TOKEN_CHECK --> ROLE_CHECK
    ROLE_CHECK --> PERMISSION
    PERMISSION --> ACCESS_GRANT
    
    ACCESS_GRANT --> MCP_TOKEN
    MCP_TOKEN --> TOOL_AUTH
    TOOL_AUTH --> RATE_CHECK
    RATE_CHECK --> AUDIT_LOG
```

---

## 🚀 Deployment Architecture

### Container Architecture

```mermaid
graph TB
    subgraph "Load Balancer"
        LB[NGINX Load Balancer]
    end
    
    subgraph "Frontend Containers"
        WEB1[Web UI Container 1]
        WEB2[Web UI Container 2]
        CHAT1[Chatbot UI Container 1]
        CHAT2[Chatbot UI Container 2]
    end
    
    subgraph "Backend Containers"
        API1[Backend API Container 1]
        API2[Backend API Container 2]
        MCP1[MCP Server Container 1]
        MCP2[MCP Server Container 2]
    end
    
    subgraph "AI Services"
        DF_SVC[DialogFlow Service]
        LC_SVC[LangChain Service]
        ML_SVC[ML Model Service]
    end
    
    subgraph "Data Services"
        POSTGRES[PostgreSQL Primary]
        POSTGRES_REP[PostgreSQL Replica]
        REDIS_MASTER[Redis Master]
        REDIS_SLAVE[Redis Slave]
    end
    
    subgraph "Monitoring"
        PROMETHEUS[Prometheus]
        GRAFANA[Grafana]
        LOGS[Log Aggregator]
    end
    
    LB --> WEB1
    LB --> WEB2
    LB --> CHAT1
    LB --> CHAT2
    
    WEB1 --> API1
    WEB2 --> API2
    CHAT1 --> MCP1
    CHAT2 --> MCP2
    
    API1 --> POSTGRES
    API2 --> POSTGRES_REP
    MCP1 --> API1
    MCP2 --> API2
    
    CHAT1 --> DF_SVC
    CHAT2 --> LC_SVC
    DF_SVC --> ML_SVC
    
    API1 --> REDIS_MASTER
    API2 --> REDIS_SLAVE
    
    API1 --> PROMETHEUS
    API2 --> PROMETHEUS
    PROMETHEUS --> GRAFANA
    
    style LB fill:#e3f2fd
    style POSTGRES fill:#e8f5e8
    style REDIS_MASTER fill:#fff3e0
```

### Microservices Deployment

```mermaid
graph TB
    subgraph "Kubernetes Cluster"
        subgraph "Frontend Namespace"
            WEB_DEPLOY[Web UI Deployment]
            CHAT_DEPLOY[Chatbot Deployment]
            WEB_SVC[Web Service]
            CHAT_SVC[Chat Service]
        end
        
        subgraph "Backend Namespace"
            API_DEPLOY[API Deployment]
            MCP_DEPLOY[MCP Deployment]
            API_SVC[API Service]
            MCP_SVC[MCP Service]
        end
        
        subgraph "Data Namespace"
            DB_DEPLOY[Database StatefulSet]
            CACHE_DEPLOY[Cache Deployment]
            DB_SVC[Database Service]
            CACHE_SVC[Cache Service]
        end
        
        subgraph "AI Namespace"
            DF_DEPLOY[DialogFlow Deployment]
            LC_DEPLOY[LangChain Deployment]
            ML_DEPLOY[ML Model Deployment]
        end
    end
    
    subgraph "External Services"
        DF_API[DialogFlow API]
        OPENAI[OpenAI API]
        PAYMENT_GW[Payment Gateway]
    end
    
    WEB_DEPLOY --> WEB_SVC
    CHAT_DEPLOY --> CHAT_SVC
    API_DEPLOY --> API_SVC
    MCP_DEPLOY --> MCP_SVC
    
    WEB_SVC --> API_SVC
    CHAT_SVC --> MCP_SVC
    MCP_SVC --> API_SVC
    
    API_SVC --> DB_SVC
    API_SVC --> CACHE_SVC
    
    CHAT_SVC --> DF_DEPLOY
    CHAT_SVC --> LC_DEPLOY
    DF_DEPLOY --> DF_API
    LC_DEPLOY --> OPENAI
    
    API_SVC --> PAYMENT_GW
```

---

## 📈 Performance & Monitoring

### System Monitoring Dashboard

```mermaid
graph LR
    subgraph "Application Metrics"
        API_METRICS[API Response Times]
        MCP_METRICS[MCP Tool Performance]
        CHAT_METRICS[Chatbot Metrics]
        ERROR_RATES[Error Rates]
    end
    
    subgraph "Infrastructure Metrics"
        CPU[CPU Usage]
        MEMORY[Memory Usage]
        DISK[Disk I/O]
        NETWORK[Network Traffic]
    end
    
    subgraph "Business Metrics"
        TXN_VOLUME[Transaction Volume]
        USER_ACTIVITY[User Activity]
        FRAUD_DETECTION[Fraud Detection Rate]
        DISPUTE_RESOLUTION[Dispute Resolution Time]
    end
    
    subgraph "Alerting"
        PAGER[PagerDuty]
        SLACK[Slack Notifications]
        EMAIL[Email Alerts]
        SMS[SMS Alerts]
    end
    
    API_METRICS --> PAGER
    ERROR_RATES --> SLACK
    FRAUD_DETECTION --> EMAIL
    CPU --> SMS
```

## 🎯 Conclusion

This Credit Card Enterprise System represents a comprehensive financial services platform that leverages modern technologies including:

- **Model Context Protocol (MCP)** for seamless AI-to-API communication
- **DialogFlow NLP** for natural language understanding
- **LangChain Agents** for intelligent conversation management
- **Microservices Architecture** for scalability and maintainability
- **Enterprise Security** with JWT authentication and fraud protection
- **Real-time Processing** for transactions and fraud detection

The system is designed to handle enterprise-scale operations while providing an intuitive chatbot interface for customers and comprehensive APIs for developers. The modular architecture ensures easy maintenance, scaling, and feature additions.

### Key Benefits:

1. **Unified Communication**: MCP provides a standardized way for AI components to interact with backend services
2. **Natural Language Interface**: Users can perform complex banking operations through conversational AI
3. **Real-time Fraud Protection**: Advanced fraud detection with automatic blocking and alerting
4. **Scalable Architecture**: Microservices design supports horizontal scaling
5. **Developer Friendly**: Comprehensive APIs with detailed documentation and testing tools
6. **Security First**: Multi-layered security architecture protecting sensitive financial data

The system is production-ready and can be deployed using the provided Docker configurations and Kubernetes manifests for enterprise environments.
