#!/usr/bin/env node

/**
 * Example client for Credit Card Enterprise MCP Server
 * This demonstrates how to interact with the MCP server programmatically
 */

const { spawn } = require('child_process');
const readline = require('readline');

class MCPClient {
  constructor() {
    this.requestId = 1;
    this.mcpProcess = null;
  }

  async start() {
    console.log('🚀 Starting Credit Card Enterprise MCP Client Example');
    
    // Start the MCP server
    this.mcpProcess = spawn('node', ['mcp-server.js'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.mcpProcess.stderr.on('data', (data) => {
      console.log('🔧 MCP Server:', data.toString().trim());
    });

    this.mcpProcess.on('close', (code) => {
      console.log(`MCP server exited with code ${code}`);
    });

    // Wait a moment for server to start
    await this.sleep(1000);

    // Run example operations
    await this.runExamples();
  }

  async sendRequest(method, params = {}) {
    const request = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method: method,
      params: params
    };

    return new Promise((resolve, reject) => {
      let responseData = '';
      
      const onData = (data) => {
        responseData += data.toString();
        
        // Try to parse JSON response
        const lines = responseData.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              if (response.id === request.id) {
                this.mcpProcess.stdout.removeListener('data', onData);
                resolve(response);
                return;
              }
            } catch (e) {
              // Continue trying to parse
            }
          }
        }
      };

      this.mcpProcess.stdout.on('data', onData);
      
      // Send request
      this.mcpProcess.stdin.write(JSON.stringify(request) + '\n');
      
      // Timeout after 10 seconds
      setTimeout(() => {
        this.mcpProcess.stdout.removeListener('data', onData);
        reject(new Error('Request timeout'));
      }, 10000);
    });
  }

  async runExamples() {
    try {
      console.log('\n📋 Running MCP Server Examples...\n');

      // 1. List available tools
      console.log('1️⃣  Listing available tools...');
      const toolsResponse = await this.sendRequest('tools/list');
      console.log(`✅ Found ${toolsResponse.result.tools.length} tools available`);
      
      // 2. Health check
      console.log('\n2️⃣  Checking API health...');
      const healthResponse = await this.sendRequest('tools/call', {
        name: 'health_check',
        arguments: {}
      });
      
      if (healthResponse.result) {
        console.log('✅ API Health Check:', JSON.stringify(healthResponse.result.content[0].text, null, 2));
      }

      // 3. Try authentication (this will fail without a real API server, but demonstrates the flow)
      console.log('\n3️⃣  Testing authentication...');
      try {
        const authResponse = await this.sendRequest('tools/call', {
          name: 'authenticate',
          arguments: {
            email: 'demo@example.com',
            password: 'demo123'
          }
        });
        console.log('🔐 Authentication response:', authResponse.result.content[0].text);
      } catch (error) {
        console.log('⚠️  Authentication failed (expected if API server not running):', error.message);
      }

      // 4. Show tool schemas
      console.log('\n4️⃣  Available tools and their schemas:');
      toolsResponse.result.tools.forEach(tool => {
        console.log(`\n🔧 ${tool.name}: ${tool.description}`);
        console.log(`   Input schema: ${JSON.stringify(tool.inputSchema.properties ? Object.keys(tool.inputSchema.properties) : 'none', null, 2)}`);
      });

      console.log('\n✅ Example completed successfully!');
      
    } catch (error) {
      console.error('❌ Error during examples:', error.message);
    } finally {
      this.cleanup();
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  cleanup() {
    if (this.mcpProcess) {
      this.mcpProcess.kill();
    }
    process.exit(0);
  }
}

// Interactive mode
async function interactiveMode() {
  const client = new MCPClient();
  
  console.log('🎮 Starting Interactive MCP Client...');
  console.log('Available commands:');
  console.log('  list - List all available tools');
  console.log('  health - Check API health');
  console.log('  auth <email> <password> - Authenticate');
  console.log('  accounts - Get accounts');
  console.log('  help - Show this help');
  console.log('  exit - Exit the client\n');

  client.mcpProcess = spawn('node', ['mcp-server.js'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  client.mcpProcess.stderr.on('data', (data) => {
    console.log('🔧 MCP:', data.toString().trim());
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'mcp> '
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const [command, ...args] = line.trim().split(' ');

    try {
      switch (command) {
        case 'list':
          const tools = await client.sendRequest('tools/list');
          console.log('Available tools:');
          tools.result.tools.forEach(tool => {
            console.log(`  - ${tool.name}: ${tool.description}`);
          });
          break;

        case 'health':
          const health = await client.sendRequest('tools/call', {
            name: 'health_check',
            arguments: {}
          });
          console.log('Health check result:', health.result.content[0].text);
          break;

        case 'auth':
          if (args.length < 2) {
            console.log('Usage: auth <email> <password>');
            break;
          }
          const auth = await client.sendRequest('tools/call', {
            name: 'authenticate',
            arguments: {
              email: args[0],
              password: args[1]
            }
          });
          console.log('Authentication result:', auth.result.content[0].text);
          break;

        case 'accounts':
          const accounts = await client.sendRequest('tools/call', {
            name: 'get_accounts',
            arguments: {}
          });
          console.log('Accounts result:', accounts.result.content[0].text);
          break;

        case 'help':
          console.log('Available commands:');
          console.log('  list - List all available tools');
          console.log('  health - Check API health');
          console.log('  auth <email> <password> - Authenticate');
          console.log('  accounts - Get accounts');
          console.log('  help - Show this help');
          console.log('  exit - Exit the client');
          break;

        case 'exit':
          console.log('👋 Goodbye!');
          client.cleanup();
          return;

        default:
          if (command) {
            console.log(`Unknown command: ${command}. Type 'help' for available commands.`);
          }
      }
    } catch (error) {
      console.error('Error:', error.message);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    client.cleanup();
  });
}

// Main execution
if (require.main === module) {
  const mode = process.argv[2];
  
  if (mode === 'interactive') {
    interactiveMode();
  } else {
    const client = new MCPClient();
    client.start();
  }
}
