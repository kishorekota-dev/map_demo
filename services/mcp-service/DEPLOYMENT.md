# MCP Service - Deployment Guide

## Overview

This directory contains everything needed to deploy the MCP Service in various environments.

## Directory Structure

```
poc-mcp-service/
├── src/                    # Application source code
├── config/                 # Configuration files
├── logs/                   # Application logs
├── Dockerfile             # Docker image definition
├── docker-compose.yml     # Docker Compose configuration
├── docker.sh              # Docker management script
├── start.sh               # Local startup script
├── .env.development       # Development environment config
├── .env.docker           # Docker environment config
└── DEPLOYMENT.md         # This file
```

## Deployment Options

### 1. Local Development (Node.js)

Run directly on your machine without Docker.

**Requirements:**
- Node.js 18+
- Banking Service running on port 3005

**Steps:**
```bash
# Install dependencies
npm install

# Start service
npm start
# or
./start.sh

# Service will be available at:
# http://localhost:3004
```

**Configuration:**
- Edit `.env.development` for local settings
- Default Banking Service URL: http://localhost:3005/api/v1

### 2. Docker (Standalone)

Run as a Docker container, connecting to external Banking Service.

**Requirements:**
- Docker Desktop installed and running
- Banking Service accessible from Docker container

**Quick Start:**
```bash
# Start service in background
./docker.sh up -d

# Check health
./docker.sh health

# View logs
./docker.sh logs

# Stop service
./docker.sh stop
```

**Configuration:**
- Copy `.env.docker` to `.env` (done automatically)
- Edit `.env` to configure:
  - `BANKING_SERVICE_URL` - Banking Service endpoint
  - `MCP_JWT_SECRET` - JWT secret (change in production!)
  - `ALLOWED_ORIGINS` - CORS origins

**Useful Commands:**
```bash
./docker.sh up -d       # Start in background
./docker.sh logs        # View logs
./docker.sh health      # Check health
./docker.sh test        # Run tests
./docker.sh restart     # Restart service
./docker.sh stop        # Stop service
./docker.sh clean       # Remove all data
./docker.sh shell       # Open shell in container
```

### 3. Docker with Full Stack

Deploy MCP Service along with Banking Service and PostgreSQL.

**See:** Root directory `docker-compose-mcp.yml` for full-stack deployment.

## Environment Configuration

### Development (.env.development)

Used for local Node.js development:
```bash
PORT=3004
NODE_ENV=development
LOG_LEVEL=debug
BANKING_SERVICE_URL=http://localhost:3005/api/v1
```

### Docker (.env.docker / .env)

Used for Docker deployment:
```bash
NODE_ENV=production
MCP_PORT=3004
LOG_LEVEL=info
BANKING_SERVICE_URL=http://host.docker.internal:3005/api/v1
MCP_JWT_SECRET=change-me-in-production
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

**Important Environment Variables:**

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `MCP_PORT` | Service port | `3004` |
| `LOG_LEVEL` | Logging level | `info` |
| `BANKING_SERVICE_URL` | Banking Service endpoint | Required |
| `MCP_JWT_SECRET` | JWT secret | **Change in production!** |
| `ALLOWED_ORIGINS` | CORS allowed origins | Comma-separated URLs |
| `WS_AUTH_REQUIRED` | Require WebSocket auth | `false` |

## Service Endpoints

Once deployed, the service provides:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/api` | GET | Service information |
| `/api/mcp/tools` | GET | List all tools |
| `/api/mcp/tools/:name` | GET | Get tool definition |
| `/api/mcp/categories` | GET | Tools by category |
| `/api/mcp/execute` | POST | Execute single tool |
| `/api/mcp/execute-batch` | POST | Execute multiple tools |
| `/api/mcp/validate` | POST | Validate parameters |
| `ws://` | WS | MCP Protocol WebSocket |

## Testing Deployment

### Local Deployment

```bash
# Health check
curl http://localhost:3004/health

# Get tools
curl http://localhost:3004/api/mcp/tools

# Get categories
curl http://localhost:3004/api/mcp/categories
```

### Docker Deployment

```bash
# Using docker.sh script
./docker.sh test

# Or manually
curl http://localhost:3004/health
curl http://localhost:3004/api/mcp/tools
```

## Monitoring & Logs

### Local Deployment

Logs are written to `logs/` directory:
```bash
tail -f logs/combined.log
tail -f logs/error.log
```

### Docker Deployment

View logs using docker.sh:
```bash
./docker.sh logs          # Follow logs
./docker.sh logs-clear    # Clear logs
```

Or use Docker commands:
```bash
docker logs -f mcp-service
docker exec mcp-service ls -la logs/
```

## Health Checks

