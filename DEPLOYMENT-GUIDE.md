# POC Banking Chat - Deployment Guide

## 📋 Overview

This guide provides comprehensive instructions for deploying and running the POC Banking Chat microservices architecture in various environments.

---

## 🎯 Prerequisites

### Required Software
- **Node.js** v18.0.0 or higher
- **npm** v8.0.0 or higher
- **Git** for version control

### Optional (for production)
- **Docker** v20.0.0 or higher
- **Docker Compose** v2.0.0 or higher
- **Redis** v6.0.0 or higher (for caching/sessions)
- **PostgreSQL** v13.0 or higher (for persistent data)
- **Kubernetes** v1.24 or higher (for orchestration)

### External Services
- **Google Cloud Platform** account (for DialogFlow integration)
- **DialogFlow** API credentials

---

## 🚀 Quick Start (Local Development)

### 1. Clone the Repository
```bash
git clone <repository-url>
cd map_demo
```

### 2. Install Dependencies for All Services
```bash
# Install root dependencies
npm install

# Install each service's dependencies
cd poc-frontend && npm install && cd ..
cd poc-agent-ui && npm install && cd ..
cd poc-api-gateway && npm install && cd ..
cd poc-backend && npm install && cd ..
cd poc-chat-backend && npm install && cd ..
cd poc-banking-service && npm install && cd ..
cd poc-nlp-service && npm install && cd ..
cd poc-nlu-service && npm install && cd ..
cd poc-mcp-service && npm install && cd ..
```

Or use the helper script:
```bash
chmod +x deployment-scripts/install-all.sh
./deployment-scripts/install-all.sh
```

### 3. Configure Environment Variables

Each service requires environment configuration. Copy the example files:

```bash
# API Gateway
cp poc-api-gateway/.env.example poc-api-gateway/.env

# Banking Service
cp poc-banking-service/.env.example poc-banking-service/.env

# NLP Service
cp poc-nlp-service/.env.example poc-nlp-service/.env

# NLU Service  
cp poc-nlu-service/.env.example poc-nlu-service/.env

# MCP Service
cp poc-mcp-service/.env.development poc-mcp-service/.env

# Chat Backend
cp poc-chat-backend/.env.development poc-chat-backend/.env

# Agent UI
cp poc-agent-ui/.env.development poc-agent-ui/.env

# Frontend
cp poc-frontend/.env.example poc-frontend/.env
```

### 4. Start All Services

#### Option A: Individual Terminals (Recommended for Development)

Open 9 terminal windows and run:

**Terminal 1 - API Gateway (Port 3001)**
```bash
cd poc-api-gateway
npm run dev
```

**Terminal 2 - NLP Service (Port 3002)**
```bash
cd poc-nlp-service
npm run dev
```

**Terminal 3 - NLU Service (Port 3003)**
```bash
cd poc-nlu-service
npm run dev
```

**Terminal 4 - MCP Service (Port 3004)**
```bash
cd poc-mcp-service
npm run dev
```

**Terminal 5 - Banking Service (Port 3005)**
```bash
cd poc-banking-service
npm run dev
```

**Terminal 6 - Chat Backend (Port 3006)**
```bash
cd poc-chat-backend
npm run dev
```

**Terminal 7 - Agent UI (Port 3007)**
```bash
cd poc-agent-ui
npm run dev
```

**Terminal 8 - Frontend (Port 3000)**
```bash
cd poc-frontend
npm run dev
```

**Terminal 9 - Legacy Backend (Port 3008 - if needed)**
```bash
cd poc-backend
PORT=3008 npm run dev
```

#### Option B: Using Helper Script
```bash
chmod +x deployment-scripts/start-all-services.sh
./deployment-scripts/start-all-services.sh
```

### 5. Verify All Services

Run the health check script:
```bash
chmod +x deployment-scripts/test-all-services.sh
./deployment-scripts/test-all-services.sh
```

Expected output:
```
✓ Frontend (3000): Healthy
✓ API Gateway (3001): Healthy
✓ NLP Service (3002): Healthy
✓ NLU Service (3003): Healthy
✓ MCP Service (3004): Healthy
✓ Banking Service (3005): Healthy
✓ Chat Backend (3006): Healthy
✓ Agent UI (3007): Healthy

All services are running! 🎉
```

### 6. Access the Application

- **Customer Chat Interface**: http://localhost:3000
- **Agent Dashboard**: http://localhost:3007
- **API Gateway**: http://localhost:3001/api
- **API Gateway Health**: http://localhost:3001/health
- **API Gateway Metrics**: http://localhost:3001/metrics

---

## 🐳 Docker Deployment

