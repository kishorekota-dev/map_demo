# POC Banking Chat

<div align="center">

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

**Enterprise conversational platform with a banking accelerator, built on microservices architecture**

[Quick Start](#-quick-start) •
[Architecture](#-architecture) •
[Documentation](#-documentation) •
[Development](#-development) •
[Deployment](#-deployment)

</div>

---

## ✨ Features

### 🤖 AI-Powered Banking
- **LangGraph Workflows** - State machine-based conversation orchestration
- **Deterministic by design** - Same input + state → same routing, tool calls, policy decisions, and a stable response. Tool-backed replies are formatted directly from authoritative banking results; optional remote generation for no-tool intents is explicitly enabled and uses pinned sampling. See [Deterministic Behavior](docs/architecture/determinism.md).
- **Intent Detection** - Deterministic pattern matching with DialogFlow as an advisory tie-breaker; one canonical intent vocabulary across services
- **Policy Engine** - Confirmation gates, transfer limits, prompt-injection blocking, and PII redaction
- **MCP Tools** - Model Context Protocol for tool execution, with a startup tool contract

### 💬 Real-time Communication
- **WebSocket Chat** - Bidirectional messaging via Socket.IO
- **Multi-Agent Support** - Coordinate between AI and human agents
- **Session Persistence** - Maintain context across conversations

### 🏦 Banking Operations
- Account management and balance inquiries
- Transaction history and search
- Fund transfers and payments
- Card management and controls
- Dispute resolution
- Fraud detection and alerts

### 🔒 Enterprise Security
- JWT authentication
- Role-based access control
- Rate limiting
- Request validation
- Audit logging

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│  ┌──────────────┐                    ┌──────────────┐           │
│  │   Frontend   │                    │   Agent UI   │           │
│  │  React/Vite  │                    │    React     │           │
│  └──────┬───────┘                    └──────┬───────┘           │
└─────────┼───────────────────────────────────┼───────────────────┘
          │                                   │
          └─────────────┬─────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│                      API GATEWAY                                 │
│         Routing • Auth • Rate Limiting • Load Balancing         │
└───────────────────────┬─────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┬───────────────┐
        │               │               │               │
┌───────▼───────┐ ┌─────▼─────┐ ┌───────▼───────┐ ┌─────▼─────┐
│ Chat Backend  │ │  Banking  │ │  NLU Service  │ │    MCP    │
│  Socket.IO    │ │  Service  │ │  DialogFlow   │ │  Service  │
└───────┬───────┘ └─────┬─────┘ └───────────────┘ └─────┬─────┘
        │               │                               │
        └───────────────┼───────────────────────────────┘
                        │
                ┌───────▼───────┐
                │      AI       │
                │  Orchestrator │
                │   LangGraph   │
                └───────┬───────┘
                        │
                ┌───────▼───────┐
                │   PostgreSQL  │
                └───────────────┘
```

### Services

| Service | Port | Description |
|---------|------|-------------|
| `frontend` | 3000 | React/Vite customer chat interface |
| `api-gateway` | 3001 | API routing and authentication |
| `nlu-service` | 3003 | DialogFlow NLU integration |
| `mcp-service` | 3004 | Model Context Protocol tools |
| `banking-service` | 3005 | Banking domain APIs |
| `chat-backend` | 3006 | Socket.IO real-time chat |
| `ai-orchestrator` | 3007 | LangGraph AI workflows |
| `agent-ui` | 8081 | Support agent dashboard |

> **Canonical implementation:** the services live under [services/](services/). The
> root `package.json` workspaces are `services/*`. (`packages/*` and the
> `docker-compose-enterprise.yml` topology are a separate legacy/experimental
> track and are not the canonical product.)

### Request flow

Every customer message follows one fixed, reproducible pipeline:

1. `chat-backend` receives the message over WebSocket and forwards it to
   `nlu-service` for a **canonical intent**.
2. `chat-backend` calls `ai-orchestrator` (`/api/orchestrator/process`) with the
   user's JWT. Routing is a pure function of intent + state — never live load.
3. `ai-orchestrator` runs the LangGraph workflow (validation → policy →
   confirmation → tool execution → response) and calls `mcp-service` tools, which
   call `banking-service`.
4. Human-input / confirmation / escalation states are surfaced back to the chat
   (and to `agent-ui` for human takeover).

See [Deterministic Behavior](docs/architecture/determinism.md) for the guarantees
enforced at each layer.

> **Session state** is persisted by `chat-backend` to its dedicated `poc_chat`
> PostgreSQL database. Active sessions and full message metadata are restored
> lazily after a restart, while per-session updates remain serialized to prevent
> lost updates. The default development setup enables this persistence and fails
> fast when PostgreSQL is unavailable rather than silently falling back to
> process memory.

---

## 🚀 Quick Start

### Prerequisites

- Node.js v22.0.0+
- npm v10.0.0+
- PostgreSQL v15+
- Docker (optional)

### Installation

```bash
# Clone repository
git clone https://github.com/kishorekota-dev/map_demo.git
cd map_demo

# Install dependencies
npm install

# Configure environment
cp .env.example .env.development

# Start PostgreSQL (skip this if PostgreSQL is already running locally)
docker compose -f docker/docker-compose.local.yml up -d postgres

# Create the databases, run migrations, and load the demo data
npm run db:setup
npm run db:seed

# Start all eight services, including both UIs
npm run dev
```

### Verify Installation

```bash
# Check service health
npm run health
```

### Access Points

| URL | Description |
|-----|-------------|
| http://localhost:3000 | Customer chat interface |
| http://localhost:8081 | Agent dashboard |
| http://localhost:3001/health | API Gateway health |
| http://localhost:3005/api/docs | Banking API docs |

---

## 📁 Project Structure

```
poc-banking-chat/
├── services/               # Microservices
│   ├── frontend/          # React chat UI
│   ├── api-gateway/       # API Gateway
│   ├── chat-backend/      # Socket.IO server
│   ├── banking-service/   # Banking APIs
│   ├── nlu-service/       # DialogFlow
│   ├── mcp-service/       # MCP tools
│   ├── ai-orchestrator/   # LangGraph
│   └── agent-ui/          # Agent dashboard
├── docs/                   # Documentation
│   ├── getting-started/   # Quick start guides
│   ├── architecture/      # System design
│   ├── api/               # API reference
│   └── guides/            # How-to guides
├── scripts/                # Build & deploy scripts
├── docker/                 # Docker configurations
└── package.json           # Monorepo configuration
```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [Quick Start](docs/getting-started/quick-start.md) | Get started in 5 minutes |
| [Architecture](docs/architecture/overview.md) | System design and data flow |
| [Recommendations](docs/architecture/recommendations.md) | Current architecture follow-ups |
| [Productization](docs/guides/productization.md) | How to package this repo for enterprise rollout |
| [Development](docs/guides/development.md) | Development workflows |
| [Deployment](docs/guides/deployment.md) | Production deployment |
| [API Overview](docs/api/README.md) | API and OpenAPI entry points |

---

## 💻 Development

### Commands

```bash
# Development (all eight services)
npm run dev

# Individual services (optional)
npm run dev:frontend
npm run dev:agent
npm run dev:banking
npm run dev:chat

# Testing
npm run test
npm run test:integration

# Linting
npm run lint
npm run format

# Database
npm run db:migrate
npm run db:seed
```

### Workspaces

Run commands in specific services:

```bash
npm run <script> -w services/<service-name>

# Examples
npm run test -w services/banking-service
npm install axios -w services/frontend
```

---

## 🐳 Docker

### Quick Start

```bash
# Start all services
npm run docker:up

# View logs
npm run docker:logs

# Stop services
npm run docker:down
```

### Full Stack

```bash
docker compose -f docker/docker-compose-full-stack.yml up -d --build
```

---

## 🔧 Configuration

### Environment Variables

Create `.env.development` with:

```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/poc_banking

# JWT
JWT_SECRET=your-secret-key

# Services
API_GATEWAY_URL=http://localhost:3001
BANKING_SERVICE_URL=http://localhost:3005

# AI (optional and disabled by default)
OPENAI_ENABLED=false
OPENAI_API_KEY=your-openai-key
SLM_ENABLED=false
SLM_BASE_URL=
DIALOGFLOW_PROJECT_ID=your-project-id
```

### Enterprise Packaging

Generate a tenant deployment profile and frontend runtime config with:

```bash
npm run product:generate
```

See [Productization](docs/guides/productization.md) for the platform-core versus domain-accelerator split and the remaining work to make this a reusable enterprise product.

See [Configuration Guide](docs/getting-started/configuration.md) for all options.

---

## 🧪 Testing

```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# Health check
npm run health
```

---

## 🚢 Deployment

### Options

| Method | Best For |
|--------|----------|
| Docker Compose | Development, staging |
| PM2 | Simple production |
| Kubernetes | Scale production |

See [Deployment Guide](docs/guides/deployment.md) for details.

---

## 📈 Monitoring

### Health Endpoints

All services expose `/health`:

```bash
curl http://localhost:3001/health  # API Gateway
curl http://localhost:3005/health  # Banking Service
curl http://localhost:3006/health  # Chat Backend
```

### Logs

```bash
# All services
npm run docker:logs

# Specific service
docker compose -f docker/docker-compose.local.yml logs -f banking-service
```

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push branch (`git push origin feature/amazing`)
5. Open Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

## 🙏 Acknowledgments

- [LangGraph](https://github.com/langchain-ai/langgraph) - AI workflow orchestration
- [Socket.IO](https://socket.io/) - Real-time communication
- [DialogFlow](https://cloud.google.com/dialogflow) - NLU platform
- [React](https://reactjs.org/) - Frontend framework

---

<div align="center">

**Built with ❤️ by the POC Development Team**

</div>
