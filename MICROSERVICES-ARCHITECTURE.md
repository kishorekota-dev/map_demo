# POC Banking Chat - Microservices Architecture

## 📋 Executive Summary

This document provides a comprehensive overview of the POC Banking Chat application's microservices architecture, including service responsibilities, communication patterns, ports, and integration points.

---

## 🏗️ Architecture Overview

The POC Banking Chat is built on a **microservices architecture** with the following services:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Client Layer                                     │
├─────────────────────────────────────────────────────────────────────────┤
│  poc-frontend (React/TS)  │  poc-agent-ui (Agent Dashboard)             │
│  Port: 3000               │  Port: 3007                                  │
└───────────────┬──────────────────────────┬───────────────────────────────┘
                │                          │
                └──────────┬───────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────────────────┐
│                     API Gateway (Central Entry Point)                   │
│                     poc-api-gateway                                     │
│                     Port: 3001                                          │
│  - Routes requests to appropriate microservices                        │
│  - Load balancing, rate limiting, authentication                       │
└──────────┬─────────────┬─────────────┬──────────────┬─────────────────┘
           │             │             │              │
┌──────────▼─────┐ ┌─────▼─────┐ ┌────▼──────┐ ┌────▼────────┐
│ poc-backend    │ │poc-chat-  │ │ poc-      │ │ poc-banking-│
│ (Legacy REST)  │ │backend    │ │ nlu-      │ │ service     │
│ Port: 3001*    │ │(Real-time)│ │ service   │ │ Port: 3005  │
│                │ │Port: 3006 │ │Port: 3003 │ │             │
└────────┬───────┘ └─────┬─────┘ └────┬──────┘ └──────┬──────┘
         │               │             │               │
         │         ┌─────▼─────┐ ┌────▼──────┐        │
         │         │ poc-nlp-  │ │ poc-mcp-  │        │
         │         │ service   │ │ service   │        │
         │         │Port: 3002 │ │Port: 3004 │        │
         │         └───────────┘ └───────────┘        │
         │                                             │
         └─────────────────────┬──────────────────────┘
                               │
                    ┌──────────▼───────────┐
                    │   External Services   │
                    │ - DialogFlow (GCP)    │
                    │ - Redis (Caching)     │
                    │ - PostgreSQL (Data)   │
                    └───────────────────────┘
```

**Note**: *poc-backend on port 3001 conflicts with API Gateway. See Issues section.

---

## 🎯 Services Detailed Overview

### 1. **poc-frontend** (Customer Chat Interface)
- **Port**: 3000 (Vite dev server)
- **Technology**: React 18, TypeScript, Vite
- **Purpose**: Customer-facing chat interface for banking interactions
- **Key Features**:
  - Real-time chat UI with WebSocket support
  - Intent display and confidence visualization
  - Message history and session management
  - Atomic design component structure
- **Dependencies**:
  - API Gateway (REST): `http://localhost:3001/api`
  - Chat Backend (WebSocket): `ws://localhost:3006`
- **Environment Variables**:
  ```
  VITE_API_BASE_URL=http://localhost:3001/api
  VITE_WS_URL=ws://localhost:3006
  ```

### 2. **poc-agent-ui** (Agent Dashboard)
- **Port**: 3007
- **Technology**: Node.js, Express, Socket.IO, Vanilla JS
- **Purpose**: Internal dashboard for customer service agents
- **Key Features**:
  - Agent queue management
  - Live chat monitoring
  - Customer conversation history
  - Agent assignment and routing
- **Dependencies**:
  - Chat Backend: `http://localhost:3006`
  - Redis for session storage
- **Services**:
  - AgentService: Manages agent status and availability
  - QueueService: Handles customer queue
  - ChatClientService: Interface to chat backend
  - SocketManager: Real-time agent notifications

### 3. **poc-api-gateway** (API Gateway)
- **Port**: 3001
- **Technology**: Node.js, Express, Helmet, CORS
- **Purpose**: Central entry point, routing, and cross-cutting concerns
- **Key Features**:
  - Service discovery and routing
  - Load balancing (round-robin, least-connection)
  - Rate limiting and throttling
  - JWT authentication
  - Circuit breaker pattern
  - Request/response logging
- **Routes**:
  - `/health` - Health check
  - `/metrics` - Service metrics
  - `/api/banking/*` - Banking service proxy
  - `/api/nlp/*` - NLP service proxy
  - `/api/nlu/*` - NLU service proxy
  - `/api/mcp/*` - MCP service proxy
