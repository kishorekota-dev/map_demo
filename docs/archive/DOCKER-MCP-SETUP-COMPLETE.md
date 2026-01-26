# Docker Compose Setup for MCP Service - Complete

## ✅ Files Created

### 1. **docker-compose-mcp.yml**
Full-stack Docker Compose with:
- MCP Service (port 3004)
- Banking Service (port 3005)
- PostgreSQL Database (port 5432)
- Network configuration
- Volume management
- Health checks

### 2. **docker-compose-mcp-standalone.yml**
Standalone MCP Service:
- MCP Service only
- Connects to external Banking Service
- Ideal for development/testing

### 3. **docker-mcp.sh**
Management script with commands:
- `up [-d]` - Start services
- `down` - Stop services
- `restart` - Restart services
- `logs [service]` - View logs
- `status` - Check status
- `health` - Health checks
- `test` - Run tests
- `clean` - Remove all data

### 4. **.env.docker.example**
Environment template with:
- Database credentials
- JWT secrets
- Port configuration
- CORS settings

### 5. **DOCKER-MCP-README.md**
Complete documentation covering:
- Quick start guide
- Architecture overview
- Service details
- Commands reference
- Troubleshooting
- Production guidelines

## Quick Start

### Option 1: Full Stack

Start all services (MCP, Banking, Database):

```bash
# Copy environment template
cp .env.docker.example .env

# Edit .env with your settings (optional)
# vi .env

# Start all services
./docker-mcp.sh up -d

# Check health
./docker-mcp.sh health

# View logs
./docker-mcp.sh logs
```

### Option 2: Standalone MCP Service

If Banking Service is already running:

```bash
# Start only MCP Service
docker-compose -f docker-compose-mcp-standalone.yml up -d

# Check health
curl http://localhost:3004/health
```

## Service URLs

Once running:
- **MCP Service**: http://localhost:3004
- **Banking Service**: http://localhost:3005
- **PostgreSQL**: localhost:5432

## Test the Setup

```bash
# Run built-in tests
./docker-mcp.sh test

# Or test manually
curl http://localhost:3004/health
curl http://localhost:3004/api/mcp/tools
curl http://localhost:3004/api/mcp/categories
```

## Architecture

```
┌──────────────────────────────┐
│   Docker Network (bridge)    │
│                              │
│  ┌────────────────────────┐  │
│  │  poc-mcp-service       │  │ :3004
│  │  - 24 Banking Tools    │  │
│  │  - MCP Protocol (WS)   │  │
│  │  - HTTP REST API       │  │
│  └──────────┬─────────────┘  │
│             │                │
│  ┌──────────▼─────────────┐  │
│  │  poc-banking-service   │  │ :3005
│  │  - Core Banking APIs   │  │
│  │  - JWT Auth            │  │
│  └──────────┬─────────────┘  │
│             │                │
│  ┌──────────▼─────────────┐  │
│  │  PostgreSQL            │  │ :5432
│  │  - banking_db          │  │
│  └────────────────────────┘  │
│                              │
└──────────────────────────────┘
```

## Key Features

✅ **Production-Ready**
- Health checks on all services
- Automatic restart policies
- Volume persistence
- Network isolation

✅ **Easy Management**
- Simple shell script interface
- One-command startup
- Integrated health checks
- Log viewing

✅ **Flexible Configuration**
- Environment-based config
- Standalone or full-stack modes
- Customizable ports
- CORS settings

✅ **Developer Friendly**
- Live logs viewing
- Volume-mounted logs
- Quick restart
- Easy cleanup

## Environment Variables

Key variables in `.env`:

```bash
# Database
POSTGRES_DB=banking_db
POSTGRES_USER=banking_user
POSTGRES_PASSWORD=your_password

# Security (CHANGE IN PRODUCTION!)
MCP_JWT_SECRET=your_mcp_secret
BANKING_JWT_SECRET=your_banking_secret

# Logging
LOG_LEVEL=info

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

## Common Commands

```bash
# Start services in background
./docker-mcp.sh up -d

# View real-time logs
./docker-mcp.sh logs poc-mcp-service

# Check all services are healthy
./docker-mcp.sh health

# Stop services
./docker-mcp.sh down

# Remove all data and start fresh
./docker-mcp.sh clean
./docker-mcp.sh up -d
```

## Integration with AI Orchestrator

Update AI Orchestrator `.env`:

```bash
MCP_SERVICE_URL=http://localhost:3004
```

Or if AI Orchestrator is also in Docker:

```bash
MCP_SERVICE_URL=http://poc-mcp-service:3004
```

## Troubleshooting

### Services won't start
```bash
# Check Docker is running
docker info

# Check ports are available
lsof -ti :3004 :3005 :5432

# View logs for errors
./docker-mcp.sh logs
```

### Health check failing
```bash
# Check individual service
docker exec poc-mcp-service curl http://localhost:3004/health

# Restart service
docker-compose -f docker-compose-mcp.yml restart poc-mcp-service
```

### Database connection error
```bash
# Check PostgreSQL is ready
docker exec poc-postgres pg_isready -U banking_user

# Check logs
docker logs poc-postgres
```

## Data Persistence

Data is stored in Docker volumes:

| Volume | Content | Backup Command |
|--------|---------|----------------|
| `postgres-data` | Database | `docker exec poc-postgres pg_dump -U banking_user banking_db > backup.sql` |
| `mcp-logs` | MCP logs | `docker exec poc-mcp-service tar czf - logs > mcp-logs.tar.gz` |
| `banking-logs` | Banking logs | `docker exec poc-banking-service tar czf - logs > banking-logs.tar.gz` |

## Production Deployment

For production:

1. **Change all secrets** in `.env`
2. **Set `NODE_ENV=production`**
3. **Set `LOG_LEVEL=info`**
4. **Enable authentication**: `WS_AUTH_REQUIRED=true`
5. **Use proper SSL certificates**
6. **Configure backup strategy**
7. **Set up monitoring** (Prometheus/Grafana)
8. **Configure alerting**

## Files Summary

```
map_demo/
├── docker-compose-mcp.yml              # Full stack
├── docker-compose-mcp-standalone.yml   # MCP only
├── docker-mcp.sh                       # Management script
├── .env.docker.example                 # Config template
├── DOCKER-MCP-README.md                # Full documentation
└── DOCKER-MCP-SETUP-COMPLETE.md        # This file
```

## Next Steps

1. **Start the services**:
   ```bash
   ./docker-mcp.sh up -d
   ```

2. **Verify health**:
   ```bash
   ./docker-mcp.sh health
   ```

3. **Test the API**:
   ```bash
   ./docker-mcp.sh test
   ```

4. **Integrate with AI Orchestrator**:
   - Update `MCP_SERVICE_URL` in AI Orchestrator
   - Test end-to-end flow

5. **Monitor logs**:
   ```bash
   ./docker-mcp.sh logs -f
   ```

## Status

✅ **Complete and Ready**
- Docker Compose configurations created
- Management script implemented
- Documentation complete
- Environment templates ready
- Full-stack and standalone modes available

The MCP Service can now be deployed using Docker with a single command!

---

**Quick Start**: `./docker-mcp.sh up -d && ./docker-mcp.sh health`
