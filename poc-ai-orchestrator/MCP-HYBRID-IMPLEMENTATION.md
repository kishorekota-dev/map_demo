# MCP Hybrid Implementation Guide

## Overview

The AI Orchestrator now supports **both** the official Model Context Protocol (MCP) via Server-Sent Events (SSE) and the legacy HTTP-based API, providing:

- ✅ **True MCP Protocol** - Industry-standard implementation using `@modelcontextprotocol/sdk`
- ✅ **Automatic Tool Discovery** - No manual configuration required
- ✅ **HTTP Fallback** - Seamless fallback to HTTP API for backward compatibility
- ✅ **Best of Both Worlds** - New features with zero breaking changes

## Architecture

### Hybrid Approach (Option 2 - Implemented)

```
┌─────────────────────────────────────────────────────────────┐
│                 AI Orchestrator (Client)                    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │        Enhanced MCP Client (Hybrid)                 │  │
│  │                                                     │  │
│  │  ┌──────────────────┐    ┌──────────────────────┐ │  │
│  │  │ True MCP Client  │    │  HTTP MCP Client     │ │  │
│  │  │  (MCP SDK/SSE)   │    │   (axios/REST)       │ │  │
│  │  │                  │    │                      │ │  │
│  │  │ • Tool Discovery │    │ • Direct API Calls   │ │  │
│  │  │ • Resources      │    │ • Manual Tools       │ │  │
│  │  │ • Prompts        │    │ • Simple Protocol    │ │  │
│  │  │ • Streaming      │    │ • Proven Reliability │ │  │
│  │  └────────┬─────────┘    └──────────┬───────────┘ │  │
│  │           │                          │             │  │
│  │           │    ┌──────────────────┐  │             │  │
│  │           └────▶ Intelligent      ◀──┘             │  │
│  │                │ Router/Fallback  │                │  │
│  │                └──────────────────┘                │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────┬────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              MCP Service (Server)                           │
│                                                             │
│  ┌─────────────────┐         ┌─────────────────────────┐  │
│  │ MCP Protocol    │         │   HTTP REST API         │  │
│  │   (SSE)         │         │   (Express Routes)      │  │
│  │                 │         │                         │  │
│  │ • GET /mcp/sse  │         │ • POST /api/mcp/tools   │  │
│  │ • Persistent    │         │ • Simple Request/Reply  │  │
│  │ • Streaming     │         │ • Stateless             │  │
│  └────────┬────────┘         └──────────┬──────────────┘  │
│           │                             │                  │
│           └────────────┬────────────────┘                  │
│                        ▼                                    │
│            ┌──────────────────────┐                        │
│            │   Banking Tools      │                        │
│            │   (6 tools with      │                        │
│            │    JSON schemas)     │                        │
│            └──────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Enhanced MCP Client (`src/services/enhancedMCPClient.js`)

The hybrid client that provides intelligent routing between MCP Protocol and HTTP API.

**Features:**
- Tries MCP Protocol (SSE) first
- Falls back to HTTP automatically on failure
- Unified interface for both protocols
- Statistics tracking for monitoring
- Health checks for both transports

**Configuration:**
```javascript
{
  preferMCPProtocol: true,  // Try MCP first (default: true)
  enableFallback: true,     // Enable HTTP fallback (default: true)
}
```

### 2. True MCP Client (`src/services/trueMCPClient.js`)

Official MCP SDK implementation using Server-Sent Events (SSE).

**Features:**
- SSE transport for persistent connection
- Automatic tool discovery
- Resource access (beyond tools)
- Prompt management
- Auto-reconnection logic
- Standard MCP protocol compliance

**Key Methods:**
```javascript
await client.connect()                          // Connect to MCP server
const tools = await client.listTools()          // Discover available tools
const result = await client.callTool({name, arguments})  // Execute tool
const resources = await client.listResources()  // List resources
const prompts = await client.listPrompts()      // List prompts
```

### 3. MCP Protocol Server (`poc-mcp-service/src/mcp/mcpServer.js`)

Official MCP server implementation using `@modelcontextprotocol/sdk`.

**Features:**
- SSE endpoint at `/mcp/sse`
- Tool discovery support
- Resource access
- Prompt management
- Multiple concurrent connections
- Connection tracking

**Endpoints:**
- `GET /mcp/sse` - MCP Protocol endpoint (SSE)
- `GET /mcp/status` - Server status and capabilities
- `POST /api/mcp/tools/execute` - HTTP API (fallback)

### 4. Banking Tools (`poc-mcp-service/src/mcp/tools/bankingTools.js`)

Tool implementations with JSON Schema definitions.

**Available Tools:**
1. `get_account_balance` - Get account balance
2. `get_transactions` - Get transaction history
3. `transfer_funds` - Transfer money between accounts
4. `manage_card` - Manage card services
5. `dispute_transaction` - File transaction dispute
6. `get_account_info` - Get detailed account info

## Configuration

### Environment Variables

Add to `poc-ai-orchestrator/.env`:

```bash
# MCP Protocol Configuration
MCP_SSE_URL=http://localhost:3004/mcp/sse
MCP_PREFER_PROTOCOL=true
MCP_ENABLE_FALLBACK=true

