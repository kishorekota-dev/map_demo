#!/usr/bin/env node

/**
 * POC Banking - Node.js API Test Suite
 * Provides detailed API testing with better error handling
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  apiGateway: process.env.API_GATEWAY || 'http://localhost:3001',
  customerService: process.env.CUSTOMER_SERVICE || 'http://localhost:3010',
  timeout: 30000,
  resultsDir: 'test-results',
};

// Test results tracking
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: [],
  responses: []
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

// Logging functions
function logInfo(msg) {
  console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`);
}

function logSuccess(msg) {
  console.log(`${colors.green}[PASS]${colors.reset} ${msg}`);
  results.passed++;
}

function logError(msg, error = null) {
  console.log(`${colors.red}[FAIL]${colors.reset} ${msg}`);
  if (error) {
    console.log(`  Error: ${error.message}`);
    results.errors.push({ test: msg, error: error.message });
  }
  results.failed++;
}

function logWarn(msg) {
  console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`);
}

// HTTP Client
const client = axios.create({
  timeout: CONFIG.timeout,
  validateStatus: () => true, // Don't throw on any status
});

// Test execution function
async function runTest(testName, method, endpoint, data = null, expectedStatus = 200) {
  results.total++;
  logInfo(`Running: ${testName}`);

  try {
    const config = {
      method,
      url: endpoint,
      headers: { 'Content-Type': 'application/json' },
    };

    if (data) {
      config.data = data;
    }

    const response = await client(config);
    
    // Save response
    results.responses.push({
      test: testName,
      status: response.status,
      data: response.data,
    });

    if (response.status === expectedStatus) {
      logSuccess(`${testName} (HTTP ${response.status})`);
      return { success: true, data: response.data };
    } else {
      logError(`${testName} (Expected ${expectedStatus}, got ${response.status})`);
      console.log('  Response:', JSON.stringify(response.data, null, 2));
      return { success: false, data: response.data };
    }
  } catch (error) {
    logError(`${testName}`, error);
    return { success: false, error: error.message };
  }
}

// Main test suite
async function runTestSuite() {
  console.log('\n======================================');
  console.log('POC Banking - E2E API Test Suite (Node.js)');
  console.log('======================================');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`API Gateway: ${CONFIG.apiGateway}`);
  console.log('======================================\n');

  // Create results directory
  if (!fs.existsSync(CONFIG.resultsDir)) {
    fs.mkdirSync(CONFIG.resultsDir, { recursive: true });
  }

  // Pre-flight checks
  logInfo('=== Pre-flight Checks ===\n');
  
  try {
    const gatewayHealth = await client.get(`${CONFIG.apiGateway}/health`);
    if (gatewayHealth.status === 200) {
      logSuccess('API Gateway is healthy');
    } else {
      logError('API Gateway health check failed');
      process.exit(1);
    }

    const customerHealth = await client.get(`${CONFIG.customerService}/health`);
    if (customerHealth.status === 200) {
      logSuccess('Customer Service is healthy');
    } else {
      logError('Customer Service health check failed');
      process.exit(1);
    }
  } catch (error) {
    logError('Pre-flight checks failed', error);
    process.exit(1);
  }

  await sleep(1000);

  // Test Suite 1: Customer Management
  console.log('\n=== Test Suite 1: Customer Management (REST API) ===\n');

  // Test 1.1: Create Customer - John Doe
  const customer1Result = await runTest(
    'Create Customer John Doe',
    'POST',
    `${CONFIG.apiGateway}/customers`,
    {
      title: 'Mr',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phone: '+15551234567',
      dateOfBirth: '1985-06-15',
      gender: 'MALE',
      nationality: 'USA',
      addressLine1: '123 Main Street',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      country: 'USA',
      idType: 'PASSPORT',
      idNumber: 'P12345678',
      idExpiryDate: '2030-12-31',
    },
    201
  );

  const customer1Id = customer1Result.success ? customer1Result.data?.data?.id : null;
  logInfo(`Customer 1 ID: ${customer1Id}\n`);

  await sleep(500);

  // Test 1.2: Create Customer - Jane Smith
  const customer2Result = await runTest(
    'Create Customer Jane Smith',
    'POST',
    `${CONFIG.apiGateway}/customers`,
    {
      title: 'Ms',
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@example.com',
      phone: '+15559876543',
      dateOfBirth: '1990-03-22',
      gender: 'FEMALE',
      nationality: 'USA',
      addressLine1: '456 Oak Avenue',
      city: 'Los Angeles',
      state: 'CA',
      postalCode: '90001',
      country: 'USA',
    },
    201
  );

  const customer2Id = customer2Result.success ? customer2Result.data?.data?.id : null;
  logInfo(`Customer 2 ID: ${customer2Id}\n`);

  await sleep(500);

  // Test 1.3: Duplicate Email - Should Fail
  await runTest(
    'Create Customer with Duplicate Email',
    'POST',
    `${CONFIG.apiGateway}/customers`,
    {
      firstName: 'Duplicate',
      lastName: 'User',
      email: 'john.doe@example.com',
      phone: '+15551111111',
      dateOfBirth: '1980-01-01',
    },
    409
  );

  await sleep(500);

  // Test 1.4: Get All Customers
  await runTest('Get All Customers', 'GET', `${CONFIG.apiGateway}/customers`, null, 200);

  await sleep(500);

  // Test 1.5: Get Customer by ID
  if (customer1Id) {
    await runTest(
      'Get Customer by ID',
      'GET',
      `${CONFIG.apiGateway}/customers/${customer1Id}`,
      null,
      200
    );
  }

  await sleep(500);

  // Test 1.6: Update Customer
  if (customer1Id) {
    await runTest(
      'Update Customer',
      'PUT',
      `${CONFIG.apiGateway}/customers/${customer1Id}`,
      {
        email: 'john.doe.updated@example.com',
        phone: '+15551234999',
      },
      200
    );
  }

  await sleep(500);

  // Test 1.7: Verify KYC
  if (customer1Id) {
    await runTest(
      'Verify Customer KYC',
      'POST',
      `${CONFIG.apiGateway}/customers/${customer1Id}/kyc/verify`,
      {
        status: 'VERIFIED',
        verifiedBy: 'admin@bank.com',
        riskRating: 'LOW',
      },
      200
    );
  }

  await sleep(500);

  // Test Suite 2: BIAN API
  console.log('\n=== Test Suite 2: BIAN API ===\n');

  // Test 2.1: BIAN Initiate
  const bianCustomerResult = await runTest(
    'BIAN Initiate Party Profile',
    'POST',
    `${CONFIG.apiGateway}/sd-party-reference-data-management/v1/party-reference-profile/initiate`,
    {
      partyName: { firstName: 'Emily', lastName: 'Williams' },
      contactDetails: { email: 'emily.williams@example.com', phone: '+15556789012' },
      identificationDocuments: { type: 'PASSPORT', number: 'P11223344' },
      riskAssessment: { rating: 'LOW' },
    },
    201
  );

  const bianCustomerId = bianCustomerResult.success 
    ? bianCustomerResult.data?.controlRecordId 
    : null;
  logInfo(`BIAN Customer ID: ${bianCustomerId}\n`);

  await sleep(500);

  // Test 2.2: BIAN Retrieve
  if (bianCustomerId) {
    await runTest(
      'BIAN Retrieve Party Profile',
      'GET',
      `${CONFIG.apiGateway}/sd-party-reference-data-management/v1/party-reference-profile/${bianCustomerId}/retrieve`,
      null,
      200
    );
  }

  await sleep(500);

  // Test 2.3: BIAN Update
  if (bianCustomerId) {
    await runTest(
      'BIAN Update Party Profile',
      'PUT',
      `${CONFIG.apiGateway}/sd-party-reference-data-management/v1/party-reference-profile/${bianCustomerId}/update`,
      {
        contactDetails: { email: 'emily.updated@example.com' },
        riskRating: 'MEDIUM',
      },
      200
    );
  }

  await sleep(500);

  // Test Suite 3: Error Handling
  console.log('\n=== Test Suite 3: Error Handling ===\n');

  // Test 3.1: Missing Required Field
  await runTest(
    'Missing Required Field',
    'POST',
    `${CONFIG.apiGateway}/customers`,
    { firstName: 'Invalid', lastName: 'User' },
    400
  );

  await sleep(500);

  // Test 3.2: Invalid Email
  await runTest(
    'Invalid Email Format',
    'POST',
    `${CONFIG.apiGateway}/customers`,
    {
      firstName: 'Invalid',
      lastName: 'User',
      email: 'not-an-email',
      phone: '+15551111111',
      dateOfBirth: '1980-01-01',
    },
    400
  );

  await sleep(500);

  // Test 3.3: Non-existent Customer
  await runTest(
    'Get Non-Existent Customer',
    'GET',
    `${CONFIG.apiGateway}/customers/00000000-0000-0000-0000-000000000000`,
    null,
    404
  );

  // Generate results
  console.log('\n======================================');
  console.log('Test Results Summary');
  console.log('======================================');
  console.log(`Total Tests:  ${results.total}`);
  console.log(`${colors.green}Passed:       ${results.passed}${colors.reset}`);
  console.log(`${colors.red}Failed:       ${results.failed}${colors.reset}`);
  console.log(`Success Rate: ${((results.passed / results.total) * 100).toFixed(2)}%`);
  console.log('======================================\n');

  // Save detailed results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsFile = path.join(CONFIG.resultsDir, `test-results-${timestamp}.json`);
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  logInfo(`Detailed results saved to: ${resultsFile}`);

  // Exit with appropriate code
  process.exit(results.failed === 0 ? 0 : 1);
}

// Helper function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run tests
if (require.main === module) {
  runTestSuite().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runTestSuite };
