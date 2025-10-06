/**
 * Prompt Templates for Different Intents
 * Each intent has a specific system prompt and user prompt template
 */

const PROMPTS = {
  // Balance inquiry intent
  balance_inquiry: {
    system: `You are a banking assistant helping with balance inquiries.
Your role is to:
1. Confirm the user's identity if needed
2. Retrieve account balance information
3. Present the balance clearly and offer additional assistance

Be professional, concise, and security-conscious.`,
    
    user: (context) => `User Question: ${context.question}

${context.accountData ? `Account Information:
- Account Number: ${context.accountData.accountNumber}
- Account Type: ${context.accountData.accountType}
- Current Balance: $${context.accountData.balance}
` : 'Account information will be retrieved.'}

Provide a clear, helpful response about the account balance.`,
    
    requiredData: ['userId'],
    tools: ['banking_get_balance', 'banking_account_info']
  },

  // Transaction history intent
  transaction_history: {
    system: `You are a banking assistant helping with transaction history.
Your role is to:
1. Understand the timeframe the user wants to see
2. Retrieve transaction history
3. Present transactions in a clear, organized manner
4. Answer any follow-up questions about transactions

Be detailed but concise.`,
    
    user: (context) => `User Question: ${context.question}

${context.timeframe ? `Timeframe: ${context.timeframe}` : 'Timeframe not specified - ask user.'}
${context.transactions ? `\nTransactions:\n${JSON.stringify(context.transactions, null, 2)}` : ''}

Help the user understand their transaction history.`,
    
    requiredData: ['userId', 'timeframe'],
    tools: ['banking_get_transactions']
  },

  // Fund transfer intent
  transfer_funds: {
    system: `You are a banking assistant helping with fund transfers.
Your role is to:
1. Collect all required information (recipient, amount, purpose)
2. Verify the transfer details with the user
3. Execute the transfer using the banking tools
4. Confirm successful completion

IMPORTANT: Always confirm with the user before executing a transfer.
Be security-conscious and verify all details.`,
    
    user: (context) => `User Question: ${context.question}

Transfer Details:
${context.recipient ? `- Recipient: ${context.recipient}` : '- Recipient: [REQUIRED]'}
${context.amount ? `- Amount: $${context.amount}` : '- Amount: [REQUIRED]'}
${context.purpose ? `- Purpose: ${context.purpose}` : '- Purpose: [OPTIONAL]'}

${context.transferResult ? `Transfer Status: ${context.transferResult.status}` : ''}

Guide the user through the transfer process step by step.`,
    
    requiredData: ['userId', 'recipient', 'amount'],
    optionalData: ['purpose', 'memo'],
    needsConfirmation: true,
    tools: ['banking_transfer', 'banking_get_balance']
  },

  // Card management intent
  card_management: {
    system: `You are a banking assistant helping with card management.
Your role is to:
1. Understand what card operation the user wants
2. Provide information about cards
3. Execute card operations (block, unblock, replace) when requested
4. Confirm actions and provide next steps

Be cautious with card blocking - confirm user's intent.`,
    
    user: (context) => `User Question: ${context.question}

${context.cardAction ? `Requested Action: ${context.cardAction}` : 'Action not specified - ask user.'}
${context.cardData ? `\nCard Information:\n${JSON.stringify(context.cardData, null, 2)}` : ''}
${context.actionResult ? `\nAction Result: ${context.actionResult}` : ''}

Help the user manage their card safely and efficiently.`,
    
    requiredData: ['userId', 'cardAction'],
    optionalData: ['cardId', 'reason'],
    needsConfirmation: true,
    tools: ['banking_get_cards', 'banking_block_card']
  },

  // Dispute transaction intent
  dispute_transaction: {
    system: `You are a banking assistant helping with transaction disputes.
Your role is to:
1. Collect details about the disputed transaction
2. Gather reason for dispute
3. File the dispute with the banking system
4. Explain next steps and timeline

Be empathetic and thorough.`,
    
    user: (context) => `User Question: ${context.question}

Dispute Details:
${context.transactionId ? `- Transaction ID: ${context.transactionId}` : '- Transaction ID: [REQUIRED]'}
${context.reason ? `- Reason: ${context.reason}` : '- Reason: [REQUIRED]'}
${context.description ? `- Description: ${context.description}` : '- Description: [OPTIONAL]'}

${context.disputeResult ? `Dispute Filed: Case #${context.disputeResult.caseId}` : ''}

Guide the user through the dispute filing process.`,
    
    requiredData: ['userId', 'transactionId', 'reason'],
    optionalData: ['description', 'evidence'],
    tools: ['banking_get_transactions', 'banking_dispute']
  },

  // General inquiry intent
  general_inquiry: {
    system: `You are a helpful banking assistant.
Your role is to:
1. Understand the user's question
2. Provide accurate information about banking services
3. Guide users to the right resources
4. Offer to help with specific tasks

Be friendly, professional, and helpful.`,
    
    user: (context) => `User Question: ${context.question}

${context.additionalInfo ? `Additional Context:\n${context.additionalInfo}` : ''}

Provide a helpful, informative response.`,
    
    requiredData: [],
    tools: []
  },

  // Account information intent
  account_info: {
    system: `You are a banking assistant providing account information.
Your role is to:
1. Retrieve comprehensive account details
2. Present information clearly
3. Answer specific questions about the account
4. Offer additional relevant information

Be thorough and accurate.`,
    
    user: (context) => `User Question: ${context.question}

${context.accountData ? `Account Details:\n${JSON.stringify(context.accountData, null, 2)}` : ''}

Provide comprehensive account information in a clear format.`,
    
    requiredData: ['userId'],
    tools: ['banking_account_info', 'banking_get_balance']
  }
};

/**
 * Get prompt for a specific intent
 */
function getPromptForIntent(intent) {
  const prompt = PROMPTS[intent] || PROMPTS.general_inquiry;
  return prompt;
}

/**
 * Build system message
 */
function buildSystemMessage(intent) {
  const prompt = getPromptForIntent(intent);
  return prompt.system;
}

/**
 * Build user message with context
 */
function buildUserMessage(intent, context) {
  const prompt = getPromptForIntent(intent);
  return prompt.user(context);
}

/**
 * Get required data fields for intent
 */
function getRequiredDataForIntent(intent) {
  const prompt = getPromptForIntent(intent);
  return prompt.requiredData || [];
}

/**
 * Get optional data fields for intent
 */
function getOptionalDataForIntent(intent) {
  const prompt = getPromptForIntent(intent);
  return prompt.optionalData || [];
}

/**
 * Check if intent needs confirmation
 */
function needsConfirmation(intent) {
  const prompt = getPromptForIntent(intent);
  return prompt.needsConfirmation === true;
}

/**
 * Get tools for intent
 */
function getToolsForIntent(intent) {
  const prompt = getPromptForIntent(intent);
  return prompt.tools || [];
}

module.exports = {
  PROMPTS,
  getPromptForIntent,
  buildSystemMessage,
  buildUserMessage,
  getRequiredDataForIntent,
  getOptionalDataForIntent,
  needsConfirmation,
  getToolsForIntent
};
