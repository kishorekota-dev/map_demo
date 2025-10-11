/**
 * Intent Configuration & Mapping
 * 
 * This is the central configuration file for all intent-based routing.
 * All intent mappings, prompt templates, and tool associations are defined here.
 * 
 * HOW TO ADD A NEW INTENT:
 * 1. Add intent to INTENT_CATEGORIES
 * 2. Define prompt in INTENT_PROMPTS
 * 3. Map tools in INTENT_TOOL_MAPPING
 * 4. Set behavior in INTENT_BEHAVIOR
 * 5. Add NLU patterns in INTENT_PATTERNS (optional)
 */

// ==================== INTENT CATEGORIES ====================
// Organize intents by functional category for easier maintenance

const INTENT_CATEGORIES = {
  ACCOUNT_OPERATIONS: [
    'balance_inquiry',
    'account_info',
    'account_statement'
  ],
  
  TRANSACTION_OPERATIONS: [
    'transaction_history',
    'transfer_funds',
    'payment_inquiry'
  ],
  
  CARD_OPERATIONS: [
    'card_management',
    'card_activation',
    'card_replacement'
  ],
  
  SECURITY_OPERATIONS: [
    'report_fraud',
    'check_fraud_alerts',
    'verify_transaction',
    'dispute_transaction'
  ],
  
  SUPPORT_OPERATIONS: [
    'general_inquiry',
    'help',
    'complaint'
  ]
};

// ==================== INTENT METADATA ====================
// Define core properties for each intent

const INTENT_METADATA = {
  balance_inquiry: {
    name: 'Balance Inquiry',
    category: 'ACCOUNT_OPERATIONS',
    description: 'Check account balance',
    requiresAuth: true,
    priority: 'normal',
    estimatedDuration: 'quick' // quick, medium, long
  },
  
  transaction_history: {
    name: 'Transaction History',
    category: 'TRANSACTION_OPERATIONS',
    description: 'View past transactions',
    requiresAuth: true,
    priority: 'normal',
    estimatedDuration: 'quick'
  },
  
  transfer_funds: {
    name: 'Fund Transfer',
    category: 'TRANSACTION_OPERATIONS',
    description: 'Transfer money between accounts',
    requiresAuth: true,
    priority: 'high',
    estimatedDuration: 'medium'
  },
  
  card_management: {
    name: 'Card Management',
    category: 'CARD_OPERATIONS',
    description: 'Manage debit/credit cards',
    requiresAuth: true,
    priority: 'high',
    estimatedDuration: 'medium'
  },
  
  dispute_transaction: {
    name: 'Dispute Transaction',
    category: 'SECURITY_OPERATIONS',
    description: 'File a transaction dispute',
    requiresAuth: true,
    priority: 'high',
    estimatedDuration: 'long'
  },
  
  report_fraud: {
    name: 'Report Fraud',
    category: 'SECURITY_OPERATIONS',
    description: 'Report fraudulent activity',
    requiresAuth: true,
    priority: 'critical',
    estimatedDuration: 'medium'
  },
  
  check_fraud_alerts: {
    name: 'Check Fraud Alerts',
    category: 'SECURITY_OPERATIONS',
    description: 'View fraud alerts and warnings',
    requiresAuth: true,
    priority: 'high',
    estimatedDuration: 'quick'
  },
  
  verify_transaction: {
    name: 'Verify Transaction',
    category: 'SECURITY_OPERATIONS',
    description: 'Confirm or deny suspicious transactions',
    requiresAuth: true,
    priority: 'high',
    estimatedDuration: 'quick'
  },
  
  general_inquiry: {
    name: 'General Inquiry',
    category: 'SUPPORT_OPERATIONS',
    description: 'General questions and support',
    requiresAuth: false,
    priority: 'normal',
    estimatedDuration: 'quick'
  }
};

// ==================== INTENT BEHAVIOR ====================
// Control how each intent behaves in the workflow

