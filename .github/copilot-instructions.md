# Copilot Instructions for POC Banking Chat

## Architecture Overview
Multi-service chat banking system with 8 microservices using npm workspaces:

```
frontend (3000) → api-gateway (3001) → chat-backend (3006) → ai-orchestrator (3007)
                                                          ↓
                      banking-service (3005) ← mcp-service (3004) ← nlu-service (3003)
```

- **AI Orchestrator**: LangGraph workflows + hybrid MCP client (official MCP SDK with HTTP fallback)
- **NLU Service**: DialogFlow integration with automatic mock fallback when credentials missing
- **MCP Service**: 24 banking tools across 7 categories exposed via WebSocket + HTTP REST
- **Banking Service**: Domain APIs with Flyway migrations in `services/banking-service/database/`
- **PostgreSQL**: Used by chat-backend (sessions), ai-orchestrator (state), banking-service (domain data)

## Developer Workflows

```bash
# Start all services (monorepo)
npm run dev                           # Starts gateway, chat, banking, nlu, mcp, ai concurrently
npm run dev:frontend                  # Frontend separately (React/Vite)

# Start specific service
npm run dev -w services/banking-service

# Health check all services
npm run health                        # or: ./scripts/health-check.sh

# Database operations
npm run db:setup                      # Full setup: migrations + seed
npm run db:migrate -w services/banking-service
npm run db:seed -w services/banking-service

# Docker full stack
docker-compose -f docker/docker-compose.yml up -d
```

## Project Conventions

**New modules**: Name as `services/<module-name>`, no `poc-` prefix (monorepo migrated)

**Frontend (Atomic Design)** in `services/frontend/src/components/`:
- `atoms/` → Button, Input, Icon, LoadingSpinner
- `molecules/` → ChatMessage, SessionList, TokenInput
- `organisms/` → ChatContainer, LoginForm

**Backend services**: Node.js + Express with consistent patterns:
- Entry point: `server.js` (CommonJS with `require()`)
- Routes: `routes/*.js` with `/health` endpoint required
- Middleware: `middleware/` for auth, validation, error handling
- Winston logging, JWT auth, helmet security

**MCP Tools**: Defined in `services/mcp-service/src/tools/completeBankingTools.js`

**AI Prompts**: Intent templates in `services/ai-orchestrator/src/prompts/intentPrompts.js`

## Key Integration Points

| Endpoint | Service | Purpose |
|----------|---------|---------|
| `POST /api/nlu/analyze` | nlu-service | Intent detection (DialogFlow or mock) |
| `POST /api/mcp/execute` | mcp-service | Execute banking tool |
| `GET /api/mcp/tools` | mcp-service | List available tools |
| `POST /auth/login` | banking-service | JWT authentication |
| `WS /socket.io` | chat-backend | Real-time chat |

## Environment Configuration
- Root `.env.example` contains all service URLs and shared config
- Each service has `.env.development` for local overrides
- Required: `OPENAI_API_KEY` for ai-orchestrator, `DIALOGFLOW_PROJECT_ID` for nlu-service (optional, falls back to mock)

## Where to Look First
- Service ports and quick start: [README.md](README.md)
- Per-service docs: `services/*/README.md`
- Database schema: `services/banking-service/database/README.md`
- AI workflow: `services/ai-orchestrator/src/workflows/bankingChatWorkflow.js`
- Scripts reference: `scripts/` directory