# Legacy HTTP API (fallback)
MCP_SERVICE_URL=http://localhost:3004
MCP_TIMEOUT=30000
MCP_MAX_RETRIES=3
```

### Config File

Updated `poc-ai-orchestrator/config/index.js`:

```javascript
mcp: {
  // True MCP Protocol (SSE-based)
  sseUrl: process.env.MCP_SSE_URL || 'http://localhost:3004/mcp/sse',
  preferProtocol: process.env.MCP_PREFER_PROTOCOL !== 'false',
  enableFallback: process.env.MCP_ENABLE_FALLBACK !== 'false',
  
  // HTTP-based MCP (legacy/fallback)
  serviceUrl: process.env.MCP_SERVICE_URL || 'http://localhost:3004',
  timeout: 30000,
  retryAttempts: 3
}
```

## Usage

### Starting the Services

```bash
# Terminal 1: Start MCP Service
cd poc-mcp-service
npm start

# Terminal 2: Start AI Orchestrator
cd poc-ai-orchestrator
npm start

# Terminal 3: Start Chat Backend (optional)
cd poc-chat-backend
npm start
```

### Testing the Implementation

Run the comprehensive test suite:

```bash
cd poc-ai-orchestrator
./test-mcp-hybrid.sh
```

This tests:
- ✅ Health checks for both services
- ✅ MCP Protocol status
- ✅ Tool discovery
- ✅ Tool execution (both protocols)
- ✅ Workflow execution
- ✅ Hybrid fallback behavior

### Manual Testing

**1. Check MCP Protocol Status:**
```bash
curl http://localhost:3004/mcp/status
```

**2. Test Tool Execution (HTTP API):**
```bash
curl -X POST http://localhost:3004/api/mcp/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "get_account_balance",
    "params": {
      "accountId": "ACC001",
      "sessionId": "test123"
    }
  }'
```

**3. Test AI Orchestrator Workflow:**
```bash
curl -X POST http://localhost:3007/api/orchestrator/process \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session123",
    "userId": "user001",
    "intent": "account_balance",
    "question": "What is my account balance?",
    "metadata": {}
  }'
```

## Migration Path

### For Existing Deployments

The hybrid implementation is **100% backward compatible**:

1. **No Changes Required** - Existing HTTP API continues to work
2. **Gradual Migration** - MCP Protocol tries first, falls back to HTTP
3. **Zero Downtime** - Deploy without service interruption
4. **Feature Flags** - Control MCP Protocol usage via environment variables

### Enabling MCP Protocol Only

To disable HTTP fallback (once MCP is stable):

```bash
MCP_PREFER_PROTOCOL=true
MCP_ENABLE_FALLBACK=false
```

### Disabling MCP Protocol (HTTP Only)

To use only HTTP API:

```bash
MCP_PREFER_PROTOCOL=false
```

## Benefits of True MCP Protocol

### 1. Automatic Tool Discovery
❌ **Before:** Manual tool configuration in `intentPrompts.js`
```javascript
tools: ['get_account_balance', 'get_transactions']  // Hard-coded
```

✅ **After:** Automatic discovery from server
```javascript
const tools = await client.listTools();  // Auto-discovered with schemas
```

### 2. Resource Access
Access banking data beyond tools:
```javascript
const resources = await client.listResources();
// Returns: banking://accounts, banking://transactions, banking://cards