const INTENT_BEHAVIOR = {
  balance_inquiry: {
    needsConfirmation: false,
    allowsPartialData: true,
    requiresAllFields: false,
    canUseDefaults: true,
    maxRetries: 3
  },
  
  transaction_history: {
    needsConfirmation: false,
    allowsPartialData: true,
    requiresAllFields: false,
    canUseDefaults: true,
    maxRetries: 3
  },
  
  transfer_funds: {
    needsConfirmation: true,
    allowsPartialData: false,
    requiresAllFields: true,
    canUseDefaults: false,
    maxRetries: 3,
    confirmationMessage: 'Please confirm you want to transfer ${amount} to ${recipient}'
  },
  
  card_management: {
    needsConfirmation: true,
    allowsPartialData: false,
    requiresAllFields: true,
    canUseDefaults: false,
    maxRetries: 2,
    confirmationMessage: 'Please confirm you want to ${cardAction} your card'
  },
  
  dispute_transaction: {
    needsConfirmation: false, // Disputes are long-form, confirmation at end
    allowsPartialData: true,
    requiresAllFields: true,
    canUseDefaults: false,
    maxRetries: 5 // Allow more attempts for complex disputes
  },
  
  report_fraud: {
    needsConfirmation: false, // URGENT - no delays
    allowsPartialData: true,
    requiresAllFields: false, // Get minimum info and act
    canUseDefaults: true,
    maxRetries: 2,
    isUrgent: true
  },
  
  check_fraud_alerts: {
    needsConfirmation: false,
    allowsPartialData: true,
    requiresAllFields: false,
    canUseDefaults: true,
    maxRetries: 3
  },
  
  verify_transaction: {
    needsConfirmation: true,
    allowsPartialData: false,
    requiresAllFields: true,
    canUseDefaults: false,
    maxRetries: 2,
    confirmationMessage: 'Please confirm: Did you authorize transaction ${transactionId}?'
  },
  
  general_inquiry: {
    needsConfirmation: false,
    allowsPartialData: true,
    requiresAllFields: false,
    canUseDefaults: true,
    maxRetries: 3
  }
};

// ==================== INTENT DATA REQUIREMENTS ====================
// Define what data each intent needs

const INTENT_DATA_REQUIREMENTS = {
  balance_inquiry: {
    required: [],
    optional: ['accountId'],
    defaults: {
      accountType: 'primary'
    }
  },
  
  transaction_history: {
    required: [],
    optional: ['timeframe', 'transactionType', 'minAmount', 'maxAmount'],
    defaults: {
      timeframe: 'last_30_days',
      limit: 20
    }
  },
  
  transfer_funds: {
    required: ['recipient', 'amount'],
    optional: ['purpose', 'memo', 'scheduledDate'],
    validation: {
      amount: { type: 'number', min: 0.01, max: 10000 },
      recipient: { type: 'string', pattern: '^[A-Z0-9]{10,20}$' }
    }
  },
  
  card_management: {
    required: ['cardAction'],
    optional: ['cardId', 'reason', 'replacementAddress'],
    validation: {
      cardAction: { type: 'enum', values: ['block', 'unblock', 'replace', 'view'] }
    }
  },
  
  dispute_transaction: {
    required: ['transactionId', 'disputeType', 'reason'],
    optional: ['description', 'evidenceProvided', 'amountDisputed', 'merchantName'],
    validation: {
      disputeType: {
        type: 'enum',
        values: [
          'unauthorized_transaction',
          'incorrect_amount',
          'duplicate_charge',
          'service_not_received',
          'product_not_received',
          'defective_product',
          'cancelled_service',
          'fraudulent_charge',
          'billing_error',
          'other'
        ]
      },
      reason: { type: 'string', minLength: 10, maxLength: 500 }
    }
  },
  
  report_fraud: {
    required: ['fraudType', 'description'],
    optional: ['transactionId', 'amount', 'location', 'dateOccurred', 'cardId', 'ipAddress'],
    validation: {
      fraudType: {
        type: 'enum',
        values: [
          'unauthorized_transaction',
          'unusual_activity',
          'card_not_present',
          'identity_theft',
          'account_takeover',
          'suspicious_merchant',
          'phishing',
          'atm_skimming',
          'other_fraud'
        ]
      },
      description: { type: 'string', minLength: 10, maxLength: 1000 }
    }
  },
  
  check_fraud_alerts: {
    required: [],
    optional: ['status', 'severity', 'dateFrom', 'dateTo'],
    defaults: {
      limit: 10,
      status: 'all'
    }
  },
  
  verify_transaction: {
    required: ['alertId', 'isLegitimate'],
    optional: ['additionalInfo'],
    validation: {
      isLegitimate: { type: 'boolean' }
    }
  },
  
  general_inquiry: {
    required: [],
    optional: ['topic', 'relatedIntent'],
    defaults: {}
  }
};

