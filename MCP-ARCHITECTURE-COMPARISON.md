# MCP Integration Architecture Comparison

## Current Architecture (HTTP-based MCP)

```
┌─────────────────────────────────────────────────────────────────────┐
│                  AI ORCHESTRATOR (Port 3007)                         │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │              LangGraph Workflow Engine                     │    │
│  │                                                             │    │
│  │  ┌──────────────────────────────────────────────────┐     │    │
│  │  │  Node: executeTools()                            │     │    │
│  │  │                                                   │     │    │
│  │  │  const tools = getToolsForIntent(intent)         │     │    │
│  │  │  for (tool of tools) {                           │     │    │
│  │  │    result = await mcpClient                      │     │    │
│  │  │              .executeToolWithRetry(tool, params) │     │    │
│  │  │  }                                                │     │    │
│  │  └──────────────────────┬───────────────────────────┘     │    │
│  └─────────────────────────┼─────────────────────────────────┘    │
│                            │                                       │
│  ┌─────────────────────────▼─────────────────────────────────┐    │
│  │        Custom HTTP MCP Client                             │    │
│  │                                                            │    │
│  │  class MCPClient {                                        │    │
│  │    async executeTool(tool, params) {                     │    │
│  │      return await axios.post(                            │    │
│  │        'http://localhost:3004/api/mcp/execute',          │    │
│  │        { tool, parameters: params }                      │    │
│  │      );                                                   │    │
│  │    }                                                      │    │
│  │  }                                                        │    │
│  │                                                            │    │
│  │  ❌ No tool discovery                                     │    │
│  │  ❌ No streaming                                          │    │
│  │  ❌ Custom error handling                                 │    │
│  │  ❌ Manual retry logic                                    │    │
│  └────────────────────────┬───────────────────────────────────┘    │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
                              │ HTTP POST
                              │ Custom JSON Format
                              │ {
                              │   "tool": "get_balance",
                              │   "parameters": {...}
                              │ }
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   MCP SERVICE (Port 3004)                            │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │            Custom REST API Layer                           │    │
│  │                                                             │    │
│  │  POST /api/mcp/execute                                     │    │
│  │  {                                                          │    │
│  │    if (tool === 'get_balance') {                           │    │
│  │      return bankingService.getBalance(params);             │    │
│  │    }                                                        │    │
│  │    if (tool === 'transfer') {                              │    │
│  │      return bankingService.transfer(params);               │    │
│  │    }                                                        │    │
│  │  }                                                          │    │
│  │                                                             │    │
│  │  ❌ Not MCP protocol compliant                             │    │
│  │  ❌ No standard tool registration                          │    │
│  │  ❌ No JSON schemas                                        │    │
│  └────────────────────────┬───────────────────────────────────┘    │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
                              ▼
                    Banking Service (3005)
```

**Characteristics:**
- ✅ **Works** - Functional implementation
- ✅ **Simple** - Easy to understand
- ✅ **Testable** - Can use curl/Postman
- ❌ **Not Standard** - Custom protocol
- ❌ **Limited** - No discovery, streaming, resources
- ❌ **Manual** - All configuration hardcoded

---

## Proposed Architecture (True MCP Protocol)

