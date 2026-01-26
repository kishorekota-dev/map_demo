/**
 * MCP Banking Tools - Fraud and Dispute Operations
 * Comprehensive tool definitions for fraud case management and dispute resolution
 */

/**
 * FRAUD MANAGEMENT TOOLS
 */

const FRAUD_TOOLS = {
  // Create fraud alert/report
  banking_create_fraud_alert: {
    name: 'banking_create_fraud_alert',
    description: 'Create a fraud alert to report suspicious or fraudulent activity',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'User ID (from authenticated session)'
        },
        transactionId: {
          type: 'string',
          description: 'Related transaction ID (optional, if fraud relates to specific transaction)'
        },
        accountId: {
          type: 'string',
          description: 'Account ID where fraud occurred (optional)'
        },
        cardId: {
          type: 'string',
          description: 'Card ID if fraud involves card (optional)'
        },
        alertType: {
          type: 'string',
          enum: [
            'unusual_activity',
            'high_value_transaction',
            'multiple_failed_attempts',
            'location_mismatch',
            'velocity_check',
            'suspicious_merchant',
            'card_not_present',
            'account_takeover',
            'identity_theft'
          ],
          description: 'Type of fraud alert'
        },
        severity: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: 'Severity level of the fraud'
        },
        description: {
          type: 'string',
          description: 'Detailed description of the fraudulent activity'
        },
        amount: {
          type: 'number',
          description: 'Amount involved in fraud (if applicable)'
        },
        location: {
          type: 'string',
          description: 'Location where fraud occurred'
        },
        ipAddress: {
          type: 'string',
          description: 'IP address associated with suspicious activity'
        },
        details: {
          type: 'object',
          description: 'Additional fraud details (timestamps, patterns, etc.)'
        }
      },
      required: ['userId', 'alertType', 'description']
    },
    endpoint: {
      method: 'POST',
      path: '/api/v1/fraud/alerts',
      headers: {
        'Authorization': 'Bearer {accessToken}',
        'Content-Type': 'application/json'
      }
    }
  },

  // Get fraud alerts
  banking_get_fraud_alerts: {
    name: 'banking_get_fraud_alerts',
    description: 'Retrieve fraud alerts for authenticated user',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'User ID (from authenticated session)'
        },
        status: {
          type: 'string',
          enum: ['pending', 'investigating', 'confirmed', 'false_positive', 'resolved'],
          description: 'Filter by alert status'
        },
        severity: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: 'Filter by severity'
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default: 1)'
        },
        limit: {
          type: 'number',
          description: 'Results per page (default: 50)'
        }
      },
      required: ['userId']
    },
    endpoint: {
      method: 'GET',
      path: '/api/v1/fraud/alerts',
      params: ['status', 'severity', 'page', 'limit']
    }
  },

  // Get specific fraud alert details
  banking_get_fraud_alert_details: {
    name: 'banking_get_fraud_alert_details',
    description: 'Get detailed information about a specific fraud alert',
    inputSchema: {
      type: 'object',
      properties: {
        alertId: {
          type: 'string',
          description: 'Fraud alert ID'
        },
        userId: {
          type: 'string',
          description: 'User ID (from authenticated session)'
        }
      },
      required: ['alertId', 'userId']
    },
    endpoint: {
      method: 'GET',
      path: '/api/v1/fraud/alerts/{alertId}'
    }
  },

  // Confirm fraud
  banking_confirm_fraud: {
    name: 'banking_confirm_fraud',
    description: 'Confirm that a fraud alert represents actual fraud (admin/user action)',
    inputSchema: {
      type: 'object',
      properties: {
        alertId: {
          type: 'string',
          description: 'Fraud alert ID to confirm'
        },
        userId: {
          type: 'string',
          description: 'User ID confirming fraud'
        },
        notes: {
          type: 'string',
          description: 'Notes about the fraud confirmation'
        },
        actionTaken: {
          type: 'string',
          enum: [
            'blocked_transaction',
            'blocked_card',
            'frozen_account',
            'notified_user',
            'manual_review',
            'escalated'
          ],
          description: 'Action taken in response to fraud'
        }
      },
      required: ['alertId', 'userId']
    },
    endpoint: {
      method: 'POST',
      path: '/api/v1/fraud/alerts/{alertId}/confirm',
      headers: {
        'Authorization': 'Bearer {accessToken}',
        'Content-Type': 'application/json'
      }
    }
  },

  // Mark as false positive
  banking_mark_false_positive: {
    name: 'banking_mark_false_positive',
    description: 'Mark a fraud alert as false positive (legitimate transaction)',
    inputSchema: {
      type: 'object',
      properties: {
        alertId: {
          type: 'string',
          description: 'Fraud alert ID to mark as false positive'
        },
        userId: {
          type: 'string',
          description: 'User ID verifying legitimacy'
        },
        notes: {
          type: 'string',
          description: 'Notes about why this is legitimate'
        }
      },
      required: ['alertId', 'userId']
    },
    endpoint: {
      method: 'POST',
      path: '/api/v1/fraud/alerts/{alertId}/false-positive',
      headers: {
        'Authorization': 'Bearer {accessToken}',
        'Content-Type': 'application/json'
      }
    }
  },

  // Verify transaction (respond to fraud alert)
  banking_verify_transaction: {
    name: 'banking_verify_transaction',
    description: 'Verify if a transaction is legitimate or fraudulent',
    inputSchema: {
      type: 'object',
      properties: {
        transactionId: {
          type: 'string',
          description: 'Transaction ID to verify'
        },
        alertId: {
          type: 'string',
          description: 'Related fraud alert ID (if applicable)'
        },
        userId: {
          type: 'string',
          description: 'User ID verifying transaction'
        },
        isLegitimate: {
          type: 'boolean',
          description: 'true if transaction is legitimate, false if fraudulent'
        },
        notes: {
          type: 'string',
          description: 'Notes about verification'
        }
      },
      required: ['transactionId', 'userId', 'isLegitimate']
    },
    endpoint: {
      method: 'POST',
      path: '/api/v1/fraud/verify',
      headers: {
        'Authorization': 'Bearer {accessToken}',
        'Content-Type': 'application/json'
      }
    }
  }
};

