# Backend API Debug Logging System

## Overview

This document describes the comprehensive debug logging system implemented for the Enterprise Banking Backend API. The system provides detailed tracing, performance monitoring, security event logging, and error correlation across all API routes and middleware.

## Architecture

### Core Components

1. **APIDebugLogger Class** (`middleware/apiDebugLogger.js`)
   - Centralized logging with structured output
   - Environment-based configuration
   - Data sanitization for security
   - Performance timing measurements
   - Request ID generation and correlation

2. **Enhanced Middleware**
   - `apiDebugMiddleware`: Request/response logging
   - Enhanced `auth` middleware: Authentication flow tracing
   - Enhanced `authorize` middleware: Permission checking logs

3. **Route-Specific Loggers**
   - Individual debug loggers for each route group
   - Business operation logging
   - Database operation tracking
   - External API call monitoring

## Features

### 🔍 Request Tracing
- **Unique Request IDs**: Every request gets a unique identifier for end-to-end tracing
- **Request/Response Logging**: Complete HTTP cycle tracking with timing
- **Header Analysis**: Client information extraction and logging
- **Body Sanitization**: Automatic removal of sensitive data from logs

### 🔐 Security Monitoring
- **Authentication Events**: Login attempts, failures, and successes
- **Authorization Failures**: Permission denials and access attempts
- **Suspicious Activity Detection**: Bot detection, rapid requests, path traversal
- **Rate Limiting Events**: Threshold breaches and blocking

### ⚡ Performance Monitoring
- **Request Duration Tracking**: Millisecond-precise timing
- **Slow Request Detection**: Automatic flagging of slow operations
- **Database Query Timing**: Individual query performance tracking
- **Memory and Resource Usage**: Optional system resource monitoring

### 🛡️ Data Protection
- **Sensitive Data Sanitization**: Automatic scrubbing of passwords, tokens, SSNs, etc.
- **PII Protection**: Email masking and personal information handling
- **Token Security**: JWT and authorization header sanitization
- **Financial Data Protection**: Account numbers and card information masking

## Configuration

### Environment Variables

```bash
# Master debug control
DEBUG=true                    # Enable/disable all debug logging
NODE_ENV=development         # Environment mode
LOG_LEVEL=DEBUG              # Minimum log level (ERROR, WARN, INFO, DEBUG)

# Component-specific controls
LOG_REQUESTS=true            # Enable request logging
LOG_RESPONSES=true           # Enable response logging
LOG_DATABASE=true            # Enable database operation logging
SANITIZE_LOGS=true           # Enable sensitive data sanitization

# Performance monitoring
LOG_PERFORMANCE=true         # Enable performance logging
SLOW_REQUEST_THRESHOLD=1000  # Threshold for slow request detection (ms)
```

### Debug Configuration File

The system uses `debug-config.json` for centralized configuration:

```json
{
  "debug": {
    "enabled": true,
    "components": {
      "backend-api": {
        "enabled": true,
        "logLevel": "DEBUG",
        "logRequests": true,
        "logResponses": true,
        "logDatabaseOperations": true,
        "logAuthOperations": true,
        "logBusinessOperations": true,
        "logSecurityEvents": true,
        "logPerformanceMetrics": true,
        "sanitizeSensitiveData": true
      }
    }
  }
}
```

## Usage

### Starting with Debug Logging

```bash
# Development mode with full debugging
cd packages/backend
DEBUG=true LOG_LEVEL=DEBUG npm start

# Production mode with error logging only
DEBUG=false LOG_LEVEL=ERROR npm start

# Custom configuration
DEBUG=true LOG_REQUESTS=true LOG_RESPONSES=false npm start
```

### Log Format Examples

#### Request Logging
```
[INFO] 2025-01-08 15:30:25 - [BACKEND-API] Incoming request: POST /api/v1/auth/login
Context: {
  "requestId": "REQ-abc123def456",
  "method": "POST",
  "url": "/api/v1/auth/login",
  "body": {"email": "us***@example.com", "password": "[SANITIZED]"},
  "client": {"ip": "192.168.1.100", "userAgent": "Mozilla/5.0..."}
}
```