```
┌─────────────────────────────────────────────────────────────────────┐
│                  AI ORCHESTRATOR (Port 3007)                         │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │              LangGraph Workflow Engine                     │    │
│  │                                                             │    │
│  │  ┌──────────────────────────────────────────────────┐     │    │
│  │  │  Node: executeTools()                            │     │    │
│  │  │                                                   │     │    │
│  │  │  // Discover tools dynamically                   │     │    │
│  │  │  const tools = await mcpClient.listTools()       │     │    │
│  │  │  const relevant = selectForIntent(tools, intent) │     │    │
│  │  │                                                   │     │    │
│  │  │  for (tool of relevant) {                        │     │    │
│  │  │    result = await mcpClient.callTool({           │     │    │
│  │  │      name: tool.name,                            │     │    │
│  │  │      arguments: params                           │     │    │
│  │  │    })                                             │     │    │
│  │  │  }                                                │     │    │
│  │  └──────────────────────┬───────────────────────────┘     │    │
│  └─────────────────────────┼─────────────────────────────────┘    │
│                            │                                       │
│  ┌─────────────────────────▼─────────────────────────────────┐    │
│  │    MCP SDK Client (@modelcontextprotocol/sdk)             │    │
│  │                                                            │    │
│  │  const { Client } = require('@mcp/sdk/client');          │    │
│  │  const { SSETransport } = require('@mcp/sdk/sse');       │    │
│  │                                                            │    │
│  │  class TrueMCPClient {                                    │    │
│  │    async connect() {                                      │    │
│  │      this.client = new Client(...);                       │    │
│  │      const transport = new SSETransport(                  │    │
│  │        new URL('http://localhost:3004/sse')               │    │
│  │      );                                                    │    │
│  │      await this.client.connect(transport);                │    │
│  │    }                                                       │    │
│  │                                                            │    │
│  │    async listTools() {                                    │    │
│  │      return await this.client.listTools();                │    │
│  │    }                                                       │    │
│  │                                                            │    │
│  │    async callTool({ name, arguments }) {                  │    │
│  │      return await this.client.callTool({                  │    │
│  │        name, arguments                                    │    │
│  │      });                                                   │    │
│  │    }                                                       │    │
│  │  }                                                         │    │
│  │                                                            │    │
│  │  ✅ Automatic tool discovery                              │    │
│  │  ✅ Streaming support                                     │    │
│  │  ✅ Standard error handling                               │    │
│  │  ✅ Built-in retry logic                                  │    │
│  │  ✅ Resource access                                       │    │
│  │  ✅ Prompt management                                     │    │
│  └────────────────────────┬───────────────────────────────────┘    │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
                              │ MCP Protocol (SSE or stdio)
                              │ Standard JSON-RPC 2.0 Messages:
                              │
                              │ → tools/list
                              │ ← [{name, description, schema}]
                              │
                              │ → tools/call {name, arguments}
                              │ ← {content: [...], isError: false}
                              │
                              │ → resources/read {uri}
                              │ ← {contents: [...]}
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│           MCP SERVER - Banking Tools (Port 3004)                     │
│           (@modelcontextprotocol/sdk)                               │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │        MCP Server with Standard Protocol                   │    │
│  │                                                             │    │
│  │  const { Server } = require('@mcp/sdk/server');           │    │
│  │  const { SSEServerTransport } = require('@mcp/sdk/sse');  │    │
│  │                                                             │    │
│  │  const server = new Server({                               │    │
│  │    name: 'banking-tools',                                  │    │
│  │    version: '1.0.0'                                        │    │
│  │  }, {                                                       │    │
│  │    capabilities: {                                         │    │
│  │      tools: {},                                            │    │
│  │      resources: {},                                        │    │
│  │      prompts: {}                                           │    │
│  │    }                                                        │    │
│  │  });                                                        │    │
│  │                                                             │    │
│  │  // Register tools with JSON schemas                       │    │
│  │  server.setRequestHandler(                                 │    │
│  │    ListToolsRequestSchema,                                 │    │
│  │    async () => ({                                          │    │
│  │      tools: [                                              │    │
│  │        {                                                    │    │
│  │          name: 'get_account_balance',                      │    │
│  │          description: 'Get balance for account',           │    │
│  │          inputSchema: {                                    │    │
│  │            type: 'object',                                 │    │
│  │            properties: {                                   │    │
│  │              accountId: {                                  │    │
│  │                type: 'string',                             │    │
│  │                description: 'Account ID'                   │    │
│  │              }                                              │    │
│  │            },                                               │    │
│  │            required: ['accountId']                         │    │
│  │          }                                                  │    │
│  │        }                                                    │    │
│  │      ]                                                      │    │
│  │    })                                                       │    │
│  │  );                                                         │    │
│  │                                                             │    │
│  │  // Handle tool calls                                      │    │
│  │  server.setRequestHandler(                                 │    │
│  │    CallToolRequestSchema,                                  │    │
│  │    async (request) => {                                    │    │
│  │      if (request.params.name === 'get_account_balance') { │    │
│  │        const balance = await bankingService                │    │
│  │          .getBalance(request.params.arguments);            │    │
│  │        return {                                             │    │
│  │          content: [{                                       │    │
│  │            type: 'text',                                   │    │
│  │            text: JSON.stringify(balance)                   │    │
│  │          }]                                                 │    │
│  │        };                                                   │    │
│  │      }                                                      │    │
│  │    }                                                        │    │
│  │  );                                                         │    │
│  │                                                             │    │
│  │  // Register resources                                     │    │
│  │  server.setRequestHandler(                                 │    │
│  │    ListResourcesRequestSchema,                             │    │
│  │    async () => ({                                          │    │
│  │      resources: [                                          │    │
│  │        {                                                    │    │
│  │          uri: 'accounts://user/{userId}/accounts',         │    │
│  │          name: 'User Accounts',                            │    │
│  │          mimeType: 'application/json'                      │    │
│  │        }                                                    │    │
│  │      ]                                                      │    │
│  │    })                                                       │    │
│  │  );                                                         │    │
│  │                                                             │    │
│  │  ✅ MCP protocol compliant                                 │    │
│  │  ✅ Standard tool registration with JSON schemas           │    │
│  │  ✅ Resource endpoints (accounts, transactions)            │    │
│  │  ✅ Prompt templates                                       │    │
│  │  ✅ Works with Claude Desktop                              │    │
│  └────────────────────────┬───────────────────────────────────┘    │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
                              ▼
                    Banking Service (3005)
```

