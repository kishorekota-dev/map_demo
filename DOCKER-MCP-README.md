# Docker Deployment for MCP Service

Complete Docker Compose setup for running the MCP Service with all dependencies.

## Quick Start

### 1. Prerequisites

- Docker Desktop installed and running
- Docker Compose (v2.0+)
- 4GB+ RAM available
- Ports 3004, 3005, 5432 available

### 2. Start Services

```bash
# Start all services in detached mode
./docker-mcp.sh up -d

# Or start with logs
./docker-mcp.sh up
```

### 3. Verify Services

```bash
# Check service health
./docker-mcp.sh health

# View logs
./docker-mcp.sh logs

# Check status
./docker-mcp.sh status
```

### 4. Test MCP Service

```bash
# Run basic tests
./docker-mcp.sh test

# Test MCP Service directly
curl http://localhost:3004/health
curl http://localhost:3004/api/mcp/tools
```

## Architecture

```
┌─────────────────────────────┐
│   Docker Host               │
│                             │
│  ┌─────────────────────┐    │
│  │ poc-mcp-service     │    │  Port 3004
│  │ (MCP Protocol)      │    │
│  └──────────┬──────────┘    │
│             │                │
│  ┌──────────▼──────────┐    │
│  │ poc-banking-service │    │  Port 3005
│  │ (Banking APIs)      │    │
│  └──────────┬──────────┘    │
│             │                │
│  ┌──────────▼──────────┐    │
│  │ PostgreSQL Database │    │  Port 5432
│  │ (Data Storage)      │    │
│  └─────────────────────┘    │
│                             │
└─────────────────────────────┘
```

## Services

### MCP Service (Port 3004)

**Container**: `poc-mcp-service`

**Endpoints**:
- Health: http://localhost:3004/health
- API Info: http://localhost:3004/api
- Tools: http://localhost:3004/api/mcp/tools
- Execute: http://localhost:3004/api/mcp/execute
- WebSocket: ws://localhost:3004

**Features**:
- 24 banking operations
- MCP Protocol (WebSocket)
- HTTP REST API
- Automatic health checks
- Volume-mounted logs

### Banking Service (Port 3005)

**Container**: `poc-banking-service`

**Endpoints**:
- Health: http://localhost:3005/health
- Auth: http://localhost:3005/api/v1/auth
- Accounts: http://localhost:3005/api/v1/accounts
- Transactions: http://localhost:3005/api/v1/transactions
- Cards: http://localhost:3005/api/v1/cards
- Fraud: http://localhost:3005/api/v1/fraud
- Disputes: http://localhost:3005/api/v1/disputes

**Features**:
- Complete banking API
- JWT authentication
- PostgreSQL integration
- RESTful endpoints

### PostgreSQL Database (Port 5432)

**Container**: `poc-postgres`

**Configuration**:
- Database: `banking_db`
- User: `banking_user`
- Port: 5432

**Features**:
- Persistent data storage
- Auto-initialization scripts
- Health checks
- Volume backup support

## Configuration

### Environment Variables

Create a `.env` file in the root directory (copy from `.env.docker.example`):

```bash
# Database
POSTGRES_DB=banking_db
POSTGRES_USER=banking_user
POSTGRES_PASSWORD=your_secure_password

# Security Secrets (CHANGE IN PRODUCTION!)
MCP_JWT_SECRET=your_mcp_secret
BANKING_JWT_SECRET=your_banking_secret

# Service Ports
MCP_SERVICE_PORT=3004
BANKING_SERVICE_PORT=3005
POSTGRES_PORT=5432

# Logging
LOG_LEVEL=info

# CORS Origins
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

### Customization

Edit `docker-compose-mcp.yml` to customize:
- Port mappings
- Environment variables
- Resource limits
- Volume mounts
- Network configuration

## Commands Reference

### Service Management

```bash
# Start services
./docker-mcp.sh up           # With logs
./docker-mcp.sh up -d        # Detached mode

# Stop services
./docker-mcp.sh down

# Restart services
./docker-mcp.sh restart

# View status
./docker-mcp.sh status
./docker-mcp.sh ps
```

### Logs & Monitoring

```bash
# View all logs
./docker-mcp.sh logs

# View specific service logs
./docker-mcp.sh logs poc-mcp-service
./docker-mcp.sh logs poc-banking-service
./docker-mcp.sh logs poc-postgres

# Follow logs (real-time)
docker-compose -f docker-compose-mcp.yml logs -f
```

### Health Checks

```bash
# Check all services
./docker-mcp.sh health

# Individual service health
curl http://localhost:3004/health  # MCP Service
curl http://localhost:3005/health  # Banking Service
```

### Testing

```bash
# Run basic tests
./docker-mcp.sh test

# Get available tools
curl http://localhost:3004/api/mcp/tools

# Get tool categories
curl http://localhost:3004/api/mcp/categories

# Execute a tool
curl -X POST http://localhost:3004/api/mcp/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "banking_authenticate",
    "parameters": {
      "username": "john.doe@example.com",
      "password": "Password123!"
    }
  }'
```

### Cleanup

```bash
# Stop and remove containers (keeps volumes)
./docker-mcp.sh down

# Remove everything including data
./docker-mcp.sh clean
```

## Data Persistence

### Volumes

The setup uses Docker volumes for data persistence:

| Volume | Purpose | Location |
|--------|---------|----------|
| `mcp-logs` | MCP Service logs | `/app/logs` |
| `banking-logs` | Banking Service logs | `/app/logs` |
| `postgres-data` | PostgreSQL data | `/var/lib/postgresql/data` |

### Backup Data

```bash
# Backup PostgreSQL data
docker exec poc-postgres pg_dump -U banking_user banking_db > backup.sql