### Build and Run with Docker Compose

```bash
# Build all images
docker-compose -f docker-compose-full-stack.yml build

# Start all services
docker-compose -f docker-compose-full-stack.yml up -d

# View logs
docker-compose -f docker-compose-full-stack.yml logs -f

# Stop all services
docker-compose -f docker-compose-full-stack.yml down
```

### Individual Service Docker Builds

```bash
# Build a single service
docker build -t poc-chat-backend:latest ./poc-chat-backend

# Run a single service
docker run -p 3006:3006 --env-file ./poc-chat-backend/.env poc-chat-backend:latest
```

---

## ☸️ Kubernetes Deployment

### Prerequisites
- Kubernetes cluster (Minikube, GKE, EKS, AKS)
- kubectl configured
- Helm (optional, for easier deployment)

### Deploy to Kubernetes

```bash
# Create namespace
kubectl create namespace poc-banking-chat

# Apply configurations
kubectl apply -f k8s/configmaps/ -n poc-banking-chat
kubectl apply -f k8s/secrets/ -n poc-banking-chat
kubectl apply -f k8s/deployments/ -n poc-banking-chat
kubectl apply -f k8s/services/ -n poc-banking-chat
kubectl apply -f k8s/ingress.yaml -n poc-banking-chat

# Verify deployments
kubectl get pods -n poc-banking-chat
kubectl get services -n poc-banking-chat
```

### Scale Services

```bash
# Scale chat backend
kubectl scale deployment poc-chat-backend --replicas=3 -n poc-banking-chat

# Scale banking service
kubectl scale deployment poc-banking-service --replicas=2 -n poc-banking-chat
```

---

## 🔧 Configuration Guide

### Service Ports

| Service | Default Port | Environment Variable | Required |
|---------|--------------|---------------------|----------|
| Frontend | 3000 | VITE_PORT | Yes |
| API Gateway | 3001 | PORT | Yes |
| NLP Service | 3002 | PORT | Yes |
| NLU Service | 3003 | PORT | Yes |
| MCP Service | 3004 | PORT | Yes |
| Banking Service | 3005 | PORT | Yes |
| Chat Backend | 3006 | PORT | Yes |
| Agent UI | 3007 | PORT | Yes |

### Environment Variables

#### Common Variables (All Services)
```bash
NODE_ENV=development|production
LOG_LEVEL=debug|info|warn|error
PORT=<service-port>
```

#### API Gateway (.env)
```bash
PORT=3001
JWT_SECRET=your-secret-key
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3007

# Service URLs
CHAT_BACKEND_URL=http://localhost:3006
BANKING_SERVICE_URL=http://localhost:3005
NLP_SERVICE_URL=http://localhost:3002
NLU_SERVICE_URL=http://localhost:3003
MCP_SERVICE_URL=http://localhost:3004

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Load Balancing
LOAD_BALANCER_STRATEGY=round-robin
HEALTH_CHECK_INTERVAL=30000
```

#### Chat Backend (.env)
```bash
PORT=3006
JWT_SECRET=your-secret-key
ALLOWED_ORIGINS=http://localhost:3000

# Microservice URLs
BANKING_SERVICE_URL=http://localhost:3005
NLP_SERVICE_URL=http://localhost:3002
NLU_SERVICE_URL=http://localhost:3003
MCP_SERVICE_URL=http://localhost:3004

# WebSocket Configuration
WS_PING_INTERVAL=25000
WS_PING_TIMEOUT=5000
MAX_CONNECTIONS=500

# Agent Configuration
MAX_CONCURRENT_AGENTS=10
AGENT_RESPONSE_TIMEOUT=30000
```

#### NLU Service (.env)
```bash
PORT=3003

# DialogFlow Configuration
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_APPLICATION_CREDENTIALS=path/to/credentials.json
DIALOGFLOW_LANGUAGE_CODE=en-US
```

#### Frontend (.env)
```bash
VITE_API_BASE_URL=http://localhost:3001/api
VITE_WS_URL=ws://localhost:3006
VITE_ENV=development
```

---

## 🔒 Security Configuration

### JWT Configuration

Generate secure JWT secrets:
```bash
# Generate random secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Update `.env` files with generated secrets:
```bash
JWT_SECRET=<generated-secret>
```

### HTTPS Configuration (Production)

1. Obtain SSL certificates (Let's Encrypt, AWS Certificate Manager, etc.)
2. Configure Nginx or load balancer with certificates
3. Update `ALLOWED_ORIGINS` to use https://

Example Nginx configuration:
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 📊 Monitoring & Logging

### Log Locations

Each service writes logs to its own `logs/` directory:
```
poc-api-gateway/logs/
  ├── api-gateway.log
  ├── api-gateway-error.log
  └── api-gateway-security.log

