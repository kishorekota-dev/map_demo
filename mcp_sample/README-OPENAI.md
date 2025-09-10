# MCP Sample Demo with OpenAI Integration

A comprehensive end-to-end demonstration of the Model Context Protocol (MCP) with OpenAI LLM integration, featuring a backend API, MCP server, MCP client, and an intelligent MCP Host that connects real AI to your tools.

## 🌟 What's New: MCP Host with OpenAI

The **MCP Host** is the bridge between AI language models and your tools. It allows an OpenAI LLM to intelligently call tools through the MCP protocol, enabling natural language interaction with your backend systems.

## 📋 Complete Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   OpenAI LLM    │◄──►│   MCP Host      │◄──►│   MCP Server    │◄──►│  Backend API    │
│                 │    │                 │    │                 │    │                 │
│ - GPT-3.5/4     │    │ - AI orchestration│   │ - Tool handlers │    │ - Users CRUD    │
│ - Tool calling  │    │ - Conversation  │    │ - API proxy     │    │ - Tasks CRUD    │
│ - Natural lang. │    │ - Error handling│    │ - MCP protocol  │    │ - Health check  │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### 1. Installation & Setup

```bash
cd mcp_sample
./setup-mcp-host.sh
```

### 2. Get OpenAI API Key

1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create an API key
3. Set it in your environment:

```bash
export OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Run the AI-Powered Demo

**Option A: Full AI Demo**
```bash
npm run dev:host
```

**Option B: Interactive AI Chat**
```bash
npm run host:interactive
```

**Option C: Traditional MCP Demo (no AI)**
```bash
npm run dev
```

## 🤖 AI-Powered Features

### Natural Language Tool Calling

The AI can understand natural language requests and automatically call the appropriate tools:

**User:** "Show me all users"
**AI:** *Calls get_users tool* → "Here are all the users in the system: Alice Johnson (admin), Bob Smith (user)..."

**User:** "Create a user named Emma with email emma@test.com"
**AI:** *Calls create_user tool* → "I've successfully created a new user named Emma with email emma@test.com..."

**User:** "What tasks are pending?"
**AI:** *Calls get_tasks tool and filters* → "There are 2 pending tasks: 'Test the application' assigned to Charlie..."

### Intelligent Conversation Flow

The AI maintains context across the conversation and can:
- Remember previous interactions
- Chain multiple tool calls together
- Provide helpful summaries and insights
- Handle errors gracefully

## 🔧 Available Components

### 1. Backend API (`backend-api.js`)
Simple Express.js REST API with:
- User management (CRUD)
- Task management (CRUD)
- Health monitoring

### 2. MCP Server (`mcp-server.js`)
Model Context Protocol server exposing 7 tools:
- `get_users` - Fetch all users
- `get_user_by_id` - Fetch specific user
- `create_user` - Create new user
- `get_tasks` - Fetch all tasks
- `create_task` - Create new task
- `complete_task` - Mark task complete
- `get_api_health` - Health check

### 3. MCP Client (`mcp-client.js`)
Traditional MCP client for direct tool interaction

### 4. MCP Host (`mcp-host.js`) ⭐ **NEW**
AI-powered orchestrator that:
- Connects OpenAI LLMs to MCP tools
- Handles natural language processing
- Manages conversation context
- Provides intelligent responses

## 📖 Usage Examples

### Interactive AI Commands

```bash
# Start interactive mode
npm run host:interactive

# Example conversations:
You: Show me all users
AI: I'll fetch all users for you. [calls get_users] Here are all the users...

You: Create a user named John Doe with email john@example.com  
AI: I'll create that user for you. [calls create_user] Successfully created John Doe...

You: What tasks need to be completed?
AI: Let me check the current tasks. [calls get_tasks] There are 3 tasks, 2 are pending...

You: Complete task 1
AI: I'll mark task 1 as completed. [calls complete_task] Task 1 has been completed!
```

### Programmatic Usage

```javascript
const MCPHost = require('./mcp-host');

const host = new MCPHost({
  openaiApiKey: 'your-api-key',
  model: 'gpt-3.5-turbo',
  temperature: 0.7
});

await host.connectToMCPServer();

const result = await host.chatWithAI(
  "Create a user named Alice and assign her a task"
);

console.log(result.response);
```

## ⚙️ Configuration

### Environment Variables

```bash
# Required
OPENAI_API_KEY=your_openai_api_key_here

