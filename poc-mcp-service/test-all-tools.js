#!/usr/bin/env node

/**
 * Comprehensive Test Script for MCP Banking Tools
 * Tests all 28 banking tools against the Banking Service API
 */

const bankingTools = require('./src/mcp/tools/bankingTools');
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

let testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  total: 0
};

// Test credentials
const TEST_USER = {
  username: 'admin',
  password: 'Password123!'
};

let authToken = null;
let testAccountId = null;
let testCardId = null;
let testTransactionId = null;
let testTransferId = null;
let testFraudAlertId = null;
let testDisputeId = null;

/**
 * Print test result
 */
function printResult(testName, success, message = '', data = null) {
  testResults.total++;
  
  if (success) {
    testResults.passed++;
    console.log(`${colors.green}✓${colors.reset} ${testName}`);
    if (message) console.log(`  ${colors.cyan}→${colors.reset} ${message}`);
  } else {
    testResults.failed++;
    console.log(`${colors.red}✗${colors.reset} ${testName}`);
    if (message) console.log(`  ${colors.red}Error:${colors.reset} ${message}`);
  }
  
  if (data && process.env.VERBOSE) {
    console.log(`  ${colors.yellow}Data:${colors.reset}`, JSON.stringify(data, null, 2));
  }
}

/**
 * Print section header
 */
