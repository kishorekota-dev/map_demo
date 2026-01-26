# Troubleshooting Guide

Common issues and solutions for POC Banking Chat.

## Quick Diagnostics

```bash
# Check all service health
npm run health

# Validate environment
npm run validate

# Check running processes
ps aux | grep node

# Check port usage
lsof -i :3000,3001,3003,3004,3005,3006,3007,8081
```

## Common Issues

### Installation Issues

#### npm install fails

**Symptoms:** Errors during `npm install`

**Solutions:**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Try with legacy peer deps
npm install --legacy-peer-deps
```

#### Node version mismatch

**Symptoms:** `engine "node" is incompatible`

**Solutions:**
```bash
# Check version
node -v

# Install correct version with nvm
nvm install 18
nvm use 18
```

### Service Startup Issues

#### Port already in use

**Symptoms:** `Error: listen EADDRINUSE`

**Solutions:**
```bash
# Find process using port
lsof -ti:3005

# Kill process
lsof -ti:3005 | xargs kill -9

# Or use different port
PORT=3015 npm run dev:banking
```

#### Service won't start

**Symptoms:** Service exits immediately

**Solutions:**
```bash
# Check logs
npm run dev:banking 2>&1 | tee banking.log

# Check environment
cat services/banking-service/.env

# Run with debug
DEBUG=* npm run dev:banking
```

### Database Issues

#### Connection refused

**Symptoms:** `ECONNREFUSED 127.0.0.1:5432`

**Solutions:**
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Start PostgreSQL (Docker)
docker-compose -f docker/docker-compose.yml up -d postgres

# Start PostgreSQL (system)
sudo systemctl start postgresql
```

#### Database doesn't exist

**Symptoms:** `database "poc_banking" does not exist`

**Solutions:**
```bash
# Create database
createdb poc_banking

# Or run setup script
npm run db:setup
```

#### Migration errors

**Symptoms:** `relation "xxx" does not exist`

**Solutions:**
```bash
# Run migrations
npm run db:migrate

# Reset database (warning: deletes data)
npm run db:reset
```

### Authentication Issues

#### JWT verification failed

**Symptoms:** `JsonWebTokenError: invalid signature`

**Causes:**
- JWT_SECRET mismatch between services
- Token expired
- Malformed token

**Solutions:**
```bash
# Ensure same JWT_SECRET in all services
grep JWT_SECRET services/*/.env

# Check token expiration
# Decode token at jwt.io to see expiry

# Generate new token via login
curl -X POST http://localhost:3005/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Password123!"}'
```

#### 401 Unauthorized

**Symptoms:** All requests return 401

**Solutions:**
```bash
# Check Authorization header format
# Should be: "Bearer <token>"

# Verify token is valid
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3005/health
```

### WebSocket Issues

#### Connection fails

**Symptoms:** WebSocket connection refused

**Solutions:**
```bash
# Check chat-backend is running
curl http://localhost:3006/health

# Check WebSocket URL in frontend
grep VITE_WS_URL services/frontend/.env

# Test WebSocket connection
wscat -c ws://localhost:3006
```

#### Messages not received

**Symptoms:** Messages sent but not received

**Solutions:**
```bash
# Check Socket.IO transport
# Browser console: socket.io transport

# Ensure CORS is configured
grep ALLOWED_ORIGINS services/chat-backend/.env
```

### AI/NLU Issues

#### OpenAI API errors

**Symptoms:** `OpenAI API error: 401`

**Solutions:**
```bash
# Check API key is set
echo $OPENAI_API_KEY

# Verify key is valid
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

#### DialogFlow not responding

**Symptoms:** NLU returns fallback intent

**Solutions:**
```bash
# Check credentials file exists
ls -la services/nlu-service/credentials/

# Verify project ID
echo $DIALOGFLOW_PROJECT_ID

# Check service health
curl http://localhost:3003/health
```

### Docker Issues

#### Container won't start

**Symptoms:** Container exits immediately

**Solutions:**
```bash
# Check logs
docker-compose logs banking-service

# Check container status
docker ps -a

# Rebuild container
docker-compose build --no-cache banking-service
```

#### Container can't reach other containers

**Symptoms:** Connection refused between services

**Solutions:**
```bash
# Check network
docker network ls
docker network inspect poc-network

# Verify container is on network
docker inspect banking-service | grep Networks

# Use service names, not localhost
# Example: http://postgres:5432 not http://localhost:5432
```

### Performance Issues

#### Slow response times

**Symptoms:** Requests take > 5 seconds

**Solutions:**
```bash
# Check database queries
# Enable query logging in PostgreSQL

# Check for N+1 queries
# Monitor with Node.js inspector

# Add indexes
psql poc_banking -c "CREATE INDEX idx_transactions_user ON transactions(user_id)"
```

#### Memory issues

**Symptoms:** `JavaScript heap out of memory`

**Solutions:**
```bash
# Increase Node.js memory
NODE_OPTIONS=--max-old-space-size=4096 npm run dev

# Check for memory leaks
node --inspect services/banking-service/server.js
# Open chrome://inspect
```

## Getting Help

### Collect Diagnostic Information

```bash
# System info
node -v
npm -v
docker -v
psql --version

# Service status
npm run health > health-report.txt

# Environment (sanitized)
env | grep -E '^(NODE|PORT|DATABASE|REDIS)' > env-report.txt
```

### Log Files

- Service logs: Check terminal output
- Docker logs: `docker-compose logs -f`
- PM2 logs: `pm2 logs`

### Support Channels

1. Check [Documentation](../README.md)
2. Search existing issues on GitHub
3. Create new issue with diagnostic info
