# Architecture Overview

The POC Banking Chat is a microservices-based application for conversational banking.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐                            │
│  │   Frontend      │    │   Agent UI      │                            │
│  │   (React/Vite)  │    │   (React)       │                            │
│  │   Port: 3000    │    │   Port: 8081    │                            │
│  └────────┬────────┘    └────────┬────────┘                            │
└───────────┼──────────────────────┼──────────────────────────────────────┘
            │                      │
            └──────────┬───────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────────────┐
│                         GATEWAY LAYER                                    │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     API Gateway                                   │   │
│  │  • Request Routing    • Rate Limiting    • Load Balancing        │   │
│  │  • Authentication     • Service Discovery                        │   │
│  │                       Port: 3001                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                       │
       ┌───────────────┼───────────────┬───────────────┐
       │               │               │               │
┌──────▼─────┐  ┌──────▼─────┐  ┌──────▼─────┐  ┌──────▼─────┐
│   Chat     │  │  Banking   │  │    NLU     │  │    MCP     │
│  Backend   │  │  Service   │  │  Service   │  │  Service   │
│  :3006     │  │  :3005     │  │  :3003     │  │  :3004     │
└──────┬─────┘  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘
       │               │               │               │
       └───────────────┼───────────────┴───────────────┘
                       │
                ┌──────▼──────┐
                │     AI      │
                │ Orchestrator│
                │   :3007     │
                └──────┬──────┘
                       │
                ┌──────▼──────┐
                │  PostgreSQL │
                │   Database  │
                └─────────────┘
```

## Services Overview

### Frontend Layer

| Service | Port | Technology | Purpose |
|---------|------|------------|---------|
| Frontend | 3000 | React + Vite + TypeScript | Customer chat interface with Atomic Design |
| Agent UI | 8081 | React + Express | Support agent dashboard |

### Gateway Layer

| Service | Port | Technology | Purpose |
|---------|------|------------|---------|
| API Gateway | 3001 | Express | Request routing, auth, rate limiting |

### Processing Layer

| Service | Port | Technology | Purpose |
|---------|------|------------|---------|
| Chat Backend | 3006 | Express + Socket.IO | Real-time chat, WebSocket, session management |
| NLU Service | 3003 | Express + DialogFlow | Intent detection, entity extraction |
| MCP Service | 3004 | Express + WebSocket | Model Context Protocol tools execution |

### Domain Layer

| Service | Port | Technology | Purpose |
|---------|------|------------|---------|
| Banking Service | 3005 | Express + PostgreSQL | Banking operations, accounts, transactions |
| AI Orchestrator | 3007 | Express + LangGraph | Banking workflow orchestration and deterministic tool-backed responses; optional remote generation for no-tool intents |

## Data Flow

### Chat Message Flow

```
1. Frontend sends REST chat and session traffic to the API Gateway.
2. The gateway proxies chat traffic to the Chat Backend.
3. Chat Backend extracts intent via NLU Service.
4. AI Orchestrator processes workflow-driven requests when required.
5. MCP Service executes banking tools.
6. Banking Service performs operations.
7. Frontend receives REST responses through the gateway and uses Socket.IO directly for real-time updates.
```

### Authentication Flow

```
1. User submits credentials to Frontend
2. Frontend calls Banking Service /auth/login
3. Banking Service validates and returns JWT
4. JWT included in all subsequent requests
5. API Gateway validates JWT on each request
```

## Key Technologies

| Category | Technology |
|----------|------------|
| Frontend | React 18, Vite, TypeScript, Zustand |
| Backend | Node.js, Express, Socket.IO |
| AI/NLU | LangGraph, OpenAI, DialogFlow |
| Database | PostgreSQL, Flyway migrations |
| Protocol | MCP (Model Context Protocol) |
| Auth | JWT, bcrypt |
| DevOps | Docker, Docker Compose |

## Service Communication

### Synchronous (REST)
- Frontend → API Gateway → Chat Backend and domain services
- Inter-service REST calls

### Asynchronous (WebSocket)
- Frontend ↔ Chat Backend (Socket.IO)
- MCP Service ↔ AI Orchestrator

### Event-Driven
- Chat events broadcast
- Agent notifications

## Database Schema

### Banking Service Database (poc_banking)
- users, roles, permissions
- accounts, transactions
- cards, disputes, fraud_alerts

### AI Orchestrator Database (poc_ai_orchestrator)
- workflow_sessions
- conversation_state
- tool_executions

## Configuration

Each service has its own `.env` file. See [Configuration Guide](../getting-started/configuration.md).

## Current Recommendations

- Treat the NLU service as the consolidated NLP and NLU runtime surface. Legacy callers now resolve through compatibility endpoints, but the naming should be simplified next.
- Keep browser HTTP traffic on the API gateway and browser WebSocket traffic on the chat backend. That split now works, but it should be codified in tests and docs.
- Reduce deployment drift by treating `docker/docker-compose.local.yml` and `docker/docker-compose-full-stack.yml` as the only supported compose entry points.

See [Architecture Recommendations](recommendations.md) for the detailed follow-up list.

## Diagrams

- [Sequence Diagram](diagrams/sequence-flow.mermaid)
- [Architecture Diagram](diagrams/architecture.mermaid)
- [Data Model](diagrams/data-model.mermaid)