poc-chat-backend/logs/
  ├── chat-backend.log
  ├── chat-backend-error.log
  └── chat-backend-debug.log

... (similar for other services)
```

### View Logs

```bash
# Tail all logs
tail -f poc-*/logs/*.log

# View specific service logs
tail -f poc-chat-backend/logs/chat-backend.log

# Search for errors across all logs
grep -r "ERROR" poc-*/logs/
```

### Metrics Endpoints

- **API Gateway Metrics**: http://localhost:3001/metrics
- **Prometheus Format**: http://localhost:3001/metrics/prometheus

### Health Checks

```bash
# Check API Gateway and all services
curl http://localhost:3001/health/services

# Check individual service
curl http://localhost:3006/health
```

---

## 🧪 Testing

### Run Integration Tests

```bash
# Test all services
./deployment-scripts/test-all-services.sh

# Test specific API endpoints
./test-api.sh
./test-poc-banking.sh
```

### Manual API Testing

```bash
# Test chat message
curl -X POST http://localhost:3001/api/chat/message \
  -H "Content-Type: application/json" \
  -H "X-Session-ID: test-session-123" \
  -d '{"message": "Check my balance"}'

# Test banking service
curl http://localhost:3005/api/accounts \
  -H "Authorization: Bearer <your-token>"
```

---

## 🔄 Continuous Integration/Deployment

### GitHub Actions Workflow Example

```yaml
name: Deploy POC Banking Chat

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          npm install
          ./deployment-scripts/install-all.sh
      
      - name: Run tests
        run: npm test
      
      - name: Build Docker images
        run: docker-compose build
      
      - name: Deploy to production
        run: |
          # Add your deployment commands here
          echo "Deploying to production..."
```

---

## 🐛 Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Find process using port
lsof -ti:3001

# Kill process
kill -9 $(lsof -ti:3001)
```

#### Services Not Starting
```bash
# Check logs
cat poc-chat-backend/logs/chat-backend-error.log

# Verify dependencies are installed
cd poc-chat-backend && npm install

# Check environment variables
cat poc-chat-backend/.env
```

#### WebSocket Connection Failed
- Verify Chat Backend is running on port 3006
- Check CORS configuration in Chat Backend
- Ensure firewall allows WebSocket connections

#### DialogFlow Integration Issues
- Verify GOOGLE_APPLICATION_CREDENTIALS path is correct
- Check GCP project permissions
- Ensure DialogFlow API is enabled

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=debug npm run dev
```

---

## 📈 Performance Optimization

### Production Optimizations

1. **Enable Compression**
   - Already enabled in all services via `compression` middleware

2. **Use Redis for Caching**
```bash
# Start Redis
docker run -d -p 6379:6379 redis:alpine

# Update .env
REDIS_URL=redis://localhost:6379
```

3. **Enable PM2 for Process Management**
```bash
npm install -g pm2

# Start services with PM2
pm2 start ecosystem.config.js

# Monitor
pm2 monit
```

4. **Database Connection Pooling**
   - Configure max connections in database settings
   - Use connection pooling libraries

---

## 🔄 Backup & Recovery

### Backup Strategies

1. **Database Backups** (when implemented)
```bash
pg_dump banking_db > backup_$(date +%Y%m%d).sql
```

2. **Configuration Backups**
```bash
tar -czf configs_backup.tar.gz poc-*/.env
```

3. **Log Archival**
```bash
tar -czf logs_$(date +%Y%m%d).tar.gz poc-*/logs/
```

---

## 📞 Support

### Getting Help

- Check documentation in `/docs`
- Review logs for error messages
- Check GitHub Issues
- Contact development team

### Reporting Issues

Include the following information:
- Service name and version
- Error logs
- Steps to reproduce
- Expected vs actual behavior

---

## 📅 Maintenance

### Regular Tasks

- **Daily**: Monitor logs for errors
- **Weekly**: Review metrics and performance
- **Monthly**: Update dependencies
- **Quarterly**: Security audits

### Updating Dependencies

```bash
# Check for outdated packages
npm outdated

# Update packages
npm update

# Update specific package
npm update <package-name>
```

---

## 🎓 Additional Resources

- [MICROSERVICES-ARCHITECTURE.md](./MICROSERVICES-ARCHITECTURE.md) - Architecture overview
- [README.md](./README.md) - Project overview
- [API Documentation](./api-docs/) - API specifications

---

**Last Updated**: October 4, 2025  
**Version**: 1.0.0  
**Maintained By**: POC Development Team
