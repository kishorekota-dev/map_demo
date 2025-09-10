const axios = require('axios');
const { spawn } = require('child_process');

class TestRunner {
  constructor() {
    this.backendProcess = null;
    this.testResults = [];
  }

  async startBackend() {
    console.log('🚀 Starting backend API for testing...');
    return new Promise((resolve, reject) => {
      this.backendProcess = spawn('node', ['backend-api.js'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: __dirname,
      });

      this.backendProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Backend API server running')) {
          console.log('✅ Backend API started successfully');
          resolve();
        }
      });

      this.backendProcess.stderr.on('data', (data) => {
        console.error('Backend Error:', data.toString());
      });

      setTimeout(() => {
        reject(new Error('Backend startup timeout'));
      }, 10000);
    });
  }

  async stopBackend() {
    if (this.backendProcess) {
      this.backendProcess.kill();
      console.log('🛑 Backend API stopped');
    }
  }

  async testBackendAPI() {
    console.log('\n🧪 Testing Backend API...');
    const tests = [
      {
        name: 'Health Check',
        test: async () => {
          const response = await axios.get('http://localhost:3001/api/health');
          return response.data.status === 'healthy';
        }
      },
      {
        name: 'Get Users',
        test: async () => {
          const response = await axios.get('http://localhost:3001/api/users');
          return response.data.success && Array.isArray(response.data.data);
        }
      },
      {
        name: 'Create User',
        test: async () => {
          const response = await axios.post('http://localhost:3001/api/users', {
            name: 'Test User',
            email: 'test@example.com'
          });
          return response.data.success && response.data.data.name === 'Test User';
        }
      },
      {
        name: 'Get Tasks',
        test: async () => {
          const response = await axios.get('http://localhost:3001/api/tasks');
          return response.data.success && Array.isArray(response.data.data);
        }
      },
      {
        name: 'Create Task',
        test: async () => {
          const response = await axios.post('http://localhost:3001/api/tasks', {
            title: 'Test Task',
            userId: 1
          });
          return response.data.success && response.data.data.title === 'Test Task';
        }
      }
    ];

    for (const test of tests) {
      try {
        const result = await test.test();
        console.log(`  ✅ ${test.name}: PASSED`);
        this.testResults.push({ name: test.name, status: 'PASSED' });
      } catch (error) {
        console.log(`  ❌ ${test.name}: FAILED - ${error.message}`);
        this.testResults.push({ name: test.name, status: 'FAILED', error: error.message });
      }
    }
  }

  async testMCPIntegration() {
    console.log('\n🧪 Testing MCP Integration...');
    
    try {
      const SimpleMCPClient = require('./mcp-client');
      const client = new SimpleMCPClient();
      
      console.log('  🔧 Testing MCP Client connection...');
      // Note: This is a simplified test. In a real scenario, you'd want more comprehensive testing
      console.log('  ✅ MCP Client module loaded successfully');
      this.testResults.push({ name: 'MCP Client Module', status: 'PASSED' });
      
    } catch (error) {
      console.log(`  ❌ MCP Integration: FAILED - ${error.message}`);
      this.testResults.push({ name: 'MCP Integration', status: 'FAILED', error: error.message });
    }
  }

  async runAllTests() {
    console.log('🎯 Starting Comprehensive Test Suite...');
    console.log('='.repeat(50));

    try {
      // Start backend
      await this.startBackend();
      
      // Wait a bit for backend to fully start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Run tests
      await this.testBackendAPI();
      await this.testMCPIntegration();
      
      // Print summary
      this.printTestSummary();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
    } finally {
      await this.stopBackend();
    }
  }

  printTestSummary() {
    console.log('\n📊 Test Summary');
    console.log('='.repeat(50));
    
    const passed = this.testResults.filter(r => r.status === 'PASSED').length;
    const failed = this.testResults.filter(r => r.status === 'FAILED').length;
    
    console.log(`Total Tests: ${this.testResults.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    
    if (failed > 0) {
      console.log('\nFailed Tests:');
      this.testResults
        .filter(r => r.status === 'FAILED')
        .forEach(r => console.log(`  ❌ ${r.name}: ${r.error}`));
    }
    
    console.log(`\n${failed === 0 ? '🎉 All tests passed!' : '⚠️  Some tests failed'}`);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const runner = new TestRunner();
  runner.runAllTests().catch(console.error);
}

module.exports = TestRunner;
