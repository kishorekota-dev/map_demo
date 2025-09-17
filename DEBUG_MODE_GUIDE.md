# 🐛 DEBUG MODE OPERATION GUIDE

Complete guide for operating the Enterprise Banking HTTP MCP System in DEBUG mode with comprehensive logging and tracing.

## 🚀 Quick Start

```bash
# Start all services with DEBUG mode enabled
./start-debug.sh

# Check status of debug environment
./status-debug.sh

# Stop all services and cleanup
./stop-debug.sh
```

## 📋 Table of Contents

1. [Debug Mode Overview](#debug-mode-overview)
2. [Quick Start Commands](#quick-start-commands)
3. [Environment Variables](#environment-variables)
4. [Service Architecture](#service-architecture)
5. [Log Management](#log-management)
6. [Testing & Verification](#testing--verification)
7. [Troubleshooting](#troubleshooting)
8. [Advanced Usage](#advanced-usage)

## 🎯 Debug Mode Overview

The debug mode provides comprehensive logging and tracing across the entire HTTP MCP system:

### Key Features
- **🔍 Request/Response Tracing**: Every HTTP request/response logged with unique IDs
- **🔐 Authentication Flow Logging**: Detailed auth process tracking
- **⚡ Performance Monitoring**: Request timing classification and bottleneck detection
- **🛡️ Security Event Detection**: Suspicious activity and security event logging
- **🧹 Sensitive Data Sanitization**: Automatic scrubbing of passwords, tokens, PII
- **📊 Business Operation Tracking**: Account operations, transactions, fraud detection
- **🎯 Request Correlation**: End-to-end request tracking across services
- **📈 Real-time Health Monitoring**: Service health checks and status reporting

### Debug Infrastructure
- **APIDebugLogger**: Comprehensive backend API debug logging system
- **DebugLogger Classes**: Structured logging with timestamp formatting
- **Route-specific Loggers**: Dedicated logging for each API route
- **Middleware Integration**: Debug logging integrated into all middleware layers
- **Environment Controls**: Granular debug control via environment variables

## 🎮 Quick Start Commands

### Essential Commands

```bash
# 🚀 Start debug environment
./start-debug.sh

# 📊 Check comprehensive status
./status-debug.sh

# 🛑 Stop and cleanup
./stop-debug.sh
```

### Testing Commands

```bash
# 🧪 Test debug logging functionality
./test-debug-logging.sh

# 🔍 Test backend API debug features
./test-backend-debug.sh

# 🚀 Run API demo with debug tracing
./test-api-demo.sh
```

### Log Monitoring

```bash
# 📄 View all service logs in real-time
tail -f logs/services/*.log

# 🔍 View specific service logs
tail -f logs/services/backend.log
tail -f logs/services/mcp-server.log
tail -f logs/services/chatbot-ui.log

# 📈 View debug session log
tail -f logs/debug/session-$(date +%Y%m%d)-*.log
```

## 🌍 Environment Variables

### Core Debug Variables

```bash
# Main debug control
DEBUG=true                    # Enable general debug mode
NODE_ENV=development         # Development environment
LOG_LEVEL=DEBUG             # Detailed logging level

# Service-specific debug
MCP_DEBUG=true              # Enable MCP server debug logging
NEXT_PUBLIC_DEBUG=true      # Enable frontend debug logging

# Detailed logging controls
LOG_REQUESTS=true           # Log all HTTP requests
LOG_RESPONSES=true          # Log all HTTP responses
LOG_DATABASE=true           # Log database operations
LOG_PERFORMANCE=true        # Log performance metrics
SANITIZE_LOGS=true          # Enable sensitive data sanitization
```

### Automatic Configuration

The `start-debug.sh` script automatically sets all required environment variables:

```bash
export DEBUG=true
export NODE_ENV=development
export MCP_DEBUG=true
export NEXT_PUBLIC_DEBUG=true
export LOG_LEVEL=DEBUG
export LOG_REQUESTS=true
export LOG_RESPONSES=true
export LOG_DATABASE=true
export LOG_PERFORMANCE=true
export SANITIZE_LOGS=true
```

## 🏗️ Service Architecture

### Services in Debug Mode

| Service | Port | Purpose | Debug Features |
|---------|------|---------|----------------|
| **Backend API** | 3000 | Core banking API | Request tracing, auth logging, performance monitoring |
| **HTTP MCP Server** | 3001 | Model Context Protocol server | Tool execution logging, request correlation |
| **ChatBot UI** | 3002 | React/Next.js frontend | User interaction logging, API call tracing |
| **PostgreSQL** | 5432 | Database (Docker) | Query logging, connection monitoring |
| **Redis** | 6379 | Cache (Docker) | Cache operation logging |

### Debug Endpoints

```bash
# Health and status endpoints
curl http://localhost:3000/api/v1/health    # Backend health with debug info
curl http://localhost:3000/api              # Backend API information
curl http://localhost:3001/health           # MCP server health
curl http://localhost:3001/tools            # Available MCP tools
curl http://localhost:3002                  # ChatBot UI (browser)
```

### Request Flow with Debug Tracing

```
1. ChatBot UI (3002) → HTTP Request with X-Request-ID
2. HTTP MCP Server (3001) → Request correlation and tool routing
3. Backend API (3000) → Business logic with detailed logging
4. Database/Cache → Query execution with performance metrics
5. Response chain with timing and status logging
```

## 📁 Log Management

### Directory Structure

```
logs/
├── debug/           # Debug session logs
│   ├── session-YYYYMMDD-HHMMSS.log    # Session activity
│   ├── session-YYYYMMDD-HHMMSS.info   # Session metadata
│   └── shutdown-YYYYMMDD-HHMMSS.summary # Shutdown summaries
├── services/        # Service-specific logs
│   ├── backend.log      # Backend API logs
│   ├── backend.pid      # Backend process ID
│   ├── mcp-server.log   # MCP server logs
│   ├── mcp-server.pid   # MCP process ID
│   ├── chatbot-ui.log   # Frontend logs
│   └── chatbot-ui.pid   # UI process ID
├── performance/     # Performance metrics
└── security/        # Security events
```

### Log Features

#### Request/Response Logging
```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "requestId": "REQ-1642248645123-abc123",
  "method": "POST",
  "url": "/api/v1/auth/login",
  "headers": { "sanitized": true },
  "body": { "email": "user@example.com", "password": "[REDACTED]" },
  "response": {
    "statusCode": 200,
    "timing": "157ms",
    "classification": "fast"
  }
}
```

#### Authentication Flow Logging
```json
{
  "timestamp": "2024-01-15T10:30:45.234Z",
  "requestId": "REQ-1642248645123-abc123",
  "event": "AUTH_ATTEMPT",
  "email": "user@example.com",
  "ip": "127.0.0.1",
  "userAgent": "Mozilla/5.0...",
  "result": "SUCCESS",
  "timing": "89ms"
}
```

#### Performance Classification
- **🟢 Fast**: ≤ 500ms
- **🟡 Moderate**: 501-1000ms  
- **🟠 Slow**: 1001-2000ms
- **🔴 Very Slow**: > 2000ms

### Log Cleanup

```bash
# Automatic cleanup during shutdown
./stop-debug.sh
# Choose cleanup option:
# 1) Keep recent logs (recommended)
# 2) Clean all logs  
# 3) Keep all logs

# Manual cleanup
rm -rf logs/debug/*     # Clear debug sessions
rm -rf logs/services/*  # Clear service logs
```

## 🧪 Testing & Verification

### Debug Functionality Tests

#### 1. Authentication Flow Test
```bash
# Test successful login with debug tracing
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: TEST-AUTH-001" \
  -d '{"email":"demo@example.com","password":"demo123"}' \
  http://localhost:3000/api/v1/auth/login

# Test failed login (debug security events)
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: TEST-AUTH-FAIL-001" \
  -d '{"email":"bad@example.com","password":"wrongpass"}' \
  http://localhost:3000/api/v1/auth/login
```

#### 2. Account Operations Test
```bash
# Test account listing with performance monitoring
curl -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Request-ID: TEST-ACCOUNTS-001" \
  http://localhost:3000/api/v1/accounts

# Test account creation with validation logging
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Request-ID: TEST-CREATE-ACCOUNT-001" \
  -d '{"name":"Debug Test Account","type":"checking","balance":1000}' \
  http://localhost:3000/api/v1/accounts
```

#### 3. MCP Tool Execution Test
```bash
# Test MCP tools listing
curl -H "X-Request-ID: TEST-MCP-TOOLS-001" \
  http://localhost:3001/tools

# Test MCP health with correlation
curl -H "X-Request-ID: TEST-MCP-HEALTH-001" \
  http://localhost:3001/health
```

### Automated Test Scripts

```bash
# Comprehensive debug logging test
./test-debug-logging.sh

# Backend-specific debug features test  
./test-backend-debug.sh

# API functionality with debug tracing
./test-api-demo.sh
```

### Expected Debug Output

#### Successful Request Log Entry
```
[DEBUG] 2024-01-15 10:30:45 - 🔍 Incoming request: POST /api/v1/auth/login (ID: REQ-1642248645123-abc123)
[DEBUG] 2024-01-15 10:30:45 - 🔐 Auth attempt for: user@example.com (IP: 127.0.0.1)
[DEBUG] 2024-01-15 10:30:45 - 🔍 Password validation: PASSED
[DEBUG] 2024-01-15 10:30:45 - 🎯 JWT generation: SUCCESS (expires: 1h)
[DEBUG] 2024-01-15 10:30:45 - ⚡ Request completed: 157ms (classification: fast)
[DEBUG] 2024-01-15 10:30:45 - 📤 Response: 200 OK (ID: REQ-1642248645123-abc123)
```

#### Failed Request with Security Event
```
[DEBUG] 2024-01-15 10:31:15 - 🔍 Incoming request: POST /api/v1/auth/login (ID: REQ-1642248675456-def456)
[DEBUG] 2024-01-15 10:31:15 - 🔐 Auth attempt for: bad@example.com (IP: 127.0.0.1)
[WARN]  2024-01-15 10:31:15 - 🚨 SECURITY_EVENT: Invalid credentials for bad@example.com
[DEBUG] 2024-01-15 10:31:15 - 🔍 Password validation: FAILED
[DEBUG] 2024-01-15 10:31:15 - ⚡ Request completed: 234ms (classification: fast)
[DEBUG] 2024-01-15 10:31:15 - 📤 Response: 401 Unauthorized (ID: REQ-1642248675456-def456)
```

## 🔧 Troubleshooting

### Common Issues

#### 1. Port Already in Use
```bash
# Problem: Port 3000, 3001, or 3002 is busy
Error: Port 3000 is already in use (required for backend)

# Solution: Stop existing services
./stop-debug.sh
# Or manually kill processes:
lsof -ti:3000 | xargs kill -9
lsof -ti:3001 | xargs kill -9  
lsof -ti:3002 | xargs kill -9
```

#### 2. Docker Services Not Running
```bash
# Problem: PostgreSQL or Redis containers not available
Error: Docker is not running

# Solution: Start Docker and services
docker compose up -d postgres redis
# Or use the debug script which handles this automatically
./start-debug.sh
```

#### 3. Missing Dependencies
```bash
# Problem: node_modules missing or outdated
Error: Cannot find module 'express'

# Solution: Debug script automatically handles this, or manually:
cd packages/backend && npm install
cd packages/chatbot-ui && npm install
```

#### 4. Debug Logs Not Appearing
```bash
# Problem: Debug environment variables not set
# Check current environment:
env | grep -E "(DEBUG|MCP_DEBUG|LOG_)"

# Solution: Use the debug startup script:
./start-debug.sh
# Or manually set variables:
export DEBUG=true
export MCP_DEBUG=true
export LOG_LEVEL=DEBUG
```

#### 5. Health Checks Failing
```bash
# Problem: Services not responding to health checks
# Check service status:
./status-debug.sh

# Check service logs:
tail -f logs/services/backend.log
tail -f logs/services/mcp-server.log
tail -f logs/services/chatbot-ui.log

# Check if processes are running:
ps aux | grep node
lsof -i :3000 -i :3001 -i :3002
```

### Debug Log Analysis

#### Request Correlation Issues
```bash
# Problem: Can't correlate requests across services
# Look for Request ID in logs:
grep "REQ-1642248645123-abc123" logs/services/*.log

# Ensure X-Request-ID headers are being passed:
curl -H "X-Request-ID: TRACE-123" http://localhost:3000/api/v1/health
```

#### Performance Issues
```bash
# Problem: Slow response times
# Check performance logs:
grep "classification.*slow" logs/services/backend.log
grep "timing.*[0-9]{4,}" logs/services/backend.log

# Check system resources:
./status-debug.sh
```

#### Authentication Flow Issues
```bash
# Problem: Login not working in debug mode
# Check auth logs:
grep "AUTH_" logs/services/backend.log
grep "JWT" logs/services/backend.log
grep "password" logs/services/backend.log

# Test with debug tracing:
curl -X POST -H "Content-Type: application/json" \
  -H "X-Request-ID: DEBUG-AUTH-TEST" \
  -d '{"email":"demo@example.com","password":"demo123"}' \
  http://localhost:3000/api/v1/auth/login
```

### Recovery Procedures

#### Complete Reset
```bash
# 1. Stop all services
./stop-debug.sh

# 2. Clean all logs
rm -rf logs/

# 3. Reset Docker services
docker compose down
docker compose up -d postgres redis

# 4. Restart in debug mode
./start-debug.sh
```

#### Selective Service Restart
```bash
# Stop specific service
kill -TERM $(cat logs/services/backend.pid)

# Restart manually with debug
cd packages/backend
DEBUG=true LOG_LEVEL=DEBUG npm run dev &

# Or restart all services
./stop-debug.sh && ./start-debug.sh
```

## 🚀 Advanced Usage

### Custom Debug Sessions

#### Starting with Custom Configuration
```bash
# Set custom debug variables before starting
export LOG_LEVEL=TRACE
export LOG_DATABASE=true
export LOG_PERFORMANCE=true
./start-debug.sh
```

#### Session-Specific Logging
```bash
# Create session-specific log directory
export DEBUG_SESSION_ID="CUSTOM-$(date +%s)"
export DEBUG_LOG_FILE="logs/debug/custom-${DEBUG_SESSION_ID}.log"
./start-debug.sh
```

### Integration with Development Tools

#### VS Code Integration
1. Install REST Client extension
2. Create `.http` files for testing:

```http
### Test Authentication with Debug
POST http://localhost:3000/api/v1/auth/login
Content-Type: application/json
X-Request-ID: VSCODE-AUTH-{{$timestamp}}

{
  "email": "demo@example.com",
  "password": "demo123"
}

### Test Account Listing
GET http://localhost:3000/api/v1/accounts
Authorization: Bearer {{auth_token}}
X-Request-ID: VSCODE-ACCOUNTS-{{$timestamp}}
```

#### Postman Collection
Import the debug-enabled Postman collection with pre-configured:
- Request ID generation
- Debug headers
- Environment variables
- Response testing

### Performance Monitoring

#### Real-time Performance Dashboard
```bash
# Monitor request timing in real-time
tail -f logs/services/backend.log | grep "classification"

# Count requests by performance category
grep -c "classification.*fast" logs/services/backend.log
grep -c "classification.*moderate" logs/services/backend.log
grep -c "classification.*slow" logs/services/backend.log
```

#### Performance Alerts
```bash
# Alert on slow requests (>2000ms)
tail -f logs/services/backend.log | grep "very slow" | while read line; do
  echo "ALERT: Very slow request detected - $line"
  # Add notification logic here
done
```

### Security Monitoring

#### Security Event Dashboard
```bash
# Monitor security events in real-time
tail -f logs/services/backend.log | grep "SECURITY_EVENT"

# Count failed authentication attempts
grep -c "Invalid credentials" logs/services/backend.log

# Monitor suspicious activity
grep -E "(SECURITY_EVENT|Invalid|Failed|Unauthorized)" logs/services/backend.log
```

### Custom Log Filters

#### Service-Specific Filtering
```bash
# Backend API only
tail -f logs/services/backend.log | grep -E "(AUTH_|ACCOUNT_|TRANSACTION_)"

# MCP Server only  
tail -f logs/services/mcp-server.log | grep -E "(TOOL_|MCP_|EXECUTION_)"

# Performance monitoring only
tail -f logs/services/*.log | grep -E "(timing|classification|performance)"
```

#### Request ID Tracking
```bash
# Follow specific request across all services
export REQUEST_ID="REQ-1642248645123-abc123"
grep "$REQUEST_ID" logs/services/*.log | sort
```

## 📚 Additional Resources

### Related Documentation
- [Backend Debug Guide](BACKEND_DEBUG_GUIDE.md) - Detailed backend API debug features
- [General Debug Guide](DEBUG_GUIDE.md) - Overall debug system overview
- [Security Implementation](SECURITY-IMPLEMENTATION.md) - Security logging features

### Script Reference
- `start-debug.sh` - Main debug environment startup
- `stop-debug.sh` - Graceful shutdown with cleanup
- `status-debug.sh` - Comprehensive status checking
- `test-debug-logging.sh` - Debug functionality testing
- `test-backend-debug.sh` - Backend-specific debug testing

### Environment Templates
```bash
# Development with full debugging
DEBUG=true
NODE_ENV=development
MCP_DEBUG=true
NEXT_PUBLIC_DEBUG=true
LOG_LEVEL=DEBUG
LOG_REQUESTS=true
LOG_RESPONSES=true
LOG_DATABASE=true
LOG_PERFORMANCE=true
SANITIZE_LOGS=true

# Production with minimal debugging
DEBUG=false
NODE_ENV=production
LOG_LEVEL=WARN
SANITIZE_LOGS=true
```

---

## 🎯 Summary

The debug mode provides comprehensive visibility into the Enterprise Banking HTTP MCP System through:

✅ **Complete Request Tracing** - Every request tracked from UI to database  
✅ **Performance Monitoring** - Response time classification and bottleneck detection  
✅ **Security Event Logging** - Authentication failures and suspicious activity tracking  
✅ **Sensitive Data Protection** - Automatic sanitization of passwords, tokens, PII  
✅ **Business Operation Insights** - Account management, transactions, fraud detection  
✅ **Real-time Health Monitoring** - Service status and dependency checking  
✅ **Easy Operation** - Simple scripts for start, stop, status, and testing  
✅ **Comprehensive Documentation** - Detailed guides and troubleshooting procedures  

**Start debugging now**: `./start-debug.sh` 🚀