const data = await client.readResource({ uri: 'banking://accounts' });
```

### 3. Prompt Management
Server-managed prompts:
```javascript
const prompts = await client.listPrompts();
const prompt = await client.getPrompt({
  name: 'account_balance_prompt',
  arguments: { accountId: 'ACC001' }
});
```

### 4. Streaming Support
Real-time responses (future enhancement):
```javascript
const stream = await client.callToolStreaming({ name, arguments });
for await (const chunk of stream) {
  console.log(chunk);
}
```

### 5. Claude Desktop Integration
Compatible with Claude Desktop MCP configuration:
```json
{
  "mcpServers": {
    "banking": {
      "command": "node",
      "args": ["path/to/mcp-service/src/server.js"],
      "env": {
        "PORT": "3004"
      }
    }
  }
}
```

## Monitoring and Statistics

### Get Client Statistics

```javascript
const stats = workflowService.workflow.getClientStats();
console.log(stats);
```

**Output:**
```json
{
  "mcpSuccess": 150,
  "mcpFailure": 5,
  "httpSuccess": 45,
  "httpFailure": 0,
  "fallbackUsed": 5,
  "total": 200,
  "mcpSuccessRate": "75.00%",
  "httpSuccessRate": "22.50%",
  "fallbackRate": "2.50%"
}
```

### Health Check

```javascript
const health = await mcpClient.healthCheck();
console.log(health);
```

**Output:**
```json
{
  "mcpProtocol": {
    "enabled": true,
    "connected": true,
    "healthy": true
  },
  "httpMcp": {
    "enabled": true,
    "healthy": true
  },
  "fallbackEnabled": true,
  "overall": "healthy",
  "stats": { ... }
}
```

## Troubleshooting

### MCP Protocol Connection Issues

**Problem:** MCP Protocol fails to connect

**Solutions:**
1. Check MCP service is running: `curl http://localhost:3004/mcp/status`
2. Verify SSE URL in config: `MCP_SSE_URL`
3. Check logs: `tail -f poc-ai-orchestrator/logs/app.log`
4. Fallback to HTTP should be automatic

### Tool Execution Failures

**Problem:** Tools fail to execute

**Check:**
1. Tool name is correct: `await client.listTools()`
2. Parameters match schema
3. MCP service has tool registered
4. Review error logs

### HTTP Fallback Not Working

**Problem:** Fallback doesn't activate

**Verify:**
1. `MCP_ENABLE_FALLBACK=true` in `.env`
2. HTTP endpoint is accessible: `curl http://localhost:3004/health`
3. Check EnhancedMCPClient logs

## Performance Considerations

### Connection Persistence

MCP Protocol maintains persistent SSE connection:
- **Advantage:** Lower latency, no reconnection overhead
- **Trade-off:** One more persistent connection per client

### Tool Discovery Caching

Cache discovered tools to avoid repeated calls:
```javascript
// Cache tools for 5 minutes
let cachedTools = null;
let cacheExpiry = null;

async function getTools() {
  if (cachedTools && Date.now() < cacheExpiry) {
    return cachedTools;
  }
  
  cachedTools = await client.listTools();
  cacheExpiry = Date.now() + (5 * 60 * 1000);
  return cachedTools;
}
```

## Best Practices

### 1. Use Tool Discovery
Let MCP Protocol discover tools automatically rather than hard-coding.

### 2. Handle Fallback Gracefully
Log when fallback occurs for monitoring:
```javascript
if (this.preferMCPProtocol && this.stats.fallbackUsed > 0) {
  logger.warn('MCP Protocol fallback occurred', {
    fallbackRate: this.stats.fallbackRate
  });
}
```

### 3. Monitor Protocol Health
Regularly check client health and switch protocols if needed.

### 4. Test Both Protocols
Ensure both MCP and HTTP work independently.

### 5. Gradual Rollout
Start with `preferMCPProtocol=true` and `enableFallback=true`, then disable fallback once stable.

## Next Steps

### Future Enhancements

1. **Streaming Support** - Real-time streaming responses
2. **Claude Desktop Integration** - Full integration with Claude Desktop
3. **Enhanced Resources** - More resource types beyond tools
4. **Prompt Library** - Server-managed prompt templates
5. **Multi-Server Support** - Connect to multiple MCP servers
6. **Caching Layer** - Redis caching for tool results
7. **Load Balancing** - Multiple MCP server instances

### Production Readiness

- ✅ Error handling and logging
- ✅ Automatic reconnection
- ✅ Health checks
- ✅ Statistics and monitoring
- ⏳ Load testing
- ⏳ Production deployment guide
- ⏳ Kubernetes configuration
- ⏳ Monitoring dashboards

## References

- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [Server-Sent Events (SSE) Spec](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)

## Support

For issues or questions:
1. Check logs in `poc-ai-orchestrator/logs/`
2. Run test suite: `./test-mcp-hybrid.sh`
3. Review this guide and architecture diagrams
4. Check MCP Protocol status: `http://localhost:3004/mcp/status`

---

**Implementation Status:** ✅ Complete
**Version:** 1.0.0
**Date:** January 2024
**Protocol:** MCP v1.0 (SSE) + HTTP Fallback