- **Dependencies**:
  - All downstream microservices
  - Consul (optional service registry)
  - Redis (caching)

### 4. **poc-backend** ⚠️ (Legacy REST API)
- **Port**: 3001 (PORT CONFLICT with API Gateway!)
- **Technology**: Node.js, Express
- **Purpose**: Original REST API for chat with intent detection
- **Status**: **OVERLAPS with poc-chat-backend** - Consolidation recommended
- **Key Features**:
  - REST endpoints for chat
  - Local intent detection (IntentService)
  - Banking operations (PocBankingService)
  - Session management
- **Routes**:
  - `POST /api/chat/message` - Send chat message
  - `POST /api/chat/banking` - Banking-specific message
  - `GET /api/chat/intents` - Available intents
  - `GET /api/chat/history` - Chat history
  - `/api/banking/*` - Banking operations

### 5. **poc-chat-backend** (Real-time Chat Orchestration)
- **Port**: 3006
- **Technology**: Node.js, Express, Socket.IO
- **Purpose**: Real-time chat processing with multi-agent orchestration
- **Key Features**:
  - WebSocket bidirectional communication
  - Agent orchestration (NLP, NLU, Banking, MCP)
  - Session management with Redis
  - Conversation context tracking
  - JWT authentication for WebSocket
  - Typing indicators and presence
- **Services**:
  - ChatService: Message processing and history
  - AgentOrchestrator: Multi-agent coordination
  - SessionManager: Session lifecycle management
  - SocketHandler: WebSocket event handling
- **Routes**:
  - `POST /api/chat/message` - HTTP fallback
  - `GET /api/sessions/:id` - Session details
  - `WebSocket: /socket.io` - Real-time communication
- **Dependencies**:
  - poc-nlu-service: Intent detection
  - poc-nlp-service: Text processing
  - poc-banking-service: Banking operations
  - poc-mcp-service: Tool calling

### 6. **poc-banking-service** (Banking Operations)
- **Port**: 3005
- **Technology**: Node.js, Express, Winston
- **Purpose**: Core banking functionality and data
- **Key Features**:
  - Account management
  - Transaction processing
  - Card services
  - Fund transfers
  - Fraud detection
  - Dispute management
- **Routes**:
  - `GET /api/accounts` - List accounts
  - `GET /api/accounts/:id` - Account details
  - `GET /api/transactions` - Transaction history
  - `POST /api/transfers` - Create transfer
  - `GET /api/cards` - Card management
  - `POST /api/fraud/report` - Report fraud
  - `POST /api/disputes` - File dispute
- **Authentication**: JWT-based (middleware)
- **Mock Data**: Currently uses in-memory mock data

### 7. **poc-nlp-service** (Natural Language Processing)
- **Port**: 3002
- **Technology**: Node.js, Express, Natural library
- **Purpose**: Text analysis and processing
- **Key Features**:
  - Tokenization
  - Part-of-speech tagging
  - Named entity recognition (NER)
  - Sentiment analysis
  - Keyword extraction
  - Text normalization
- **Routes**:
  - `POST /api/nlp/process` - Full NLP pipeline
  - `POST /api/nlp/analyze` - Text analysis
  - `POST /api/nlp/entities` - Entity extraction
  - `POST /api/nlp/sentiment` - Sentiment analysis
  - `POST /api/nlp/tokenize` - Tokenization
- **No External Dependencies**: Uses local NLP library

### 8. **poc-nlu-service** (Natural Language Understanding)
- **Port**: 3003
- **Technology**: Node.js, Express, DialogFlow SDK
- **Purpose**: Intent detection and context understanding
- **Key Features**:
  - Intent classification
  - Entity extraction
  - Context management
  - DialogFlow integration
  - Banking domain-specific intents
  - Confidence scoring
  - Multi-language support
- **Routes**:
  - `POST /api/nlu/intents` - Detect intent
  - `POST /api/nlu/entities` - Extract entities
  - `POST /api/nlu/dialogflow` - DialogFlow query
  - `POST /api/nlu/banking` - Banking-specific NLU
  - `POST /api/nlu/train` - Training data management
- **External Dependencies**:
  - Google DialogFlow API (requires credentials)

### 9. **poc-mcp-service** (Model Context Protocol)
- **Port**: 3004
- **Technology**: Node.js, Express, WebSocket
- **Purpose**: Tool discovery and execution via MCP protocol
- **Key Features**:
  - MCP protocol compliance (version 2024-11-05)
  - Tool discovery and registration
  - Tool execution with validation
  - Resource management
  - Prompt templates
  - Progress tracking
  - WebSocket and HTTP interfaces
