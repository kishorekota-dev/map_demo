# POC Banking System - Local Development Guide

## Overview

This guide helps you run the complete POC Banking System locally using Docker Compose. All services are orchestrated together with proper networking and dependencies.

## Architecture

The system consists of the following services:

### Core Services
- **PostgreSQL Database** (port 5432) - Primary data store
- **Redis Cache** (port 6379) - Session and caching layer

### Microservices
- **Banking Service** (port 3005) - Core banking operations (accounts, transactions, transfers)
- **NLU Service** (port 3003) - Natural Language Understanding with DialogFlow integration
- **MCP Service** (port 3004) - Model Context Protocol for tool calling
- **Chat Backend** (port 3006) - WebSocket chat server with agent orchestration
- **Frontend** (port 3000) - React-based user interface

## Prerequisites

1. **Docker Desktop** (v4.0+)
   - Download: https://www.docker.com/products/docker-desktop

2. **Docker Compose** (v2.0+)
   - Included with Docker Desktop

3. **System Requirements**
   - 8GB RAM minimum (16GB recommended)
   - 10GB free disk space
   - macOS, Linux, or Windows with WSL2

## Quick Start

### 1. Clone and Navigate
```bash
cd /Users/container/git/map_demo
```

### 2. Start All Services
```bash
./deployment-scripts/start-local-dev.sh
```

This script will:
- Check Docker availability
- Stop any existing containers
- Build and start all services
- Wait for services to become healthy
- Display service URLs and useful commands

### 3. Check Service Status
```bash
./deployment-scripts/check-local-status.sh
```

### 4. Stop All Services
```bash
# Stop services but keep data
./deployment-scripts/stop-local-dev.sh

# Stop services and remove all data
./deployment-scripts/stop-local-dev.sh --volumes
```

## Service URLs

Once all services are running:

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | React UI |
| Chat Backend | http://localhost:3006 | WebSocket & REST API |
| Banking Service | http://localhost:3005 | Banking operations |
| NLU Service | http://localhost:3003 | Intent detection |
| MCP Service | http://localhost:3004 | Tool calling |
| PostgreSQL | localhost:5432 | Database |
| Redis | localhost:6379 | Cache |

## API Documentation

### NLU Service OpenAPI Spec
- File: `poc-nlu-service/openapi.yaml`
- View online: http://localhost:3003/api

### Key NLU Endpoints

#### Primary Chat Integration Endpoint
```bash
POST http://localhost:3003/api/nlu/analyze

{
  "user_input": "What is my account balance?",
  "sessionId": "user-session-123",
  "userId": "user-456",
  "languageCode": "en-US"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "intent": "check.balance",
    "confidence": 0.92,
    "dialogflow": {
      "fulfillmentText": "I can help you check your account balance.",
      "parameters": { "account_type": "checking" }
    },
    "banking": {
      "intent": "check_balance",
      "confidence": 0.88
    },
    "entities": [...],
    "metadata": {
      "source": "dialogflow",
      "sessionId": "user-session-123"
    }
  }
}
```

## Chat Backend Integration

The Chat Backend now integrates with the NLU Service for intent detection through:

1. **NLU Client** (`poc-chat-backend/services/nluClient.js`)
   - Dedicated client with retry logic
   - Circuit breaker pattern
   - Automatic fallback
   - Health monitoring

2. **Agent Orchestrator** (`poc-chat-backend/services/agentOrchestrator.js`)
   - Special handling for NLU agent
   - Calls `analyzeUserInput` method
   - Context-aware processing
   - Aggregates results from multiple agents

### Integration Flow

```
User Message → Chat Backend → Agent Orchestrator → NLU Client → NLU Service
                                                        ↓
                                            DialogFlow API (optional)
```

## Configuration

### Environment Variables

All services are pre-configured with development defaults in `docker-compose.local.yml`.

#### NLU Service Environment
```yaml
- DIALOGFLOW_PROJECT_ID=${DIALOGFLOW_PROJECT_ID:-}  # Optional
- DIALOGFLOW_LANGUAGE_CODE=en-US
- CACHE_ENABLED=true
- LOG_LEVEL=debug
```

#### Chat Backend Environment
```yaml
- NLU_SERVICE_URL=http://poc-nlu-service:3003
- AGENT_FALLBACK_ENABLED=true
- MAX_CONCURRENT_AGENTS=10
```

### DialogFlow Setup (Optional)

The NLU Service works with or without DialogFlow:

**Without DialogFlow** (default):
- Uses fallback keyword-based intent detection
- Suitable for development and testing

**With DialogFlow** (recommended for production):

1. Create a DialogFlow agent
2. Download service account key JSON
3. Place it at: `poc-nlu-service/credentials/dialogflow-key.json`
4. Set environment variable:
   ```bash
   export DIALOGFLOW_PROJECT_ID=your-project-id
   ```
5. Restart services:
   ```bash
   ./deployment-scripts/stop-local-dev.sh
   ./deployment-scripts/start-local-dev.sh
   ```

## Development Workflow

### View Logs

#### All services
```bash
docker compose -f docker-compose.local.yml logs -f
```

#### Specific service
```bash
docker compose -f docker-compose.local.yml logs -f poc-nlu-service
docker compose -f docker-compose.local.yml logs -f poc-chat-backend
docker compose -f docker-compose.local.yml logs -f poc-banking-service
```