// ==================== INTENT TOOL MAPPING ====================
// Map each intent to the banking tools it can use

const INTENT_TOOL_MAPPING = {
  balance_inquiry: [
    'banking_get_balance',
    'banking_account_info'
  ],
  
  transaction_history: [
    'banking_get_transactions'
  ],
  
  transfer_funds: [
    'banking_transfer',
    'banking_get_balance',
    'banking_account_info'
  ],
  
  card_management: [
    'banking_get_cards',
    'banking_block_card',
    'banking_unblock_card',
    'banking_replace_card'
  ],
  
  dispute_transaction: [
    'banking_get_transactions',
    'banking_create_dispute',
    'banking_get_disputes',
    'banking_get_dispute_details',
    'banking_add_dispute_evidence',
    'banking_update_dispute',
    'banking_withdraw_dispute'
  ],
  
  report_fraud: [
    'banking_create_fraud_alert',
    'banking_get_transactions',
    'banking_block_card'
  ],
  
  check_fraud_alerts: [
    'banking_get_fraud_alerts',
    'banking_get_fraud_alert_details'
  ],
  
  verify_transaction: [
    'banking_verify_transaction',
    'banking_confirm_fraud',
    'banking_mark_false_positive',
    'banking_get_fraud_alert_details'
  ],
  
  general_inquiry: []
};

// ==================== INTENT PROMPT TEMPLATES ====================
// System and user prompts for each intent (using template references)

const INTENT_PROMPTS = {
  balance_inquiry: {
    systemPromptTemplate: 'account/balance_inquiry_system',
    userPromptTemplate: 'account/balance_inquiry_user',
    contextFields: ['userId', 'accountData']
  },
  
  transaction_history: {
    systemPromptTemplate: 'transaction/transaction_history_system',
    userPromptTemplate: 'transaction/transaction_history_user',
    contextFields: ['userId', 'timeframe', 'transactions']
  },
  
  transfer_funds: {
    systemPromptTemplate: 'transaction/transfer_funds_system',
    userPromptTemplate: 'transaction/transfer_funds_user',
    contextFields: ['userId', 'recipient', 'amount', 'purpose', 'transferResult']
  },
  
  card_management: {
    systemPromptTemplate: 'card/card_management_system',
    userPromptTemplate: 'card/card_management_user',
    contextFields: ['userId', 'cardAction', 'cardData', 'actionResult']
  },
  
  dispute_transaction: {
    systemPromptTemplate: 'security/dispute_transaction_system',
    userPromptTemplate: 'security/dispute_transaction_user',
    contextFields: ['userId', 'transactionId', 'disputeType', 'reason', 'description', 'evidenceProvided', 'disputeResult']
  },
  
  report_fraud: {
    systemPromptTemplate: 'security/report_fraud_system',
    userPromptTemplate: 'security/report_fraud_user',
    contextFields: ['userId', 'fraudType', 'description', 'transactionId', 'amount', 'fraudAlert']
  },
  
  check_fraud_alerts: {
    systemPromptTemplate: 'security/check_fraud_alerts_system',
    userPromptTemplate: 'security/check_fraud_alerts_user',
    contextFields: ['userId', 'alerts', 'filterCriteria']
  },
  
  verify_transaction: {
    systemPromptTemplate: 'security/verify_transaction_system',
    userPromptTemplate: 'security/verify_transaction_user',
    contextFields: ['userId', 'alertId', 'transactionDetails', 'isLegitimate', 'verificationResult']
  },
  
  general_inquiry: {
    systemPromptTemplate: 'support/general_inquiry_system',
    userPromptTemplate: 'support/general_inquiry_user',
    contextFields: ['userId', 'topic', 'additionalInfo']
  }
};

// ==================== NLU PATTERNS (Optional) ====================
// Common phrases that trigger each intent (for intent detection)

