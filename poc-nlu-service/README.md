# POC NLU Service

Natural Language Understanding Microservice for POC Banking Chat System

## Overview

The NLU Service provides intent detection, entity extraction, and natural language understanding capabilities using DialogFlow integration. It serves as the primary interface for analyzing user input from the chat interface.

## Key Features

- **DialogFlow Integration**: Real-time intent detection using Google Cloud DialogFlow API
- **Banking Domain NLU**: Specialized banking intent and entity recognition
- **Unified Analysis Endpoint**: Single endpoint for chat input processing
- **Fallback Mode**: Automatic fallback to mock responses when DialogFlow is unavailable
- **Context Management**: Session-based context tracking
- **Multi-language Support**: Configurable language detection

## API Endpoints

### Main Chat Integration Endpoint

#### POST `/api/nlu/analyze`

**Primary endpoint for chat applications to analyze user input.**

**Request Body:**
```json
{
  "user_input": "What is my account balance?",
  "sessionId": "user-session-123",
  "userId": "user-456",
  "languageCode": "en-US"
}
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
      "entities": [
        {
          "entity": "account_type",
          "value": "checking",
          "type": "account"
        }
      ]
    },
    "entities": [
      {
        "entity": "account_type",
        "value": "checking",
        "source": "dialogflow"
      }
    ],
    "metadata": {
      "source": "dialogflow",
      "sessionId": "user-session-123",
      "userId": "user-456",
      "timestamp": "2025-10-11T12:00:00.000Z"
    }
  }
}
```

### Other Endpoints

#### POST `/api/nlu/intents`
Detect intent from user message (legacy endpoint)

#### POST `/api/nlu/banking`
Detect banking-specific intents

#### POST `/api/nlu/entities`
Extract entities from message

#### POST `/api/nlu/dialogflow`
Direct DialogFlow integration

#### GET `/api/nlu/intents/available`
Get list of available intents

#### GET `/health`
Service health check

## Setup

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Service Configuration
NODE_ENV=development
NLU_SERVICE_PORT=3003
LOG_LEVEL=info

# DialogFlow Configuration
DIALOGFLOW_ENABLED=true
DIALOGFLOW_PROJECT_ID=your-project-id
DIALOGFLOW_KEY_FILENAME=./config/dialogflow-credentials.json
DIALOGFLOW_LANGUAGE_CODE=en-US

# Alternative: Use Google Application Default Credentials
# GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

### DialogFlow Setup

#### Option 1: Using Service Account Key File

1. Create a Google Cloud Project
2. Enable DialogFlow API
3. Create a Service Account with DialogFlow API Admin role
4. Download the service account JSON key
5. Place the key file in `poc-nlu-service/config/dialogflow-credentials.json`
6. Set `DIALOGFLOW_KEY_FILENAME=./config/dialogflow-credentials.json`

#### Option 2: Using Application Default Credentials (ADC)

For production environments or when running in Google Cloud:

```bash
# Authenticate with gcloud
gcloud auth application-default login

# Or set the credentials file path
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

### Installation

```bash
cd poc-nlu-service
npm install
```

### Running the Service

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

### Docker

```bash
# Build
docker build -t poc-nlu-service .

# Run
docker run -p 3003:3003 \
  -e DIALOGFLOW_ENABLED=true \
  -e DIALOGFLOW_PROJECT_ID=your-project-id \
  -v /path/to/credentials.json:/app/config/dialogflow-credentials.json \
  poc-nlu-service
```

## DialogFlow Integration

### How It Works

1. **Real API Mode**: When DialogFlow credentials are configured, the service uses the official Google Cloud DialogFlow API
2. **Mock Mode**: When credentials are not available or API calls fail, the service automatically falls back to mock responses
3. **Graceful Degradation**: The service continues to function even if DialogFlow is unavailable

### Creating DialogFlow Agent

1. Go to [DialogFlow Console](https://dialogflow.cloud.google.com/)
2. Create a new agent for your banking application
3. Define intents such as:
   - `check.balance`
   - `transfer.money`
   - `view.transactions`
   - `open.account`
   - `get.loan.info`
4. Add training phrases for each intent
5. Define entities for banking-specific terms (account types, amounts, dates)

### Testing DialogFlow Integration

```bash
# Test the analyze endpoint
curl -X POST http://localhost:3003/api/nlu/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "user_input": "What is my savings account balance?",
    "sessionId": "test-session",
    "userId": "test-user"
  }'