#### Authentication Logging
```
[INFO] 2025-01-08 15:30:26 - [AUTH-ROUTE] Login attempt started
Context: {
  "requestId": "REQ-abc123def456",
  "email": "us***@example.com",
  "clientInfo": {"ip": "192.168.1.100"}
}

[INFO] 2025-01-08 15:30:27 - [AUTH] Authentication successful
Context: {
  "userId": "user_12345",
  "role": "CUSTOMER",
  "requestId": "REQ-abc123def456"
}
```

#### Performance Logging
```
[INFO] 2025-01-08 15:30:28 - [BACKEND-API] FAST REQUEST: POST /api/v1/auth/login
Context: {
  "requestId": "REQ-abc123def456",
  "duration": "234ms",
  "performance": {"fast": true}
}
```

#### Security Event Logging
```
[WARN] 2025-01-08 15:30:30 - [BACKEND-API] SECURITY EVENT: Authentication failure
Context: {
  "securityEvent": "Authentication failure",
  "requestId": "REQ-def456ghi789",
  "ip": "192.168.1.100",
  "userAgent": "Bot/1.0"
}
```

#### Error Logging
```
[ERROR] 2025-01-08 15:30:32 - [ACCOUNTS-ROUTE] Database query failed
Context: {
  "requestId": "REQ-ghi789jkl012",
  "error": "Connection timeout",
  "operation": "GET /accounts",
  "userId": "user_12345"
}
```

## Route-Specific Logging

### Authentication Routes (`/api/v1/auth/*`)

**Login Endpoint (`POST /auth/login`)**
- Login attempt logging with client information
- User lookup and validation tracking
- Password verification logging (without exposing passwords)
- JWT token generation logging
- Success/failure correlation with timing

**Registration Endpoint (`POST /auth/register`)**
- Registration attempt logging
- Duplicate user detection
- Role validation logging
- Account creation tracking
- Initial account setup logging

### Account Routes (`/api/v1/accounts/*`)

**Account List (`GET /accounts`)**
- Security filtering application logging
- Query filter application tracking
- Pagination logic logging
- Data sanitization logging
- Response formatting tracking

**Account Details (`GET /accounts/:id`)**
- Account lookup logging
- Authorization check logging
- Transaction retrieval tracking
- Data formatting and sanitization

### Transaction Routes (`/api/v1/transactions/*`)

**Transaction List (`GET /transactions`)**
- Transaction filtering logging
- Date range validation
- Amount filtering tracking
- Merchant category filtering

**Transaction Creation (`POST /transactions`)**
- Transaction validation logging
- Account balance checking
- Fraud detection logging
- Settlement processing tracking

## Middleware Logging

### Authentication Middleware

```javascript
// Example usage in routes
router.get('/protected', auth, (req, res) => {
  // Authentication details are automatically logged:
  // - Token validation
  // - User lookup
  // - Permission loading
  // - Request correlation
});
```

### Authorization Middleware

```javascript
// Example usage with permission checking
router.get('/admin', auth, authorize('users:read'), (req, res) => {
  // Authorization details are automatically logged:
  // - Permission requirement
  // - User role validation
  // - Access grant/deny decisions
  // - Security event correlation
});
```

### API Debug Middleware

```javascript
// Automatically applied to all routes
app.use(apiDebugMiddleware);

// Provides:
// - Request ID generation
// - Request/response logging
// - Performance timing
// - Security monitoring
// - Error correlation
```

## Business Operation Logging

### Using Business Operation Logger

```javascript
const { logBusinessOperation } = require('../middleware/apiDebugLogger');

// In route handlers
router.post('/transfer', auth, async (req, res) => {
  try {
    logBusinessOperation('Fund transfer initiated', {
      userId: req.user.userId,
      amount: req.body.amount,
      fromAccount: req.body.fromAccount,
      toAccount: req.body.toAccount,
      requestId: req.requestId
    });

    // Transfer logic here...

    logBusinessOperation('Fund transfer completed', {
      userId: req.user.userId,
      transferId: transfer.id,
      requestId: req.requestId
    });

  } catch (error) {
    logError(error, {
      requestId: req.requestId,
      operation: 'fund transfer',
      userId: req.user.userId
    });
  }
});
```

## Security Features

### Sensitive Data Sanitization

The system automatically sanitizes the following sensitive fields:

- **Authentication**: passwords, tokens, JWT, bearer tokens
- **Personal Information**: SSN, tax ID, date of birth, phone numbers
- **Financial Data**: account numbers, routing numbers, card numbers, CVV
- **System Data**: API keys, secrets, session IDs, cookies