# Optional
OPENAI_MODEL=gpt-3.5-turbo          # or gpt-4
OPENAI_MAX_TOKENS=1500              # Response length limit
OPENAI_TEMPERATURE=0.7              # Creativity (0-1)
BACKEND_PORT=3001                   # API port
NODE_ENV=development                # Environment
```

### Model Options

- **gpt-3.5-turbo**: Fast, cost-effective, good for most use cases
- **gpt-4**: More capable, better reasoning, higher cost
- **gpt-4-turbo**: Latest GPT-4 with improved performance

## 🧪 Testing

### Run All Tests
```bash
npm test                    # Basic component tests
node test-mcp-host.js      # MCP Host specific tests
```

### Manual Testing
```bash
# Test individual components
npm run backend            # Start API only
npm run server            # Start MCP server only
npm run client            # Run MCP client demo
npm run host              # Run AI host demo
```

## 🛠️ Development

### Project Structure
```
mcp_sample/
├── backend-api.js         # Express REST API
├── mcp-server.js         # MCP protocol server
├── mcp-client.js         # MCP protocol client
├── mcp-host.js           # AI-powered MCP host ⭐
├── test-mcp-host.js      # MCP host tests
├── setup-mcp-host.sh     # Setup script
├── .env.example          # Environment template
└── package.json          # Dependencies & scripts
```

### Adding New Tools

1. **Add to Backend API:**
```javascript
app.get('/api/new-endpoint', (req, res) => {
  // Your API logic
});
```

2. **Add to MCP Server:**
```javascript
{
  name: 'new_tool',
  description: 'Description of new tool',
  inputSchema: { /* JSON schema */ }
}
```

3. **The AI automatically discovers and uses new tools!**

### Customizing AI Behavior

```javascript
const host = new MCPHost({
  model: 'gpt-4',
  temperature: 0.3,          // More deterministic
  maxTokens: 2000,          // Longer responses
  systemPrompt: 'Custom instructions for the AI...'
});
```

## 🔍 Troubleshooting

### Common Issues

**"OpenAI API key is required"**
```bash
export OPENAI_API_KEY=your_key_here
# or add to .env file
```

**"Port 3001 already in use"**
```bash
lsof -ti:3001 | xargs kill -9
```

**"MCP Server connection failed"**
- Ensure backend API is running first
- Check that all dependencies are installed
- Verify Node.js version compatibility

**"OpenAI API errors"**
- Check API key validity
- Verify account has sufficient credits
- Check rate limits

### Debug Mode

```bash
DEBUG=* npm run dev:host
```

## 💰 Cost Considerations

### OpenAI API Costs (Approximate)

- **GPT-3.5-turbo**: ~$0.002 per 1K tokens
- **GPT-4**: ~$0.03 per 1K tokens
- **Average demo run**: 2K-5K tokens (~$0.004-$0.15)

### Cost Optimization Tips

1. Use GPT-3.5-turbo for development
2. Set reasonable `maxTokens` limits
3. Use caching for repeated queries
4. Monitor usage via OpenAI dashboard

## 🌟 Key Benefits

### For Developers
- **Rapid Prototyping**: Add AI to any API in minutes
- **Natural Interface**: Users interact in plain English
- **Tool Discovery**: AI automatically learns available tools
- **Error Handling**: Graceful fallbacks and error recovery

### For Users
- **Intuitive**: No need to learn API endpoints
- **Conversational**: Natural back-and-forth interaction
- **Intelligent**: AI understands context and intent
- **Efficient**: Multi-step operations in single requests

## 🚀 Next Steps

### Extend the Demo
1. **Add Authentication**: Implement user auth and permissions
2. **Add Database**: Replace in-memory storage with PostgreSQL
3. **Add WebSocket**: Real-time updates and notifications
4. **Add UI**: React/Vue frontend for the AI chat
5. **Add Monitoring**: Logging, metrics, and observability
6. **Add Memory**: Persistent conversation history

### Production Deployment
1. **Environment Setup**: Production API keys and configs
2. **Scaling**: Load balancing and horizontal scaling
3. **Security**: Rate limiting, input validation, HTTPS
4. **Monitoring**: Error tracking and performance monitoring

## 📚 Learning Resources

- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/)
- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [OpenAI API Documentation](https://platform.openai.com/docs)

## 📄 License

MIT License - Feel free to use this demo for learning and development purposes.

---

**🎉 You now have a complete AI-powered system that can understand natural language and execute tasks through APIs using the Model Context Protocol!**
