# Debug Tracing Guide for Enterprise Banking HTTP MCP System

## Overview

This guide explains how to use the comprehensive debug tracing system that has been implemented across all components of the Enterprise Banking HTTP MCP System. The debug system provides detailed logging for better tracing, debugging, and troubleshooting.

## Components with Debug Logging

### 1. HTTP MCP Server (`packages/backend/mcp-server-http.js`)
- **DebugLogger Class**: Centralized logging with timestamp formatting
- **Request/Response Logging**: Complete HTTP request/response cycle tracking
- **Authentication Flow Logging**: Detailed auth middleware tracing
- **API Proxy Logging**: External API call monitoring
- **Error Handling**: Comprehensive error logging with context

### 2. HTTP MCP Client (`packages/chatbot-ui/src/services/mcp-client-http.ts`)
- **ClientDebugLogger Class**: Client-side request tracking
- **Request ID Generation**: Unique request identification for tracing
- **Session Management**: Authentication state logging
- **Data Sanitization**: Sensitive data protection in logs
- **Performance Timing**: Request duration measurement

### 3. ChatBot UI Component (`packages/chatbot-ui/src/components/ChatBot.tsx`)
- **ChatBotDebugLogger Class**: UI state and interaction tracking
- **State Change Monitoring**: Component state transitions
- **User Action Logging**: Button clicks, form submissions, navigation
- **Message Flow Tracking**: Chat conversation tracing
- **Component Event Logging**: React lifecycle and custom events

### 4. Startup Scripts (`start-local-http-mcp.sh`)
- **Service Health Monitoring**: Port checking and service status
- **Dependency Management**: Package installation tracking
- **Process Management**: PID tracking and process health
- **Environment Setup**: Debug variable configuration
- **Container Management**: Docker container status monitoring

## Environment Variables

### Debug Control Variables
```bash
# Master debug switch
export DEBUG=true

# Node.js development mode
export NODE_ENV=development

# MCP server debug logging
export MCP_DEBUG=true

# Client-side debug logging
export NEXT_PUBLIC_DEBUG=true

# Logging level control
export LOG_LEVEL=DEBUG
```

### Production Safety
```bash
# Disable debug in production
export DEBUG=false
export NODE_ENV=production
export LOG_LEVEL=INFO
```

## Debug Configuration

The system uses `debug-config.json` for centralized debug configuration:

```json
{
  "debug": {
    "enabled": true,
    "components": {
      "mcp-server": {
        "logLevel": "DEBUG",
        "logRequests": true,
        "logResponses": true,
        "sanitizeSensitiveData": true
      }
    }
  }
}
```

## Using Debug Logging

### 1. Quick Start
```bash
# Enable debug mode
export DEBUG=true
export MCP_DEBUG=true
export NEXT_PUBLIC_DEBUG=true

# Start the system
./start-local-http-mcp.sh
```

### 2. Component-Specific Debugging

#### MCP Server Debugging
```bash
# Start with enhanced logging
cd packages/backend
DEBUG=true MCP_DEBUG=true node mcp-server-http.js
```

#### Client-Side Debugging
```bash
# Enable client debug in browser console
localStorage.setItem('debug', 'true');
localStorage.setItem('mcp-debug', 'true');
```

#### ChatBot Component Debugging
The ChatBot component automatically logs when `NEXT_PUBLIC_DEBUG=true`:
- State changes with before/after values
- User interactions with timestamps
- Message flow with unique IDs
- Component lifecycle events

### 3. Testing Debug System
```bash
# Run comprehensive debug tests
./test-debug-logging.sh
```

## Debug Log Formats

### Server Logs
```
[INFO] 2025-01-08 15:30:25 - [HTTP-MCP-SERVER] Starting HTTP MCP Server on port 3002
[DEBUG] 2025-01-08 15:30:26 - [REQ-abc123] POST /api/auth/login - Processing authentication request
[DEBUG] 2025-01-08 15:30:26 - [REQ-abc123] Request body: {"username": "user@example.com", "password": "[SANITIZED]"}
[INFO] 2025-01-08 15:30:27 - [REQ-abc123] Authentication successful for user: user@example.com
[DEBUG] 2025-01-08 15:30:27 - [REQ-abc123] Response sent - Status: 200, Duration: 543ms
```

### Client Logs
```
[INFO] 2025-01-08 15:30:28 - [HTTP-MCP-CLIENT] Making HTTP request to /api/accounts
[DEBUG] 2025-01-08 15:30:28 - [REQ-def456] Request: GET /api/accounts with headers: {"Authorization": "[SANITIZED]"}
[DEBUG] 2025-01-08 15:30:29 - [REQ-def456] Response: 200 OK, Duration: 234ms
[INFO] 2025-01-08 15:30:29 - [HTTP-MCP-CLIENT] Request completed successfully
```

### ChatBot Logs
```
[INFO] 2025-01-08 15:30:30 - [CHATBOT] Component mounted with initial state
[DEBUG] 2025-01-08 15:30:31 - [CHATBOT] State change detected: isConnected: false -> true
[INFO] 2025-01-08 15:30:32 - [CHATBOT] User action: send_message - Message: "What's my account balance?"
[DEBUG] 2025-01-08 15:30:33 - [CHATBOT] Message sent with ID: msg-789
```

## Security Features

