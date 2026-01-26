# MCP Service Docker - Quick Reference

## 🚀 One-Line Start

```bash
./docker-mcp.sh up -d && ./docker-mcp.sh health
```

## 📦 What Gets Started

| Service | Port | Container Name | Purpose |
|---------|------|----------------|---------|
| MCP Service | 3004 | poc-mcp-service | Tool execution & MCP protocol |
| Banking Service | 3005 | poc-banking-service | Core banking APIs |
| PostgreSQL | 5432 | poc-postgres | Database |

## 🔧 Essential Commands

```bash
# Start
./docker-mcp.sh up -d

# Stop
./docker-mcp.sh down

# Check health
./docker-mcp.sh health

# View logs
./docker-mcp.sh logs

# Restart
./docker-mcp.sh restart

# Clean everything
./docker-mcp.sh clean
```

## 🧪 Quick Tests

```bash
# Health check
curl http://localhost:3004/health

# Get tools
curl http://localhost:3004/api/mcp/tools

# Get categories
curl http://localhost:3004/api/mcp/categories

# Execute tool
curl -X POST http://localhost:3004/api/mcp/execute \
  -H "Content-Type: application/json" \
  -d '{"tool":"banking_authenticate","parameters":{"username":"test","password":"test"}}'
```

## 📋 Service URLs

- MCP Service: http://localhost:3004
- MCP Health: http://localhost:3004/health
- MCP Tools: http://localhost:3004/api/mcp/tools
- MCP WebSocket: ws://localhost:3004
- Banking Service: http://localhost:3005
- PostgreSQL: localhost:5432

## 🔍 Troubleshooting

```bash
# Check if running
docker ps

# Check logs
./docker-mcp.sh logs poc-mcp-service

# Restart service
docker-compose -f docker-compose-mcp.yml restart poc-mcp-service

# Check database
docker exec poc-postgres pg_isready -U banking_user
```

## ⚙️ Configuration

Edit `.env` file (copy from `.env.docker.example`):

```bash
POSTGRES_PASSWORD=your_password
MCP_JWT_SECRET=your_secret
BANKING_JWT_SECRET=your_secret
LOG_LEVEL=info
```

## 📊 Monitoring

```bash
# Service status
./docker-mcp.sh status

# Real-time logs
./docker-mcp.sh logs -f

# Specific service
./docker-mcp.sh logs poc-mcp-service

# Health checks
./docker-mcp.sh health
```

## 🧹 Cleanup

```bash
# Stop services (keep data)
./docker-mcp.sh down

# Remove everything
./docker-mcp.sh clean
```

## 📚 Documentation

- Full docs: `DOCKER-MCP-README.md`
- Setup guide: `DOCKER-MCP-SETUP-COMPLETE.md`
- MCP Service: `MCP-SERVICE-COMPLETE.md`

## 🎯 Common Tasks

### Start fresh
```bash
./docker-mcp.sh clean
./docker-mcp.sh up -d
```

### View MCP logs
```bash
docker logs -f poc-mcp-service
```

### Access database
```bash
docker exec -it poc-postgres psql -U banking_user -d banking_db
```

### Backup database
```bash
docker exec poc-postgres pg_dump -U banking_user banking_db > backup.sql
```

### Check network
```bash
docker network inspect poc-network
```

## ⚡ Development Mode

Use standalone mode when Banking Service is already running:

```bash
docker-compose -f docker-compose-mcp-standalone.yml up -d
```

## 🔐 Security Checklist

- [ ] Change `POSTGRES_PASSWORD` in `.env`
- [ ] Change `MCP_JWT_SECRET` in `.env`
- [ ] Change `BANKING_JWT_SECRET` in `.env`
- [ ] Set `NODE_ENV=production` for prod
- [ ] Set `LOG_LEVEL=info` for prod
- [ ] Review `ALLOWED_ORIGINS` settings

## 💡 Tips

- Use `-d` flag for background mode
- Use `-f` flag for following logs
- Services auto-restart on failure
- Data persists in Docker volumes
- Logs available in mounted volumes

---

**Quick Start**: `./docker-mcp.sh up -d`  
**Full Docs**: `DOCKER-MCP-README.md`