/**
 * DISPUTE MANAGEMENT TOOLS
 */

const DISPUTE_TOOLS = {
  // Create dispute
  banking_create_dispute: {
    name: 'banking_create_dispute',
    description: 'Create a transaction dispute/chargeback case',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'User ID (from authenticated session)'
        },
        accountId: {
          type: 'string',
          description: 'Account ID for the dispute'
        },
        transactionId: {
          type: 'string',
          description: 'Transaction ID being disputed'
        },
        cardId: {
          type: 'string',
          description: 'Card ID if dispute involves card transaction (optional)'
        },
        disputeType: {
          type: 'string',
          enum: [
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
          ],
          description: 'Type of dispute'
        },
        disputeCategory: {
          type: 'string',
          enum: ['fraud', 'billing', 'service', 'quality', 'other'],
          description: 'Category of dispute'
        },
        amountDisputed: {
          type: 'number',
          description: 'Amount being disputed'
        },
        currency: {
          type: 'string',
          description: 'Currency code (default: USD)'
        },
        merchantName: {
          type: 'string',
          description: 'Name of merchant involved'
        },
        transactionDate: {
          type: 'string',
          description: 'Date of transaction (YYYY-MM-DD)'
        },
        description: {
          type: 'string',
          description: 'Detailed description of dispute reason'
        },
        evidenceProvided: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of evidence types provided (receipts, emails, photos, etc.)'
        },
        evidenceDocuments: {
          type: 'object',
          description: 'Evidence documents metadata'
        },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high', 'urgent'],
          description: 'Priority level (default: normal)'
        },
        customerNotes: {
          type: 'string',
          description: 'Additional notes from customer'
        }
      },
      required: ['userId', 'accountId', 'transactionId', 'disputeType', 'amountDisputed', 'description']
    },
    endpoint: {
      method: 'POST',
      path: '/api/v1/disputes',
      headers: {
        'Authorization': 'Bearer {accessToken}',
        'Content-Type': 'application/json'
      }
    }
  },

  // Get disputes
  banking_get_disputes: {
    name: 'banking_get_disputes',
    description: 'Retrieve disputes for authenticated user',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'User ID (from authenticated session)'
        },
        status: {
          type: 'string',
          enum: [
            'submitted',
            'under_review',
            'pending_merchant',
            'pending_customer',
            'resolved_in_favor',
            'resolved_against',
            'partially_resolved',
            'withdrawn',
            'escalated'
          ],
          description: 'Filter by dispute status'
        },
        disputeType: {
          type: 'string',
          description: 'Filter by dispute type'
        },
        page: {
          type: 'number',
          description: 'Page number for pagination'
        },
        limit: {
          type: 'number',
          description: 'Results per page'
        }
      },
      required: ['userId']
    },
    endpoint: {
      method: 'GET',
      path: '/api/v1/disputes',
      params: ['status', 'disputeType', 'page', 'limit']
    }
  },

  // Get specific dispute details
  banking_get_dispute_details: {
    name: 'banking_get_dispute_details',
    description: 'Get detailed information about a specific dispute',
    inputSchema: {
      type: 'object',
      properties: {
        disputeId: {
          type: 'string',
          description: 'Dispute ID'
        },
        userId: {
          type: 'string',
          description: 'User ID (from authenticated session)'
        }
      },
      required: ['disputeId', 'userId']
    },
    endpoint: {
      method: 'GET',
      path: '/api/v1/disputes/{disputeId}'
    }
  },

  // Add evidence to dispute
  banking_add_dispute_evidence: {
    name: 'banking_add_dispute_evidence',
    description: 'Add evidence to an existing dispute',
    inputSchema: {
      type: 'object',
      properties: {
        disputeId: {
          type: 'string',
          description: 'Dispute ID to add evidence to'
        },
        userId: {
          type: 'string',
          description: 'User ID (from authenticated session)'
        },
        evidenceType: {
          type: 'string',
          enum: ['receipt', 'email', 'screenshot', 'document', 'photo', 'other'],
          description: 'Type of evidence being added'
        },
        evidenceData: {
          type: 'object',
          description: 'Evidence data (file URLs, text, metadata)'
        },
        description: {
          type: 'string',
          description: 'Description of the evidence'
        }
      },
      required: ['disputeId', 'userId', 'evidenceType', 'evidenceData']
    },
    endpoint: {
      method: 'POST',
      path: '/api/v1/disputes/{disputeId}/evidence',
      headers: {
        'Authorization': 'Bearer {accessToken}',
        'Content-Type': 'application/json'
      }
    }
  },

  // Update dispute
  banking_update_dispute: {
    name: 'banking_update_dispute',
    description: 'Update dispute details or add information',
    inputSchema: {
      type: 'object',
      properties: {
        disputeId: {
          type: 'string',
          description: 'Dispute ID to update'
        },
        userId: {
          type: 'string',
          description: 'User ID (from authenticated session)'
        },
        description: {
          type: 'string',
          description: 'Updated description'
        },
        customerNotes: {
          type: 'string',
          description: 'Additional customer notes'
        },
        evidenceProvided: {
          type: 'array',
          items: { type: 'string' },
          description: 'Updated list of evidence types'
        }
      },
      required: ['disputeId', 'userId']
    },
    endpoint: {
      method: 'PUT',
      path: '/api/v1/disputes/{disputeId}',
      headers: {
        'Authorization': 'Bearer {accessToken}',
        'Content-Type': 'application/json'
      }
    }
  },

  // Withdraw dispute
  banking_withdraw_dispute: {
    name: 'banking_withdraw_dispute',
    description: 'Withdraw/cancel a dispute',
    inputSchema: {
      type: 'object',
      properties: {
        disputeId: {
          type: 'string',
          description: 'Dispute ID to withdraw'
        },
        userId: {
          type: 'string',
          description: 'User ID (from authenticated session)'
        },
        reason: {
          type: 'string',
          description: 'Reason for withdrawal'
        }
      },
      required: ['disputeId', 'userId', 'reason']
    },
    endpoint: {
      method: 'POST',
      path: '/api/v1/disputes/{disputeId}/withdraw',
      headers: {
        'Authorization': 'Bearer {accessToken}',
        'Content-Type': 'application/json'
      }
    }
  }
};

/**
 * Combined tool registry
 */
const BANKING_FRAUD_DISPUTE_TOOLS = {
  ...FRAUD_TOOLS,
  ...DISPUTE_TOOLS
};

/**
 * Get tool definition by name
 */
function getToolDefinition(toolName) {
  return BANKING_FRAUD_DISPUTE_TOOLS[toolName] || null;
}

/**
 * Get all fraud tools
 */
function getFraudTools() {
  return Object.values(FRAUD_TOOLS);
}

/**
 * Get all dispute tools
 */
function getDisputeTools() {
  return Object.values(DISPUTE_TOOLS);
}

/**
 * Get all tools
 */
function getAllTools() {
  return Object.values(BANKING_FRAUD_DISPUTE_TOOLS);
}

module.exports = {
  FRAUD_TOOLS,
  DISPUTE_TOOLS,
  BANKING_FRAUD_DISPUTE_TOOLS,
  getToolDefinition,
  getFraudTools,
  getDisputeTools,
  getAllTools
};
