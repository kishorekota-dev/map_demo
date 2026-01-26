# Copilot Instructions for map_demo

## Big picture architecture
- Multi-service chat banking system (9 microservices) spanning UI → API Gateway → chat + AI processing → banking domain services.
- Core flow: `poc-frontend` (React/Vite) → `poc-api-gateway` → `poc-chat-backend` (Socket.IO + REST) → `poc-nlu-service` (DialogFlow, fallback) and/or `poc-ai-orchestrator` (LangGraph) → `poc-mcp-service` → `poc-banking-service`.
- There is also a Next.js-based enterprise UI in `packages/chatbot-ui` and a legacy demo app in `poc/` + `poc-backend/` (kept separate from the microservices stack).
- AI Orchestrator uses a LangGraph workflow and a **hybrid MCP client** (official MCP protocol with HTTP fallback) to execute banking tools.
- Postgres is used by chat backend (sessions/messages), AI orchestrator (workflow/session state), and banking service (domain data + Flyway migrations).

## Critical workflows (root scripts)
- Start all services: `./start-all-services.sh`
- Stop all services: `./stop-all-services.sh`
- Health/status: `./check-services-status.sh`
- Integration tests/health: `./test-all-services.sh`
- Docker full stack: `docker-compose -f docker-compose-full-stack.yml up -d`

## Project-specific conventions
- New modules follow naming convention: `poc-<module-name>`.
- Frontends: `poc-frontend` uses React + TypeScript + Vite and **Atomic Design** (atoms/molecules/organisms/templates/pages). `packages/chatbot-ui` is Next.js + TypeScript + Tailwind.
- Backend services are Node.js + Express with Winston logging, JWT auth, and health endpoints.
- MCP tools live in `poc-mcp-service/src/tools/completeBankingTools.js` and are exposed via WS + HTTP.

## Integration points & patterns
- NLU primary endpoint: `POST /api/nlu/analyze` with DialogFlow; falls back to mock when credentials missing.
- Chat backend persists sessions/messages and supports session resume via REST + WebSocket.
- AI Orchestrator intent prompts and workflow nodes live under `poc-ai-orchestrator/src/prompts` and `poc-ai-orchestrator/src/workflows`.
- Banking service exposes REST APIs under `/api/*` and relies on Flyway migrations in `poc-banking-service/database`.
- `poc-frontend` auth uses the banking service `/auth/login` directly and then calls chat APIs through the gateway.

## Where to look first
- Architecture overview and service list: `README.md`
- Service-specific behavior: each `poc-*/README.md`
- Environment setup: `.env.example` or `.env.development` in each service.

## Notes for changes
- Keep service boundaries intact: UI ↔ gateway ↔ chat/AI ↔ banking tools.
- Prefer adding deployment utilities under `deployment-scripts/`.