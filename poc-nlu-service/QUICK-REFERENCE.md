# NLU Service - Quick Reference Card

## 🚀 Quick Start

```bash
cd poc-nlu-service
npm install
npm start
# Service runs on http://localhost:3003
```

## 🎯 Main Endpoint (Use This!)

### POST `/api/nlu/analyze`

**For Chat Applications - Accepts user input and returns intent + entities**

```bash
curl -X POST http://localhost:3003/api/nlu/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "user_input": "What is my account balance?",
    "sessionId": "session-123",
    "userId": "user-456"
  }'
```

**Returns:**
```json
{
  "success": true,
  "data": {
    "intent": "check.balance",
    "confidence": 0.92,
    "dialogflow": { /* DialogFlow details */ },
    "banking": { /* Banking analysis */ },
    "entities": [ /* Extracted entities */ ],
    "metadata": { /* Session info */ }
  }
}
```

## 🔧 Configuration

**Environment Variables (.env):**
```bash
DIALOGFLOW_ENABLED=true
DIALOGFLOW_PROJECT_ID=your-project-id
DIALOGFLOW_KEY_FILENAME=./config/dialogflow-credentials.json
```

## 📊 Other Useful Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/api/nlu/dialogflow` | POST | Direct DialogFlow |
| `/api/nlu/banking` | POST | Banking intents |
| `/api/nlu/entities` | POST | Entity extraction |

## 🧪 Testing

```bash
# Run all tests
./test-nlu-service.sh

# Quick test
curl http://localhost:3003/health
```

## 💡 Integration Example

```javascript
// In your chat backend
const analyzeMessage = async (message, sessionId, userId) => {
  const response = await axios.post('http://localhost:3003/api/nlu/analyze', {
    user_input: message,
    sessionId,
    userId
  });
  return response.data.data;
};
```

## 🔍 Common Intents

- `check.balance` - Check account balance
- `transfer.money` - Transfer funds
- `view.transactions` - View transaction history
- `open.account` - Open new account
- `get.loan.info` - Loan information

## 📖 Full Documentation

- `README.md` - Complete service documentation
- `API-EXAMPLES.md` - API usage examples
- `NLU-SERVICE-REVIEW.md` - Implementation summary

## 🆘 Troubleshooting

**DialogFlow not working?**
1. Check credentials file exists
2. Verify DIALOGFLOW_PROJECT_ID is correct
3. Ensure DialogFlow API is enabled in GCP
4. Check logs: Service auto-falls back to mock mode

**Mock responses?**
- Expected when DIALOGFLOW_ENABLED=false
- Service works in mock mode for testing
- Set DIALOGFLOW_ENABLED=true for production

## 📞 Service Info

- **Port**: 3003 (default)
- **Health**: `GET /health`
- **API Docs**: `GET /api`
- **Rate Limit**: 200 req/15min per IP

---

**Version**: 1.0.0 | **Status**: ✅ Production Ready
