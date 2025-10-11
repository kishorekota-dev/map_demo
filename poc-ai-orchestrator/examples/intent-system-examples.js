/**
 * Intent System Examples
 * Demonstrates how to use the new intent-based configuration system
 */

const intentMapper = require('../src/services/intentMapper');

// ==================== EXAMPLE 1: Check if Intent is Valid ====================
console.log('=== Example 1: Validate Intent ===');
console.log('Is "balance_inquiry" valid?', intentMapper.isValidIntent('balance_inquiry'));
console.log('Is "invalid_intent" valid?', intentMapper.isValidIntent('invalid_intent'));
console.log('');

// ==================== EXAMPLE 2: Get Complete Intent Configuration ====================
console.log('=== Example 2: Get Intent Configuration ===');
const config = intentMapper.getIntentConfig('transfer_funds');
console.log('Transfer Funds Configuration:');
console.log(JSON.stringify(config, null, 2));
console.log('');

// ==================== EXAMPLE 3: Build Prompts ====================
console.log('=== Example 3: Build Prompts ===');

// System prompt
const systemPrompt = intentMapper.buildSystemMessage('balance_inquiry');
console.log('System Prompt for Balance Inquiry:');
console.log(systemPrompt);
console.log('');

// User prompt with context
const userPrompt = intentMapper.buildUserMessage('balance_inquiry', {
  question: 'What is my current balance?',
  userId: 'user-12345',
  accountData: {
    accountNumber: '****5678',
    accountType: 'Checking',
    balance: 5432.10,
    availableBalance: 5432.10
  }
});
console.log('User Prompt for Balance Inquiry:');
console.log(userPrompt);
console.log('');

// ==================== EXAMPLE 4: Get Data Requirements ====================
console.log('=== Example 4: Get Data Requirements ===');
const required = intentMapper.getRequiredData('dispute_transaction');
const optional = intentMapper.getOptionalData('dispute_transaction');
console.log('Dispute Transaction - Required Fields:', required);
console.log('Dispute Transaction - Optional Fields:', optional);
console.log('');

// ==================== EXAMPLE 5: Validate Collected Data ====================
console.log('=== Example 5: Validate Data ===');

// Valid data
const validData = {
  transactionId: 'TXN-123456',
  disputeType: 'unauthorized_transaction',
  reason: 'This is a detailed reason for the dispute that meets the minimum length requirement.'
};
const validationResult1 = intentMapper.validateData('dispute_transaction', validData);
console.log('Valid Data Validation:', validationResult1);
console.log('');

// Invalid data (missing required fields)
const invalidData = {
  transactionId: 'TXN-123456'
  // Missing disputeType and reason
};
const validationResult2 = intentMapper.validateData('dispute_transaction', invalidData);
console.log('Invalid Data Validation:', validationResult2);
console.log('');

// ==================== EXAMPLE 6: Get Tools for Intent ====================
console.log('=== Example 6: Get Tools ===');
const fraudTools = intentMapper.getToolsForIntent('report_fraud');
const disputeTools = intentMapper.getToolsForIntent('dispute_transaction');
console.log('Fraud Report Tools:', fraudTools);
console.log('Dispute Transaction Tools:', disputeTools);
console.log('');

// ==================== EXAMPLE 7: Check Intent Behavior ====================
console.log('=== Example 7: Check Behavior ===');
console.log('Transfer needs confirmation?', intentMapper.needsConfirmation('transfer_funds'));
console.log('Report fraud needs confirmation?', intentMapper.needsConfirmation('report_fraud'));
console.log('Report fraud is urgent?', intentMapper.isUrgent('report_fraud'));
console.log('Max retries for card management:', intentMapper.getMaxRetries('card_management'));
console.log('');

// ==================== EXAMPLE 8: Get Intent by Category ====================
console.log('=== Example 8: Get Intents by Category ===');
const securityIntents = intentMapper.getIntentsByCategory('SECURITY_OPERATIONS');
const accountIntents = intentMapper.getIntentsByCategory('ACCOUNT_OPERATIONS');
console.log('Security Operations Intents:', securityIntents);
console.log('Account Operations Intents:', accountIntents);
console.log('');

// ==================== EXAMPLE 9: Get All Available Intents ====================
console.log('=== Example 9: List All Intents ===');
const allIntents = intentMapper.getAllIntents();
console.log('All Available Intents:', allIntents);
console.log('Total Intents:', allIntents.length);
console.log('');

// ==================== EXAMPLE 10: Get Intent Metadata ====================
console.log('=== Example 10: Get Intent Metadata ===');
const metadata = intentMapper.getIntentMetadata('report_fraud');
console.log('Report Fraud Metadata:');
console.log(JSON.stringify(metadata, null, 2));
console.log('');

// ==================== EXAMPLE 11: Get Confirmation Message ====================
console.log('=== Example 11: Get Confirmation Message ===');
const confirmMsg = intentMapper.getConfirmationMessage('transfer_funds', {
  amount: 500,
  recipient: 'John Doe'
});
console.log('Transfer Confirmation Message:', confirmMsg);
console.log('');

// ==================== EXAMPLE 12: Suggest Similar Intents ====================
console.log('=== Example 12: Suggest Intents ===');
const suggestions = intentMapper.suggestIntents('fraud');
console.log('Intents matching "fraud":', suggestions);
console.log('');

// ==================== EXAMPLE 13: Full Workflow Simulation ====================
console.log('=== Example 13: Full Workflow Simulation ===');

