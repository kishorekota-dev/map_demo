# POC Banking Chatbot - Development Environment

This document provides comprehensive setup instructions for the POC Banking Chatbot microservices development environment.

## 🏗️ Architecture Overview

The POC Banking Chatbot consists of 5 independent microservices:

- **🌐 API Gateway** (Port 3001) - Central routing, authentication, and load balancing
- **🏪 Banking Service** (Port 3005) - Core banking operations and business logic
- **🧠 NLP Service** (Port 3002) - Natural language processing capabilities
- **🎯 NLU Service** (Port 3003) - Natural language understanding and intent detection
- **🔧 MCP Service** (Port 3004) - Model Context Protocol for AI tool calling

## 📋 Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 8.0.0
- **Git**
- **Optional**: Redis, PostgreSQL, Consul (for full functionality)

## 🚀 Quick Start

### 1. Clone and Setup

```bash
# Clone the repository
git clone <repository-url>
cd map_demo

# Validate environment setup
./scripts/validate-env.sh

# Start all services
./scripts/start-dev.sh
```

### 2. Verify Services

Once started, you can access:

- **API Gateway**: http://localhost:3001/api
- **Health Checks**: http://localhost:3001/health
- **Individual Services**: 
  - Banking: http://localhost:3005/health
  - NLP: http://localhost:3002/health
  - NLU: http://localhost:3003/health
  - MCP: http://localhost:3004/health

### 3. Stop Services

```bash
./scripts/stop-dev.sh
```

## 📁 Project Structure

```
map_demo/
├── .env.development              # Master development environment
├── scripts/
│   ├── start-dev.sh             # Start all services
│   ├── stop-dev.sh              # Stop all services
│   └── validate-env.sh          # Validate environment
├── poc-api-gateway/             # API Gateway microservice
│   ├── .env.development         # Gateway-specific environment
│   ├── package.json
│   ├── server.js
│   └── config/
├── poc-banking-service/         # Banking microservice
│   ├── .env.development         # Banking-specific environment
│   ├── package.json
│   ├── server.js
│   └── config/
├── poc-nlp-service/             # NLP microservice
│   ├── .env.development         # NLP-specific environment
│   ├── package.json
│   ├── server.js
│   └── config/
├── poc-nlu-service/             # NLU microservice
│   ├── .env.development         # NLU-specific environment
│   ├── package.json
│   ├── server.js
│   └── config/
└── poc-mcp-service/             # MCP microservice
    ├── .env.development         # MCP-specific environment
    ├── package.json
    ├── server.js
    └── config/
```

## ⚙️ Environment Configuration

### Master Environment File

The `.env.development` file contains global configuration for all services:

```bash
# Global settings
NODE_ENV=development
LOG_LEVEL=debug
JWT_SECRET=dev-jwt-secret-change-me-in-production-2024

# Service URLs
API_GATEWAY_URL=http://localhost:3001
BANKING_SERVICE_URL=http://localhost:3005
NLP_SERVICE_URL=http://localhost:3002
NLU_SERVICE_URL=http://localhost:3003
MCP_SERVICE_URL=http://localhost:3004

# External services
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://postgres:password@localhost:5432/poc_banking_dev

# Development features
MOCK_EXTERNAL_SERVICES=true
DEBUG_REQUESTS=true
METRICS_ENABLED=true
```

### Service-Specific Environments

Each service has its own `.env.development` file with service-specific configurations:

- **API Gateway**: Proxy settings, circuit breaker, load balancing
- **Banking Service**: Business rules, fees, external integrations
- **NLP Service**: AI service endpoints, processing limits
- **NLU Service**: DialogFlow configuration, intent thresholds
- **MCP Service**: WebSocket settings, tool execution limits

## 🔧 Manual Setup (Alternative)

### 1. Install Dependencies for All Services

```bash
# Install dependencies for each service
cd poc-api-gateway && npm install && cd ..
cd poc-banking-service && npm install && cd ..
cd poc-nlp-service && npm install && cd ..
cd poc-nlu-service && npm install && cd ..
cd poc-mcp-service && npm install && cd ..
```

### 2. Copy Environment Files

```bash
# Copy master environment to each service
cp .env.development poc-api-gateway/.env
cp .env.development poc-banking-service/.env
cp .env.development poc-nlp-service/.env
cp .env.development poc-nlu-service/.env
cp .env.development poc-mcp-service/.env
```

### 3. Start Services Individually

```bash
# Terminal 1 - API Gateway
cd poc-api-gateway && npm run dev

# Terminal 2 - Banking Service
cd poc-banking-service && npm run dev

# Terminal 3 - NLP Service
cd poc-nlp-service && npm run dev

# Terminal 4 - NLU Service
cd poc-nlu-service && npm run dev

# Terminal 5 - MCP Service
cd poc-mcp-service && npm run dev
```

## 🔍 Service Details

### API Gateway (Port 3001)

**Purpose**: Central entry point for all microservices

**Key Features**:
- Request routing and load balancing
- JWT authentication
- Rate limiting and circuit breaker
- Service discovery integration

**Endpoints**:
- `GET /api` - Service information
- `GET /health` - Health check
- `/api/banking/*` - Banking service proxy
- `/api/nlp/*` - NLP service proxy
- `/api/nlu/*` - NLU service proxy
- `/api/mcp/*` - MCP service proxy

### Banking Service (Port 3005)

**Purpose**: Core banking operations and business logic