### Data Sanitization
The debug system automatically sanitizes sensitive data:
- **Passwords**: Replaced with `[SANITIZED]`
- **Tokens**: Replaced with `[SANITIZED]`
- **SSN**: Replaced with `[SANITIZED]`
- **Card Numbers**: Replaced with `[SANITIZED]`
- **PII**: Email addresses partially masked

### Safe Logging Practices
- No sensitive data in production logs
- Configurable log levels for different environments
- Request IDs for correlation without exposing user data
- Timing information without revealing system internals

## Request Tracing

### End-to-End Tracing
1. **Request ID**: Unique identifier generated for each request
2. **Client → Server**: Request ID passed in headers
3. **Server Processing**: All operations tagged with request ID
4. **Response**: Request ID included in response headers
5. **Client Handling**: Response processing tracked with same ID

### Example Trace Flow
```
[REQ-abc123] Client: Sending login request
[REQ-abc123] Server: Received login request
[REQ-abc123] Server: Validating credentials
[REQ-abc123] Server: Authentication successful
[REQ-abc123] Server: Sending response
[REQ-abc123] Client: Received response
[REQ-abc123] Client: Processing authentication success
```

## Performance Monitoring

### Timing Measurements
- **Request Duration**: Complete request/response cycle timing
- **Authentication Time**: Auth middleware processing time
- **Database Query Time**: Individual query performance
- **API Proxy Time**: External API call duration

### Performance Logs
```
[PERF] 2025-01-08 15:30:25 - [REQ-abc123] Total request time: 543ms
[PERF] 2025-01-08 15:30:25 - [REQ-abc123] Auth middleware: 45ms
[PERF] 2025-01-08 15:30:25 - [REQ-abc123] Database query: 123ms
[PERF] 2025-01-08 15:30:25 - [REQ-abc123] Response serialization: 15ms
```

## Error Debugging

### Error Context
Debug logging provides rich error context:
- **Stack Traces**: Full error stack with file locations
- **Request Context**: What request caused the error
- **User Context**: Which user experienced the error
- **System State**: Component state when error occurred

### Error Log Example
```
[ERROR] 2025-01-08 15:30:25 - [REQ-abc123] Authentication failed
[ERROR] 2025-01-08 15:30:25 - [REQ-abc123] Error: Invalid credentials
[ERROR] 2025-01-08 15:30:25 - [REQ-abc123] Stack: at validateCredentials (auth.js:45:12)
[ERROR] 2025-01-08 15:30:25 - [REQ-abc123] User: user@example.com
[ERROR] 2025-01-08 15:30:25 - [REQ-abc123] IP: 192.168.1.100
```

## Troubleshooting

### Common Issues

#### Debug Logs Not Appearing
1. Check environment variables are set correctly
2. Verify debug configuration in `debug-config.json`
3. Ensure log level is set to `DEBUG` or lower
4. Check browser console for client-side logs

#### Too Many Logs
1. Increase log level to `INFO` or `WARN`
2. Disable specific component logging in configuration
3. Add endpoint filters to exclude health checks
4. Use production configuration

#### Missing Request Context
1. Verify request ID generation is working
2. Check that request IDs are passed between client and server
3. Ensure debug logger is initialized in all components

### Debug Commands

#### View Live Logs
```bash
# Server logs
tail -f packages/backend/logs/debug.log

# Filter by request ID
grep "REQ-abc123" packages/backend/logs/debug.log

# Show only errors
grep "\[ERROR\]" packages/backend/logs/debug.log
```

#### Performance Analysis
```bash
# Show slow requests (>1000ms)
grep "Duration: [0-9][0-9][0-9][0-9]ms" packages/backend/logs/debug.log

# Authentication performance
grep "Auth middleware" packages/backend/logs/debug.log
```

## Best Practices

### Development
1. **Always use request IDs** for tracing across components
2. **Enable full debug logging** during development
3. **Test with debug disabled** before production deployment
4. **Use performance timing** to identify bottlenecks

### Production
1. **Set log level to INFO or WARN** in production
2. **Disable sensitive data logging** completely
3. **Use centralized logging** for log aggregation
4. **Monitor log volume** to prevent disk space issues

### Debugging Workflow
1. **Enable debug mode** for the specific component
2. **Reproduce the issue** with detailed logging
3. **Follow request IDs** through the system
4. **Analyze timing and state changes**
5. **Identify root cause** using log context
6. **Disable debug mode** after resolution

## Configuration Reference

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `DEBUG` | `false` | Master debug switch |
| `NODE_ENV` | `production` | Node.js environment |
| `MCP_DEBUG` | `false` | MCP server debug logging |
| `NEXT_PUBLIC_DEBUG` | `false` | Client-side debug logging |
| `LOG_LEVEL` | `INFO` | Minimum log level |

### Log Levels
- **DEBUG**: All messages including detailed tracing
- **INFO**: General information and important events
- **WARN**: Warning messages and potential issues
- **ERROR**: Error messages and failures only

### Component Configuration
Each component can be individually configured in `debug-config.json`:
- `enabled`: Enable/disable debug logging
- `logLevel`: Minimum log level for component
- `logRequests`: Log HTTP requests
- `logResponses`: Log HTTP responses
- `sanitizeSensitiveData`: Remove sensitive data from logs

This comprehensive debug tracing system provides excellent visibility into the Enterprise Banking HTTP MCP System, enabling effective debugging, performance monitoring, and troubleshooting across all components.