// Simulate a user asking about balance
const intent = 'balance_inquiry';

console.log('1. Validate Intent:', intentMapper.isValidIntent(intent));

console.log('2. Check if authentication required:', intentMapper.requiresAuth(intent));

console.log('3. Get required data:', intentMapper.getRequiredData(intent));

console.log('4. Get tools:', intentMapper.getToolsForIntent(intent));

console.log('5. Build system prompt:');
console.log(intentMapper.buildSystemMessage(intent).substring(0, 100) + '...');

console.log('6. Build user prompt:');
const context = {
  question: 'Show me my balance',
  userId: 'user-999'
};
console.log(intentMapper.buildUserMessage(intent, context).substring(0, 100) + '...');

console.log('7. Check if confirmation needed:', intentMapper.needsConfirmation(intent));

console.log('8. Get category:', intentMapper.getCategoryForIntent(intent));
console.log('');

// ==================== EXAMPLE 14: Error Handling ====================
console.log('=== Example 14: Error Handling ===');

// Invalid intent
try {
  const invalidConfig = intentMapper.getIntentConfig('nonexistent_intent');
  console.log('Invalid intent config:', invalidConfig); // Will be null
} catch (error) {
  console.error('Error:', error.message);
}

// Graceful fallback for invalid intent
const fallbackPrompt = intentMapper.buildSystemMessage('nonexistent_intent');
console.log('Fallback prompt (first 50 chars):', fallbackPrompt.substring(0, 50) + '...');
console.log('');

// ==================== EXAMPLE 15: Dynamic Intent Selection ====================
console.log('=== Example 15: Dynamic Intent Selection ===');

function selectIntentForQuestion(question) {
  const lowerQuestion = question.toLowerCase();
  
  // Simple keyword matching (in production, use NLU service)
  if (lowerQuestion.includes('balance') || lowerQuestion.includes('how much')) {
    return 'balance_inquiry';
  } else if (lowerQuestion.includes('transfer') || lowerQuestion.includes('send money')) {
    return 'transfer_funds';
  } else if (lowerQuestion.includes('fraud') || lowerQuestion.includes('unauthorized')) {
    return 'report_fraud';
  } else if (lowerQuestion.includes('dispute') || lowerQuestion.includes('wrong charge')) {
    return 'dispute_transaction';
  } else if (lowerQuestion.includes('card') && lowerQuestion.includes('block')) {
    return 'card_management';
  } else {
    return 'general_inquiry';
  }
}

const testQuestions = [
  "What's my balance?",
  "I want to send money to John",
  "Someone charged my card without permission",
  "I need to dispute a transaction",
  "Block my card immediately"
];

testQuestions.forEach(question => {
  const detectedIntent = selectIntentForQuestion(question);
  const config = intentMapper.getIntentConfig(detectedIntent);
  console.log(`Q: "${question}"`);
  console.log(`   → Intent: ${detectedIntent} (${config.metadata.priority} priority)`);
});
console.log('');

// ==================== EXAMPLE 16: Validation with Multiple Fields ====================
console.log('=== Example 16: Complex Validation ===');

const transferData = {
  recipient: 'ACC1234567890',
  amount: 150.50,
  purpose: 'Payment for services'
};

const transferValidation = intentMapper.validateData('transfer_funds', transferData);
console.log('Transfer Data Validation:');
console.log(JSON.stringify(transferValidation, null, 2));

// Test with invalid amount
const invalidTransferData = {
  recipient: 'ACC1234567890',
  amount: -50, // Invalid: negative amount
  purpose: 'Payment'
};

const invalidTransferValidation = intentMapper.validateData('transfer_funds', invalidTransferData);
console.log('Invalid Transfer Data Validation:');
console.log(JSON.stringify(invalidTransferValidation, null, 2));
console.log('');

// ==================== EXAMPLE 17: Context Field Management ====================
console.log('=== Example 17: Context Fields ===');
const contextFields = intentMapper.getContextFields('dispute_transaction');
console.log('Context fields for dispute_transaction:', contextFields);
console.log('');

// ==================== EXAMPLE 18: Partial Data Handling ====================
console.log('=== Example 18: Partial Data Handling ===');
console.log('Balance inquiry allows partial data?', intentMapper.allowsPartialData('balance_inquiry'));
console.log('Transfer allows partial data?', intentMapper.allowsPartialData('transfer_funds'));
console.log('');

// ==================== USAGE EXAMPLES IN REAL WORKFLOW ====================
console.log('=== Usage in Real Workflow ===');
console.log(`
// In bankingChatWorkflow.js

// Get required data fields
const requiredData = intentMapper.getRequiredData(state.intent);

// Build prompts
const systemPrompt = intentMapper.buildSystemMessage(state.intent);
const userPrompt = intentMapper.buildUserMessage(state.intent, context);

// Get tools to execute
const tools = intentMapper.getToolsForIntent(state.intent);

// Check if confirmation needed
if (intentMapper.needsConfirmation(state.intent)) {
  // Request confirmation
}

// Validate collected data
const validation = intentMapper.validateData(state.intent, state.collectedData);
if (!validation.valid) {
  // Handle missing/invalid fields
}
`);

console.log('');
console.log('=== Examples Complete ===');
console.log('See INTENT-SYSTEM-MAINTENANCE-GUIDE.md for full documentation');
console.log('See INTENT-QUICK-REFERENCE.md for quick reference');
