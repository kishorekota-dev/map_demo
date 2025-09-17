# Chatbot POC - Express Backend

A robust Node.js Express backend for the Chatbot POC with Intent Detection, following Express best practices and modern architecture patterns.

## 🚀 Features

- **Express.js** with modern middleware stack
- **Layered architecture** (Controllers, Services, Middleware)
- **Winston logging** with structured output
- **Rate limiting** and security headers
- **Environment-based configuration**
- **Performance monitoring** with timing metrics
- **Error handling** with proper HTTP status codes
- **Input validation** with express-validator
- **CORS support** for cross-origin requests

## 📁 Project Structure

```
src/
├── controllers/        # HTTP request handlers
├── services/          # Business logic layer
├── middleware/        # Custom Express middleware
├── routes/           # API route definitions
├── utils/            # Utility functions and helpers
├── config/           # Configuration management
└── server.js         # Application entry point
```

## 🛠 Technology Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Winston** - Logging
- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing
- **express-validator** - Input validation
- **compression** - Response compression
- **express-rate-limit** - Rate limiting

## 🚦 Getting Started

### Prerequisites

- Node.js 16+
- npm 8+

### Installation

1. Navigate to the backend directory:
   ```bash
   cd poc-backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file:
   ```bash
   cp .env.example .env
   ```

4. Update environment variables:
   ```env
   NODE_ENV=development
   PORT=3001
   HOST=localhost
   
   # CORS
   ALLOWED_ORIGINS=http://localhost:3002,http://localhost:3000
   
   # Rate Limiting
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX=100
   
   # Logging
   LOG_LEVEL=debug
   LOG_FILE_ENABLED=true
   
   # Intent Detection
   INTENT_CONFIDENCE_THRESHOLD=0.7
   
   # Security
   SESSION_SECRET=your-session-secret-here
   JWT_SECRET=your-jwt-secret-here
   ```

### Development

Start the development server:
```bash
npm run dev
```

The API will be available at `http://localhost:3001`

Start production server:
```bash
npm start
```

## 🔌 API Endpoints

### Chat Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat/message` | Send chat message and get response |
| POST | `/api/chat/analyze` | Analyze message intent only |
| GET | `/api/chat/history` | Get conversation history |
| GET | `/api/chat/intents` | Get available intents |
| DELETE | `/api/chat/reset` | Reset conversation |

### Health Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Basic health check |
| GET | `/api/health` | Detailed health information |

### Example Usage

```bash
# Send a chat message
curl -X POST http://localhost:3001/api/chat/message \
  -H "Content-Type: application/json" \
  -H "X-Session-ID: your-session-id" \
  -d '{"message": "Hello, how are you?"}'

# Get available intents
curl http://localhost:3001/api/chat/intents

# Health check
curl http://localhost:3001/health
```

## 🏗 Architecture

### Layered Architecture

1. **Routes** - Define API endpoints and basic validation
2. **Controllers** - Handle HTTP requests and responses
3. **Services** - Contain business logic and data processing
4. **Middleware** - Cross-cutting concerns (auth, logging, validation)
5. **Utils** - Helper functions and utilities

### Request Flow

```
HTTP Request → Middleware → Route → Controller → Service → Response
```

### Error Handling

Centralized error handling with:
- Global error middleware
- Structured error responses
- Proper HTTP status codes
- Request correlation IDs

### Logging

Structured logging with Winston:
- Console output (development)
- File output (production)
- Request/response logging
- Performance monitoring
- Error tracking

## 🔧 Configuration

Environment-based configuration in `src/config/index.js`:

- **Server settings** (port, timeout, body limits)
- **CORS configuration** (allowed origins, credentials)
- **Rate limiting** (window size, request limits)
- **Logging levels** (file output, log rotation)
- **Security settings** (secrets, validation rules)

## 📊 Performance Monitoring

Built-in performance monitoring:

- Request/response timing
- Memory usage tracking
- Slow operation detection
- System health metrics

Access performance data:
```bash
curl http://localhost:3001/api/health/detailed
```

## 🔒 Security Features

- **Helmet.js** - Security headers
- **CORS** - Cross-origin protection
- **Rate limiting** - DDoS protection
- **Input validation** - XSS/injection prevention
- **Error sanitization** - Information disclosure prevention

## 🧪 Testing

Run tests:
```bash
npm test
```

Run tests with coverage:
```bash
npm run test:coverage
```

Watch mode:
```bash
npm run test:watch
```

## 🔧 Development Tools

### Code Quality

Run linting:
```bash
npm run lint
```

Format code:
```bash
npm run format
```

Health check script:
```bash
npm run health-check
```

## 📝 Logging

Log files (when enabled):
- `logs/combined.log` - All application logs
- `logs/error.log` - Error logs only
- `logs/debug.log` - Debug logs (development)

Log levels: `error`, `warn`, `info`, `http`, `verbose`, `debug`, `silly`

## 🚀 Deployment

### Environment Variables

Production environment variables:
```env
NODE_ENV=production
PORT=3001
ALLOWED_ORIGINS=https://yourfrontend.com
LOG_LEVEL=info
LOG_FILE_ENABLED=true
SESSION_SECRET=production-session-secret
JWT_SECRET=production-jwt-secret
```

### Docker Support

```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3001
CMD ["npm", "start"]
```

### Process Management

For production, use PM2:
```bash
npm install -g pm2
pm2 start src/server.js --name chatbot-api
```

## 🤝 Contributing

1. Follow the layered architecture pattern
2. Add proper error handling
3. Include input validation
4. Write comprehensive tests
5. Update API documentation
6. Follow logging standards

## 📝 License

MIT License - see LICENSE file for details