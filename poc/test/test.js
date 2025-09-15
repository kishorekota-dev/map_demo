// Test Suite for Chatbot POC
const http = require('http');
const assert = require('assert');

class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.baseUrl = 'http://localhost:3000';
  }

  addTest(name, testFunction) {
    this.tests.push({ name, testFunction });
  }

  async runTests() {
    console.log('🧪 Running Chatbot POC Test Suite...\n');

    for (const test of this.tests) {
      try {
        console.log(`▶️  ${test.name}`);
        await test.testFunction();
        console.log(`✅ ${test.name} - PASSED\n`);
        this.passed++;
      } catch (error) {
        console.log(`❌ ${test.name} - FAILED`);
        console.log(`   Error: ${error.message}\n`);
        this.failed++;
      }
    }

    this.printSummary();
  }

  printSummary() {
    const total = this.passed + this.failed;
    console.log('📊 Test Summary:');
    console.log(`   Total tests: ${total}`);
    console.log(`   Passed: ${this.passed}`);
    console.log(`   Failed: ${this.failed}`);
    console.log(`   Success rate: ${((this.passed / total) * 100).toFixed(1)}%`);

    if (this.failed > 0) {
      process.exit(1);
    }
  }

  async makeRequest(path, options = {}) {
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}${path}`;
      const requestOptions = {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      };

      const req = http.request(url, requestOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = {
              statusCode: res.statusCode,
              headers: res.headers,
              data: res.headers['content-type']?.includes('application/json') 
                ? JSON.parse(data) 
                : data
            };
            resolve(response);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', reject);

      if (options.body) {
        req.write(JSON.stringify(options.body));
      }

      req.end();
    });
  }
}

// Create test runner instance
const testRunner = new TestRunner();

// Health Check Tests
testRunner.addTest('Health Check - Basic', async () => {
  const response = await testRunner.makeRequest('/api/health');
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.data.success, true);
  assert(response.data.data.status === 'healthy');
});

testRunner.addTest('Health Check - Detailed', async () => {
  const response = await testRunner.makeRequest('/api/health/detailed');
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.data.success, true);
  assert(response.data.data.server);
  assert(response.data.data.application);
});

// Chat API Tests
testRunner.addTest('Chat API - Send Message', async () => {
  const response = await testRunner.makeRequest('/api/chat/message', {
    method: 'POST',
    body: { message: 'Hello, how are you?' }
  });
  
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.data.success, true);
  assert(response.data.data.message);
  assert(response.data.data.intent);
  assert(typeof response.data.data.intent.confidence === 'number');
});

testRunner.addTest('Chat API - Intent Analysis', async () => {
  const response = await testRunner.makeRequest('/api/chat/analyze', {
    method: 'POST',
    body: { message: 'Hello there!' }
  });
  
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.data.success, true);
  assert(response.data.data.intent);
  assert(typeof response.data.data.confidence === 'number');
});

testRunner.addTest('Chat API - Get Available Intents', async () => {
  const response = await testRunner.makeRequest('/api/chat/intents');
  
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.data.success, true);
  assert(Array.isArray(response.data.data.intents));
  assert(response.data.data.intents.length > 0);
});

testRunner.addTest('Chat API - Get Status', async () => {
  const response = await testRunner.makeRequest('/api/chat/status');
  
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.data.success, true);
  assert(response.data.data.chatbot);
  assert(response.data.data.intentDetection);
  assert(response.data.data.responseGeneration);
});

// Error Handling Tests
testRunner.addTest('Chat API - Empty Message Error', async () => {
  const response = await testRunner.makeRequest('/api/chat/message', {
    method: 'POST',
    body: { message: '' }
  });
  
  assert.strictEqual(response.statusCode, 400);
  assert.strictEqual(response.data.success, false);
});

testRunner.addTest('Chat API - Missing Message Error', async () => {
  const response = await testRunner.makeRequest('/api/chat/message', {
    method: 'POST',
    body: {}
  });
  
  assert.strictEqual(response.statusCode, 400);
  assert.strictEqual(response.data.success, false);
});

testRunner.addTest('API - 404 Route', async () => {
  const response = await testRunner.makeRequest('/api/nonexistent');
  assert.strictEqual(response.statusCode, 404);
});

// Intent Detection Tests
testRunner.addTest('Intent Detection - Greeting', async () => {
  const response = await testRunner.makeRequest('/api/chat/analyze', {
    method: 'POST',
    body: { message: 'Hello!' }
  });
  
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.data.data.intent, 'greeting');
  assert(response.data.data.confidence > 0.5);
});

testRunner.addTest('Intent Detection - Question', async () => {
  const response = await testRunner.makeRequest('/api/chat/analyze', {
    method: 'POST',
    body: { message: 'What can you do?' }
  });
  
  assert.strictEqual(response.statusCode, 200);
  assert(['question', 'help'].includes(response.data.data.intent));
});

testRunner.addTest('Intent Detection - Help', async () => {
  const response = await testRunner.makeRequest('/api/chat/analyze', {
    method: 'POST',
    body: { message: 'I need help' }
  });
  
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.data.data.intent, 'help');
});

testRunner.addTest('Intent Detection - Goodbye', async () => {
  const response = await testRunner.makeRequest('/api/chat/analyze', {
    method: 'POST',
    body: { message: 'Goodbye' }
  });
  
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.data.data.intent, 'goodbye');
});

// Configuration Tests
testRunner.addTest('Configuration - Environment Variables', async () => {
  const config = require('./config/config');
  assert(config.server);
  assert(config.intentDetection);
  assert(config.responses);
  assert(typeof config.intentDetection.confidenceThreshold === 'number');
});

// Module Tests
testRunner.addTest('Intent Detector Module', async () => {
  const IntentDetector = require('./modules/intentDetector');
  const detector = new IntentDetector();
  
  const result = detector.detectIntent('Hello there!');
  assert(result.intent);
  assert(typeof result.confidence === 'number');
  assert(result.timestamp);
});

testRunner.addTest('Response Generator Module', async () => {
  const ResponseGenerator = require('./modules/responseGenerator');
  const generator = new ResponseGenerator();
  
  const intentResult = { intent: 'greeting', confidence: 0.9 };
  const response = generator.generateResponse(intentResult, 'Hello');
  
  assert(response.text);
  assert(response.intent === 'greeting');
  assert(response.metadata);
});

// Check if server is running before starting tests
async function checkServerHealth() {
  try {
    const response = await testRunner.makeRequest('/api/health');
    if (response.statusCode === 200) {
      console.log('✅ Server is running and healthy\n');
      return true;
    }
  } catch (error) {
    console.log('❌ Server is not running. Please start the server first:');
    console.log('   npm start\n');
    process.exit(1);
  }
}

// Run tests
async function main() {
  await checkServerHealth();
  await testRunner.runTests();
}

if (require.main === module) {
  main().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = TestRunner;