# POC Banking Chat Services

This directory contains all microservices for the Chat Banking application.

## Services

| Service | Port | Description |
|---------|------|-------------|
| `frontend` | 3000 | React/Vite Customer Chat UI |
| `api-gateway` | 3001 | API Gateway & Routing |
| `nlu-service` | 3003 | DialogFlow NLU Integration |
| `mcp-service` | 3004 | Model Context Protocol Tools |
| `banking-service` | 3005 | Banking Domain APIs |
| `chat-backend` | 3006 | Socket.IO Chat Processing |
| `ai-orchestrator` | 3007 | LangGraph AI Workflows |
| `agent-ui` | 8081 | Support Agent Dashboard |

## Quick Start

```bash
# From root directory
npm install
npm run dev
```

See individual service READMEs for detailed documentation.
