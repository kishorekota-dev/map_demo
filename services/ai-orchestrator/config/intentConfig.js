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
  },

  account_info: {
    name: 'Account Information',
    category: 'ACCOUNT_OPERATIONS',
    description: 'View account details and metadata',
    requiresAuth: true,
    priority: 'normal',
    estimatedDuration: 'quick'
  },

  account_statement: {
    name: 'Account Statement',
    category: 'ACCOUNT_OPERATIONS',
    description: 'Retrieve an account statement',
    requiresAuth: true,
    priority: 'normal',
    estimatedDuration: 'medium'
  },

  payment_inquiry: {
    name: 'Payment Inquiry',
    category: 'TRANSACTION_OPERATIONS',
    description: 'Check status of payments and transfers',
    requiresAuth: true,
    priority: 'normal',
    estimatedDuration: 'quick'
  },

  card_activation: {
    name: 'Card Activation',
    category: 'CARD_OPERATIONS',
    description: 'Activate a new or replacement card',
    requiresAuth: true,
    priority: 'high',
    estimatedDuration: 'medium'
  },

  card_replacement: {
    name: 'Card Replacement',
    category: 'CARD_OPERATIONS',
    description: 'Request a replacement card',
    requiresAuth: true,
    priority: 'high',
    estimatedDuration: 'medium'
  },

  help: {
    name: 'Help',
    category: 'SUPPORT_OPERATIONS',
    description: 'Explain available services and how to use them',
    requiresAuth: false,
    priority: 'normal',
    estimatedDuration: 'quick'
  },

  complaint: {
    name: 'Complaint',
    category: 'SUPPORT_OPERATIONS',
    description: 'File or discuss a customer complaint',
    requiresAuth: false,
    priority: 'high',
    estimatedDuration: 'medium'
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
  },

  account_info: {
    needsConfirmation: false,
    allowsPartialData: true,
    requiresAllFields: false,
    canUseDefaults: true,
    maxRetries: 3
  },

  account_statement: {
    needsConfirmation: false,
    allowsPartialData: true,
    requiresAllFields: false,
    canUseDefaults: true,
    maxRetries: 3
  },

  payment_inquiry: {
    needsConfirmation: false,
    allowsPartialData: true,
    requiresAllFields: false,
    canUseDefaults: true,
    maxRetries: 3
  },

  card_activation: {
    needsConfirmation: true,
    allowsPartialData: false,
    requiresAllFields: true,
    canUseDefaults: false,
    maxRetries: 2,
    confirmationMessage: 'Please confirm you want to activate card ${cardId}'
  },

  card_replacement: {
    needsConfirmation: true,
    allowsPartialData: false,
    requiresAllFields: true,
    canUseDefaults: false,
    maxRetries: 2,
    confirmationMessage: 'Please confirm you want to replace card ${cardId}'
  },

  help: {
    needsConfirmation: false,
    allowsPartialData: true,
    requiresAllFields: false,
    canUseDefaults: true,
    maxRetries: 3
  },

  complaint: {
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
  },

  account_info: {
    required: [],
    optional: ['accountId'],
    defaults: {}
  },

  account_statement: {
    required: [],
    optional: ['accountId', 'period', 'fromDate', 'toDate'],
    defaults: {
      period: 'last_30_days'
    }
  },

  payment_inquiry: {
    required: [],
    optional: ['transferId', 'status', 'timeframe'],
    defaults: {
      timeframe: 'last_30_days'
    }
  },

  card_activation: {
    required: ['cardId'],
    optional: ['activationCode'],
    validation: {
      cardId: { type: 'string', minLength: 4, maxLength: 40 }
    }
  },

  card_replacement: {
    required: ['cardId', 'reason'],
    optional: ['replacementAddress'],
    validation: {
      cardId: { type: 'string', minLength: 4, maxLength: 40 },
      reason: { type: 'string', minLength: 3, maxLength: 200 }
    }
  },

  help: {
    required: [],
    optional: ['topic'],
    defaults: {}
  },

  complaint: {
    required: ['description'],
    optional: ['category', 'relatedTransactionId'],
    validation: {
      description: { type: 'string', minLength: 10, maxLength: 1000 }
    }
  }
};

// ==================== INTENT TOOL MAPPING ====================
// Map each intent to the banking tools it can use