- **Routes**:
  - `POST /api/mcp/tools/discover` - List available tools
  - `POST /api/mcp/tools/execute` - Execute tool
  - `GET /api/mcp/resources` - Available resources
  - `POST /api/mcp/prompts` - Prompt templates
  - `WebSocket: ws://localhost:3004` - MCP protocol
- **Tools Provided**:
  - Banking tools (balance check, transfer, etc.)
  - Data retrieval tools
  - External API integration tools

---

## 🔄 Communication Patterns

### Synchronous Communication (HTTP/REST)
```
Frontend → API Gateway → Microservices
                        ├→ Banking Service
                        ├→ NLP Service
                        └→ NLU Service
```

### Asynchronous Communication (WebSocket)
```
Frontend ←→ Chat Backend (Socket.IO)
Agent UI ←→ Chat Backend (Socket.IO)
MCP Service ←→ Chat Backend (WebSocket)
```

### Service-to-Service Communication
```
Chat Backend → NLU Service (REST)
             → NLP Service (REST)
             → Banking Service (REST)
             → MCP Service (REST/WebSocket)

API Gateway → All Services (REST with circuit breaker)
```

---

## 🔌 Port Allocation

| Service | Port | Protocol | Status |
|---------|------|----------|--------|
| poc-frontend | 3000 | HTTP | ✅ Active |
| poc-api-gateway | 3001 | HTTP | ✅ Active |
| **poc-backend** | **3001** | HTTP | ⚠️ **PORT CONFLICT** |
| poc-nlp-service | 3002 | HTTP | ✅ Active |
| poc-nlu-service | 3003 | HTTP | ✅ Active |
| poc-mcp-service | 3004 | HTTP/WS | ✅ Active |
| poc-banking-service | 3005 | HTTP | ✅ Active |
| poc-chat-backend | 3006 | HTTP/WS | ✅ Active |
| poc-agent-ui | 3007 | HTTP | ✅ Active |

---

## 🔐 Security & Authentication

### Authentication Flow
```
1. User logs in → API Gateway
2. Gateway validates credentials
3. Issues JWT token (24h expiry)
4. Token included in all subsequent requests
5. Services validate JWT using shared secret
```

### Security Features
- **Helmet.js**: Security headers on all services
- **CORS**: Configured allowed origins
- **Rate Limiting**: Per-service rate limits
- **JWT**: Token-based authentication
- **Input Validation**: express-validator
- **HTTPS**: Production ready (requires certificates)

---

## 📊 Data Flow - Chat Message Example

```
User sends message: "What's my account balance?"

1. Frontend (3000) → WebSocket → Chat Backend (3006)
   - Message: "What's my account balance?"
   - Session ID: abc-123

2. Chat Backend → Agent Orchestrator
   - Determines required agents: [NLP, NLU, Banking]

3. Agent Orchestrator → NLP Service (3002)
   - Request: Tokenize and analyze sentiment
   - Response: Tokens, sentiment: neutral

4. Agent Orchestrator → NLU Service (3003)
   - Request: Detect intent
   - Response: Intent="check_balance", confidence=0.95

5. Agent Orchestrator → Banking Service (3005)
   - Request: GET /api/accounts/:id
   - Response: Balance=$2,500.75

6. Chat Backend → Aggregates responses
   - Creates response message
   - Updates conversation context

7. Chat Backend → WebSocket → Frontend
   - Response: "Your checking account balance is $2,500.75"
   - Intent display shown to user

8. Chat Backend → Stores in session history
```

---

## 🔥 Critical Issues & Recommendations

### Issue 1: Port Conflict ⚠️
**Problem**: `poc-backend` and `poc-api-gateway` both use port 3001

**Resolution Options**:
1. **Recommended**: Retire `poc-backend`, consolidate into `poc-chat-backend`
2. Change `poc-backend` port to 3008
3. Use API Gateway exclusively and route to chat-backend

### Issue 2: Duplicate Functionality ⚠️
**Problem**: ~70% overlap between `poc-backend` and `poc-chat-backend`

**Recommendation**: 
- Consolidate services into single `poc-chat-backend`
- Support both REST and WebSocket in one service
- Reduce maintenance burden and code duplication

### Issue 3: Missing Service Discovery ⚠️
**Problem**: Hard-coded service URLs in all services