# Restore PostgreSQL data
docker exec -i poc-postgres psql -U banking_user banking_db < backup.sql
```

### View Logs

```bash
# View MCP Service logs
docker exec poc-mcp-service ls -la logs/
docker exec poc-mcp-service cat logs/app.log

# View Banking Service logs
docker exec poc-banking-service ls -la logs/
```

## Networking

All services are connected via `poc-network` bridge network.

**Internal DNS**:
- `poc-mcp-service` → MCP Service
- `poc-banking-service` → Banking Service
- `poc-postgres` → PostgreSQL

Services can communicate using container names:
```
http://poc-banking-service:3005
http://poc-postgres:5432
```

## Resource Management

### Memory & CPU

Default configuration uses Docker defaults. To limit resources, add to `docker-compose-mcp.yml`:

```yaml
services:
  poc-mcp-service:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

### Scaling

To scale the MCP Service:

```bash
docker-compose -f docker-compose-mcp.yml up --scale poc-mcp-service=3
```

Note: You'll need to configure a load balancer for multiple instances.

## Troubleshooting

### Services Not Starting

1. **Check Docker is running**:
   ```bash
   docker info
   ```

2. **Check port availability**:
   ```bash
   lsof -ti :3004
   lsof -ti :3005
   lsof -ti :5432
   ```

3. **View service logs**:
   ```bash
   ./docker-mcp.sh logs
   ```

### Service Health Check Failing

```bash
# Check individual service
docker exec poc-mcp-service curl http://localhost:3004/health

# Check container status
docker ps -a

# Restart specific service
docker-compose -f docker-compose-mcp.yml restart poc-mcp-service
```

### Database Connection Issues

1. **Check PostgreSQL is running**:
   ```bash
   docker exec poc-postgres pg_isready -U banking_user
   ```

2. **Check database exists**:
   ```bash
   docker exec poc-postgres psql -U banking_user -l
   ```

3. **View PostgreSQL logs**:
   ```bash
   docker logs poc-postgres
   ```

### MCP Service Cannot Connect to Banking Service

1. **Verify network**:
   ```bash
   docker network inspect poc-network
   ```

2. **Test connectivity**:
   ```bash
   docker exec poc-mcp-service curl http://poc-banking-service:3005/health
   ```

3. **Check environment variables**:
   ```bash
   docker exec poc-mcp-service env | grep BANKING_SERVICE_URL
   ```

## Production Considerations

### Security

1. **Change default secrets** in `.env`:
   ```bash
   MCP_JWT_SECRET=$(openssl rand -base64 32)
   BANKING_JWT_SECRET=$(openssl rand -base64 32)
   POSTGRES_PASSWORD=$(openssl rand -base64 32)
   ```

2. **Use Docker secrets** for sensitive data:
   ```yaml
   secrets:
     mcp_jwt_secret:
       file: ./secrets/mcp_jwt_secret.txt
   ```

3. **Enable authentication** on MCP WebSocket:
   ```yaml
   - WS_AUTH_REQUIRED=true
   ```

### Performance

1. **Use production-grade PostgreSQL** image
2. **Enable connection pooling**
3. **Configure resource limits**
4. **Use reverse proxy** (nginx/traefik)
5. **Enable caching** (Redis)

### Monitoring

1. **Add Prometheus** for metrics
2. **Add Grafana** for visualization
3. **Configure log aggregation** (ELK stack)
4. **Set up alerting**

### High Availability

1. **Run multiple replicas**:
   ```bash
   docker-compose up --scale poc-mcp-service=3
   ```

2. **Use load balancer** (nginx/HAProxy)

3. **PostgreSQL replication** for HA

## Development vs Production

### Development

```yaml
environment:
  - NODE_ENV=development
  - LOG_LEVEL=debug
volumes:
  - ./poc-mcp-service:/app  # Live reload
```

### Production

```yaml
environment:
  - NODE_ENV=production
  - LOG_LEVEL=info
# No source code volumes
# Add resource limits
# Use secrets management
```

## Integration with Other Services

### AI Orchestrator

Update AI Orchestrator configuration:

```bash
# In poc-ai-orchestrator/.env
MCP_SERVICE_URL=http://localhost:3004
```

Or if running in Docker:

```bash
MCP_SERVICE_URL=http://poc-mcp-service:3004
```

### Frontend Application

Configure frontend to connect:

```javascript
const MCP_SERVICE_URL = process.env.REACT_APP_MCP_SERVICE_URL || 'http://localhost:3004';
const WS_URL = process.env.REACT_APP_MCP_WS_URL || 'ws://localhost:3004';
```

## Summary

This Docker Compose setup provides:

✅ **Complete MCP Service stack** with all dependencies  
✅ **Automatic service orchestration** and health checks  
✅ **Persistent data storage** with volumes  
✅ **Easy management** with helper script  
✅ **Production-ready** configuration  
✅ **Network isolation** and security  

**Quick Commands**:
```bash
./docker-mcp.sh up -d      # Start
./docker-mcp.sh health     # Check
./docker-mcp.sh logs       # Monitor
./docker-mcp.sh down       # Stop
```

For more information, see:
- `MCP-SERVICE-COMPLETE.md` - Complete implementation guide
- `poc-mcp-service/MCP-SERVICE-IMPLEMENTATION-COMPLETE.md` - Service details
