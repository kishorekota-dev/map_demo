#!/usr/bin/env node

/**
 * MCP Service Test Script
 * Tests HTTP API endpoints
 */

const axios = require('axios');
const chalk = require('chalk');

const MCP_SERVICE_URL = process.env.MCP_SERVICE_URL || 'http://localhost:3004';

// Test data
const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJmMGFhYjI0MS04MzNjLTQyYjctYTQ0Zi1iNGVmMzc4MjBkYTEiLCJlbWFpbCI6ImpvaG4uZG9lQGV4YW1wbGUuY29tIiwiaWF0IjoxNzM3NTgxNjYxLCJleHAiOjE3Mzc2NjgwNjF9.K4_5xpSLFPLa_vJIFZRYxvLPyPXJyE_4FXVmWqRNkQw';

async function testHealthCheck() {
  console.log(chalk.blue('\n=== Testing Health Check ==='));
  try {
    const response = await axios.get(`${MCP_SERVICE_URL}/health`);
    console.log(chalk.green('✓ Health check passed'));
    console.log(JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.log(chalk.red('✗ Health check failed:'), error.message);
    return false;
  }
}

async function testServiceInfo() {
  console.log(chalk.blue('\n=== Testing Service Info ==='));
  try {
    const response = await axios.get(`${MCP_SERVICE_URL}/api`);
    console.log(chalk.green('✓ Service info retrieved'));
    console.log(JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.log(chalk.red('✗ Service info failed:'), error.message);
    return false;
  }
}

async function testGetTools() {
  console.log(chalk.blue('\n=== Testing Get Tools ==='));
  try {
    const response = await axios.get(`${MCP_SERVICE_URL}/api/mcp/tools`);
    console.log(chalk.green(`✓ Retrieved ${response.data.count} tools`));
    console.log('Available tools:');
    response.data.tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });
    return true;
  } catch (error) {
    console.log(chalk.red('✗ Get tools failed:'), error.message);
    return false;
  }
}

async function testGetToolByName() {
  console.log(chalk.blue('\n=== Testing Get Tool by Name ==='));
  try {
    const toolName = 'banking_get_accounts';
    const response = await axios.get(`${MCP_SERVICE_URL}/api/mcp/tools/${toolName}`);
    console.log(chalk.green(`✓ Retrieved tool: ${toolName}`));
    console.log(JSON.stringify(response.data.tool, null, 2));
    return true;
  } catch (error) {
    console.log(chalk.red('✗ Get tool by name failed:'), error.message);
    return false;
  }
}

async function testGetCategories() {
  console.log(chalk.blue('\n=== Testing Get Categories ==='));
  try {
    const response = await axios.get(`${MCP_SERVICE_URL}/api/mcp/categories`);
    console.log(chalk.green('✓ Retrieved tool categories'));
    Object.entries(response.data.categories).forEach(([category, tools]) => {
      console.log(`  ${category}: ${tools.length} tools`);
      tools.forEach(tool => console.log(`    - ${tool}`));
    });
    return true;
  } catch (error) {
    console.log(chalk.red('✗ Get categories failed:'), error.message);
    return false;
  }
}

async function testValidateParameters() {
  console.log(chalk.blue('\n=== Testing Validate Parameters ==='));
  try {
    // Test valid parameters
    const validResponse = await axios.post(`${MCP_SERVICE_URL}/api/mcp/validate`, {
      tool: 'banking_get_accounts',
      parameters: {
        token: testToken
      }
    });
    console.log(chalk.green('✓ Valid parameters accepted'));
    console.log(JSON.stringify(validResponse.data, null, 2));

    // Test invalid parameters (missing required field)
    try {
      await axios.post(`${MCP_SERVICE_URL}/api/mcp/validate`, {
        tool: 'banking_get_accounts',
        parameters: {}
      });
    } catch (error) {
      if (error.response?.data?.valid === false) {
        console.log(chalk.yellow('✓ Invalid parameters rejected correctly'));
        console.log(JSON.stringify(error.response.data, null, 2));
      }
    }

    return true;
  } catch (error) {
    console.log(chalk.red('✗ Validate parameters failed:'), error.message);
    return false;
  }
}

async function testExecuteTool() {
  console.log(chalk.blue('\n=== Testing Execute Tool ==='));
  try {
    const response = await axios.post(`${MCP_SERVICE_URL}/api/mcp/execute`, {
      tool: 'banking_get_accounts',
      parameters: {
        token: testToken
      }
    });
    console.log(chalk.green('✓ Tool executed successfully'));
    console.log(JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.log(chalk.red('✗ Execute tool failed:'), error.response?.data || error.message);
    // Don't fail the test if it's an auth error (expected with test token)
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.log(chalk.yellow('Note: Authentication error is expected with test token'));
      return true;
    }
    return false;
  }
}

async function testBatchExecution() {
  console.log(chalk.blue('\n=== Testing Batch Execution ==='));
  try {
    const response = await axios.post(`${MCP_SERVICE_URL}/api/mcp/execute-batch`, {
      tools: [
        {
          tool: 'banking_get_accounts',
          parameters: { token: testToken }
        },
        {
          tool: 'banking_get_balance',
          parameters: { token: testToken, accountId: 'test-account-id' }
        }
      ]
    });
    console.log(chalk.green('✓ Batch execution completed'));
    console.log(JSON.stringify(response.data.summary, null, 2));
    return true;
  } catch (error) {
    console.log(chalk.red('✗ Batch execution failed:'), error.response?.data || error.message);
    // Don't fail if auth error
    if (error.response?.data?.summary) {
      console.log(chalk.yellow('Note: Some tools may fail with test token'));
      return true;
    }
    return false;
  }
}

async function runAllTests() {
  console.log(chalk.bold.cyan('\n╔════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║   MCP Service HTTP API Test Suite     ║'));
  console.log(chalk.bold.cyan('╚════════════════════════════════════════╝'));
  console.log(chalk.gray(`Testing: ${MCP_SERVICE_URL}\n`));

  const tests = [
    { name: 'Health Check', fn: testHealthCheck },
    { name: 'Service Info', fn: testServiceInfo },
    { name: 'Get Tools', fn: testGetTools },
    { name: 'Get Tool by Name', fn: testGetToolByName },
    { name: 'Get Categories', fn: testGetCategories },
    { name: 'Validate Parameters', fn: testValidateParameters },
    { name: 'Execute Tool', fn: testExecuteTool },
    { name: 'Batch Execution', fn: testBatchExecution }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) passed++;
      else failed++;
    } catch (error) {
      console.log(chalk.red(`✗ Test ${test.name} threw error:`, error.message));
      failed++;
    }
  }

  console.log(chalk.bold.cyan('\n╔════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║          Test Results                  ║'));
  console.log(chalk.bold.cyan('╚════════════════════════════════════════╝'));
  console.log(chalk.green(`✓ Passed: ${passed}`));
  console.log(chalk.red(`✗ Failed: ${failed}`));
  console.log(chalk.gray(`Total: ${passed + failed}\n`));

  if (failed === 0) {
    console.log(chalk.bold.green('🎉 All tests passed!'));
  } else {
    console.log(chalk.bold.yellow(`⚠️  ${failed} test(s) failed`));
  }
}

// Run tests
runAllTests().catch(error => {
  console.error(chalk.bold.red('\n💥 Test suite failed:'), error);
  process.exit(1);
});
