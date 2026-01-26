/**
 * Complete Banking Tools for MCP Service
 * Implements all banking operations from poc-banking-service API
 * 
 * Tool Categories:
 * - Authentication & Users
 * - Accounts
 * - Transactions  
 * - Transfers
 * - Cards
 * - Fraud Detection
 * - Disputes
 */

const axios = require('axios');
const logger = require('../utils/logger');

class CompleteBankingTools {
  constructor(bankingServiceUrl) {
    this.bankingServiceUrl = bankingServiceUrl || process.env.BANKING_SERVICE_URL || 'http://localhost:3005/api/v1';
    this.apiTimeout = parseInt(process.env.API_TIMEOUT) || 30000;
    
    logger.info('Complete Banking Tools initialized', { bankingServiceUrl: this.bankingServiceUrl });
  }

  /**
   * Get all tool definitions
   */
  getToolDefinitions() {
    return [
      ...this.getAuthenticationTools(),
      ...this.getAccountTools(),
      ...this.getTransactionTools(),
      ...this.getTransferTools(),
      ...this.getCardTools(),
      ...this.getFraudTools(),
      ...this.getDisputeTools()
    ];
  }

  /**
   * Execute a tool by name
   */
  async executeTool(toolName, parameters) {
    const tool = this.getToolDefinitions().find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    logger.info('Executing tool', { toolName, parameters: Object.keys(parameters) });

    try {
      const result = await this[`_execute_${toolName}`](parameters);
      logger.info('Tool executed successfully', { toolName });
      return { success: true, data: result };
    } catch (error) {
      logger.error('Tool execution failed', {
        toolName,
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }

  // ==================== AUTHENTICATION TOOLS ====================
  
  getAuthenticationTools() {
    return [
      {
        name: 'banking_authenticate',
        description: 'Authenticate user and obtain JWT access token',
        inputSchema: {
          type: 'object',
          properties: {
            username: { type: 'string', description: 'User username or email' },
            password: { type: 'string', description: 'User password' }
          },
          required: ['username', 'password']
        }
      },
      {
        name: 'banking_refresh_token',
        description: 'Refresh JWT access token using refresh token',
        inputSchema: {
          type: 'object',
          properties: {
            refreshToken: { type: 'string', description: 'Refresh token' }
          },
          required: ['refreshToken']
        }
      }
    ];
  }

  async _execute_banking_authenticate(params) {
    const response = await axios.post(`${this.bankingServiceUrl}/auth/login`, {
      username: params.username,
      password: params.password
    }, { timeout: this.apiTimeout });
    return response.data;
  }

  async _execute_banking_refresh_token(params) {
    const response = await axios.post(`${this.bankingServiceUrl}/auth/refresh`, {
      refreshToken: params.refreshToken
    }, { timeout: this.apiTimeout });
    return response.data;
  }

  // ==================== ACCOUNT TOOLS ====================
  
  getAccountTools() {
    return [
      {
        name: 'banking_get_accounts',
        description: 'Get all accounts for authenticated user',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            status: { type: 'string', enum: ['active', 'frozen', 'closed'], description: 'Filter by status' },
            limit: { type: 'number', description: 'Max results', default: 50 },
            offset: { type: 'number', description: 'Results to skip', default: 0 }
          },
          required: ['authToken']
        }
      },
      {
        name: 'banking_get_account',
        description: 'Get specific account details',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            accountId: { type: 'string', description: 'Account ID (UUID)' }
          },
          required: ['authToken', 'accountId']
        }
      },
      {
        name: 'banking_get_balance',
        description: 'Get account balance',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            accountId: { type: 'string', description: 'Account ID (UUID)' }
          },
          required: ['authToken', 'accountId']
        }
      },
      {
        name: 'banking_get_account_statement',
        description: 'Get account statement for specific period',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            accountId: { type: 'string', description: 'Account ID (UUID)' },
            startDate: { type: 'string', format: 'date', description: 'Start date (YYYY-MM-DD)' },
            endDate: { type: 'string', format: 'date', description: 'End date (YYYY-MM-DD)' }
          },
          required: ['authToken', 'accountId', 'startDate', 'endDate']
        }
      }
    ];
  }

  async _execute_banking_get_accounts(params) {
    const response = await axios.get(`${this.bankingServiceUrl}/accounts`, {
      params: {
        status: params.status,
        limit: params.limit,
        offset: params.offset
      },
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }

  async _execute_banking_get_account(params) {
    const response = await axios.get(`${this.bankingServiceUrl}/accounts/${params.accountId}`, {
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }

  async _execute_banking_get_balance(params) {
    const response = await axios.get(`${this.bankingServiceUrl}/accounts/${params.accountId}/balance`, {
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }

  async _execute_banking_get_account_statement(params) {
    const response = await axios.get(`${this.bankingServiceUrl}/accounts/${params.accountId}/statement`, {
      params: {
        startDate: params.startDate,
        endDate: params.endDate
      },
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }

  // ==================== TRANSACTION TOOLS ====================
  
  getTransactionTools() {
    return [
      {
        name: 'banking_get_transactions',
        description: 'Get transaction history',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            page: { type: 'number', default: 1 },
            limit: { type: 'number', default: 50 },
            type: { type: 'string', enum: ['purchase', 'withdrawal', 'deposit', 'transfer', 'refund', 'fee'] },
            status: { type: 'string', enum: ['pending', 'completed', 'failed', 'cancelled'] },
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' }
          },
          required: ['authToken']
        }
      },
      {
        name: 'banking_get_transaction',
        description: 'Get specific transaction details',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            transactionId: { type: 'string', description: 'Transaction ID (UUID)' }
          },
          required: ['authToken', 'transactionId']
        }
      }
    ];
  }

  async _execute_banking_get_transactions(params) {
    const response = await axios.get(`${this.bankingServiceUrl}/transactions`, {
      params: {
        page: params.page,
        limit: params.limit,
        type: params.type,
        status: params.status,
        startDate: params.startDate,
        endDate: params.endDate
      },
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }

  async _execute_banking_get_transaction(params) {
    const response = await axios.get(`${this.bankingServiceUrl}/transactions/${params.transactionId}`, {
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }

  // ==================== TRANSFER TOOLS ====================
  
  getTransferTools() {
    return [
      {
        name: 'banking_create_transfer',
        description: 'Create a money transfer',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            fromAccountId: { type: 'string', description: 'Source account ID' },
            toAccountId: { type: 'string', description: 'Destination account ID' },
            amount: { type: 'number', minimum: 0.01, description: 'Transfer amount' },
            currency: { type: 'string', default: 'USD', description: 'Currency code' },
            purpose: { type: 'string', description: 'Transfer purpose' },
            memo: { type: 'string', description: 'Transfer memo/note' }
          },
          required: ['authToken', 'fromAccountId', 'toAccountId', 'amount']
        }
      },
      {
        name: 'banking_get_transfers',
        description: 'Get transfer history',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            page: { type: 'number', default: 1 },
            limit: { type: 'number', default: 50 },
            status: { type: 'string', enum: ['pending', 'completed', 'failed', 'cancelled'] }
          },
          required: ['authToken']
        }
      },
      {
        name: 'banking_get_transfer',
        description: 'Get specific transfer details',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            transferId: { type: 'string', description: 'Transfer ID (UUID)' }
          },
          required: ['authToken', 'transferId']
        }
      }
    ];
  }

  async _execute_banking_create_transfer(params) {
    const response = await axios.post(`${this.bankingServiceUrl}/transfers`, {
      fromAccountId: params.fromAccountId,
      toAccountId: params.toAccountId,
      amount: params.amount,
      currency: params.currency || 'USD',
      purpose: params.purpose,
      memo: params.memo
    }, {
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }

  async _execute_banking_get_transfers(params) {
    const response = await axios.get(`${this.bankingServiceUrl}/transfers`, {
      params: {
        page: params.page,
        limit: params.limit,
        status: params.status
      },
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }

  async _execute_banking_get_transfer(params) {
    const response = await axios.get(`${this.bankingServiceUrl}/transfers/${params.transferId}`, {
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }

  // ==================== CARD TOOLS ====================
  
  getCardTools() {
    return [
      {
        name: 'banking_get_cards',
        description: 'Get all cards for authenticated user',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            status: { type: 'string', enum: ['active', 'blocked', 'expired', 'cancelled'] },
            limit: { type: 'number', default: 50 }
          },
          required: ['authToken']
        }
      },
      {
        name: 'banking_get_card',
        description: 'Get specific card details',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            cardId: { type: 'string', description: 'Card ID (UUID)' }
          },
          required: ['authToken', 'cardId']
        }
      },
      {
        name: 'banking_block_card',
        description: 'Block a card (lost, stolen, or suspected fraud)',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            cardId: { type: 'string', description: 'Card ID (UUID)' },
            reason: { type: 'string', enum: ['lost', 'stolen', 'suspected_fraud', 'damaged', 'other'] },
            notes: { type: 'string', description: 'Additional notes' }
          },
          required: ['authToken', 'cardId', 'reason']
        }
      },
      {
        name: 'banking_unblock_card',
        description: 'Unblock a previously blocked card',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            cardId: { type: 'string', description: 'Card ID (UUID)' },
            notes: { type: 'string', description: 'Reason for unblocking' }
          },
          required: ['authToken', 'cardId']
        }
      }
    ];
  }

  async _execute_banking_get_cards(params) {
    const response = await axios.get(`${this.bankingServiceUrl}/cards`, {
      params: {
        status: params.status,
        limit: params.limit
      },
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }

  async _execute_banking_get_card(params) {
    const response = await axios.get(`${this.bankingServiceUrl}/cards/${params.cardId}`, {
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }

  async _execute_banking_block_card(params) {
    const response = await axios.post(`${this.bankingServiceUrl}/cards/${params.cardId}/block`, {
      reason: params.reason,
      notes: params.notes
    }, {
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }

  async _execute_banking_unblock_card(params) {
    const response = await axios.post(`${this.bankingServiceUrl}/cards/${params.cardId}/unblock`, {
      notes: params.notes
    }, {
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }

  // ==================== FRAUD DETECTION TOOLS ====================
  
  getFraudTools() {
    return [
      {
        name: 'banking_create_fraud_alert',
        description: 'Create a fraud alert to report suspicious activity',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            transactionId: { type: 'string', description: 'Related transaction ID (optional)' },
            accountId: { type: 'string', description: 'Affected account ID (optional)' },
            cardId: { type: 'string', description: 'Affected card ID (optional)' },
            alertType: {
              type: 'string',
              enum: ['unusual_activity', 'high_value_transaction', 'multiple_failed_attempts', 'location_mismatch', 'velocity_check', 'suspicious_merchant', 'card_not_present', 'account_takeover', 'identity_theft'],
              description: 'Type of fraud alert'
            },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            description: { type: 'string', description: 'Description of fraudulent activity' },
            amount: { type: 'number', description: 'Amount involved (optional)' },
            location: { type: 'string', description: 'Location where fraud occurred (optional)' },
            ipAddress: { type: 'string', description: 'IP address of suspicious activity (optional)' }
          },
          required: ['authToken', 'alertType', 'description']
        }
      },
      {
        name: 'banking_get_fraud_alerts',
        description: 'Get fraud alerts for authenticated user',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            status: { type: 'string', enum: ['pending', 'investigating', 'confirmed', 'false_positive', 'resolved'] },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            limit: { type: 'number', default: 50 }
          },
          required: ['authToken']
        }
      },
      {
        name: 'banking_get_fraud_alert',
        description: 'Get specific fraud alert details',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            alertId: { type: 'string', description: 'Alert ID (UUID)' }
          },
          required: ['authToken', 'alertId']
        }
      },
      {
        name: 'banking_verify_transaction',
        description: 'Verify if a transaction is legitimate or fraudulent',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            transactionId: { type: 'string', description: 'Transaction ID (UUID)' },
            isLegitimate: { type: 'boolean', description: 'True if legitimate, false if fraudulent' },
            notes: { type: 'string', description: 'Additional notes (optional)' }
          },
          required: ['authToken', 'transactionId', 'isLegitimate']
        }
      }
    ];
  }

  async _execute_banking_create_fraud_alert(params) {
    const response = await axios.post(`${this.bankingServiceUrl}/fraud/alerts`, {
      transactionId: params.transactionId,
      accountId: params.accountId,
      cardId: params.cardId,
      alertType: params.alertType,
      severity: params.severity,
      description: params.description,
      amount: params.amount,
      location: params.location,
      ipAddress: params.ipAddress
    }, {
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }

  async _execute_banking_get_fraud_alerts(params) {
    const response = await axios.get(`${this.bankingServiceUrl}/fraud/alerts`, {
      params: {
        status: params.status,
        severity: params.severity,
        limit: params.limit
      },
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }

  async _execute_banking_get_fraud_alert(params) {
    const response = await axios.get(`${this.bankingServiceUrl}/fraud/alerts/${params.alertId}`, {
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }

  async _execute_banking_verify_transaction(params) {
    const response = await axios.post(`${this.bankingServiceUrl}/fraud/verify-transaction`, {
      transactionId: params.transactionId,
      isLegitimate: params.isLegitimate,
      notes: params.notes
    }, {
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }

  // ==================== DISPUTE TOOLS ====================
  
  getDisputeTools() {
    return [
      {
        name: 'banking_create_dispute',
        description: 'File a dispute for a transaction',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            transactionId: { type: 'string', description: 'Transaction ID (UUID)' },
            disputeType: {
              type: 'string',
              enum: ['unauthorized_transaction', 'incorrect_amount', 'duplicate_charge', 'service_not_received', 'product_not_received', 'defective_product', 'cancelled_service', 'fraudulent_charge', 'billing_error', 'other'],
              description: 'Type of dispute'
            },
            amountDisputed: { type: 'number', minimum: 0.01, description: 'Amount being disputed' },
            reason: { type: 'string', description: 'Reason for dispute' },
            description: { type: 'string', description: 'Detailed description (optional)' },
            merchantName: { type: 'string', description: 'Merchant name (optional)' }
          },
          required: ['authToken', 'transactionId', 'disputeType', 'amountDisputed', 'reason']
        }
      },
      {
        name: 'banking_get_disputes',
        description: 'Get all disputes for authenticated user',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            status: { type: 'string', enum: ['submitted', 'under_review', 'resolved', 'closed', 'withdrawn'] },
            limit: { type: 'number', default: 50 }
          },
          required: ['authToken']
        }
      },
      {
        name: 'banking_get_dispute',
        description: 'Get specific dispute details',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            disputeId: { type: 'string', description: 'Dispute ID (UUID)' }
          },
          required: ['authToken', 'disputeId']
        }
      },
      {
        name: 'banking_add_dispute_evidence',
        description: 'Add evidence to an existing dispute',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            disputeId: { type: 'string', description: 'Dispute ID (UUID)' },
            evidenceType: { type: 'string', enum: ['receipt', 'email', 'screenshot', 'photo', 'document', 'other'] },
            description: { type: 'string', description: 'Evidence description' },
            fileUrl: { type: 'string', description: 'URL to uploaded file (optional)' }
          },
          required: ['authToken', 'disputeId', 'evidenceType', 'description']
        }
      },
      {
        name: 'banking_withdraw_dispute',
        description: 'Withdraw a previously filed dispute',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            disputeId: { type: 'string', description: 'Dispute ID (UUID)' },
            reason: { type: 'string', description: 'Reason for withdrawal' }
          },
          required: ['authToken', 'disputeId', 'reason']
        }
      }
    ];
  }

  async _execute_banking_create_dispute(params) {
    const response = await axios.post(`${this.bankingServiceUrl}/disputes`, {
      transactionId: params.transactionId,
      disputeType: params.disputeType,
      amountDisputed: params.amountDisputed,
      reason: params.reason,
      description: params.description,
      merchantName: params.merchantName
    }, {
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }

  async _execute_banking_get_disputes(params) {
    const response = await axios.get(`${this.bankingServiceUrl}/disputes`, {
      params: {
        status: params.status,
        limit: params.limit
      },
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }

  async _execute_banking_get_dispute(params) {
    const response = await axios.get(`${this.bankingServiceUrl}/disputes/${params.disputeId}`, {
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }

  async _execute_banking_add_dispute_evidence(params) {
    const response = await axios.post(`${this.bankingServiceUrl}/disputes/${params.disputeId}/evidence`, {
      evidenceType: params.evidenceType,
      description: params.description,
      fileUrl: params.fileUrl
    }, {
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }

  async _execute_banking_withdraw_dispute(params) {
    const response = await axios.post(`${this.bankingServiceUrl}/disputes/${params.disputeId}/withdraw`, {
      reason: params.reason
    }, {
      headers: { Authorization: `Bearer ${params.authToken}` },
      timeout: this.apiTimeout
    });
    return response.data;
  }
}

module.exports = CompleteBankingTools;