**Key Features**:
- Account management
- Transaction processing
- Card operations
- Fraud detection
- Dispute handling

**Endpoints**:
- `/api/accounts` - Account operations
- `/api/transactions` - Transaction management
- `/api/cards` - Card operations
- `/api/transfers` - Money transfers
- `/api/fraud` - Fraud detection
- `/api/disputes` - Dispute management

### NLP Service (Port 3002)

**Purpose**: Natural language processing capabilities

**Key Features**:
- Text analysis and tokenization
- Sentiment analysis
- Entity extraction
- Language detection

**Endpoints**:
- `/api/analyze` - Text analysis
- `/api/sentiment` - Sentiment analysis
- `/api/entities` - Entity extraction
- `/api/tokenize` - Text tokenization

### NLU Service (Port 3003)

**Purpose**: Natural language understanding and intent detection

**Key Features**:
- Intent classification
- Banking domain understanding
- DialogFlow integration
- Context management

**Endpoints**:
- `/api/intent` - Intent detection
- `/api/entities` - Entity recognition
- `/api/context` - Context management
- `/api/banking-intent` - Banking-specific intents

### MCP Service (Port 3004)

**Purpose**: Model Context Protocol for AI tool calling

**Key Features**:
- WebSocket communication
- Tool execution framework
- AI model integration
- Real-time processing

**Endpoints**:
- `/api/tools` - Tool management
- `/api/execute` - Tool execution
- `/ws` - WebSocket connection
- `/api/models` - AI model endpoints

## 🔧 Development Features

### Debug Logging

Enable detailed logging for development:

```bash
DEBUG_REQUESTS=true
DEBUG_RESPONSES=true
DEBUG_TRANSACTIONS=true
DEBUG_NLP_PROCESSING=true
DEBUG_INTENT_DETECTION=true
```

### Mock External Services

Disable external API calls for development:

```bash
MOCK_EXTERNAL_SERVICES=true
MOCK_EXTERNAL_NLP_SERVICES=true
MOCK_DIALOGFLOW=true
MOCK_AI_SERVICES=true
```

### Metrics and Monitoring

Enable metrics collection:

```bash
METRICS_ENABLED=true
TRACING_ENABLED=true
```

## 📊 Monitoring and Logs

### Real-time Logs

```bash
# Watch all service logs
tail -f logs/*.log

# Individual service logs
tail -f logs/poc-api-gateway.log
tail -f logs/poc-banking-service.log
tail -f logs/poc-nlp-service.log
tail -f logs/poc-nlu-service.log
tail -f logs/poc-mcp-service.log
```

### Health Monitoring

```bash
# Check all services
curl http://localhost:3001/health

# Individual health checks
curl http://localhost:3001/health  # API Gateway
curl http://localhost:3002/health  # NLP Service
curl http://localhost:3003/health  # NLU Service
curl http://localhost:3004/health  # MCP Service
curl http://localhost:3005/health  # Banking Service
```

## 🧪 Testing API Endpoints

### Using the API Gateway

All requests should go through the API Gateway:

```bash
# Banking operations
curl -H "Authorization: Bearer <jwt-token>" \
     http://localhost:3001/api/banking/accounts

# NLP processing
curl -H "Authorization: Bearer <jwt-token>" \
     -H "Content-Type: application/json" \
     -d '{"text": "Hello, I want to check my balance"}' \
     http://localhost:3001/api/nlp/analyze

# Intent detection
curl -H "Authorization: Bearer <jwt-token>" \
     -H "Content-Type: application/json" \
     -d '{"query": "I want to transfer money"}' \
     http://localhost:3001/api/nlu/intent
```

## 🚨 Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Find process using port
   lsof -i :3001
   
   # Kill process
   kill -9 <PID>
   ```

2. **Service Not Starting**
   ```bash
   # Check logs
   tail -f logs/poc-<service-name>.log
   
   # Validate environment
   ./scripts/validate-env.sh
   ```

3. **Authentication Errors**
   - Ensure JWT_SECRET is consistent across all services
   - Check token expiry settings

4. **Service Communication Errors**
   - Verify all service URLs in environment files
   - Check service health endpoints

### Validation Commands

```bash
# Validate environment setup
./scripts/validate-env.sh

# Check port availability
netstat -tlnp | grep -E ':(3001|3002|3003|3004|3005)'

# Verify Node.js version
node --version  # Should be >= 18.0.0
```

## 🔄 Development Workflow

1. **Start Development Environment**
   ```bash
   ./scripts/start-dev.sh
   ```

2. **Make Changes to Service Code**
   - Services use `nodemon` for auto-restart
   - Check logs for any errors

3. **Test Changes**
   - Use health checks to verify service status
   - Test API endpoints through gateway

4. **Stop Environment**
   ```bash
   ./scripts/stop-dev.sh
   ```

## 📚 Next Steps

- Set up Docker containers for easier deployment
- Implement service discovery with Consul
- Add comprehensive API documentation
- Set up monitoring and metrics dashboard
- Configure CI/CD pipeline

## 🤝 Contributing

1. Follow the microservices naming convention: `poc-<service-name>`
2. Update environment configurations when adding new settings
3. Ensure all services have proper health checks
4. Add logging for debugging and monitoring
5. Test service integration through the API Gateway

## 📞 Support

For issues and questions:
- Check service logs in `logs/` directory
- Run environment validation: `./scripts/validate-env.sh`
- Verify service health endpoints
- Review environment configuration files