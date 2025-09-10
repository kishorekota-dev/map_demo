const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { spawn } = require('child_process');

class SimpleMCPClient {
  constructor() {
    this.client = null;
    this.serverProcess = null;
  }

  async connect() {
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
        name: 'simple-demo-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await this.client.connect(transport);
    console.log('✅ Connected to MCP Server successfully!');
  }

  async listAvailableTools() {
    console.log('\n📋 Listing available tools...');
    try {
      const response = await this.client.listTools();
      console.log('Available tools:');
      response.tools.forEach((tool, index) => {
        console.log(`  ${index + 1}. ${tool.name}: ${tool.description}`);
      });
      return response.tools;
    } catch (error) {
      console.error('❌ Error listing tools:', error.message);
      return [];
    }
  }

  async callTool(toolName, args = {}) {
    console.log(`\n🔧 Calling tool: ${toolName}`, args ? `with args: ${JSON.stringify(args)}` : '');
    try {
      const response = await this.client.callTool({
        name: toolName,
        arguments: args,
      });
      
      console.log('✅ Tool response:');
      response.content.forEach((content) => {
        if (content.type === 'text') {
          console.log(content.text);
        }
      });
      
      return response;
    } catch (error) {
      console.error(`❌ Error calling tool ${toolName}:`, error.message);
      return null;
    }
  }

  async runDemo() {
    console.log('🚀 Starting MCP Client Demo...');
    console.log('='.repeat(50));

    try {
      await this.connect();
      
      // List available tools
      await this.listAvailableTools();
      
      // Demo sequence
      console.log('\n🎬 Running demo sequence...');
      console.log('='.repeat(50));

      // 1. Check API health
      await this.callTool('get_api_health');

      // 2. Get all users
      await this.callTool('get_users');

      // 3. Get a specific user
      await this.callTool('get_user_by_id', { userId: '1' });

      // 4. Create a new user
      await this.callTool('create_user', {
        name: 'David Wilson',
        email: 'david@example.com',
        role: 'user'
      });

      // 5. Get all tasks
      await this.callTool('get_tasks');

      // 6. Create a new task
      await this.callTool('create_task', {
        title: 'Review MCP integration',
        userId: '2'
      });

      // 7. Complete a task
      await this.callTool('complete_task', { taskId: '1' });

      // 8. Get updated users and tasks
      console.log('\n📊 Final state check...');
      await this.callTool('get_users');
      await this.callTool('get_tasks');

      console.log('\n🎉 Demo completed successfully!');

    } catch (error) {
      console.error('❌ Demo failed:', error.message);
    } finally {
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

  // Interactive mode for manual testing
  async runInteractive() {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      await this.connect();
      const tools = await this.listAvailableTools();
      
      console.log('\n🎮 Interactive Mode - Available Commands:');
      console.log('  list - List available tools');
      console.log('  call <toolName> [args] - Call a tool');
      console.log('  demo - Run the full demo');
      console.log('  quit - Exit');
      console.log('\nExample: call get_users');
      console.log('Example: call create_user {"name":"John","email":"john@test.com"}');

      const askQuestion = () => {
        rl.question('\n> ', async (input) => {
          const [command, ...rest] = input.trim().split(' ');
          
          switch (command) {
            case 'list':
              await this.listAvailableTools();
              break;
              
            case 'call':
              const toolName = rest[0];
              let args = {};
              if (rest.length > 1) {
                try {
                  args = JSON.parse(rest.slice(1).join(' '));
                } catch (e) {
                  console.log('❌ Invalid JSON arguments');
                }
              }
              await this.callTool(toolName, args);
              break;
              
            case 'demo':
              await this.runDemo();
              return;
              
            case 'quit':
              await this.disconnect();
              rl.close();
              return;
              
            default:
              console.log('❌ Unknown command. Use: list, call, demo, or quit');
          }
          
          askQuestion();
        });
      };

      askQuestion();
      
    } catch (error) {
      console.error('❌ Interactive mode failed:', error.message);
      rl.close();
    }
  }
}

// Main execution
async function main() {
  const client = new SimpleMCPClient();
  
  const mode = process.argv[2];
  
  if (mode === 'interactive') {
    await client.runInteractive();
  } else {
    await client.runDemo();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = SimpleMCPClient;