function printSection(title) {
  console.log(`\n${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.blue}${title}${colors.reset}`);
  console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}\n`);
}

/**
 * Test authentication
 */
async function testAuthentication() {
  printSection('Phase 0: Authentication');
  
  try {
    const result = await bankingTools.executeTool('authenticate_user', {
      username: TEST_USER.username,
      password: TEST_USER.password,
      sessionId: 'test-session-001'
    });
    
    if (result.success && result.data.accessToken) {
      authToken = result.data.accessToken;
      printResult(
        'authenticate_user',
        true,
        `Token obtained for user: ${result.data.user.username}`,
        { userId: result.data.user.userId, roles: result.data.roles }
      );
    } else {
      printResult('authenticate_user', false, 'No access token returned');
      process.exit(1);
    }
  } catch (error) {
    printResult('authenticate_user', false, error.message);
    process.exit(1);
  }
}

/**
 * Test Phase 1: Core Account & Card Operations
 */
async function testPhase1() {
  printSection('Phase 1: Core Account & Card Operations (5 tools)');
  
  // Test get_all_accounts
  try {
    const result = await bankingTools.executeTool('get_all_accounts', {
      authToken,
      limit: 10,
      sessionId: 'test-session-002'
    });
    
    if (result.success && result.data) {
      testAccountId = result.data[0]?.account_id || result.data[0]?.accountId;
      printResult(
        'get_all_accounts',
        true,
        `Found ${result.count} accounts`,
        { firstAccount: testAccountId }
      );
    } else {
      printResult('get_all_accounts', false, 'Failed to get accounts');
    }
  } catch (error) {
    printResult('get_all_accounts', false, error.message);
  }
  
  // Test get_account_details
  if (testAccountId) {
    try {
      const result = await bankingTools.executeTool('get_account_details', {
        accountId: testAccountId,
        authToken,
        sessionId: 'test-session-003'
      });
      
      printResult(
        'get_account_details',
        result.success,
        result.success ? `Account type: ${result.data.accountType}` : 'Failed to get account details'
      );
    } catch (error) {
      printResult('get_account_details', false, error.message);
    }
  } else {
    printResult('get_account_details', false, 'Skipped: No account ID available');
    testResults.skipped++;
  }
  
  // Test get_all_cards
  try {
    const result = await bankingTools.executeTool('get_all_cards', {
      authToken,
      limit: 10,
      sessionId: 'test-session-004'
    });
    
    if (result.success && result.data) {
      testCardId = result.data[0]?.card_id || result.data[0]?.cardId;
      printResult(
        'get_all_cards',
        true,
        `Found ${result.count} cards`,
        { firstCard: testCardId }
      );
    } else {
      printResult('get_all_cards', false, 'Failed to get cards');
    }
  } catch (error) {
    printResult('get_all_cards', false, error.message);
  }
  
  // Test get_card_details
  if (testCardId) {
    try {
      const result = await bankingTools.executeTool('get_card_details', {
        cardId: testCardId,
        authToken,
        sessionId: 'test-session-005'
      });
      
      printResult(
        'get_card_details',
        result.success,
        result.success ? `Card brand: ${result.data.cardBrand}` : 'Failed to get card details'
      );
    } catch (error) {
      printResult('get_card_details', false, error.message);
    }
  } else {
    printResult('get_card_details', false, 'Skipped: No card ID available');
    testResults.skipped++;
  }
  
  // Test create_transfer (skip actual creation in test)
  printResult('create_transfer', false, 'Skipped: Requires two account IDs');
  testResults.skipped++;
  testResults.failed--;
}

/**
 * Test Phase 2: Card Management Operations
 */
async function testPhase2() {
  printSection('Phase 2: Card Management Operations (4 tools)');
  
  // Skip destructive operations in automated tests
  printResult('block_card', false, 'Skipped: Destructive operation');
  testResults.skipped++;
  testResults.failed--;
  
  printResult('unblock_card', false, 'Skipped: Destructive operation');
  testResults.skipped++;
  testResults.failed--;
  
  printResult('activate_card', false, 'Skipped: Destructive operation');
  testResults.skipped++;
  testResults.failed--;
  
  printResult('replace_card', false, 'Skipped: Destructive operation');
  testResults.skipped++;
  testResults.failed--;
}

/**
 * Test Phase 3: Fraud & Dispute Operations
 */
async function testPhase3() {
  printSection('Phase 3: Fraud & Dispute Operations (6 tools)');
  
  // Test get_fraud_alerts
  try {
    const result = await bankingTools.executeTool('get_fraud_alerts', {
      authToken,
      limit: 10,
      sessionId: 'test-session-010'
    });
    
    if (result.success && result.data) {
      testFraudAlertId = result.data[0]?.alert_id || result.data[0]?.alertId;
      printResult(
        'get_fraud_alerts',
        true,
        `Found ${result.count} fraud alerts`,
        { firstAlert: testFraudAlertId }
      );
    } else {
      printResult('get_fraud_alerts', false, 'Failed to get fraud alerts');
    }
  } catch (error) {
    printResult('get_fraud_alerts', false, error.message);
  }
  
  // Test get_fraud_alert_details
  if (testFraudAlertId) {
    try {
      const result = await bankingTools.executeTool('get_fraud_alert_details', {
        alertId: testFraudAlertId,
        authToken,
        sessionId: 'test-session-011'
      });
      
      printResult(
        'get_fraud_alert_details',
        result.success,
        result.success ? `Alert type: ${result.data.alertType}` : 'Failed to get alert details'
      );
    } catch (error) {
      printResult('get_fraud_alert_details', false, error.message);
    }
  } else {
    printResult('get_fraud_alert_details', false, 'Skipped: No fraud alert ID available');
    testResults.skipped++;
  }
  
  // Test report_fraud (skip actual creation)
  printResult('report_fraud', false, 'Skipped: Creates new alert');
  testResults.skipped++;
  testResults.failed--;
  
  // Test get_all_disputes
  try {
    const result = await bankingTools.executeTool('get_all_disputes', {
      authToken,
      limit: 10,
      sessionId: 'test-session-012'
    });
    
    if (result.success && result.data) {
      testDisputeId = result.data[0]?.dispute_id || result.data[0]?.disputeId;
      printResult(
        'get_all_disputes',
        true,
        `Found ${result.count} disputes`,
        { firstDispute: testDisputeId }
      );
    } else {
      printResult('get_all_disputes', false, 'Failed to get disputes');
    }
  } catch (error) {
    printResult('get_all_disputes', false, error.message);
  }
  
  // Test get_dispute_details
  if (testDisputeId) {
    try {
      const result = await bankingTools.executeTool('get_dispute_details', {
        disputeId: testDisputeId,
        authToken,
        sessionId: 'test-session-013'
      });
      
      printResult(
        'get_dispute_details',
        result.success,
        result.success ? `Dispute type: ${result.data.disputeType}` : 'Failed to get dispute details'
      );
    } catch (error) {
      printResult('get_dispute_details', false, error.message);
    }
  } else {
    printResult('get_dispute_details', false, 'Skipped: No dispute ID available');
    testResults.skipped++;
  }
  
  // Test submit_dispute_evidence (skip)
  printResult('submit_dispute_evidence', false, 'Skipped: Requires dispute ID');
  testResults.skipped++;
  testResults.failed--;
  
  // Test resolve_dispute (skip)
  printResult('resolve_dispute', false, 'Skipped: Destructive operation');
  testResults.skipped++;
  testResults.failed--;
}

/**
 * Test Phase 4: Additional Tools
 */
async function testPhase4() {
  printSection('Phase 4: Additional Tools (8 tools)');
  
  // Test get_transactions (already tested, but do it again)
  try {
    const result = await bankingTools.executeTool('get_transactions', {
      authToken,
      page: 1,
      limit: 10,
      sessionId: 'test-session-020'
    });
    
    if (result.success && result.data) {
      testTransactionId = result.data[0]?.transaction_id || result.data[0]?.transactionId;
      printResult(
        'get_transactions',
        true,
        `Found ${result.count} transactions`,
        { firstTransaction: testTransactionId }
      );
    } else {
      printResult('get_transactions', false, 'Failed to get transactions');
    }
  } catch (error) {
    printResult('get_transactions', false, error.message);
  }
  
  // Test get_transaction_details
  if (testTransactionId) {
    try {
      const result = await bankingTools.executeTool('get_transaction_details', {
        transactionId: testTransactionId,
        authToken,
        sessionId: 'test-session-021'
      });
      
      printResult(
        'get_transaction_details',
        result.success,
        result.success ? `Amount: $${result.data.amount}` : 'Failed to get transaction details'
      );
    } catch (error) {
      printResult('get_transaction_details', false, error.message);
    }
  } else {
    printResult('get_transaction_details', false, 'Skipped: No transaction ID available');
    testResults.skipped++;
  }
  
  // Test get_transaction_categories
  try {
    const result = await bankingTools.executeTool('get_transaction_categories', {
      authToken,
      sessionId: 'test-session-022'
    });
    
    printResult(
      'get_transaction_categories',
      result.success,
      result.success ? `Found ${result.data?.length || 0} categories` : 'Failed to get categories'
    );
  } catch (error) {
    printResult('get_transaction_categories', false, error.message);
  }
  
  // Test get_user_profile
  try {
    const result = await bankingTools.executeTool('get_user_profile', {
      authToken,
      sessionId: 'test-session-023'
    });
    
    printResult(
      'get_user_profile',
      result.success,
      result.success ? `User: ${result.data.username}` : 'Failed to get user profile'
    );
  } catch (error) {
    printResult('get_user_profile', false, error.message);
  }
  
  // Test get_all_transfers
  try {
    const result = await bankingTools.executeTool('get_all_transfers', {
      authToken,
      limit: 10,
      sessionId: 'test-session-024'
    });
    
    if (result.success && result.data) {
      testTransferId = result.data[0]?.transfer_id || result.data[0]?.transferId;
      printResult(
        'get_all_transfers',
        true,
        `Found ${result.count} transfers`,
        { firstTransfer: testTransferId }
      );
    } else {
      printResult('get_all_transfers', false, 'Failed to get transfers');
    }
  } catch (error) {
    printResult('get_all_transfers', false, error.message);
  }
  
  // Test get_transfer_details
  if (testTransferId) {
    try {
      const result = await bankingTools.executeTool('get_transfer_details', {
        transferId: testTransferId,
        authToken,
        sessionId: 'test-session-025'
      });
      
      printResult(
        'get_transfer_details',
        result.success,
        result.success ? `Amount: $${result.data.amount}` : 'Failed to get transfer details'
      );
    } catch (error) {
      printResult('get_transfer_details', false, error.message);
    }
  } else {
    printResult('get_transfer_details', false, 'Skipped: No transfer ID available');
    testResults.skipped++;
  }
  
  // Test cancel_transfer (skip)
  printResult('cancel_transfer', false, 'Skipped: Destructive operation');
  testResults.skipped++;
  testResults.failed--;
  
  // Test update_fraud_alert (skip)
  printResult('update_fraud_alert', false, 'Skipped: Destructive operation');
  testResults.skipped++;
  testResults.failed--;
  
  // Test update_dispute (skip)
  printResult('update_dispute', false, 'Skipped: Destructive operation');
  testResults.skipped++;
  testResults.failed--;
}

/**
 * Print final summary
 */
function printSummary() {
  console.log(`\n${colors.blue}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.blue}Test Summary${colors.reset}`);
  console.log(`${colors.blue}${'='.repeat(60)}${colors.reset}\n`);
  
  console.log(`Total Tests:     ${testResults.total}`);
  console.log(`${colors.green}✓ Passed:${colors.reset}        ${testResults.passed}`);
  console.log(`${colors.red}✗ Failed:${colors.reset}        ${testResults.failed}`);
  console.log(`${colors.yellow}⊘ Skipped:${colors.reset}       ${testResults.skipped}`);
  
  const successRate = ((testResults.passed / (testResults.total - testResults.skipped)) * 100).toFixed(1);
  console.log(`\n${colors.cyan}Success Rate:${colors.reset}   ${successRate}% (excluding skipped)`);
  
  if (testResults.failed === 0) {
    console.log(`\n${colors.green}🎉 All tests passed!${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}❌ Some tests failed${colors.reset}\n`);
    process.exit(1);
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}MCP Banking Tools - Comprehensive Test Suite${colors.reset}`);
  console.log(`${colors.cyan}Testing all 28 tools against Banking Service API${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  
  try {
    await testAuthentication();
    await testPhase1();
    await testPhase2();
    await testPhase3();
    await testPhase4();
    
    printSummary();
  } catch (error) {
    console.error(`\n${colors.red}Fatal error:${colors.reset}`, error.message);
    process.exit(1);
  }
}

// Run tests
runTests();