### Security Event Detection

- **Failed Authentication**: Multiple login failures
- **Authorization Violations**: Access to forbidden resources
- **Suspicious Patterns**: Rapid requests, bot detection
- **Attack Attempts**: Path traversal, injection attempts
- **Rate Limiting**: Threshold breaches

## Performance Monitoring

### Request Classification

- **Fast Requests**: ≤ 500ms (DEBUG level)
- **Moderate Requests**: 501-1000ms (INFO level)
- **Slow Requests**: 1001-2000ms (WARN level)
- **Very Slow Requests**: > 2000ms (WARN level with alert)

### Performance Metrics

```javascript
// Automatic performance logging for all requests
// Manual performance logging for specific operations
const withTiming = withPerformanceLogging(async () => {
  // Your operation here
}, 'Database query');
```

## Testing Debug Logging

### Manual Testing

```bash
# Run the comprehensive test script
./test-backend-debug.sh

# Test specific endpoints with curl
curl -H "X-Request-ID: TEST-123" http://localhost:3000/api/v1/health

# Test authentication flow
curl -X POST -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrongpassword"}' \
  http://localhost:3000/api/v1/auth/login
```

### Automated Testing

The `test-backend-debug.sh` script provides comprehensive testing of:

- Authentication flow logging
- Request ID correlation
- Performance monitoring
- Security event detection
- Error handling
- Rate limiting
- User agent detection
- Malformed request handling

## Log Analysis

### Finding Logs by Request ID

```bash
# Filter logs by specific request ID
grep "REQ-abc123def456" server.log

# Find all requests from a specific user
grep "userId.*user_12345" server.log

# Find security events
grep "SECURITY EVENT" server.log

# Find slow requests
grep "SLOW REQUEST" server.log
```

### Performance Analysis

```bash
# Find requests taking longer than 1 second
grep -E "duration.*[0-9]{4,}ms" server.log

# Authentication performance
grep "Login.*duration" server.log

# Database operation timing
grep "DATABASE.*duration" server.log
```

### Security Analysis

```bash
# Failed authentication attempts
grep "Authentication failed" server.log

# Authorization failures
grep "Authorization failed" server.log

# Bot detection
grep "Bot detected" server.log

# Suspicious activity
grep "Suspiciously fast" server.log
```

## Best Practices

### Development

1. **Enable Full Debug Logging**: Use `DEBUG=true LOG_LEVEL=DEBUG`
2. **Monitor Performance**: Watch for slow request warnings
3. **Check Security Events**: Review failed authentication attempts
4. **Use Request IDs**: Always include request IDs in manual testing
5. **Test Error Scenarios**: Verify error correlation works properly

### Production

1. **Use INFO or WARN Level**: `LOG_LEVEL=INFO` for production
2. **Enable Security Monitoring**: Keep security event logging enabled
3. **Monitor Performance**: Track slow requests and investigate
4. **Rotate Logs**: Implement log rotation to manage disk space
5. **Centralize Logging**: Use log aggregation tools for analysis

### Security

1. **Verify Sanitization**: Ensure no sensitive data appears in logs
2. **Monitor Failed Attempts**: Watch for authentication/authorization failures
3. **Rate Limiting**: Review rate limiting events for abuse
4. **Regular Audits**: Periodic review of security event logs

## Integration with Monitoring Tools

### Log Aggregation

```javascript
// Example integration with Winston
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Integrate with APIDebugLogger
class WinstonAPIDebugLogger extends APIDebugLogger {
  info(message, context) {
    logger.info(this.formatMessage('INFO', message, context));
  }
  // ... other methods
}
```

### Metrics Collection

```javascript
// Example integration with Prometheus
const promClient = require('prom-client');

const requestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code']
});

// Integrate with performance logging
apiDebugLogger.performance = function(message, duration, context) {
  // Existing logging
  this.originalPerformance(message, duration, context);
  
  // Metrics collection
  requestDuration
    .labels(context.method, context.route, context.statusCode)
    .observe(duration / 1000);
};
```

This comprehensive debug logging system provides enterprise-grade visibility into your banking API operations, ensuring you can effectively monitor, debug, and secure your application in both development and production environments.
