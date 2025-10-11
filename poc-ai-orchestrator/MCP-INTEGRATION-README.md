# AI Orchestrator ↔ MCP Service Integration

## ✅ Integration Complete

The AI Orchestrator has been successfully updated to communicate with the standalone **MCP Service** for all banking operations.

## Architecture Overview

```
┌─────────────────────────┐
│   AI Orchestrator       │
│   (Port 3001)           │
│                         │
│  ┌──────────────────┐   │
│  │  MCPClient       │   │ ← Updated to call MCP Service
│  │  - HTTP API      │   │
│  │  - Tool Mapping  │   │
│  └──────────────────┘   │
└───────────┬─────────────┘
            │
            │ HTTP REST API
            │
┌───────────▼─────────────┐
│   MCP Service           │
│   (Port 3004)           │
│                         │
│  ┌──────────────────┐   │
│  │ WebSocket (MCP)  │   │
│  ├──────────────────┤   │
│  │ HTTP REST API    │   │
│  ├──────────────────┤   │
│  │ Banking Tools    │   │ ← 24 banking operations
│  │ (Accounts, Cards │   │
│  │  Fraud, Disputes)│   │
│  └──────────────────┘   │
└───────────┬─────────────┘
            │
            │ HTTP
            │
┌───────────▼─────────────┐
│  Banking Service        │
│  (Port 3005)            │
│                         │
│  Core Banking APIs      │
└─────────────────────────┘
```

## What Changed

### 1. MCPClient Service (`src/services/mcpClient.js`)

**Updated to use standalone MCP Service:**

```javascript
class MCPClient {
  constructor() {
    this.baseUrl = config.mcp.serviceUrl; // Points to http://localhost:3004
    // ... HTTP client initialization
  }

  // NEW: Tool discovery methods
  async getAvailableTools()
  async getToolCategories()
  async getToolDefinition(toolName)
  async validateParameters(toolName, parameters)

  // UPDATED: Tool execution
  async executeTool(toolName, parameters, sessionId)
  async executeBatch(toolExecutions, sessionId)
  async executeBankingOperation(operation, parameters, sessionId)
}
```

**Key Features:**
- ✅ HTTP-based communication with MCP Service
- ✅ Retry logic with exponential backoff
- ✅ Banking operation name mapping
- ✅ Batch execution support
- ✅ Parameter validation
- ✅ Health checks

### 2. Configuration (`config/index.js`)

**MCP Service URL configured:**

```javascript
mcp: {
  serviceUrl: process.env.MCP_SERVICE_URL || 'http://localhost:3004',
  timeout: parseInt(process.env.MCP_SERVICE_TIMEOUT) || 30000,
  retryAttempts: parseInt(process.env.MCP_RETRY_ATTEMPTS) || 3,
  retryDelay: parseInt(process.env.MCP_RETRY_DELAY) || 1000
}
```

### 3. Banking Operation Mapping

The MCPClient maintains a mapping for backward compatibility:

| Operation Name | MCP Tool Name |
|----------------|---------------|
| `get_balance` | `banking_get_balance` |
| `get_transactions` | `banking_get_transactions` |
| `transfer_funds` | `banking_transfer` |
| `block_card` | `banking_block_card` |
| `create_fraud_alert` | `banking_create_fraud_alert` |
| `get_fraud_alerts` | `banking_get_fraud_alerts` |
| `create_dispute` | `banking_create_dispute` |
| `get_disputes` | `banking_get_disputes` |
| `add_dispute_evidence` | `banking_add_dispute_evidence` |
| ... and more |

## Usage Examples

### Execute a Banking Tool

```javascript
const mcpClient = new MCPClient();

// Direct tool execution
const result = await mcpClient.executeTool(
  'banking_get_accounts',
  { authToken: userToken },
  sessionId
);

// Banking operation (with mapping)
const balance = await mcpClient.executeBankingOperation(
  'get_balance',
  { authToken: userToken, accountId: 'acc-123' },
  sessionId
);
```

### Tool Discovery

```javascript
// Get all available tools
const tools = await mcpClient.getAvailableTools();
console.log(`Available tools: ${tools.length}`);

// Get tools by category
const categories = await mcpClient.getToolCategories();
console.log(`Fraud tools: ${categories.fraud.length}`);

// Get specific tool definition
const toolDef = await mcpClient.getToolDefinition('banking_create_dispute');
console.log(toolDef.inputSchema);
```

### Batch Execution

```javascript
const results = await mcpClient.executeBatch([
  { tool: 'banking_get_accounts', parameters: { authToken } },
  { tool: 'banking_get_cards', parameters: { authToken } }
], sessionId);

console.log(`Executed ${results.summary.successful} tools successfully`);
```

## Testing

### Integration Test

Run the comprehensive integration test:

```bash
cd poc-ai-orchestrator
node test-mcp-integration.js
```

