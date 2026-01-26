# NLU Service - Quick Reference Card

## 🚀 Quick Start

```bash
# Start all services
./deployment-scripts/start-local-dev.sh

# Check status
./deployment-scripts/check-local-status.sh

# Run tests
./deployment-scripts/test-nlu-integration.sh

# Stop services
./deployment-scripts/stop-local-dev.sh
```

## 🌐 Service URLs

| Service | URL | Docs |
|---------|-----|------|
| Frontend | http://localhost:3000 | UI |
| Chat Backend | http://localhost:3006 | WebSocket + REST |
| Banking Service | http://localhost:3005 | `/api` |
| **NLU Service** | **http://localhost:3003** | `/api` |
| MCP Service | http://localhost:3004 | `/api` |

## 📡 Primary NLU Endpoint

### POST /api/nlu/analyze

**The main endpoint for chat integration**

```bash
curl -X POST http://localhost:3003/api/nlu/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "user_input": "What is my account balance?",
    "sessionId": "user-session-123",
    "userId": "user-456",
    "languageCode": "en-US"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "intent": "check.balance",
    "confidence": 0.92,
    "dialogflow": { ... },
    "banking": { ... },
    "entities": [ ... ],
    "metadata": { ... }
  }
}
```

## 🔧 Integration Code

### Using NLU Client in Chat Backend

```javascript
const nluClient = require('./services/nluClient');

// Analyze user input
const result = await nluClient.analyzeUserInput(
  userMessage,
  sessionId,
  userId,
  'en-US'
);

console.log('Intent:', result.intent);
console.log('Confidence:', result.confidence);
console.log('Entities:', result.entities);
```

### NLU Client Methods

```javascript
// Main method
analyzeUserInput(userInput, sessionId, userId, languageCode)

// Other methods
detectIntent(message, userId, sessionId)
detectBankingIntent(message)
extractEntities(message, domain)
updateContext(sessionId, context)
getContext(sessionId)
checkHealth()
getStatus()
```

## 📊 All NLU Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/nlu/analyze` | **Main chat endpoint** |
| POST | `/api/nlu/intents` | Detect intent |
| GET | `/api/nlu/intents/available` | List intents |
| POST | `/api/nlu/banking` | Banking intents |
| POST | `/api/nlu/entities` | Extract entities |
| POST | `/api/nlu/dialogflow` | DialogFlow direct |
| GET | `/api/nlu/dialogflow/status` | DialogFlow status |
| POST | `/api/nlu/context/{sessionId}` | Update context |
| GET | `/api/nlu/context/{sessionId}` | Get context |
| DELETE | `/api/nlu/context/{sessionId}` | Clear context |
| POST | `/api/nlu/train` | Train model |
| GET | `/health` | Health check |
| GET | `/api/nlu/capabilities` | Service info |

## 🧪 Test Examples

### Balance Check
```bash
curl -X POST http://localhost:3003/api/nlu/analyze \
  -H "Content-Type: application/json" \
  -d '{"user_input": "What is my balance?"}'
```

### Transfer
```bash
curl -X POST http://localhost:3003/api/nlu/analyze \
  -H "Content-Type: application/json" \
  -d '{"user_input": "Transfer $500 to John"}'
```

### Transaction History
```bash
curl -X POST http://localhost:3003/api/nlu/analyze \
  -H "Content-Type: application/json" \
  -d '{"user_input": "Show my recent transactions"}'
```

## 🔍 Debugging

### View Logs
```bash
# NLU Service
docker compose -f docker-compose.local.yml logs -f poc-nlu-service

# Chat Backend
docker compose -f docker-compose.local.yml logs -f poc-chat-backend

# All services
docker compose -f docker-compose.local.yml logs -f
```

### Check Health
```bash
curl http://localhost:3003/health
curl http://localhost:3006/health
```

### Check Circuit Breaker Status
```javascript
// In Chat Backend logs, look for:
// - "Circuit breaker closed"
// - "Circuit breaker opened"
// - "Using fallback NLU response"
```

## ⚙️ Configuration

### Environment Variables

**NLU Service:**
```env
PORT=3003
DIALOGFLOW_PROJECT_ID=your-project-id  # Optional
CACHE_ENABLED=true
LOG_LEVEL=debug
```

**Chat Backend:**
```env
NLU_SERVICE_URL=http://poc-nlu-service:3003
NLU_TIMEOUT=10000
NLU_RETRY_ATTEMPTS=2
NLU_FALLBACK_ENABLED=true
```

## 🎯 Common Intents

| Intent | Example Phrases |
|--------|-----------------|
| `check_balance` | "What's my balance?", "How much money do I have?" |
| `transfer_funds` | "Send money to John", "Transfer $100" |
| `transaction_history` | "Show transactions", "Recent activity" |
| `card_services` | "My card info", "Block my card" |
| `loan_inquiry` | "Apply for loan", "Mortgage rates" |

## 🛡️ Resilience Features

- ✅ Circuit Breaker (5 failure threshold)
- ✅ Auto-retry (2 attempts with backoff)
- ✅ Fallback mode (keyword-based)
- ✅ Health monitoring
- ✅ Timeout protection (10s default)

## 📁 Key Files

```
poc-nlu-service/
├── openapi.yaml              # Complete API spec
├── docker-compose.yml        # Service compose
└── src/
    ├── routes/nlu.routes.js  # API routes
    └── controllers/nlu.controller.js

poc-chat-backend/
└── services/
    ├── nluClient.js          # Integration client
    └── agentOrchestrator.js  # Agent orchestration

docker-compose.local.yml      # Full stack
deployment-scripts/
├── start-local-dev.sh        # Start script
├── stop-local-dev.sh         # Stop script
├── check-local-status.sh     # Status check
└── test-nlu-integration.sh   # Integration tests
```

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| Service not starting | Check Docker running, ports available |
| Intent not detected | Check logs, verify message format |
| Circuit breaker open | Wait 60s or restart NLU service |
| Fallback mode active | Normal without DialogFlow; check credentials if needed |
| Connection refused | Ensure all services started, check network |

## 📚 Documentation

- **Full Setup Guide**: `LOCAL-DEVELOPMENT-SETUP.md`
- **Implementation Summary**: `NLU-INTEGRATION-COMPLETE.md`
- **OpenAPI Spec**: `poc-nlu-service/openapi.yaml`
- **Service README**: `poc-nlu-service/README.md`

## 🎓 Learning Resources

1. Start services: `./deployment-scripts/start-local-dev.sh`
2. Run tests: `./deployment-scripts/test-nlu-integration.sh`
3. View OpenAPI: Open `poc-nlu-service/openapi.yaml`
4. Test frontend: http://localhost:3000
5. Monitor logs: `docker compose -f docker-compose.local.yml logs -f`

---

**For detailed information, see**: `LOCAL-DEVELOPMENT-SETUP.md`