**Characteristics:**
- ✅ **Standard** - Official MCP protocol
- ✅ **Discoverable** - Tools automatically discovered
- ✅ **Type-Safe** - JSON Schema validation
- ✅ **Streaming** - Built-in support
- ✅ **Resources** - Beyond just tools
- ✅ **Claude Desktop** - Direct integration
- ✅ **Future-Proof** - Industry standard

---

## Side-by-Side Comparison

### Tool Execution Flow

#### Current (HTTP)
```
1. Orchestrator calls: mcpClient.executeTool('get_balance', {accountId: '123'})
2. HTTP Client sends: POST /api/mcp/execute
   Body: { tool: 'get_balance', parameters: {accountId: '123'} }
3. MCP Service receives POST request
4. Service routes to: toolRegistry['get_balance'](parameters)
5. Tool executes and returns result
6. Service responds with: {success: true, data: {...}}
7. HTTP Client returns response
8. Orchestrator receives result
```

#### Proposed (MCP Protocol)
```
1. Orchestrator calls: mcpClient.callTool({name: 'get_balance', arguments: {accountId: '123'}})
2. MCP SDK sends JSON-RPC message over SSE:
   {
     jsonrpc: '2.0',
     method: 'tools/call',
     params: {
       name: 'get_balance',
       arguments: {accountId: '123'}
     },
     id: 1
   }
3. MCP Server receives and validates against JSON schema
4. Server handler executes: CallToolRequestHandler
5. Tool executes with validated input
6. Server responds with MCP format:
   {
     jsonrpc: '2.0',
     result: {
       content: [{type: 'text', text: '...'}],
       isError: false
     },
     id: 1
   }
7. MCP SDK parses response
8. Orchestrator receives structured result
```

---

## Tool Discovery Example

### Current (Manual Configuration)

**intentPrompts.js:**
```javascript
export const INTENT_PROMPTS = {
  balance_inquiry: {
    tools: ['get_account_balance'],  // ❌ Hardcoded
    requiredData: ['account_id']      // ❌ Manual
  },
  transfer_funds: {
    tools: ['transfer_funds'],        // ❌ Hardcoded
    requiredData: ['from_account', 'to_account', 'amount']  // ❌ Manual
  }
};
```

**Problem:** If MCP Service adds a new tool, you must manually update this file.

### Proposed (Dynamic Discovery)

