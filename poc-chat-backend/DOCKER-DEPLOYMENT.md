# Docker Deployment Guide - POC Chat Backend

## 📦 Overview

This guide covers Docker deployment for the POC Chat Backend service with PostgreSQL database and Redis cache.

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│         POC Chat Backend Stack          │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐  │
│  │   Chat Backend Service          │  │
│  │   - Node.js 18                  │  │
│  │   - Express + Socket.IO         │  │
│  │   - Port: 3006                  │  │
│  └─────────────────────────────────┘  │
│              │         │               │
│              ▼         ▼               │
│  ┌──────────────┐  ┌──────────────┐  │
│  │  PostgreSQL  │  │    Redis     │  │
│  │  Database    │  │    Cache     │  │
│  │  Port: 5432  │  │  Port: 6379  │  │
│  └──────────────┘  └──────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

## 🚀 Quick Start

### Development Environment

```bash
# Navigate to chat-backend directory
cd poc-chat-backend

# Start all services
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f chat-backend

# Stop services
docker-compose -f docker-compose.dev.yml down
```

### Production Environment

```bash
# Navigate to chat-backend directory
cd poc-chat-backend

# Copy and configure environment variables
cp .env.production .env
# Edit .env with your production values

# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f chat-backend

# Stop services
docker-compose down
```

## 📋 Prerequisites

- Docker Engine 20.10+ 
- Docker Compose 2.0+
- At least 2GB free disk space
- Ports available: 3006, 5432, 6379

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the `poc-chat-backend` directory:

```bash
# Required - Security
JWT_SECRET=your-strong-secret-key-here

# Required - CORS
ALLOWED_ORIGINS=https://yourdomain.com

# Required - Database
DB_PASSWORD=secure-postgres-password

# Required - Redis
REDIS_PASSWORD=secure-redis-password

# Optional - Microservices (update if needed)
BANKING_SERVICE_URL=http://banking-service:3005
NLP_SERVICE_URL=http://nlp-service:3002
NLU_SERVICE_URL=http://nlu-service:3003
MCP_SERVICE_URL=http://mcp-service:3004
```

See `.env.production` for all available configuration options.

## 🐳 Docker Commands

### Building

```bash
# Build production image
docker-compose build

# Build without cache
docker-compose build --no-cache

# Build specific stage
docker build --target production -t poc-chat-backend:prod .
```

### Running

```bash
# Start in detached mode
docker-compose up -d

# Start with rebuild
docker-compose up -d --build

# Start only specific service
docker-compose up -d postgres redis

# Scale service (if needed)
docker-compose up -d --scale chat-backend=2
```

### Monitoring

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f chat-backend

# View last 100 lines
docker-compose logs --tail=100 chat-backend

# Check service status
docker-compose ps

# Check health status
docker-compose ps chat-backend
docker inspect --format='{{.State.Health.Status}}' poc-chat-backend
```

### Maintenance

```bash
# Restart service
docker-compose restart chat-backend

# Stop services
docker-compose stop

# Remove containers (keeps data)
docker-compose down

# Remove containers and volumes (destroys data)
docker-compose down -v

# Clean up unused images
docker system prune -a
```

## 📊 Database Management

### Initialize Database

The database is automatically initialized with migrations when the container starts.

### Manual Migration

```bash
# Run migrations manually
docker-compose exec chat-backend npm run migrate

# Access PostgreSQL
docker-compose exec postgres psql -U postgres -d poc_banking

# Backup database
docker-compose exec postgres pg_dump -U postgres poc_banking > backup.sql

# Restore database
docker-compose exec -T postgres psql -U postgres poc_banking < backup.sql
```

### Database Console

```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U postgres -d poc_banking

# Useful SQL commands
\dt                    # List tables
\d chat_sessions      # Describe table
SELECT COUNT(*) FROM chat_sessions;
SELECT COUNT(*) FROM chat_messages;
```

## 🔴 Redis Management

### Redis Console

```bash
# Connect to Redis CLI
docker-compose exec redis redis-cli

# With password (production)
docker-compose exec redis redis-cli -a your-redis-password

# Useful Redis commands
INFO                  # Server information
DBSIZE               # Number of keys
KEYS *               # List all keys (use carefully in production)
FLUSHALL             # Clear all data (dangerous!)
```

### Monitor Redis

```bash
# Real-time monitoring
docker-compose exec redis redis-cli MONITOR
```

## 🏥 Health Checks

### Check Service Health

```bash
# HTTP health check
curl http://localhost:3006/health

# Inside Docker network
docker-compose exec chat-backend curl http://localhost:3006/health

# Check all service metrics
curl http://localhost:3006/api/metrics
```

### Docker Health Status

```bash
# View health status
docker-compose ps

