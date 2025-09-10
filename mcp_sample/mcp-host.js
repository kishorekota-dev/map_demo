const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const OpenAI = require('openai');
const { spawn } = require('child_process');

class MCPHost {
  constructor(options = {}) {
    this.client = null;
    this.serverProcess = null;
    this.openai = null;
    this.availableTools = [];
    
    // Configuration
    this.config = {
      openaiApiKey: options.openaiApiKey || process.env.OPENAI_API_KEY,
      model: options.model || 'gpt-3.5-turbo',
      maxTokens: options.maxTokens || 1000,
      temperature: options.temperature || 0.7,
      ...options
    };

    if (!this.config.openaiApiKey) {
      throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass it in options.');
    }

    this.initializeOpenAI();
  }

  initializeOpenAI() {
    this.openai = new OpenAI({
      apiKey: this.config.openaiApiKey,
    });
    console.log('✅ OpenAI client initialized');
  }

  async connectToMCPServer() {
    console.log('🔌 Connecting to MCP Server...');
    
    // Start the MCP server process
    this.serverProcess = spawn('node', ['mcp-server.js'], {
      stdio: ['pipe', 'pipe', 'inherit'],
      cwd: __dirname,
    });

    // Create transport using the server process
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['mcp-server.js'],
    });

    this.client = new Client(
      {
        name: 'mcp-host-with-openai',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await this.client.connect(transport);
    console.log('✅ Connected to MCP Server successfully!');

    // Get available tools
    await this.loadAvailableTools();
  }

  async loadAvailableTools() {
    console.log('📋 Loading available tools from MCP Server...');
    try {
      const response = await this.client.listTools();
      this.availableTools = response.tools;
      console.log(`✅ Loaded ${this.availableTools.length} tools:`, 
        this.availableTools.map(t => t.name).join(', '));
      return this.availableTools;
    } catch (error) {
      console.error('❌ Error loading tools:', error.message);
      return [];
    }
  }

  convertToolsToOpenAIFormat() {
    return this.availableTools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema || {
          type: 'object',
          properties: {},
          required: []
        }
      }
    }));
  }

  async callMCPTool(toolName, args = {}) {
    try {
      const response = await this.client.callTool({
        name: toolName,
        arguments: args,
      });
      
      // Extract text content from the response
      const textContent = response.content
        .filter(content => content.type === 'text')
        .map(content => content.text)
        .join('\n');
      
      return {
        success: true,
        content: textContent,
        rawResponse: response
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async chatWithAI(userMessage, conversationHistory = []) {
    try {
      const messages = [
        {
          role: 'system',
          content: `You are an AI assistant that can help users manage tasks and users through a backend API. 
          You have access to several tools that can interact with the API:
          
          Available tools:
          ${this.availableTools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}
          
          Use these tools when appropriate to help the user. Always call tools when you need to fetch or modify data.
          Be conversational and helpful in your responses.`
        },
        ...conversationHistory,
        {
          role: 'user',
          content: userMessage
        }
      ];

      const tools = this.convertToolsToOpenAIFormat();

      console.log('🤖 Sending request to OpenAI...');
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: 'auto',
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      const message = response.choices[0].message;
      
      if (message.tool_calls && message.tool_calls.length > 0) {
        console.log('🔧 AI wants to call tools...');
        const toolResults = [];
        
        for (const toolCall of message.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);
          
          console.log(`🔧 Calling tool: ${toolName} with args:`, toolArgs);
          const result = await this.callMCPTool(toolName, toolArgs);
          
          toolResults.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            content: result.success ? result.content : `Error: ${result.error}`
          });
        }

        // Get AI's response after tool calls
        const followUpMessages = [
          ...messages,
          message,
          ...toolResults
        ];

        console.log('🤖 Getting AI response after tool execution...');
        const followUpResponse = await this.openai.chat.completions.create({
          model: this.config.model,
          messages: followUpMessages,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
        });

        return {
          response: followUpResponse.choices[0].message.content,
          toolCalls: message.tool_calls,
          toolResults: toolResults,
          conversationHistory: followUpMessages
        };
      } else {
        return {
          response: message.content,
          toolCalls: [],
          toolResults: [],
          conversationHistory: [...messages, message]
        };
      }

    } catch (error) {
      console.error('❌ Error in AI chat:', error.message);
      return {
        response: `Sorry, I encountered an error: ${error.message}`,
        toolCalls: [],
        toolResults: [],
        conversationHistory: conversationHistory
      };
    }
  }

  async runInteractiveSession() {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\n🎮 Interactive MCP Host with OpenAI');
    console.log('='.repeat(50));
    console.log('Type your questions or commands. The AI can use tools to help you.');
    console.log('Commands:');
    console.log('  help - Show available tools');
    console.log('  quit - Exit');
    console.log('  clear - Clear conversation history');
    console.log('\nExamples:');
    console.log('  "Show me all users"');
    console.log('  "Create a user named John with email john@test.com"');
    console.log('  "What tasks are pending?"');
    console.log('  "Complete task 1"');

    let conversationHistory = [];

    const askQuestion = () => {
      rl.question('\n🤔 You: ', async (input) => {
        const userInput = input.trim();
        
        if (userInput === 'quit') {
          console.log('\n👋 Goodbye!');
          await this.disconnect();
          rl.close();
          return;
        }

        if (userInput === 'clear') {
          conversationHistory = [];
          console.log('🧹 Conversation history cleared');
          askQuestion();
          return;
        }

        if (userInput === 'help') {
          console.log('\n📋 Available tools:');
          this.availableTools.forEach((tool, index) => {
            console.log(`  ${index + 1}. ${tool.name}: ${tool.description}`);
          });
          askQuestion();
          return;
        }

        if (!userInput) {
          askQuestion();
          return;
        }

        try {
          const result = await this.chatWithAI(userInput, conversationHistory);
          
          if (result.toolCalls.length > 0) {
            console.log(`\n🔧 AI used ${result.toolCalls.length} tool(s):`);
            result.toolCalls.forEach(call => {
              console.log(`   - ${call.function.name}(${call.function.arguments})`);
            });
          }

          console.log(`\n🤖 AI: ${result.response}`);
          conversationHistory = result.conversationHistory;

        } catch (error) {
          console.error('❌ Error:', error.message);
        }
        
        askQuestion();
      });
    };

    askQuestion();
  }

  async runDemo() {
    console.log('🚀 Starting MCP Host Demo with OpenAI');
    console.log('='.repeat(50));

    try {
      await this.connectToMCPServer();
      
      // Wait for backend to be ready
      await new Promise(resolve => setTimeout(resolve, 2000));

      const demoQueries = [
        "What's the health status of the API?",
        "Show me all the users in the system",
        "Create a new user named Emma Watson with email emma@demo.com and role user",
        "What tasks are available?",
        "Create a task called 'Review new features' and assign it to user 2",
        "Mark task 1 as completed",
        "Show me the updated list of users and tasks"
      ];

      let conversationHistory = [];

      for (const [index, query] of demoQueries.entries()) {
        console.log(`\n📝 Demo Query ${index + 1}: "${query}"`);
        console.log('-'.repeat(40));
        
        const result = await this.chatWithAI(query, conversationHistory);
        
        if (result.toolCalls.length > 0) {
          console.log(`🔧 AI used tools: ${result.toolCalls.map(c => c.function.name).join(', ')}`);
        }
        
        console.log(`🤖 AI Response: ${result.response}`);
        conversationHistory = result.conversationHistory;
        
        // Wait between queries for better readability
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      console.log('\n🎉 Demo completed successfully!');
      console.log('\nWould you like to continue with interactive mode? (y/n)');
      
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question('', (answer) => {
        rl.close();
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
          this.runInteractiveSession();
        } else {
          this.disconnect();
        }
      });

    } catch (error) {
      console.error('❌ Demo failed:', error.message);
      await this.disconnect();
    }
  }

  async disconnect() {
    console.log('\n🔌 Disconnecting from MCP Server...');
    try {
      if (this.client) {
        await this.client.close();
      }
      if (this.serverProcess) {
        this.serverProcess.kill();
      }
      console.log('✅ Disconnected successfully!');
    } catch (error) {
      console.error('❌ Error during disconnect:', error.message);
    }
  }
}

// Main execution
async function main() {
  const mode = process.argv[2] || 'demo';
  
  try {
    const host = new MCPHost({
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 1500
    });

    switch (mode) {
      case 'demo':
        await host.runDemo();
        break;
      case 'interactive':
        await host.connectToMCPServer();
        await new Promise(resolve => setTimeout(resolve, 2000));
        await host.runInteractiveSession();
        break;
      default:
        console.log('Usage: node mcp-host.js [demo|interactive]');
        break;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Make sure to:');
    console.log('1. Set your OpenAI API key: export OPENAI_API_KEY=your_key_here');
    console.log('2. Start the backend API first: node backend-api.js');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = MCPHost;