### Restart a Service

```bash
docker compose -f docker-compose.local.yml restart poc-nlu-service
```

### Rebuild and Restart

```bash
docker compose -f docker-compose.local.yml up -d --build poc-nlu-service
```

### Access Service Shell

```bash
docker compose -f docker-compose.local.yml exec poc-nlu-service sh
docker compose -f docker-compose.local.yml exec poc-chat-backend bash
```

### Database Access

```bash
# Connect to PostgreSQL
docker compose -f docker-compose.local.yml exec postgres psql -U poc_user -d poc_banking

# Connect to Redis
docker compose -f docker-compose.local.yml exec redis redis-cli
```

## Testing the Integration

### 1. Test NLU Service Directly
```bash
curl -X POST http://localhost:3003/api/nlu/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "user_input": "What is my account balance?",
    "sessionId": "test-session",
    "userId": "test-user"
  }'
```

### 2. Test Through Chat Backend

Send a WebSocket message or use the frontend UI at http://localhost:3000

### 3. Check Service Health
```bash
# All services
./deployment-scripts/check-local-status.sh

# Individual health checks
curl http://localhost:3003/health  # NLU Service
curl http://localhost:3006/health  # Chat Backend
curl http://localhost:3005/health  # Banking Service
curl http://localhost:3004/health  # MCP Service
```

## Troubleshooting

### Services Not Starting

1. Check Docker is running:
   ```bash
   docker info
   ```

2. Check port availability:
   ```bash
   lsof -i :3000,3003,3004,3005,3006,5432,6379
   ```

3. View service logs:
   ```bash
   docker compose -f docker-compose.local.yml logs [service-name]
   ```

### Database Connection Issues

1. Wait for PostgreSQL to be healthy:
   ```bash
   docker compose -f docker-compose.local.yml ps postgres
   ```

2. Check database exists:
   ```bash
   docker compose -f docker-compose.local.yml exec postgres psql -U poc_user -l
   ```

### NLU Service Issues

1. **Fallback Mode Active**
   - This is normal without DialogFlow credentials
   - Check logs: `docker compose -f docker-compose.local.yml logs poc-nlu-service`

2. **Intent Not Detected**
   - Check DialogFlow credentials if using DialogFlow
   - Review fallback keyword patterns in `nluClient.js`

3. **Circuit Breaker Open**
   - Indicates repeated failures
   - Check NLU service health
   - Restart service: `docker compose -f docker-compose.local.yml restart poc-nlu-service`

### Chat Backend Integration Issues

1. Check NLU service URL in environment:
   ```bash
   docker compose -f docker-compose.local.yml exec poc-chat-backend env | grep NLU
   ```

2. View agent orchestrator logs:
   ```bash
   docker compose -f docker-compose.local.yml logs poc-chat-backend | grep -i "nlu\|intent"
   ```

## Performance Optimization

### Development Mode
Hot-reloading is enabled via volume mounts:
- Source code changes are reflected automatically
- No need to rebuild containers for code changes

### Production Considerations
- Remove volume mounts for source code
- Use optimized Dockerfile (multi-stage builds)
- Increase resource limits
- Enable production logging
- Configure proper secrets management

## Network Architecture

All services run in the `poc-network` bridge network:
- Services communicate using service names
- External access via mapped ports
- Isolated from host network

```
┌─────────────────────────────────────────────┐
│             poc-network (bridge)             │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │PostgreSQL│  │  Redis   │  │ Banking  │  │
│  │  :5432   │  │  :6379   │  │  :3005   │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │   NLU    │  │   MCP    │  │   Chat   │  │
│  │  :3003   │  │  :3004   │  │  :3006   │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│                                              │
│  ┌──────────┐                                │
│  │ Frontend │                                │
│  │  :3000   │                                │
│  └──────────┘                                │
└─────────────────────────────────────────────┘
         │ Port Mapping to Host
         ▼
    Host: localhost
```

## Data Persistence

Data is persisted in named Docker volumes:
- `poc-postgres-data` - Database data
- `poc-redis-data` - Redis data

To remove all data:
```bash
./deployment-scripts/stop-local-dev.sh --volumes
```

## Additional Resources

- **OpenAPI Spec**: `poc-nlu-service/openapi.yaml`
- **Architecture Docs**: See `ARCHITECTURE.md` files in each service
- **API Examples**: `poc-nlu-service/API-EXAMPLES.md`
- **Deployment Guides**: `deployment-scripts/` folder

## Support

For issues or questions:
1. Check service logs
2. Review troubleshooting section
3. Check health endpoints
4. Review OpenAPI documentation

## Next Steps

1. **Implement Custom Intents**
   - Add intents to DialogFlow
   - Update banking NLU patterns
   - Test with `analyzeUserInput` endpoint

2. **Enhance Agent Orchestrator**
   - Add more agent types
   - Customize agent selection logic
   - Implement advanced routing

3. **Add Monitoring**
   - Set up metrics collection
   - Add performance monitoring
   - Configure alerting

4. **Production Deployment**
   - Review security settings
   - Configure proper secrets
   - Set up CI/CD pipeline
   - Deploy to orchestration platform