**Recommendation**:
- Implement Consul or Eureka for service registry
- Services register on startup
- API Gateway discovers services dynamically

### Issue 4: No Database Layer ⚠️
**Problem**: All services use in-memory mock data

**Recommendation**:
- Add PostgreSQL for persistent data
- Redis for caching and sessions
- MongoDB for chat history (optional)

### Issue 5: Missing Monitoring ⚠️
**Problem**: No centralized logging or metrics

**Recommendation**:
- Add ELK Stack (Elasticsearch, Logstash, Kibana)
- Prometheus + Grafana for metrics
- Distributed tracing with Jaeger

---

## 🧪 Testing Strategy

### Unit Tests
- Each service should have unit tests (Jest)
- Target: 80%+ code coverage

### Integration Tests
- Test service-to-service communication
- Test API Gateway routing

### End-to-End Tests
- Test complete user flows
- Frontend → Backend → Services → Response

### Load Tests
- Test system under concurrent users
- Identify bottlenecks

---

## 🚀 Deployment Strategy

### Development
```bash
# Start all services
npm run dev:all

# Individual service
cd poc-chat-backend && npm run dev
```

### Docker Compose
```bash
docker-compose -f docker-compose-full-stack.yml up
```

### Production (Kubernetes)
```
- Each service as a Deployment
- Service discovery via K8s Services
- Ingress for API Gateway
- ConfigMaps for environment variables
- Secrets for sensitive data
```

---

## 📦 Service Dependencies

### poc-frontend
- Depends on: API Gateway, Chat Backend
- External: None

### poc-agent-ui
- Depends on: Chat Backend
- External: Redis

### poc-api-gateway
- Depends on: All microservices
- External: Consul (optional), Redis

### poc-chat-backend
- Depends on: NLU, NLP, Banking, MCP services
- External: Redis, DialogFlow

### poc-banking-service
- Depends on: None (standalone)
- External: PostgreSQL (future)

### poc-nlp-service
- Depends on: None (standalone)
- External: None

### poc-nlu-service
- Depends on: None (standalone)
- External: Google DialogFlow API

### poc-mcp-service
- Depends on: Banking Service (for tools)
- External: None

---

## 📈 Scalability Considerations

### Horizontal Scaling
- All services are stateless (except sessions in Redis)
- Can scale each service independently
- Load balancer distributes traffic

### Vertical Scaling
- Increase CPU/Memory per service based on load
- Monitor resource usage

### Caching Strategy
- Redis for session data
- API Gateway caches responses
- CDN for frontend assets

---

## 🔧 Configuration Management

### Environment Variables
Each service uses `.env` files with:
- Service port
- Dependent service URLs
- API keys and secrets
- Feature flags
- Logging configuration

### Centralized Config (Future)
- Spring Cloud Config Server
- Consul KV store
- Kubernetes ConfigMaps

---

## 📚 API Documentation

### OpenAPI/Swagger
Each service should provide:
- `/api/docs` - Swagger UI
- `/api/openapi.json` - OpenAPI spec

### Postman Collections
Located in: `/api-docs/`

---

## 🎓 Getting Started

### Prerequisites
```bash
- Node.js 18+
- npm 8+
- Redis (optional)
- PostgreSQL (optional)
```

### Quick Start
```bash
# Clone repository
git clone <repo-url>

# Install all dependencies
npm run install:all

# Start all services
npm run dev:all

# Access application
open http://localhost:3000
```

### Individual Service Setup
```bash
cd poc-<service-name>
npm install
cp .env.example .env
npm run dev
```

---

## 📞 Support & Contribution

### Issues
Report issues on GitHub Issues page

### Contributing
1. Fork the repository
2. Create feature branch
3. Submit pull request

### Documentation
- Update this file for architecture changes
- Update service README for service changes
- Update API docs for endpoint changes

---

## 📅 Roadmap

### Phase 1 (Current)
- ✅ Basic microservices architecture
- ✅ Real-time chat functionality
- ✅ Banking operations
- ✅ Agent orchestration

### Phase 2 (Next)
- [ ] Consolidate poc-backend and poc-chat-backend
- [ ] Add database layer
- [ ] Implement service discovery
- [ ] Add comprehensive logging

### Phase 3 (Future)
- [ ] Kubernetes deployment
- [ ] CI/CD pipeline
- [ ] Automated testing
- [ ] Production monitoring

---

## 📝 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-04 | Initial comprehensive architecture documentation |

---

**Last Updated**: October 4, 2025  
**Maintained By**: POC Development Team