### Automated Health Checks

Docker container has automatic health checks:
- Interval: 30 seconds
- Timeout: 10 seconds
- Retries: 3
- Start period: 40 seconds

### Manual Health Check

```bash
# Using script
./docker.sh health

# Or direct curl
curl http://localhost:3004/health
```

Expected response:
```json
{
  "service": "poc-mcp-service",
  "status": "healthy",
  "timestamp": "2025-10-09T...",
  "uptime": 123.45,
  "version": "1.0.0",
  "mcp": {
    "protocolVersion": "2024-11-05",
    "connectedClients": 0,
    "activeConnections": 0
  }
}
```

## Troubleshooting

### Service Won't Start

**Local:**
1. Check Node.js version: `node --version` (need 18+)
2. Check port 3004 is available: `lsof -ti :3004`
3. Check Banking Service is running
4. Review logs: `tail -f logs/combined.log`

**Docker:**
1. Check Docker is running: `docker info`
2. Check port 3004 is available: `lsof -ti :3004`
3. View logs: `./docker.sh logs`
4. Check container status: `./docker.sh status`

### Cannot Connect to Banking Service

**Local:**
- Verify Banking Service URL in `.env.development`
- Test Banking Service: `curl http://localhost:3005/health`

**Docker:**
- Check `BANKING_SERVICE_URL` in `.env`
- For host service, use: `http://host.docker.internal:3005/api/v1`
- Test from container: `docker exec mcp-service curl http://host.docker.internal:3005/health`

### Health Check Failing

```bash
# Check if service is listening
./docker.sh status

# View detailed logs
./docker.sh logs

# Restart service
./docker.sh restart

# Check from inside container
./docker.sh shell
curl http://localhost:3004/health
```

## Production Deployment

### Security Checklist

- [ ] Change `MCP_JWT_SECRET` to a strong random value
- [ ] Set `NODE_ENV=production`
- [ ] Set `LOG_LEVEL=info` or `warn`
- [ ] Review and restrict `ALLOWED_ORIGINS`
- [ ] Enable `WS_AUTH_REQUIRED=true` if using WebSocket
- [ ] Use HTTPS/WSS in production
- [ ] Set up proper firewall rules
- [ ] Enable rate limiting
- [ ] Configure proper logging aggregation

### Recommended Configuration

```bash
# Production .env
NODE_ENV=production
MCP_PORT=3004
LOG_LEVEL=info

# Strong secrets
MCP_JWT_SECRET=$(openssl rand -base64 32)

# Secure Banking Service URL
BANKING_SERVICE_URL=https://banking-service.example.com/api/v1

# Restricted CORS
ALLOWED_ORIGINS=https://app.example.com

# Enable WebSocket auth
WS_AUTH_REQUIRED=true
```

### Scaling

**Horizontal Scaling:**
```bash
# Run multiple instances
docker-compose up --scale mcp-service=3

# Use load balancer (nginx, HAProxy)
# Configure service discovery
```

**Resource Limits:**
Add to `docker-compose.yml`:
```yaml
deploy:
  resources:
    limits:
      cpus: '1'
      memory: 512M
    reservations:
      cpus: '0.5'
      memory: 256M
```

## Backup & Recovery

### Backup Logs

```bash
# Local
tar czf mcp-logs-$(date +%Y%m%d).tar.gz logs/

# Docker
docker exec mcp-service tar czf - logs > mcp-logs-$(date +%Y%m%d).tar.gz
```

### Configuration Backup

```bash
# Backup environment files
cp .env .env.backup
cp .env.docker .env.docker.backup
```

## Integration

### AI Orchestrator

Update AI Orchestrator configuration:
```bash
# In poc-ai-orchestrator/.env
MCP_SERVICE_URL=http://localhost:3004
```

### Frontend Application

Configure frontend:
```javascript
const MCP_WS_URL = process.env.REACT_APP_MCP_WS_URL || 'ws://localhost:3004';
```

## Quick Reference

**Local Development:**
```bash
npm start                           # Start
tail -f logs/combined.log          # Logs
curl http://localhost:3004/health  # Health
```

**Docker:**
```bash
./docker.sh up -d     # Start
./docker.sh logs      # Logs
./docker.sh health    # Health
./docker.sh stop      # Stop
```

## Support

For detailed documentation, see:
- **Service Documentation**: `MCP-SERVICE-IMPLEMENTATION-COMPLETE.md`
- **API Reference**: Access `/api` endpoint when service is running
- **Docker Guide**: `DOCKER-MCP-README.md` (if available in root)

---

**Service**: POC MCP Service  
**Version**: 1.0.0  
**Port**: 3004  
**Protocol**: MCP 2024-11-05