**Automatic discovery at runtime:**
```javascript
// At startup or periodically
const availableTools = await mcpClient.listTools();

// Returns:
[
  {
    name: 'get_account_balance',
    description: 'Retrieves the current balance for a specified account',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: {
          type: 'string',
          description: 'The unique identifier for the account'
        }
      },
      required: ['accountId']
    }
  },
  {
    name: 'transfer_funds',
    description: 'Transfers funds between two accounts',
    inputSchema: {
      type: 'object',
      properties: {
        fromAccount: { type: 'string' },
        toAccount: { type: 'string' },
        amount: { type: 'number' }
      },
      required: ['fromAccount', 'toAccount', 'amount']
    }
  },
  // NEW TOOL automatically available!
  {
    name: 'get_spending_analysis',
    description: 'Analyzes spending patterns',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string' },
        period: { type: 'string', enum: ['month', 'quarter', 'year'] }
      },
      required: ['accountId', 'period']
    }
  }
]

// Now workflow can dynamically use tools
async function executeTools(state) {
  const allTools = await mcpClient.listTools();
  
  // AI can help select relevant tools
  const relevantTools = await this.llm.invoke([
    new SystemMessage('Select tools needed for: ' + state.intent),
    new HumanMessage(JSON.stringify(allTools))
  ]);
  
  for (const tool of relevantTools) {
    await mcpClient.callTool({
      name: tool.name,
      arguments: extractArgs(state, tool.inputSchema)
    });
  }
}
```

**Benefit:** New tools automatically available without code changes!

---

## Resource Access Example

### Current (Not Available)
```javascript
// ❌ Can't access resources, only execute tools
```

### Proposed (MCP Resources)

```javascript
// List available resources
const resources = await mcpClient.listResources();
// Returns:
// [
//   {
//     uri: 'accounts://user/{userId}/accounts',
//     name: 'User Accounts',
//     description: 'List of user accounts',
//     mimeType: 'application/json'
//   },
//   {
//     uri: 'transactions://account/{accountId}/transactions',
//     name: 'Account Transactions',
//     mimeType: 'application/json'
//   }
// ]

// Read a resource
const accounts = await mcpClient.readResource({
  uri: 'accounts://user/123/accounts'
});
// Returns account data that can be used as context for LLM

// Example in workflow:
async function generateResponse(state) {
  // Get account data as resource
  const accountData = await mcpClient.readResource({
    uri: `accounts://user/${state.userId}/accounts`
  });
  
  // Use as context for LLM
  const response = await this.llm.invoke([
    new SystemMessage('You are a banking assistant with access to:'),
    new SystemMessage(JSON.stringify(accountData)),
    new HumanMessage(state.question)
  ]);
  
  return { ...state, finalResponse: response };
}
```

---

## Claude Desktop Integration

### Current (Not Possible)
```
❌ Cannot use custom HTTP API with Claude Desktop
```

### Proposed (Works with Claude Desktop!)

**claude_desktop_config.json:**
```json
{
  "mcpServers": {
    "banking-tools": {
      "command": "node",
      "args": [
        "/path/to/poc-mcp-service/mcp-server.js"
      ]
    }
  }
}
```

Now users can:
1. Open Claude Desktop
2. Banking tools automatically available
3. Ask: "What's my account balance?"
4. Claude uses your MCP server to get real data!

---

## Implementation Effort

### Hybrid Approach (Recommended)

**Effort:** 2-3 days

**Files to Create/Modify:**

1. **Install MCP SDK** (5 min)
   ```bash
   npm install @modelcontextprotocol/sdk
   ```

2. **Create Enhanced MCP Client** (4 hours)
   ```
   poc-ai-orchestrator/src/services/enhancedMCPClient.js
   - Wrap both HTTP and MCP SDK clients
   - Implement fallback logic
   - Add tool discovery
   ```

3. **Update Workflow** (2 hours)
   ```
   poc-ai-orchestrator/src/workflows/bankingChatWorkflow.js
   - Use enhanced client
   - Add dynamic tool discovery
   - Keep existing logic as fallback
   ```

4. **Add MCP Server (POC)** (8 hours)
   ```
   poc-mcp-service/src/mcpServer.js
   - Implement MCP protocol
   - Register existing tools
   - Add SSE transport
   ```

5. **Testing** (4 hours)
   ```
   - Test tool discovery
   - Test tool execution
   - Test fallback logic
   - Verify Claude Desktop integration
   ```

**Total:** ~18-20 hours over 2-3 days

Would you like me to implement this hybrid approach?