// NOTE: Every tool name here MUST resolve to an implemented handler in
// mcp-service (see CANONICAL_BANKING_TOOLS below). A startup contract assertion
// and a cross-service test enforce this so a rename can never silently break a
// flow (as the historical banking_transfer / *_details names did).
const INTENT_TOOL_MAPPING = {
  balance_inquiry: [
    'banking_get_balance',
    'banking_get_account'
  ],

  account_info: [
    'banking_get_account',
    'banking_get_accounts'
  ],

  account_statement: [
    'banking_get_account_statement'
  ],

  transaction_history: [
    'banking_get_transactions'
  ],

  transfer_funds: [
    'banking_create_transfer',
    'banking_get_balance',
    'banking_get_account'
  ],

  payment_inquiry: [
    'banking_get_transfers',
    'banking_get_transfer'
  ],

  card_management: [
    'banking_get_cards',
    'banking_block_card',
    'banking_unblock_card'
  ],

  card_activation: [
    'banking_get_cards',
    'banking_activate_card'
  ],

  card_replacement: [
    'banking_get_cards',
    'banking_replace_card'
  ],

  dispute_transaction: [
    'banking_get_transactions',
    'banking_create_dispute',
    'banking_get_disputes',
    'banking_get_dispute',
    'banking_add_dispute_evidence',
    'banking_update_dispute',
    'banking_withdraw_dispute'
  ],

  // report_fraud is the URGENT fast path (no confirmation). Card blocking is a
  // sensitive, disruptive action handled explicitly via card_management, so it
  // is intentionally NOT in the auto-executed tool set here — keeping the fast
  // path free of the sensitive-tool confirmation gate.
  report_fraud: [
    'banking_create_fraud_alert',
    'banking_get_transactions'
  ],

  check_fraud_alerts: [
    'banking_get_fraud_alerts',
    'banking_get_fraud_alert'
  ],

  // verify_transaction makes a SINGLE deterministic decision: banking_verify_transaction
  // takes the alertId + isLegitimate flag and the banking service routes it to
  // confirm-fraud or mark-false-positive internally. Calling confirm AND
  // false-positive together (as a multi-tool mapping would) is contradictory.
  verify_transaction: [
    'banking_get_fraud_alert',
    'banking_verify_transaction'
  ],

  general_inquiry: [],
  help: [],
  complaint: []
};

// ==================== CANONICAL BANKING TOOL CONTRACT ====================
// Single source of truth for the banking tool names the orchestrator may call.
// mcp-service must implement a handler for every name here. Enforced by
// assertToolContract() at startup and by a cross-service contract test.
const CANONICAL_BANKING_TOOLS = [
  'banking_get_accounts',
  'banking_get_account',
  'banking_get_balance',
  'banking_get_account_statement',
  'banking_get_transactions',
  'banking_get_transaction',
  'banking_create_transfer',
  'banking_get_transfers',
  'banking_get_transfer',
  'banking_get_cards',
  'banking_get_card',
  'banking_block_card',
  'banking_unblock_card',
  'banking_activate_card',
  'banking_replace_card',
  'banking_create_fraud_alert',
  'banking_get_fraud_alerts',
  'banking_get_fraud_alert',
  'banking_verify_transaction',
  'banking_confirm_fraud',
  'banking_mark_false_positive',
  'banking_create_dispute',
  'banking_get_disputes',
  'banking_get_dispute',
  'banking_add_dispute_evidence',
  'banking_update_dispute',
  'banking_withdraw_dispute'
];

// ==================== INTENT PROMPT TEMPLATES ====================
// System and user prompts for each intent (using template references)

