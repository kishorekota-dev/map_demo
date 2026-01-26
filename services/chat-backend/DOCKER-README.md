# 🐳 Docker Setup - POC Chat Backend

Quick reference guide for running POC Chat Backend with Docker.

## 📦 What's Included

This Docker setup includes:
- **Chat Backend Service** - Node.js 18 with Express & Socket.IO
- **PostgreSQL 15** - Database for chat history and sessions
- **Redis 7** - Cache for session storage and rate limiting

## 🚀 Quick Start

### Development Mode (Recommended for Local Development)

```bash
# Easy way - using helper script
./docker-start.sh dev

# Or manually
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f
```

**Features:**
- ✅ Hot reload enabled (code changes auto-restart)
- ✅ Debug logging
- ✅ Development environment variables
- ✅ Source code mounted as volume

### Production Mode

```bash
# Copy and configure environment
cp .env.production .env
# Edit .env with your production values

# Easy way - using helper script
./docker-start.sh prod

# Or manually
docker-compose up -d

# View logs
docker-compose logs -f
```

**Features:**
- ✅ Optimized multi-stage build
- ✅ Production environment variables
- ✅ Security hardening
- ✅ Resource limits

## 🛑 Stop Services

```bash
# Easy way
./docker-stop.sh dev          # Stop dev containers
./docker-stop.sh prod         # Stop prod containers
./docker-stop.sh dev --volumes  # Stop and remove all data

# Or manually
docker-compose -f docker-compose.dev.yml down
docker-compose down
docker-compose down -v  # Also removes volumes (destroys data!)
```

## 🏥 Health Checks

```bash
# Check service status
docker-compose ps

# HTTP health check
curl http://localhost:3006/health

# Get detailed metrics
curl http://localhost:3006/api/metrics

# Check logs
docker-compose logs -f chat-backend
```

## 🔧 Common Commands

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f chat-backend
docker-compose logs -f postgres
docker-compose logs -f redis

# Last 100 lines
docker-compose logs --tail=100 chat-backend
```

### Access Services

```bash
# Access backend shell
docker-compose exec chat-backend sh

# Access PostgreSQL
docker-compose exec postgres psql -U postgres -d poc_banking

# Access Redis CLI
docker-compose exec redis redis-cli
```

### Database Operations

```bash
# Backup database
docker-compose exec postgres pg_dump -U postgres poc_banking > backup.sql

# Restore database
docker-compose exec -T postgres psql -U postgres poc_banking < backup.sql

# List tables
docker-compose exec postgres psql -U postgres -d poc_banking -c "\dt"

# View sessions
docker-compose exec postgres psql -U postgres -d poc_banking -c "SELECT * FROM chat_sessions LIMIT 10;"
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart chat-backend

# Rebuild and restart
docker-compose up -d --build
```

## 📊 Service Ports

| Service | Port | Description |
|---------|------|-------------|
| Chat Backend | 3006 | HTTP API & WebSocket |
| PostgreSQL | 5432 | Database (optional expose) |
| Redis | 6379 | Cache (optional expose) |

## 🔒 Security Notes

### Before Production Deployment

1. **Change default passwords:**
   ```bash
   # Edit .env file
   JWT_SECRET=generate-strong-secret-here
   DB_PASSWORD=change-me
   REDIS_PASSWORD=change-me
   ```

2. **Generate strong JWT secret:**
   ```bash
   openssl rand -base64 64
   ```

3. **Update CORS origins:**
   ```bash
   ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
   ```

4. **Don't expose database ports** in production - remove port mappings from docker-compose.yml

## 🐛 Troubleshooting

### Containers Won't Start

```bash
# Check logs
docker-compose logs

# Check what's using the ports
lsof -i :3006
lsof -i :5432
lsof -i :6379

# Clean up and retry
docker-compose down -v
docker-compose up -d --build
```

### Database Connection Issues

```bash
# Check database is healthy
docker-compose ps postgres

# Test connection
docker-compose exec postgres pg_isready -U postgres

# View database logs
docker-compose logs postgres
```

### Application Errors

```bash
# View application logs
docker-compose logs -f chat-backend

# Check environment variables
docker-compose exec chat-backend env

# Restart service
docker-compose restart chat-backend
```

## 📁 File Structure

```
poc-chat-backend/
├── docker-compose.yml          # Production configuration
├── docker-compose.dev.yml      # Development configuration
├── Dockerfile                  # Multi-stage build
├── .dockerignore              # Exclude files from image
├── .env.production            # Production env template
├── .env.development           # Development env file
├── docker-start.sh            # Helper script to start
├── docker-stop.sh             # Helper script to stop
├── DOCKER-DEPLOYMENT.md       # Comprehensive guide
└── DOCKER-README.md          # This file
```

## 📚 Additional Documentation

- **[DOCKER-DEPLOYMENT.md](./DOCKER-DEPLOYMENT.md)** - Comprehensive deployment guide
- **[README.md](./README.md)** - Complete project documentation
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Architecture overview

## 💡 Tips

1. **Use development mode** for local coding with hot reload
2. **Test production mode** before deploying to ensure everything works
3. **Back up database** before major updates
4. **Monitor logs** regularly for issues
5. **Use Docker Desktop** for easy container management
6. **Set resource limits** for production deployments

## 🆘 Need Help?

1. Check logs: `docker-compose logs -f`
2. Verify health: `curl http://localhost:3006/health`
3. Review [DOCKER-DEPLOYMENT.md](./DOCKER-DEPLOYMENT.md)
4. Check Docker status: `docker-compose ps`

## 🎯 What's Next?

After starting the services:

1. **Test the API:**
   ```bash
   curl http://localhost:3006/api
   ```

2. **Check health:**
   ```bash
   curl http://localhost:3006/health
   ```

3. **View metrics:**
   ```bash
   curl http://localhost:3006/api/metrics
   ```

4. **Connect your frontend** to `http://localhost:3006`

5. **Test WebSocket** connection to `ws://localhost:3006/socket.io`

---

**Ready to start?** Run `./docker-start.sh dev` and you're good to go! 🚀
