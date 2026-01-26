/**
 * Example Test Cases for Updated Authentication & Checkpointer
 * 
 * These examples demonstrate how to use the revised orchestrator
 * with authenticated users and LangGraph checkpointer
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/orchestrator';

// Helper function to make requests
async function makeRequest(endpoint, data) {
  try {
    const response = await axios.post(`${BASE_URL}${endpoint}`, data);
    return response.data;
  } catch (error) {
    console.error('Request failed:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Example 1: Simple Balance Inquiry
 * - User is authenticated (userId provided)
 * - No additional data required
 */
async function example1_BalanceInquiry() {
  console.log('\n=== Example 1: Balance Inquiry ===');
  
  const result = await makeRequest('/process', {
    sessionId: 'session-' + Date.now(),
    userId: 'user-12345',              // From authenticated session
    intent: 'balance_inquiry',
    question: 'What is my account balance?'
  });
  
  console.log('Response:', result);
  // Expected: Complete response with balance information
}

/**
 * Example 2: Transaction History with Optional Parameters
 * - User is authenticated
 * - Timeframe is optional (defaults to 30 days)
 */
async function example2_TransactionHistory() {
  console.log('\n=== Example 2: Transaction History ===');
  
  const result = await makeRequest('/process', {
    sessionId: 'session-' + Date.now(),
    userId: 'user-12345',
    intent: 'transaction_history',
    question: 'Show me my recent transactions',
    metadata: {
      timeframe: 'last_week'           // Optional parameter
    }
  });
  
  console.log('Response:', result);
}

/**
 * Example 3: Fund Transfer with Human-in-the-Loop
 * - Demonstrates checkpointer usage
 * - Shows how workflow pauses for confirmation
 * - Shows how workflow resumes from checkpoint
 */
async function example3_FundTransfer() {
  console.log('\n=== Example 3: Fund Transfer with Confirmation ===');
  
  const sessionId = 'session-' + Date.now();
  
  // Step 1: Initiate transfer
  console.log('\nStep 1: Initiating transfer...');
  const initiateResult = await makeRequest('/process', {
    sessionId,
    userId: 'user-12345',
    intent: 'transfer_funds',
    question: 'Transfer $100 to account 987654321'
  });
  
  console.log('Initiate Response:', initiateResult);
  
  if (initiateResult.needsHumanInput && 
      initiateResult.type === 'confirmation_required') {
    console.log('\nConfirmation Question:', initiateResult.question);
    
    // Step 2: User confirms
    // Simulate waiting for user input
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('\nStep 2: Providing confirmation...');
    const confirmResult = await makeRequest('/feedback', {
      sessionId,                       // Same sessionId!
      response: 'yes',
      confirmed: true
    });
    
    console.log('Confirmation Response:', confirmResult);
    // Workflow resumes from checkpoint and completes transfer
  }
}

/**
 * Example 4: Card Management
 * - User wants to block a card
 * - Requires confirmation
 */
async function example4_BlockCard() {
  console.log('\n=== Example 4: Block Card ===');
  
  const sessionId = 'session-' + Date.now();
  
  // Step 1: Request card block
  const blockRequest = await makeRequest('/process', {
    sessionId,
    userId: 'user-12345',
    intent: 'card_management',
    question: 'I need to block my credit card, I lost it',
    metadata: {
      cardAction: 'block',
      reason: 'lost'
    }
  });
  
  console.log('Block Request Response:', blockRequest);
  
  // Step 2: If confirmation needed, provide it
  if (blockRequest.needsHumanInput) {
    console.log('\nConfirming card block...');
    const confirmResult = await makeRequest('/feedback', {
      sessionId,
      response: 'yes, block it',
      confirmed: true
    });
    
    console.log('Block Confirmation:', confirmResult);
  }
}

/**
 * Example 5: Dispute Transaction
 * - Collect required information
 * - File dispute
 */
async function example5_DisputeTransaction() {
  console.log('\n=== Example 5: Dispute Transaction ===');
  
  const sessionId = 'session-' + Date.now();
  
  const result = await makeRequest('/process', {
    sessionId,
    userId: 'user-12345',
    intent: 'dispute_transaction',
    question: 'I want to dispute transaction TXN-98765. I never made this purchase.',
    metadata: {
      transactionId: 'TXN-98765',
      reason: 'unauthorized',
      description: 'I did not make this purchase and do not recognize the merchant'
    }
  });
  
  console.log('Dispute Response:', result);
}

/**
 * Example 6: Session Continuity
 * - Multiple exchanges in same session
 * - Demonstrates checkpointer maintaining state
 */
async function example6_SessionContinuity() {
  console.log('\n=== Example 6: Session Continuity ===');
  
  const sessionId = 'session-' + Date.now();
  const userId = 'user-12345';
  
  // First question
  console.log('\nFirst Question:');
  const result1 = await makeRequest('/process', {
    sessionId,
    userId,
    intent: 'balance_inquiry',
    question: 'What is my balance?'
  });
  console.log('Response 1:', result1);
  
  // Follow-up question in same session
  console.log('\nFollow-up Question:');
  const result2 = await makeRequest('/process', {
    sessionId,                         // Same session!
    userId,
    intent: 'transaction_history',
    question: 'Show me my recent transactions'
  });
  console.log('Response 2:', result2);
  
  // The checkpointer maintains conversation context
}

