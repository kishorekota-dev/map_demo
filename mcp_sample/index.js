#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🎯 MCP Sample Demo Launcher');
console.log('='.repeat(40));

function showUsage() {
  console.log('Usage: node index.js [command]');
  console.log('');
  console.log('Commands:');
  console.log('  demo      - Run the full MCP demo (default)');
  console.log('  backend   - Start only the backend API');
  console.log('  server    - Start only the MCP server');
  console.log('  client    - Start only the MCP client');
  console.log('  test      - Run the test suite');
  console.log('  dev       - Start all components');
  console.log('  help      - Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  node index.js demo');
  console.log('  node index.js test');
  console.log('  npm start demo');
}

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [command, ...args], {
      stdio: 'inherit',
      cwd: __dirname,
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

function runCommandInBackground(command, args = []) {
  const child = spawn('node', [command, ...args], {
    stdio: 'inherit',
    cwd: __dirname,
  });

  return child;
}

async function main() {
  const command = process.argv[2] || 'demo';

  switch (command) {
    case 'demo':
      console.log('🚀 Running MCP Demo...');
      console.log('This will start the backend, then run the MCP client demo.\n');
      
      // Start backend in background
      console.log('Starting backend API...');
      const backendProcess = runCommandInBackground('backend-api.js');
      
      // Wait for backend to start
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      try {
        // Run the client demo
        console.log('Starting MCP client demo...');
        await runCommand('mcp-client.js');
      } finally {
        // Clean up
        backendProcess.kill();
      }
      break;

    case 'backend':
      console.log('🔧 Starting Backend API only...');
      await runCommand('backend-api.js');
      break;

    case 'server':
      console.log('🔧 Starting MCP Server only...');
      await runCommand('mcp-server.js');
      break;

    case 'client':
      console.log('🔧 Starting MCP Client only...');
      await runCommand('mcp-client.js');
      break;

    case 'test':
      console.log('🧪 Running Test Suite...');
      await runCommand('test.js');
      break;

    case 'dev':
      console.log('🛠️  Starting Development Mode...');
      console.log('This will start all components concurrently.\n');
      
      const { spawn: spawnConcurrent } = require('child_process');
      const concurrentProcess = spawnConcurrent('npm', ['run', 'dev'], {
        stdio: 'inherit',
        cwd: __dirname,
        shell: true,
      });

      // Handle Ctrl+C gracefully
      process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down all processes...');
        concurrentProcess.kill('SIGINT');
        process.exit(0);
      });

      concurrentProcess.on('close', (code) => {
        process.exit(code);
      });
      break;

    case 'help':
    case '--help':
    case '-h':
      showUsage();
      break;

    default:
      console.log(`❌ Unknown command: ${command}\n`);
      showUsage();
      process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error.message);
  process.exit(1);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n👋 Goodbye!');
  process.exit(0);
});

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}