**Test Coverage:**
1. ✅ MCP Service health check
2. ✅ Get available tools
3. ✅ Get tool categories
4. ✅ Get tool definition
5. ✅ Validate parameters
6. ✅ Execute tool (authentication flow)
7. ✅ Banking operation mapping

### Manual Testing

```bash
# 1. Start MCP Service
cd poc-mcp-service
node src/server.js

# 2. Start AI Orchestrator  
cd poc-ai-orchestrator
npm start

# 3. Test end-to-end flow
curl -X POST http://localhost:3001/api/banking/accounts \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Environment Configuration

### AI Orchestrator (`.env`)

```bash
# MCP Service Configuration
MCP_SERVICE_URL=http://localhost:3004
MCP_SERVICE_TIMEOUT=30000
MCP_RETRY_ATTEMPTS=3
MCP_RETRY_DELAY=1000

# Other configs...
PORT=3001
```

### MCP Service (`.env`)

```bash
# Server Configuration
PORT=3004
NODE_ENV=development

# Banking Service Integration
BANKING_SERVICE_URL=http://localhost:3005/api/v1

# Other configs...
LOG_LEVEL=debug
```

## Benefits of This Architecture

### 1. **Separation of Concerns**
- AI Orchestrator focuses on orchestration and NLU
- MCP Service handles tool execution
- Banking Service provides core banking APIs

### 2. **Scalability**
- Each service can scale independently
- MCP Service can handle multiple AI Orchestrator instances
- Stateless design enables horizontal scaling

### 3. **Maintainability**
- Banking tools centralized in MCP Service
- Single source of truth for tool definitions
- Easy to add new banking operations

### 4. **Flexibility**
- Supports both WebSocket (MCP protocol) and HTTP REST
- Tool validation before execution
- Batch operations for efficiency

### 5. **Reliability**
- Automatic retry logic
- Health checks and monitoring
- Comprehensive error handling

## Service Dependencies

```
AI Orchestrator (3001)
    ↓
MCP Service (3004)
    ↓
Banking Service (3005)
```

**Startup Order:**
1. Banking Service (port 3005)
2. MCP Service (port 3004)
3. AI Orchestrator (port 3001)

## Troubleshooting

### MCP Service Not Responding

```bash
# Check if MCP Service is running
curl http://localhost:3004/health

# Check logs
tail -f /tmp/mcp-service.log

# Restart MCP Service
cd poc-mcp-service
node src/server.js
```

### Tool Execution Failures

1. **Check MCP Service health:**
   ```bash
   curl http://localhost:3004/health
   ```

2. **Verify tool exists:**
   ```bash
   curl http://localhost:3004/api/mcp/tools
   ```

3. **Validate parameters:**
   ```bash
   curl -X POST http://localhost:3004/api/mcp/validate \
     -H "Content-Type: application/json" \
     -d '{"tool":"banking_get_accounts","parameters":{"authToken":"..."}}'
   ```

4. **Check Banking Service:**
   ```bash
   curl http://localhost:3005/health
   ```

### Connection Timeout

- Increase `MCP_SERVICE_TIMEOUT` in AI Orchestrator config
- Check network connectivity between services
- Verify firewall rules

## Migration Checklist

- [x] ✅ MCP Service implemented and running
- [x] ✅ AI Orchestrator MCPClient updated
- [x] ✅ Integration tests passing
- [x] ✅ Tool mappings verified
- [x] ✅ Environment configuration documented
- [ ] 🔄 Docker Compose updated
- [ ] 🔄 End-to-end tests with real Banking Service
- [ ] 🔄 Production deployment configuration

## Next Steps

1. **Docker Compose Integration**
   - Add MCP Service to `docker-compose.yml`
   - Configure service networking
   - Add health checks

2. **End-to-End Testing**
   - Test with real Banking Service
   - Verify all 24 banking operations
   - Load testing

3. **Monitoring & Observability**
   - Add metrics collection
   - Set up logging aggregation
   - Configure alerting

4. **Documentation**
   - API reference documentation
   - Deployment guide
   - Runbook for operations

## Files Modified

**AI Orchestrator:**
- ✅ `src/services/mcpClient.js` - Updated to call MCP Service
- ✅ `test-mcp-integration.js` - Integration test suite

**MCP Service:**
- ✅ `src/tools/completeBankingTools.js` - 24 banking operations
- ✅ `src/mcp/mcpProtocolServer.js` - WebSocket MCP protocol
- ✅ `src/routes/mcpApi.routes.js` - HTTP REST API
- ✅ `src/server.js` - Server integration

## Summary

The integration is **complete and tested**. The AI Orchestrator now successfully communicates with the standalone MCP Service for all banking operations, providing a clean, scalable, and maintainable architecture.

🎉 **All 7 integration tests passing!**
