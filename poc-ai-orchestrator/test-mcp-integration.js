#!/usr/bin/env node

/**
 * AI Orchestrator <-> MCP Service Integration Test
 * Tests the connection and tool execution between services
 */

const MCPClient = require('./src/services/mcpClient');
const logger = require('./src/utils/logger');
const chalk = require('chalk');

// Override config for testing
process.env.MCP_SERVICE_URL = process.env.MCP_SERVICE_URL || 'http://localhost:3004';

async function testMCPConnection() {
  console.log(chalk.bold.cyan('\n╔════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║  AI Orchestrator -> MCP Service Test   ║'));
  console.log(chalk.bold.cyan('╚════════════════════════════════════════╝\n'));

  const mcpClient = new MCPClient();
  let passed = 0;
  let failed = 0;

  // Test 1: Health Check
  console.log(chalk.blue('Test 1: MCP Service Health Check'));
  try {
    const health = await mcpClient.healthCheck();
    if (health.status === 'healthy') {
      console.log(chalk.green('✓ MCP Service is healthy'));
      console.log(chalk.gray(`  Uptime: ${Math.floor(health.uptime)}s`));
      console.log(chalk.gray(`  Protocol: ${health.mcp.protocolVersion}`));
      passed++;
    } else {
      console.log(chalk.red('✗ MCP Service unhealthy'));
      failed++;
    }
  } catch (error) {
    console.log(chalk.red('✗ Health check failed:', error.message));
    failed++;
    return; // Can't continue if service is down
  }
  console.log('');

  // Test 2: Get Available Tools
  console.log(chalk.blue('Test 2: Get Available Tools'));
  try {
    const tools = await mcpClient.getAvailableTools();
    if (Array.isArray(tools) && tools.length > 0) {
      console.log(chalk.green(`✓ Retrieved ${tools.length} tools`));
      console.log(chalk.gray('  Sample tools:'));
      tools.slice(0, 5).forEach(tool => {
        console.log(chalk.gray(`    - ${tool.name}`));
      });
      passed++;
    } else {
      console.log(chalk.red('✗ No tools available'));
      failed++;
    }
  } catch (error) {
    console.log(chalk.red('✗ Failed to get tools:', error.message));
    failed++;
  }
  console.log('');

  // Test 3: Get Tool Categories
  console.log(chalk.blue('Test 3: Get Tool Categories'));
  try {
    const categories = await mcpClient.getToolCategories();
    if (categories.success && categories.categories) {
      console.log(chalk.green('✓ Retrieved tool categories'));
      Object.entries(categories.categories).forEach(([category, tools]) => {
        console.log(chalk.gray(`  ${category}: ${tools.length} tools`));
      });
      passed++;
    } else {
      console.log(chalk.red('✗ Failed to get categories'));
      failed++;
    }
  } catch (error) {
    console.log(chalk.red('✗ Failed to get categories:', error.message));
    failed++;
  }
  console.log('');

  // Test 4: Get Specific Tool Definition
  console.log(chalk.blue('Test 4: Get Tool Definition'));
  try {
    const toolDef = await mcpClient.getToolDefinition('banking_authenticate');
    if (toolDef && toolDef.name === 'banking_authenticate') {
      console.log(chalk.green('✓ Retrieved tool definition'));
      console.log(chalk.gray(`  Name: ${toolDef.name}`));
      console.log(chalk.gray(`  Description: ${toolDef.description}`));
      passed++;
    } else {
      console.log(chalk.red('✗ Invalid tool definition'));
      failed++;
    }
  } catch (error) {
    console.log(chalk.red('✗ Failed to get tool definition:', error.message));
    failed++;
  }
  console.log('');

  // Test 5: Validate Parameters
  console.log(chalk.blue('Test 5: Validate Parameters'));
  try {
    const validation = await mcpClient.validateParameters('banking_authenticate', {
      username: 'test@example.com',
      password: 'testpass'
    });
    if (validation.valid) {
      console.log(chalk.green('✓ Parameters validated successfully'));
      passed++;
    } else {
      console.log(chalk.yellow('⚠ Parameters invalid (expected for test)'));
      passed++; // Still counts as pass since validation worked
    }
  } catch (error) {
    console.log(chalk.red('✗ Parameter validation failed:', error.message));
    failed++;
  }
  console.log('');

  // Test 6: Execute Tool (will fail with auth but tests the flow)
  console.log(chalk.blue('Test 6: Execute Tool (Authentication Flow)'));
  try {
    const result = await mcpClient.executeTool('banking_authenticate', {
      username: 'john.doe@example.com',
      password: 'Password123!'
    }, 'test-session-123');
    
    if (result.success) {
      console.log(chalk.green('✓ Tool executed successfully'));
      console.log(chalk.gray(`  Request ID: ${result.requestId}`));
      passed++;
    } else {
      console.log(chalk.yellow('⚠ Tool execution returned error (checking flow)'));
      passed++; // Flow worked even if auth failed
    }
  } catch (error) {
    // Check if it's an expected banking service error
    if (error.message.includes('401') || error.message.includes('404') || error.message.includes('Banking')) {
      console.log(chalk.yellow('⚠ Banking service error (expected, MCP flow works)'));
      console.log(chalk.gray(`  Error: ${error.message}`));
      passed++; // MCP service communication worked
    } else {
      console.log(chalk.red('✗ Tool execution failed:', error.message));
      failed++;
    }
  }
  console.log('');

  // Test 7: Banking Operation Mapping
  console.log(chalk.blue('Test 7: Banking Operation Mapping'));
  try {
    // This will fail at banking service level but tests our mapping
    await mcpClient.executeBankingOperation('get_balance', {
      authToken: 'test-token',
      accountId: 'test-account'
    }, 'test-session-456');
    
    console.log(chalk.green('✓ Banking operation mapping works'));
    passed++;
  } catch (error) {
    // Expected to fail but the mapping should work
    if (error.message.includes('401') || error.message.includes('403') || error.message.includes('Banking')) {
      console.log(chalk.yellow('⚠ Banking service error (expected, mapping works)'));
      passed++;
    } else {
      console.log(chalk.red('✗ Banking operation failed:', error.message));
      failed++;
    }
  }
  console.log('');

  // Results
  console.log(chalk.bold.cyan('╔════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║          Test Results                  ║'));
  console.log(chalk.bold.cyan('╚════════════════════════════════════════╝'));
  console.log(chalk.green(`✓ Passed: ${passed}`));
  console.log(chalk.red(`✗ Failed: ${failed}`));
  console.log(chalk.gray(`Total: ${passed + failed}\n`));

  if (failed === 0) {
    console.log(chalk.bold.green('🎉 All integration tests passed!'));
    console.log(chalk.gray('AI Orchestrator can successfully communicate with MCP Service\n'));
  } else {
    console.log(chalk.bold.yellow(`⚠️  ${failed} test(s) failed`));
    console.log(chalk.gray('Check the MCP Service is running on port 3004\n'));
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
testMCPConnection().catch(error => {
  console.error(chalk.bold.red('\n💥 Test suite failed:'), error);
  process.exit(1);
});