// IMPORTANT: template keys are FLAT and UNPREFIXED. The prompt template modules
// (src/prompts/templates/*.js) are merged into one flat ALL_PROMPTS map, so the
// keys here must match the exported key exactly (e.g. 'balance_inquiry_system',
// not 'account/balance_inquiry_system'). A prefixed key resolves to undefined
// and silently degrades every intent to the generic fallback prompt — the exact
// bug this fixes. assertPromptContract() enforces resolution at startup.
const INTENT_PROMPTS = {
  balance_inquiry: {
    systemPromptTemplate: 'balance_inquiry_system',
    userPromptTemplate: 'balance_inquiry_user',
    contextFields: ['userId', 'accountData']
  },

  account_info: {
    systemPromptTemplate: 'account_info_system',
    userPromptTemplate: 'account_info_user',
    contextFields: ['userId', 'accountData']
  },

  account_statement: {
    systemPromptTemplate: 'account_statement_system',
    userPromptTemplate: 'account_statement_user',
    contextFields: ['userId', 'accountData', 'period']
  },

  transaction_history: {
    systemPromptTemplate: 'transaction_history_system',
    userPromptTemplate: 'transaction_history_user',
    contextFields: ['userId', 'timeframe', 'transactions']
  },

  transfer_funds: {
    systemPromptTemplate: 'transfer_funds_system',
    userPromptTemplate: 'transfer_funds_user',
    contextFields: ['userId', 'recipient', 'amount', 'purpose', 'transferResult']
  },

  payment_inquiry: {
    systemPromptTemplate: 'payment_inquiry_system',
    userPromptTemplate: 'payment_inquiry_user',
    contextFields: ['userId', 'transferId', 'status', 'transfers']
  },

  card_management: {
    systemPromptTemplate: 'card_management_system',
    userPromptTemplate: 'card_management_user',
    contextFields: ['userId', 'cardAction', 'cardData', 'actionResult']
  },

  card_activation: {
    systemPromptTemplate: 'card_activation_system',
    userPromptTemplate: 'card_activation_user',
    contextFields: ['userId', 'cardId', 'cardData', 'actionResult']
  },

  card_replacement: {
    systemPromptTemplate: 'card_replacement_system',
    userPromptTemplate: 'card_replacement_user',
    contextFields: ['userId', 'cardId', 'reason', 'actionResult']
  },

  dispute_transaction: {
    systemPromptTemplate: 'dispute_transaction_system',
    userPromptTemplate: 'dispute_transaction_user',
    contextFields: ['userId', 'transactionId', 'disputeType', 'reason', 'description', 'evidenceProvided', 'disputeResult']
  },

  report_fraud: {
    systemPromptTemplate: 'report_fraud_system',
    userPromptTemplate: 'report_fraud_user',
    contextFields: ['userId', 'fraudType', 'description', 'transactionId', 'amount', 'fraudAlert']
  },

  check_fraud_alerts: {
    systemPromptTemplate: 'check_fraud_alerts_system',
    userPromptTemplate: 'check_fraud_alerts_user',
    contextFields: ['userId', 'alerts', 'filterCriteria']
  },

  verify_transaction: {
    systemPromptTemplate: 'verify_transaction_system',
    userPromptTemplate: 'verify_transaction_user',
    contextFields: ['userId', 'alertId', 'transactionDetails', 'isLegitimate', 'verificationResult']
  },

  general_inquiry: {
    systemPromptTemplate: 'general_inquiry_system',
    userPromptTemplate: 'general_inquiry_user',
    contextFields: ['userId', 'topic', 'additionalInfo']
  },

  help: {
    systemPromptTemplate: 'help_system',
    userPromptTemplate: 'help_user',
    contextFields: ['userId', 'topic']
  },

  complaint: {
    systemPromptTemplate: 'complaint_system',
    userPromptTemplate: 'complaint_user',
    contextFields: ['userId', 'description', 'category', 'complaintResult']
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
    'question',
    'how do i',
    'what is',
    'can you help',
    'need assistance'
  ],

  account_info: [
    'account details',
    'account information',
    'account number',
    'my account',
    'account type'
  ],

  account_statement: [
    'statement',
    'account statement',
    'monthly statement',
    'download statement',
    'bank statement'
  ],

  payment_inquiry: [
    'payment status',
    'did my payment go through',
    'transfer status',
    'where is my payment',
    'pending payment'
  ],

  card_activation: [
    'activate card',
    'activate my card',
    'new card activation',
    'turn on card',
    'enable card'
  ],

  card_replacement: [
    'replace card',
    'replacement card',
    'new card',
    'damaged card',
    'reissue card'
  ],

  help: [
    'help',
    'what can you do',
    'services',
    'options',
    'how does this work'
  ],

  complaint: [
    'complaint',
    'complain',
    'not happy',
    'poor service',
    'file a complaint',
    'unhappy with'
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

/**
 * Validate internal configuration consistency. Returns a list of human-readable
 * problems (empty array == consistent). Used by a startup assertion and tests so
 * structural mistakes (an intent missing a config block, a tool name not in the
 * canonical contract) fail fast and loudly instead of silently degrading flows.
 */
function validateConfigConsistency() {
  const problems = [];
  const canonical = new Set(CANONICAL_BANKING_TOOLS);

  // Every intent listed in a category must have all five config blocks.
  const categorizedIntents = Object.values(INTENT_CATEGORIES).flat();
  for (const intent of categorizedIntents) {
    if (!INTENT_METADATA[intent]) problems.push(`intent "${intent}" missing INTENT_METADATA`);
    if (!INTENT_BEHAVIOR[intent]) problems.push(`intent "${intent}" missing INTENT_BEHAVIOR`);
    if (!INTENT_DATA_REQUIREMENTS[intent]) problems.push(`intent "${intent}" missing INTENT_DATA_REQUIREMENTS`);
    if (!INTENT_TOOL_MAPPING[intent]) problems.push(`intent "${intent}" missing INTENT_TOOL_MAPPING`);
    if (!INTENT_PROMPTS[intent]) problems.push(`intent "${intent}" missing INTENT_PROMPTS`);
  }

  // Every metadata intent must be reachable from a category (no orphans).
  for (const intent of Object.keys(INTENT_METADATA)) {
    if (!categorizedIntents.includes(intent)) {
      problems.push(`intent "${intent}" in INTENT_METADATA but not in any INTENT_CATEGORIES`);
    }
  }

  // Every mapped tool name must be in the canonical banking-tool contract.
  for (const [intent, tools] of Object.entries(INTENT_TOOL_MAPPING)) {
    for (const tool of tools) {
      if (!canonical.has(tool)) {
        problems.push(`intent "${intent}" maps to unknown tool "${tool}" (not in CANONICAL_BANKING_TOOLS)`);
      }
    }
  }

  return problems;
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
  CANONICAL_BANKING_TOOLS,

  // Unified Config
  getIntentConfig,

  // Validation
  isValidIntent,
  getAllIntents,
  getIntentsByPriority,
  validateConfigConsistency,
  
  // Quick Access Functions
  requiresAuth,
  needsConfirmation,
  getToolsForIntent,
  getRequiredDataForIntent,
  getOptionalDataForIntent,
  getValidationRules,
  getDefaults
};
