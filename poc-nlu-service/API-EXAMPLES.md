# NLU Service API Examples

## Quick Start

### 1. Start the Service

```bash
cd poc-nlu-service
npm install
npm start
```

The service will start on port 3003 (configurable via `NLU_SERVICE_PORT`).

## API Examples

### Analyze User Input (Main Endpoint)

This is the primary endpoint for chat applications.

```bash
curl -X POST http://localhost:3003/api/nlu/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "user_input": "What is my account balance?",
    "sessionId": "user-session-123",
    "userId": "user-456"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "intent": "check.balance",
    "confidence": 0.92,
    "dialogflow": {
      "fulfillmentText": "I can help you check your account balance.",
      "parameters": {
        "account_type": "checking"
      },
      "languageCode": "en-US",
      "allRequiredParamsPresent": true
    },
    "banking": {
      "intent": "check_balance",
      "confidence": 0.88,
      "entities": [...]
    },
    "entities": [...],
    "metadata": {
      "source": "dialogflow",
      "sessionId": "user-session-123",
      "userId": "user-456",
      "timestamp": "2025-10-11T12:00:00.000Z"
    }
  }
}
```

### More Examples

#### Check Balance
```bash
curl -X POST http://localhost:3003/api/nlu/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "user_input": "Show me my savings account balance",
    "sessionId": "session-001",
    "userId": "user-001"
  }'
```

#### Transfer Money
```bash
curl -X POST http://localhost:3003/api/nlu/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "user_input": "I want to transfer $500 to John",
    "sessionId": "session-002",
    "userId": "user-002"
  }'
```

#### View Transactions
```bash
curl -X POST http://localhost:3003/api/nlu/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "user_input": "Show me my transactions from last week",
    "sessionId": "session-003",
    "userId": "user-003"
  }'
```

#### Open Account
```bash
curl -X POST http://localhost:3003/api/nlu/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "user_input": "I would like to open a new savings account",
    "sessionId": "session-004",
    "userId": "user-004"
  }'
```

#### Get Loan Information
```bash
curl -X POST http://localhost:3003/api/nlu/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "user_input": "What are the current mortgage rates?",
    "sessionId": "session-005",
    "userId": "user-005"
  }'
```

### Direct DialogFlow Endpoint

```bash
curl -X POST http://localhost:3003/api/nlu/dialogflow \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is my balance?",
    "sessionId": "session-001"
  }'
```

### Banking Intent Detection

```bash
curl -X POST http://localhost:3003/api/nlu/banking \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I need to check my balance"
  }'
```

### Entity Extraction

```bash
curl -X POST http://localhost:3003/api/nlu/entities \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Transfer $1000 from checking to savings on December 15th",
    "domain": "banking"
  }'
```

### Get Available Intents

```bash
curl -X GET http://localhost:3003/api/nlu/intents/available
```

### Get Banking Intents

```bash
curl -X GET http://localhost:3003/api/nlu/banking/intents
```

### Get DialogFlow Status

```bash
curl -X GET http://localhost:3003/api/nlu/dialogflow/status
```

### Health Check

```bash
curl -X GET http://localhost:3003/health
```

## JavaScript/Node.js Examples

### Using Axios

```javascript
const axios = require('axios');

async function analyzeUserInput(message, sessionId, userId) {
  try {
    const response = await axios.post('http://localhost:3003/api/nlu/analyze', {
      user_input: message,
      sessionId: sessionId,
      userId: userId,
      languageCode: 'en-US'
    });
    
    console.log('Intent:', response.data.data.intent);
    console.log('Confidence:', response.data.data.confidence);
    console.log('Entities:', response.data.data.entities);
    
    return response.data.data;
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}

// Usage
analyzeUserInput('What is my account balance?', 'session-123', 'user-456')
  .then(result => console.log('Analysis:', result))
  .catch(err => console.error('Failed:', err));
```

### Using Fetch

```javascript
async function analyzeUserInput(message, sessionId, userId) {
  const response = await fetch('http://localhost:3003/api/nlu/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      user_input: message,
      sessionId: sessionId,
      userId: userId
    })
  });
  
  const data = await response.json();
  return data.data;
}
```

## Python Examples

### Using Requests

```python
import requests
import json

def analyze_user_input(message, session_id, user_id):
    url = 'http://localhost:3003/api/nlu/analyze'
    payload = {
        'user_input': message,
        'sessionId': session_id,
        'userId': user_id,
        'languageCode': 'en-US'
    }
    
    response = requests.post(url, json=payload)
    
    if response.status_code == 200:
        data = response.json()['data']
        print(f"Intent: {data['intent']}")
        print(f"Confidence: {data['confidence']}")
        print(f"Entities: {data['entities']}")
        return data
    else:
        raise Exception(f"API Error: {response.status_code}")

# Usage
result = analyze_user_input('What is my account balance?', 'session-123', 'user-456')
print(json.dumps(result, indent=2))
```

## React/Frontend Examples

### Using React Hooks

```javascript
import { useState } from 'react';
import axios from 'axios';

function useNLUAnalysis() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const analyzeMessage = async (message, sessionId, userId) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.post(
        'http://localhost:3003/api/nlu/analyze',
        {
          user_input: message,
          sessionId: sessionId,
          userId: userId
        }
      );
      
      setLoading(false);
      return response.data.data;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };
  
  return { analyzeMessage, loading, error };
}

// Usage in component
function ChatComponent() {
  const { analyzeMessage, loading, error } = useNLUAnalysis();
  
  const handleSendMessage = async (message) => {
    const result = await analyzeMessage(
      message,
      'session-' + Date.now(),
      'user-123'
    );
    
    console.log('Intent detected:', result.intent);
    console.log('Confidence:', result.confidence);
  };
  
  return (
    <div>
      {/* Your chat UI */}
    </div>
  );
}
```

## Testing

### Run All Tests

```bash
cd poc-nlu-service
./test-nlu-service.sh
```

### Test Specific Endpoint

```bash
# Test analyze endpoint
curl -X POST http://localhost:3003/api/nlu/analyze \
  -H "Content-Type: application/json" \
  -d '{"user_input": "test message", "sessionId": "test", "userId": "test"}' | jq
```

## Environment Configuration

### Development (.env)

```bash
NODE_ENV=development
NLU_SERVICE_PORT=3003
DIALOGFLOW_ENABLED=true
DIALOGFLOW_PROJECT_ID=your-project-id
DIALOGFLOW_KEY_FILENAME=./config/dialogflow-credentials.json
```

### Production

```bash
NODE_ENV=production
NLU_SERVICE_PORT=3003
DIALOGFLOW_ENABLED=true
DIALOGFLOW_PROJECT_ID=prod-project-id
GOOGLE_APPLICATION_CREDENTIALS=/app/config/credentials.json
```

## Response Format

All successful responses follow this format:

```json
{
  "success": true,
  "data": {
    // Response data specific to the endpoint
  }
}
```

Error responses:

```json
{
  "success": false,
  "error": "Error message",
  "message": "Detailed error description"
}
```

## Rate Limiting

- **Limit**: 200 requests per 15 minutes per IP
- **Response when exceeded**:
```json
{
  "error": "Too many requests from this IP, please try again later."
}
```

## Support

For questions or issues, refer to the main README.md or contact the development team.