```

## Architecture

```
Chat Frontend
    ↓
Chat Backend
    ↓
NLU Service (/api/nlu/analyze)
    ↓
    ├── DialogFlow API (Real or Mock)
    ├── Banking NLU Service
    └── Entity Extraction
    ↓
Response with Intent + Entities
```

## Response Format

The `/api/nlu/analyze` endpoint returns a comprehensive analysis:

- **intent**: Primary detected intent from DialogFlow
- **confidence**: Confidence score (0-1)
- **dialogflow**: DialogFlow-specific details
  - fulfillmentText: Suggested response text
  - parameters: Extracted parameters
  - languageCode: Detected language
  - allRequiredParamsPresent: Whether all required params are present
- **banking**: Banking-specific analysis
  - intent: Banking domain intent
  - confidence: Banking intent confidence
  - entities: Banking-specific entities
- **entities**: Combined entities from all sources
- **metadata**: Request metadata (session, user, timestamp)

## Error Handling

The service includes comprehensive error handling:

- **DialogFlow API Errors**: Automatic fallback to mock mode
- **Missing Credentials**: Service starts in mock mode with warning
- **Network Errors**: Retry logic with exponential backoff
- **Rate Limiting**: Built-in rate limiting to prevent abuse

## Logging

Logs are written using Winston logger with structured JSON format:

```json
{
  "level": "info",
  "message": "Analyzing user input",
  "messageLength": 28,
  "userId": "user-123",
  "sessionId": "session-456",
  "timestamp": "2025-10-11T12:00:00.000Z"
}
```

## Development

### Project Structure

```
poc-nlu-service/
├── src/
│   ├── server.js                 # Express server setup
│   ├── config/
│   │   └── config.js            # Configuration management
│   ├── controllers/
│   │   └── nlu.controller.js    # Request handlers
│   ├── services/
│   │   ├── nlu.service.js       # Core NLU logic
│   │   ├── dialogflow.service.js # DialogFlow integration
│   │   └── banking-nlu.service.js # Banking domain NLU
│   ├── routes/
│   │   └── nlu.routes.js        # API routes
│   ├── middleware/
│   │   ├── errorHandlers.js     # Error handling
│   │   └── validation.js        # Request validation
│   └── utils/
│       └── logger.js            # Winston logger
├── config/                       # Config files (credentials)
├── .env.example                 # Environment template
├── package.json
└── Dockerfile
```

### Adding New Intents

1. Update DialogFlow agent with new intents
2. Add intent patterns in `banking-nlu.service.js` for fallback
3. Test with the `/api/nlu/analyze` endpoint

## Monitoring

### Health Check

```bash
curl http://localhost:3003/health
```

### DialogFlow Status

```bash
curl http://localhost:3003/api/nlu/dialogflow/status
```

## Troubleshooting

### DialogFlow Not Working

1. **Check credentials**: Verify `DIALOGFLOW_KEY_FILENAME` or `GOOGLE_APPLICATION_CREDENTIALS`
2. **Check project ID**: Ensure `DIALOGFLOW_PROJECT_ID` is correct
3. **Check API enabled**: Verify DialogFlow API is enabled in Google Cloud Console
4. **Check permissions**: Service account needs DialogFlow API Admin role
5. **View logs**: Check logs for error messages

### Service Returning Mock Responses

- This is expected when DialogFlow is not configured
- Set `DIALOGFLOW_ENABLED=true` and provide valid credentials
- Check logs for initialization errors

## Performance

- Average response time: 100-300ms (real API), 50-100ms (mock)
- Rate limit: 200 requests per 15 minutes per IP
- Concurrent connections: Handled by Node.js event loop
- Memory usage: ~50MB base + ~10MB per 1000 active sessions

## Security

- Helmet.js for security headers
- Rate limiting on all API endpoints
- Input validation using express-validator
- CORS configuration
- No sensitive data in logs
- Service account key should never be committed to git

## Integration with Chat Backend

The chat backend should call `/api/nlu/analyze` endpoint:

```javascript
// In chat backend
const analyzeUserInput = async (message, sessionId, userId) => {
  const response = await axios.post(`${NLU_SERVICE_URL}/api/nlu/analyze`, {
    user_input: message,
    sessionId,
    userId,
    languageCode: 'en-US'
  });
  
  return response.data.data;
};
```

## License

MIT

## Support

For issues or questions, please contact the development team.
