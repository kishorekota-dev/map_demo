# POC MCP Service

**Model Context Protocol Host Microservice** for banking operations.

## Overview

Standalone microservice that provides banking tool execution through:
- **MCP Protocol** (WebSocket JSON-RPC 2.0)
- **HTTP REST API** (for simple integration)

## Features

✅ **24 Banking Operations** across 7 categories  
✅ **Dual Protocol Support** (WebSocket + HTTP)  
✅ **Tool Discovery & Validation**  
✅ **Batch Execution**  
✅ **Production-Ready** (health checks, logging, monitoring)  
✅ **Docker Support** (containerized deployment)  

## Quick Start

### Option 1: Local Development

```bash
# Install dependencies
npm install

# Start service
npm start

# Service running at http://localhost:3004
```

### Option 2: Docker

```bash
# Start service
./docker.sh up -d

# Check health
./docker.sh health

# View logs
./docker.sh logs
```

## Banking Operations

**24 tools across 7 categories:**

- **Authentication** (2): authenticate, refresh_token
- **Accounts** (3): get_accounts, get_account, get_statement
- **Transactions** (3): get_transactions, get_transaction, verify
- **Transfers** (3): create_transfer, get_transfers, get_transfer
- **Cards** (4): get_cards, get_card, block, unblock
- **Fraud** (3): create_alert, get_alerts, get_alert
- **Disputes** (5): create, get_disputes, get_dispute, add_evidence, withdraw

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/api` | GET | Service info |
| `/api/mcp/tools` | GET | List all tools |
| `/api/mcp/categories` | GET | Tools by category |
| `/api/mcp/execute` | POST | Execute tool |
| `/api/mcp/execute-batch` | POST | Batch execution |
| `/api/mcp/validate` | POST | Validate parameters |

## Configuration

### Local (.env.development)

```bash
PORT=3004
NODE_ENV=development
BANKING_SERVICE_URL=http://localhost:3005/api/v1
LOG_LEVEL=debug
```

### Docker (.env)

```bash
NODE_ENV=production
MCP_PORT=3004
BANKING_SERVICE_URL=http://host.docker.internal:3005/api/v1
MCP_JWT_SECRET=your-secret-change-me
```

## Testing

```bash
# Health check
curl http://localhost:3004/health

# Get available tools
curl http://localhost:3004/api/mcp/tools

# Get tool categories
curl http://localhost:3004/api/mcp/categories

# Execute a tool
curl -X POST http://localhost:3004/api/mcp/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "banking_get_accounts",
    "parameters": {"authToken": "your-token"}
  }'
```

## Directory Structure

```
poc-mcp-service/
├── src/
│   ├── mcp/
│   │   └── mcpProtocolServer.js   # WebSocket MCP protocol
│   ├── routes/
│   │   └── mcpApi.routes.js       # HTTP REST API
│   ├── tools/
│   │   └── completeBankingTools.js # 24 banking operations
│   ├── utils/
│   │   └── logger.js              # Logging utility
│   └── server.js                  # Main server
├── config/                        # Configuration files
├── logs/                          # Log files
├── Dockerfile                     # Docker image
├── docker-compose.yml             # Docker Compose
├── docker.sh                      # Docker manager
├── start.sh                       # Local startup
├── package.json                   # Dependencies
└── DEPLOYMENT.md                  # Deployment guide
```

## Management Scripts

### Local Development

```bash
./start.sh              # Start service
npm start               # Alternative start
npm test                # Run tests
```

### Docker

```bash
./docker.sh up -d       # Start in background
./docker.sh logs        # View logs
./docker.sh health      # Check health
./docker.sh test        # Run tests
./docker.sh restart     # Restart
./docker.sh stop        # Stop
./docker.sh clean       # Remove all
./docker.sh shell       # Open shell
```

## Integration

### AI Orchestrator

Configure AI Orchestrator to use this service:

```bash
# In poc-ai-orchestrator/.env
MCP_SERVICE_URL=http://localhost:3004
```

### Test Integration

```bash
# From AI Orchestrator directory
cd ../poc-ai-orchestrator
node test-mcp-integration.js
```

## Architecture

```
┌─────────────────────────┐
│   MCP Service (3004)    │
│  ┌───────────────────┐  │
│  │ WebSocket (MCP)   │  │ ← True MCP Protocol
│  ├───────────────────┤  │
│  │ HTTP REST API     │  │ ← Simple integration
│  ├───────────────────┤  │
│  │ Banking Tools     │  │ ← 24 operations
│  └─────────┬─────────┘  │
└────────────┼────────────┘
             │
             ▼
┌─────────────────────────┐
│ Banking Service (3005)  │
└─────────────────────────┘
```

## Monitoring

### Health Checks

```bash
# Using script
./docker.sh health

# Direct
curl http://localhost:3004/health
```

### Logs

```bash
# Local
tail -f logs/combined.log

# Docker
./docker.sh logs
docker logs -f mcp-service
```

## Production

For production deployment:

1. **Change secrets** in `.env`
2. **Set environment**:
   ```bash
   NODE_ENV=production
   LOG_LEVEL=info
   ```
3. **Enable security**:
   ```bash
   WS_AUTH_REQUIRED=true
   ```
4. **Configure CORS** properly
5. **Set up monitoring** (Prometheus/Grafana)
6. **Configure backups**

## Documentation

- **Deployment Guide**: [`DEPLOYMENT.md`](./DEPLOYMENT.md)
- **Implementation Details**: [`MCP-SERVICE-IMPLEMENTATION-COMPLETE.md`](./MCP-SERVICE-IMPLEMENTATION-COMPLETE.md)
- **API Tests**: [`test-http-api.js`](./test-http-api.js)

## Dependencies

**Runtime:**
- Node.js 18+
- Banking Service (required)

**Docker:**
- Docker Desktop
- Docker Compose

## Support

**Service Info**: http://localhost:3004/api (when running)  
**Health Check**: http://localhost:3004/health  
**Protocol Version**: MCP 2024-11-05  

---

**Quick Commands**:
```bash
./docker.sh up -d && ./docker.sh health    # Start & verify
curl http://localhost:3004/api/mcp/tools   # Get tools
./docker.sh logs                           # Monitor
```