/**
 * Example 7: Get Session Status
 * - Check session state
 * - View conversation history
 */
async function example7_GetSessionStatus() {
  console.log('\n=== Example 7: Get Session Status ===');
  
  const sessionId = 'session-' + Date.now();
  
  // Create session
  await makeRequest('/process', {
    sessionId,
    userId: 'user-12345',
    intent: 'balance_inquiry',
    question: 'What is my balance?'
  });
  
  // Get session status
  const status = await axios.get(`${BASE_URL}/session/${sessionId}`);
  console.log('Session Status:', JSON.stringify(status.data, null, 2));
}

/**
 * Example 8: Error Handling - Missing userId
 * - Demonstrates validation
 */
async function example8_MissingUserId() {
  console.log('\n=== Example 8: Missing userId Error ===');
  
  try {
    await makeRequest('/process', {
      sessionId: 'session-' + Date.now(),
      // userId missing!
      intent: 'balance_inquiry',
      question: 'What is my balance?'
    });
  } catch (error) {
    console.log('Expected Error:', error.response?.data);
    // Should receive validation error about missing userId
  }
}

/**
 * Example 9: Multi-Step Data Collection
 * - Intent requires multiple pieces of data
 * - Workflow collects data step by step
 */
async function example9_MultiStepCollection() {
  console.log('\n=== Example 9: Multi-Step Data Collection ===');
  
  const sessionId = 'session-' + Date.now();
  
  // Step 1: Start with incomplete information
  console.log('\nStep 1: Starting with incomplete info...');
  const result1 = await makeRequest('/process', {
    sessionId,
    userId: 'user-12345',
    intent: 'transfer_funds',
    question: 'I want to transfer money'
    // Missing: recipient and amount
  });
  
  console.log('Response 1:', result1);
  
  if (result1.needsHumanInput && result1.type === 'human_input_required') {
    console.log('\nMissing Data:', result1.requiredFields);
    
    // Step 2: Provide missing information
    console.log('\nStep 2: Providing missing data...');
    const result2 = await makeRequest('/feedback', {
      sessionId,
      response: 'Transfer $50 to account 123456789'
    });
    
    console.log('Response 2:', result2);
    
    // Step 3: Confirm if needed
    if (result2.needsHumanInput && result2.type === 'confirmation_required') {
      console.log('\nStep 3: Confirming...');
      const result3 = await makeRequest('/feedback', {
        sessionId,
        response: 'yes',
        confirmed: true
      });
      
      console.log('Final Response:', result3);
    }
  }
}

/**
 * Example 10: Checkpointer State Recovery
 * - Demonstrates how checkpointer preserves state
 */
async function example10_StateRecovery() {
  console.log('\n=== Example 10: Checkpointer State Recovery ===');
  
  const sessionId = 'session-' + Date.now();
  
  // Request 1: Start complex workflow
  console.log('\nRequest 1: Starting workflow...');
  const result1 = await makeRequest('/process', {
    sessionId,
    userId: 'user-12345',
    intent: 'transfer_funds',
    question: 'Transfer $200 to John Doe account 555-1234'
  });
  
  console.log('State after Request 1:', {
    needsHumanInput: result1.needsHumanInput,
    currentStep: result1.currentStep
  });
  
  // Simulate user doing something else, then coming back
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Request 2: Resume workflow
  console.log('\nRequest 2: Resuming from checkpoint...');
  const result2 = await makeRequest('/feedback', {
    sessionId,
    response: 'yes, proceed',
    confirmed: true
  });
  
  console.log('State after Request 2:', {
    type: result2.type,
    success: result2.success
  });
  
  // The checkpointer ensures all context is maintained!
}

// Run all examples
async function runAllExamples() {
  console.log('Starting AI Orchestrator Examples...\n');
  
  try {
    await example1_BalanceInquiry();
    await example2_TransactionHistory();
    await example3_FundTransfer();
    await example4_BlockCard();
    await example5_DisputeTransaction();
    await example6_SessionContinuity();
    await example7_GetSessionStatus();
    await example8_MissingUserId();
    await example9_MultiStepCollection();
    await example10_StateRecovery();
    
    console.log('\n✅ All examples completed!');
  } catch (error) {
    console.error('\n❌ Example failed:', error.message);
  }
}

// Export for use in tests
module.exports = {
  example1_BalanceInquiry,
  example2_TransactionHistory,
  example3_FundTransfer,
  example4_BlockCard,
  example5_DisputeTransaction,
  example6_SessionContinuity,
  example7_GetSessionStatus,
  example8_MissingUserId,
  example9_MultiStepCollection,
  example10_StateRecovery,
  runAllExamples
};

// Run if executed directly
if (require.main === module) {
  runAllExamples();
}