const INTENT_PATTERNS = {
  balance_inquiry: [
    'what is my balance',
    'check balance',
    'how much money',
    'account balance',
    'current balance',
    'show balance'
  ],
  
  transaction_history: [
    'show transactions',
    'transaction history',
    'recent transactions',
    'past transactions',
    'what did i spend',
    'where did my money go'
  ],
  
  transfer_funds: [
    'transfer money',
    'send money',
    'make payment',
    'pay someone',
    'move funds',
    'send to account'
  ],
  
  card_management: [
    'block my card',
    'freeze card',
    'lost my card',
    'stolen card',
    'replace card',
    'card stolen',
    'card missing'
  ],
  
  dispute_transaction: [
    'dispute transaction',
    'dispute charge',
    'wrong amount',
    'didn\'t receive',
    'file dispute',
    'chargeback',
    'incorrect charge',
    'want refund'
  ],
  
  report_fraud: [
    'fraud',
    'fraudulent',
    'someone charged',
    'unauthorized',
    'didn\'t authorize',
    'suspicious activity',
    'account hacked',
    'identity theft'
  ],
  
  check_fraud_alerts: [
    'fraud alerts',
    'check alerts',
    'security alerts',
    'fraud warnings',
    'suspicious activity alerts'
  ],
  
  verify_transaction: [
    'verify transaction',
    'confirm transaction',
    'was that me',
    'did i make',
    'legitimate transaction'
  ],
  
  general_inquiry: [
    'help',
    'question',
    'how do i',
    'what is',
    'can you help',
    'need assistance'
  ]
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Get all intents in a category
 */
function getIntentsByCategory(category) {
  return INTENT_CATEGORIES[category] || [];
}

/**
 * Get category for an intent
 */
function getCategoryForIntent(intent) {
  for (const [category, intents] of Object.entries(INTENT_CATEGORIES)) {
    if (intents.includes(intent)) {
      return category;
    }
  }
  return null;
}

/**
 * Get complete configuration for an intent
 */
function getIntentConfig(intent) {
  return {
    intent,
    metadata: INTENT_METADATA[intent] || {},
    behavior: INTENT_BEHAVIOR[intent] || {},
    dataRequirements: INTENT_DATA_REQUIREMENTS[intent] || {},
    tools: INTENT_TOOL_MAPPING[intent] || [],
    prompts: INTENT_PROMPTS[intent] || {},
    patterns: INTENT_PATTERNS[intent] || []
  };
}

/**
 * Validate if intent exists
 */
function isValidIntent(intent) {
  return intent in INTENT_METADATA;
}

/**
 * Get all available intents
 */
function getAllIntents() {
  return Object.keys(INTENT_METADATA);
}

/**
 * Get intents by priority
 */
function getIntentsByPriority(priority) {
  return Object.entries(INTENT_METADATA)
    .filter(([_, meta]) => meta.priority === priority)
    .map(([intent]) => intent);
}

/**
 * Check if intent requires authentication
 */
function requiresAuth(intent) {
  return INTENT_METADATA[intent]?.requiresAuth ?? true;
}

/**
 * Check if intent needs confirmation
 */
function needsConfirmation(intent) {
  return INTENT_BEHAVIOR[intent]?.needsConfirmation ?? false;
}

/**
 * Get tools for intent
 */
function getToolsForIntent(intent) {
  return INTENT_TOOL_MAPPING[intent] || [];
}

/**
 * Get required data fields for intent
 */
function getRequiredDataForIntent(intent) {
  return INTENT_DATA_REQUIREMENTS[intent]?.required || [];
}

/**
 * Get optional data fields for intent
 */
function getOptionalDataForIntent(intent) {
  return INTENT_DATA_REQUIREMENTS[intent]?.optional || [];
}

/**
 * Get validation rules for intent
 */
function getValidationRules(intent) {
  return INTENT_DATA_REQUIREMENTS[intent]?.validation || {};
}

/**
 * Get defaults for intent
 */
function getDefaults(intent) {
  return INTENT_DATA_REQUIREMENTS[intent]?.defaults || {};
}

// ==================== EXPORTS ====================

module.exports = {
  // Categories
  INTENT_CATEGORIES,
  getIntentsByCategory,
  getCategoryForIntent,
  
  // Configuration
  INTENT_METADATA,
  INTENT_BEHAVIOR,
  INTENT_DATA_REQUIREMENTS,
  INTENT_TOOL_MAPPING,
  INTENT_PROMPTS,
  INTENT_PATTERNS,
  
  // Unified Config
  getIntentConfig,
  
  // Validation
  isValidIntent,
  getAllIntents,
  getIntentsByPriority,
  
  // Quick Access Functions
  requiresAuth,
  needsConfirmation,
  getToolsForIntent,
  getRequiredDataForIntent,
  getOptionalDataForIntent,
  getValidationRules,
  getDefaults
};
