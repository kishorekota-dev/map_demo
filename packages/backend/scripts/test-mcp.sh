#!/bin/bash

# Test script for Credit Card Enterprise MCP Server

echo "🧪 Testing Credit Card Enterprise MCP Server..."

# First, start the API server in the background
echo "🚀 Starting API server..."
npm start &
API_PID=$!

# Wait for API server to start
sleep 3

# Test MCP server health check
echo "🔍 Testing MCP server health check..."

# Create a simple test to validate MCP server
cat << 'EOF' > test-mcp.js
const { spawn } = require('child_process');

// Test MCP server communication
function testMCPServer() {
  const mcpProcess = spawn('node', ['mcp-server.js']);
  
  // Send health check request
  const healthCheckRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'health_check',
      arguments: {}
    }
  };

  mcpProcess.stdin.write(JSON.stringify(healthCheckRequest) + '\n');
  
  mcpProcess.stdout.on('data', (data) => {
    try {
      const response = JSON.parse(data.toString());
      console.log('✅ MCP Server Response:', JSON.stringify(response, null, 2));
      mcpProcess.kill();
      process.exit(0);
    } catch (error) {
      console.log('📡 MCP Server Output:', data.toString());
    }
  });

  mcpProcess.stderr.on('data', (data) => {
    console.log('🔧 MCP Server Info:', data.toString());
  });

  mcpProcess.on('close', (code) => {
    console.log(`MCP server exited with code ${code}`);
  });

  // Timeout after 10 seconds
  setTimeout(() => {
    console.log('⏱️  Test timeout - stopping processes');
    mcpProcess.kill();
    process.exit(1);
  }, 10000);
}

// Wait a bit for API server, then test
setTimeout(testMCPServer, 2000);
EOF

# Run the test
node test-mcp.js

# Cleanup
echo "🧹 Cleaning up..."
kill $API_PID 2>/dev/null
rm -f test-mcp.js

echo "✅ MCP Server test completed!"