# Detailed health info
docker inspect poc-chat-backend | jq '.[0].State.Health'
```

## 🔒 Security Best Practices

### Production Checklist

- [ ] Change all default passwords in `.env`
- [ ] Generate strong JWT secret: `openssl rand -base64 64`
- [ ] Configure proper CORS origins
- [ ] Enable SSL/TLS for database connections
- [ ] Use Docker secrets for sensitive data
- [ ] Enable firewall rules for container network
- [ ] Set up log rotation
- [ ] Configure resource limits
- [ ] Use non-root user (already configured)
- [ ] Keep base images updated

### Using Docker Secrets

```yaml
# docker-compose.yml (production enhancement)
services:
  chat-backend:
    secrets:
      - jwt_secret
      - db_password
    environment:
      JWT_SECRET_FILE: /run/secrets/jwt_secret
      DB_PASSWORD_FILE: /run/secrets/db_password

secrets:
  jwt_secret:
    file: ./secrets/jwt_secret.txt
  db_password:
    file: ./secrets/db_password.txt
```

## 📈 Resource Management

### Set Resource Limits

```yaml
# Add to docker-compose.yml
services:
  chat-backend:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

### Monitor Resources

```bash
# Real-time stats
docker stats poc-chat-backend

# Container resource usage
docker-compose stats
```

## 🐛 Troubleshooting

### Service Won't Start

```bash
# Check logs
docker-compose logs chat-backend

# Check service dependencies
docker-compose ps

# Verify environment variables
docker-compose config

# Restart with fresh build
docker-compose down
docker-compose up -d --build
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Test database connection
docker-compose exec postgres pg_isready

# View database logs
docker-compose logs postgres

# Check network connectivity
docker-compose exec chat-backend ping postgres
```

### Port Conflicts

```bash
# Check what's using ports
lsof -i :3006
lsof -i :5432
lsof -i :6379

# Change ports in docker-compose.yml if needed
```

### Performance Issues

```bash
# Check resource usage
docker stats

# View connection pool status
docker-compose logs chat-backend | grep pool

# Monitor WebSocket connections
docker-compose logs chat-backend | grep WebSocket
```

## 🔄 Updating

### Update Application

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose up -d --build

# Zero-downtime update (if using orchestration)
docker-compose up -d --no-deps --build chat-backend
```

### Update Base Images

```bash
# Pull latest base images
docker-compose pull

# Rebuild with new base images
docker-compose build --pull

# Restart services
docker-compose up -d
```

## 📝 Logging

### Log Locations

- **Application logs**: `./logs/chat-backend.log`
- **Error logs**: `./logs/chat-backend-error.log`
- **Debug logs**: `./logs/chat-backend-debug.log`
- **Docker logs**: `docker-compose logs`

### Configure Log Rotation

```yaml
# Add to docker-compose.yml
services:
  chat-backend:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### View Logs

```bash
# Real-time logs
docker-compose logs -f chat-backend

# Logs since timestamp
docker-compose logs --since 2024-01-01T00:00:00 chat-backend

# Save logs to file
docker-compose logs chat-backend > logs/docker-output.log
```

## 🌐 Networking

### Container Communication

Services communicate using service names as hostnames:
- `postgres` - Database host
- `redis` - Cache host
- `chat-backend` - Application host

### External Access

Default ports exposed:
- `3006` - Chat Backend HTTP/WebSocket
- `5432` - PostgreSQL (can be removed in production)
- `6379` - Redis (can be removed in production)

### Connect to External Services

Use `host.docker.internal` to connect to services running on host:

```yaml
environment:
  BANKING_SERVICE_URL: http://host.docker.internal:3005
```

## 🎯 Production Deployment

### Deploy to Docker Swarm

```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.yml poc-chat

# View services
docker service ls

# Scale service
docker service scale poc-chat_chat-backend=3
```

### Deploy to Kubernetes

Convert Docker Compose to Kubernetes manifests using Kompose:

```bash
# Install kompose
curl -L https://github.com/kubernetes/kompose/releases/download/v1.28.0/kompose-linux-amd64 -o kompose
chmod +x kompose

# Convert
./kompose convert -f docker-compose.yml

# Deploy
kubectl apply -f .
```

## 📚 Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [PostgreSQL Docker Image](https://hub.docker.com/_/postgres)
- [Redis Docker Image](https://hub.docker.com/_/redis)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

## 💡 Tips

1. **Development**: Use `docker-compose.dev.yml` for hot-reload
2. **Production**: Always use versioned images
3. **Backup**: Regular database backups before updates
4. **Monitoring**: Set up health check alerts
5. **Security**: Never commit `.env` files with secrets
6. **Testing**: Test in staging environment first
7. **Rollback**: Keep previous images for quick rollback

## 📞 Support

For issues or questions:
1. Check logs: `docker-compose logs -f`
2. Review health status: `curl http://localhost:3006/health`
3. Consult project documentation
4. Contact development team
