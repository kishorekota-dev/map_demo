const axios = require('axios');
const logger = require('../../utils/logger');

/**
 * Banking Tools for MCP Server  
 * Implements tools that call the POC Banking Service API
 * Based on OpenAPI specification: openapi.yaml
 */
class BankingTools {
  constructor() {
    // Banking Service API configuration
    this.bankingServiceUrl = process.env.BANKING_SERVICE_URL || 'http://localhost:3005/api/v1';
    this.apiTimeout = parseInt(process.env.API_TIMEOUT) || 30000;
    
    // Authentication token (should be passed from session/context)
    this.authToken = null;

    // Tool definitions aligned with OpenAPI spec - see MCP-BANKING-TOOLS-UPDATE.md for full list
    this.tools = this.defineTools();
  }

  defineTools() {
    return [
      {
        name: 'authenticate_user',
        description: 'Authenticate user and obtain JWT access token',
        inputSchema: {
          type: 'object',
          properties: {
            username: { type: 'string', description: 'User username' },
            password: { type: 'string', description: 'User password' },
            sessionId: { type: 'string', description: 'Session identifier' }
          },
          required: ['username', 'password']
        }
      },
      {
        name: 'get_account_balance',
        description: 'Get account balance',
        inputSchema: {
          type: 'object',
          properties: {
            accountId: { type: 'string', format: 'uuid', description: 'Account ID' },
            authToken: { type: 'string', description: 'JWT token' },
            sessionId: { type: 'string', description: 'Session ID' }
          },
          required: ['accountId', 'authToken']
        }
      },
      {
        name: 'get_transactions',
        description: 'Get transaction history',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT token' },
            page: { type: 'number', default: 1 },
            limit: { type: 'number', default: 50 },
            type: { type: 'string', enum: ['purchase', 'withdrawal', 'deposit', 'transfer', 'refund', 'fee'] },
            status: { type: 'string', enum: ['pending', 'completed', 'failed', 'cancelled'] },
            sessionId: { type: 'string' }
          },
          required: ['authToken']
        }
      },
      {
        name: 'create_dispute',
        description: 'File a dispute for a transaction',
        inputSchema: {
          type: 'object',
          properties: {
            transactionId: { type: 'string', format: 'uuid', description: 'Transaction ID' },
            disputeType: { 
              type: 'string',
              enum: ['unauthorized_transaction', 'incorrect_amount', 'duplicate_charge', 'service_not_received', 'fraudulent_charge', 'billing_error', 'other']
            },
            amountDisputed: { type: 'number', minimum: 0.01 },
            reason: { type: 'string' },
            description: { type: 'string' },
            authToken: { type: 'string' },
            sessionId: { type: 'string' }
          },
          required: ['transactionId', 'disputeType', 'amountDisputed', 'reason', 'authToken']
        }
      },
      // Phase 1: Core Account & Card Operations
      {
        name: 'get_all_accounts',
        description: 'Get all accounts for the authenticated user',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            status: { type: 'string', enum: ['active', 'frozen', 'closed'], description: 'Filter by account status' },
            limit: { type: 'number', default: 50, description: 'Maximum number of results' },
            offset: { type: 'number', default: 0, description: 'Number of results to skip' },
            sessionId: { type: 'string' }
          },
          required: ['authToken']
        }
      },
      {
        name: 'get_account_details',
        description: 'Get detailed information about a specific account',
        inputSchema: {
          type: 'object',
          properties: {
            accountId: { type: 'string', format: 'uuid', description: 'Account ID' },
            authToken: { type: 'string', description: 'JWT authentication token' },
            sessionId: { type: 'string' }
          },
          required: ['accountId', 'authToken']
        }
      },
      {
        name: 'get_all_cards',
        description: 'Get all cards for the authenticated user',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            status: { type: 'string', enum: ['active', 'blocked', 'expired', 'cancelled'], description: 'Filter by card status' },
            limit: { type: 'number', default: 50 },
            offset: { type: 'number', default: 0 },
            sessionId: { type: 'string' }
          },
          required: ['authToken']
        }
      },
      {
        name: 'get_card_details',
        description: 'Get detailed information about a specific card',
        inputSchema: {
          type: 'object',
          properties: {
            cardId: { type: 'string', format: 'uuid', description: 'Card ID' },
            authToken: { type: 'string', description: 'JWT authentication token' },
            sessionId: { type: 'string' }
          },
          required: ['cardId', 'authToken']
        }
      },
      {
        name: 'create_transfer',
        description: 'Create a new transfer between accounts',
        inputSchema: {
          type: 'object',
          properties: {
            fromAccountId: { type: 'string', format: 'uuid', description: 'Source account ID' },
            toAccountId: { type: 'string', format: 'uuid', description: 'Destination account ID' },
            amount: { type: 'number', minimum: 0.01, description: 'Transfer amount' },
            currency: { type: 'string', default: 'USD', description: 'Currency code' },
            description: { type: 'string', description: 'Transfer description' },
            authToken: { type: 'string', description: 'JWT authentication token' },
            sessionId: { type: 'string' }
          },
          required: ['fromAccountId', 'toAccountId', 'amount', 'authToken']
        }
      },
      // Phase 2: Card Management Operations
      {
        name: 'block_card',
        description: 'Block a card (for lost, stolen, or security reasons)',
        inputSchema: {
          type: 'object',
          properties: {
            cardId: { type: 'string', format: 'uuid', description: 'Card ID to block' },
            reason: { type: 'string', description: 'Reason for blocking the card' },
            authToken: { type: 'string', description: 'JWT authentication token' },
            sessionId: { type: 'string' }
          },
          required: ['cardId', 'authToken']
        }
      },
      {
        name: 'unblock_card',
        description: 'Unblock a previously blocked card',
        inputSchema: {
          type: 'object',
          properties: {
            cardId: { type: 'string', format: 'uuid', description: 'Card ID to unblock' },
            authToken: { type: 'string', description: 'JWT authentication token' },
            sessionId: { type: 'string' }
          },
          required: ['cardId', 'authToken']
        }
      },
      {
        name: 'activate_card',
        description: 'Activate a newly issued card',
        inputSchema: {
          type: 'object',
          properties: {
            cardId: { type: 'string', format: 'uuid', description: 'Card ID to activate' },
            authToken: { type: 'string', description: 'JWT authentication token' },
            sessionId: { type: 'string' }
          },
          required: ['cardId', 'authToken']
        }
      },
      {
        name: 'replace_card',
        description: 'Request a replacement card (for lost, stolen, or damaged cards)',
        inputSchema: {
          type: 'object',
          properties: {
            cardId: { type: 'string', format: 'uuid', description: 'Card ID to replace' },
            reason: { type: 'string', description: 'Reason for replacement' },
            authToken: { type: 'string', description: 'JWT authentication token' },
            sessionId: { type: 'string' }
          },
          required: ['cardId', 'authToken']
        }
      },
      // Phase 3: Fraud & Dispute Operations
      {
        name: 'get_fraud_alerts',
        description: 'Get all fraud alerts for the authenticated user',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            status: { type: 'string', enum: ['pending', 'investigating', 'confirmed', 'false_positive', 'resolved'], description: 'Filter by alert status' },
            limit: { type: 'number', default: 50 },
            offset: { type: 'number', default: 0 },
            sessionId: { type: 'string' }
          },
          required: ['authToken']
        }
      },
      {
        name: 'get_fraud_alert_details',
        description: 'Get detailed information about a specific fraud alert',
        inputSchema: {
          type: 'object',
          properties: {
            alertId: { type: 'string', format: 'uuid', description: 'Fraud alert ID' },
            authToken: { type: 'string', description: 'JWT authentication token' },
            sessionId: { type: 'string' }
          },
          required: ['alertId', 'authToken']
        }
      },
      {
        name: 'report_fraud',
        description: 'Report a fraudulent transaction or activity',
        inputSchema: {
          type: 'object',
          properties: {
            transactionId: { type: 'string', format: 'uuid', description: 'Transaction ID (if related to a transaction)' },
            alertType: { 
              type: 'string', 
              enum: ['unauthorized_transaction', 'identity_theft', 'card_not_present', 'account_takeover', 'phishing', 'skimming', 'counterfeit_card', 'suspicious_activity', 'other'],
              description: 'Type of fraud alert'
            },
            description: { type: 'string', description: 'Detailed description of the fraud' },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Severity level' },
            authToken: { type: 'string', description: 'JWT authentication token' },
            sessionId: { type: 'string' }
          },
          required: ['alertType', 'description', 'authToken']
        }
      },
      {
        name: 'get_all_disputes',
        description: 'Get all disputes for the authenticated user',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            status: { 
              type: 'string', 
              enum: ['pending', 'investigating', 'awaiting_evidence', 'under_review', 'resolved', 'rejected', 'withdrawn', 'escalated', 'closed'],
              description: 'Filter by dispute status' 
            },
            limit: { type: 'number', default: 50 },
            offset: { type: 'number', default: 0 },
            sessionId: { type: 'string' }
          },
          required: ['authToken']
        }
      },
      {
        name: 'get_dispute_details',
        description: 'Get detailed information about a specific dispute',
        inputSchema: {
          type: 'object',
          properties: {
            disputeId: { type: 'string', format: 'uuid', description: 'Dispute ID' },
            authToken: { type: 'string', description: 'JWT authentication token' },
            sessionId: { type: 'string' }
          },
          required: ['disputeId', 'authToken']
        }
      },
      {
        name: 'submit_dispute_evidence',
        description: 'Submit evidence for an existing dispute',
        inputSchema: {
          type: 'object',
          properties: {
            disputeId: { type: 'string', format: 'uuid', description: 'Dispute ID' },
            evidenceType: { type: 'string', description: 'Type of evidence (receipt, screenshot, document, etc.)' },
            description: { type: 'string', description: 'Description of the evidence' },
            authToken: { type: 'string', description: 'JWT authentication token' },
            sessionId: { type: 'string' }
          },
          required: ['disputeId', 'evidenceType', 'description', 'authToken']
        }
      },
      {
        name: 'resolve_dispute',
        description: 'Mark a dispute as resolved',
        inputSchema: {
          type: 'object',
          properties: {
            disputeId: { type: 'string', format: 'uuid', description: 'Dispute ID' },
            resolution: { type: 'string', description: 'Resolution details' },
            authToken: { type: 'string', description: 'JWT authentication token' },
            sessionId: { type: 'string' }
          },
          required: ['disputeId', 'authToken']
        }
      },
      // Phase 4: Additional Tools
      {
        name: 'get_transaction_details',
        description: 'Get detailed information about a specific transaction',
        inputSchema: {
          type: 'object',
          properties: {
            transactionId: { type: 'string', format: 'uuid', description: 'Transaction ID' },
            authToken: { type: 'string', description: 'JWT authentication token' },
            sessionId: { type: 'string' }
          },
          required: ['transactionId', 'authToken']
        }
      },
      {
        name: 'get_transaction_categories',
        description: 'Get list of available transaction categories',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            sessionId: { type: 'string' }
          },
          required: ['authToken']
        }
      },
      {
        name: 'get_user_profile',
        description: 'Get the authenticated user profile information',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            sessionId: { type: 'string' }
          },
          required: ['authToken']
        }
      },
      {
        name: 'get_all_transfers',
        description: 'Get all transfers for the authenticated user',
        inputSchema: {
          type: 'object',
          properties: {
            authToken: { type: 'string', description: 'JWT authentication token' },
            status: { type: 'string', enum: ['pending', 'completed', 'failed', 'cancelled'], description: 'Filter by transfer status' },
            limit: { type: 'number', default: 50 },
            offset: { type: 'number', default: 0 },
            sessionId: { type: 'string' }
          },
          required: ['authToken']
        }
      },
      {
        name: 'get_transfer_details',
        description: 'Get detailed information about a specific transfer',
        inputSchema: {
          type: 'object',
          properties: {
            transferId: { type: 'string', format: 'uuid', description: 'Transfer ID' },
            authToken: { type: 'string', description: 'JWT authentication token' },
            sessionId: { type: 'string' }
          },
          required: ['transferId', 'authToken']
        }
      },
      {
        name: 'cancel_transfer',
        description: 'Cancel a pending transfer',
        inputSchema: {
          type: 'object',
          properties: {
            transferId: { type: 'string', format: 'uuid', description: 'Transfer ID to cancel' },
            reason: { type: 'string', description: 'Reason for cancellation' },
            authToken: { type: 'string', description: 'JWT authentication token' },
            sessionId: { type: 'string' }
          },
          required: ['transferId', 'authToken']
        }
      },
      {
        name: 'update_fraud_alert',
        description: 'Update the status or details of a fraud alert',
        inputSchema: {
          type: 'object',
          properties: {
            alertId: { type: 'string', format: 'uuid', description: 'Fraud alert ID' },
            status: { type: 'string', enum: ['pending', 'investigating', 'confirmed', 'false_positive', 'resolved'], description: 'New status' },
            notes: { type: 'string', description: 'Additional notes' },
            authToken: { type: 'string', description: 'JWT authentication token' },
            sessionId: { type: 'string' }
          },
          required: ['alertId', 'authToken']
        }
      },
      {
        name: 'update_dispute',
        description: 'Update the details of an existing dispute',
        inputSchema: {
          type: 'object',
          properties: {
            disputeId: { type: 'string', format: 'uuid', description: 'Dispute ID' },
            status: { 
              type: 'string', 
              enum: ['pending', 'investigating', 'awaiting_evidence', 'under_review', 'resolved', 'rejected', 'withdrawn', 'escalated', 'closed'],
              description: 'New status' 
            },
            reason: { type: 'string', description: 'Updated reason' },
            description: { type: 'string', description: 'Updated description' },
            authToken: { type: 'string', description: 'JWT authentication token' },
            sessionId: { type: 'string' }
          },
          required: ['disputeId', 'authToken']
        }
      }
    ];
  }

  setAuthToken(token) {
    this.authToken = token;
  }

  createApiClient(authToken) {
    return axios.create({
      baseURL: this.bankingServiceUrl,
      timeout: this.apiTimeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken || this.authToken}`
      }
    });
  }

  getAllTools() {
    return this.tools;
  }

  async executeTool(toolName, args) {
    logger.info('Executing banking tool', { tool: toolName, args: Object.keys(args || {}) });

    const handler = this.getToolHandler(toolName);
    if (!handler) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    try {
      const result = await handler(args);
      logger.info('Tool execution completed', { tool: toolName, success: true });
      return result;
    } catch (error) {
      logger.error('Tool execution failed', {
        tool: toolName,
        error: error.message,
        response: error.response?.data
      });
      
      return {
        success: false,
        error: {
          message: error.message,
          code: error.response?.status || 500,
          details: error.response?.data || {}
        },
        sessionId: args.sessionId
      };
    }
  }

  getToolHandler(toolName) {
    const handlers = {
      authenticate_user: this.authenticateUser.bind(this),
      get_account_balance: this.getAccountBalance.bind(this),
      get_transactions: this.getTransactions.bind(this),
      create_dispute: this.createDispute.bind(this),
      // Phase 1: Core Operations
      get_all_accounts: this.getAllAccounts.bind(this),
      get_account_details: this.getAccountDetails.bind(this),
      get_all_cards: this.getAllCards.bind(this),
      get_card_details: this.getCardDetails.bind(this),
      create_transfer: this.createTransfer.bind(this),
      // Phase 2: Card Management
      block_card: this.blockCard.bind(this),
      unblock_card: this.unblockCard.bind(this),
      activate_card: this.activateCard.bind(this),
      replace_card: this.replaceCard.bind(this),
      // Phase 3: Fraud & Dispute Operations
      get_fraud_alerts: this.getFraudAlerts.bind(this),
      get_fraud_alert_details: this.getFraudAlertDetails.bind(this),
      report_fraud: this.reportFraud.bind(this),
      get_all_disputes: this.getAllDisputes.bind(this),
      get_dispute_details: this.getDisputeDetails.bind(this),
      submit_dispute_evidence: this.submitDisputeEvidence.bind(this),
      resolve_dispute: this.resolveDispute.bind(this),
      // Phase 4: Additional Tools
      get_transaction_details: this.getTransactionDetails.bind(this),
      get_transaction_categories: this.getTransactionCategories.bind(this),
      get_user_profile: this.getUserProfile.bind(this),
      get_all_transfers: this.getAllTransfers.bind(this),
      get_transfer_details: this.getTransferDetails.bind(this),
      cancel_transfer: this.cancelTransfer.bind(this),
      update_fraud_alert: this.updateFraudAlert.bind(this),
      update_dispute: this.updateDispute.bind(this)
    };

    return handlers[toolName];
  }

  // Tool Implementations

  async authenticateUser({ username, password, sessionId }) {
    try {
      const response = await axios.post(`${this.bankingServiceUrl}/auth/login`, {
        username,
        password
      });

      const { data } = response.data;
      
      if (data.tokens?.accessToken) {
        this.setAuthToken(data.tokens.accessToken);
      }

      return {
        success: true,
        data: {
          user: data.user,
          accessToken: data.tokens.accessToken,
          refreshToken: data.tokens.refreshToken,
          expiresIn: data.tokens.expiresIn,
          roles: data.roles,
          permissions: data.permissions
        },
        message: 'Authentication successful',
        sessionId
      };
    } catch (error) {
      throw new Error(`Authentication failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async getAccountBalance({ accountId, authToken, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const response = await api.get(`/accounts/${accountId}/balance`);
      
      return {
        success: true,
        data: response.data.data,
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to get account balance: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async getTransactions({ authToken, page = 1, limit = 50, type, status, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const params = { page, limit };
      if (type) params.type = type;
      if (status) params.status = status;

      const response = await api.get('/transactions', { params });
      
      return {
        success: true,
        data: response.data.data,
        pagination: response.data.pagination,
        count: response.data.data?.length || 0,
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to get transactions: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async createDispute({ transactionId, disputeType, amountDisputed, reason, description, authToken, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const response = await api.post('/disputes', {
        transactionId,
        disputeType,
        amountDisputed,
        reason,
        description
      });
      
      return {
        success: true,
        data: response.data.data,
        message: 'Dispute created successfully',
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to create dispute: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Phase 1: Core Account & Card Operations

  async getAllAccounts({ authToken, status, limit = 50, offset = 0, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const params = { limit, offset };
      if (status) params.status = status;

      const response = await api.get('/accounts', { params });
      
      return {
        success: true,
        data: response.data.data,
        pagination: response.data.pagination,
        count: response.data.data?.length || 0,
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to get accounts: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async getAccountDetails({ accountId, authToken, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const response = await api.get(`/accounts/${accountId}`);
      
      return {
        success: true,
        data: response.data.data,
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to get account details: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async getAllCards({ authToken, status, limit = 50, offset = 0, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const params = { limit, offset };
      if (status) params.status = status;

      const response = await api.get('/cards', { params });
      
      return {
        success: true,
        data: response.data.data,
        pagination: response.data.pagination,
        count: response.data.data?.length || 0,
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to get cards: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async getCardDetails({ cardId, authToken, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const response = await api.get(`/cards/${cardId}`);
      
      return {
        success: true,
        data: response.data.data,
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to get card details: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async createTransfer({ fromAccountId, toAccountId, amount, currency = 'USD', description, authToken, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const response = await api.post('/transfers', {
        fromAccountId,
        toAccountId,
        amount,
        currency,
        description
      });
      
      return {
        success: true,
        data: response.data.data,
        message: 'Transfer created successfully',
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to create transfer: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Phase 2: Card Management Operations

  async blockCard({ cardId, reason, authToken, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const response = await api.post(`/cards/${cardId}/block`, {
        reason
      });
      
      return {
        success: true,
        data: response.data.data,
        message: 'Card blocked successfully',
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to block card: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async unblockCard({ cardId, authToken, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const response = await api.post(`/cards/${cardId}/unblock`);
      
      return {
        success: true,
        data: response.data.data,
        message: 'Card unblocked successfully',
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to unblock card: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async activateCard({ cardId, authToken, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const response = await api.post(`/cards/${cardId}/activate`);
      
      return {
        success: true,
        data: response.data.data,
        message: 'Card activated successfully',
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to activate card: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async replaceCard({ cardId, reason, authToken, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const response = await api.post(`/cards/${cardId}/replace`, {
        reason
      });
      
      return {
        success: true,
        data: response.data.data,
        message: 'Card replacement requested successfully',
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to replace card: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Phase 3: Fraud & Dispute Operations

  async getFraudAlerts({ authToken, status, limit = 50, offset = 0, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const params = { limit, offset };
      if (status) params.status = status;

      const response = await api.get('/fraud/alerts', { params });
      
      return {
        success: true,
        data: response.data.data,
        pagination: response.data.pagination,
        count: response.data.data?.length || 0,
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to get fraud alerts: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async getFraudAlertDetails({ alertId, authToken, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const response = await api.get(`/fraud/alerts/${alertId}`);
      
      return {
        success: true,
        data: response.data.data,
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to get fraud alert details: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async reportFraud({ transactionId, alertType, description, severity, authToken, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const payload = {
        alertType,
        description
      };
      if (transactionId) payload.transactionId = transactionId;
      if (severity) payload.severity = severity;

      const response = await api.post('/fraud/alerts', payload);
      
      return {
        success: true,
        data: response.data.data,
        message: 'Fraud reported successfully',
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to report fraud: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async getAllDisputes({ authToken, status, limit = 50, offset = 0, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const params = { limit, offset };
      if (status) params.status = status;

      const response = await api.get('/disputes', { params });
      
      return {
        success: true,
        data: response.data.data,
        pagination: response.data.pagination,
        count: response.data.data?.length || 0,
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to get disputes: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async getDisputeDetails({ disputeId, authToken, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const response = await api.get(`/disputes/${disputeId}`);
      
      return {
        success: true,
        data: response.data.data,
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to get dispute details: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async submitDisputeEvidence({ disputeId, evidenceType, description, authToken, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const response = await api.post(`/disputes/${disputeId}/evidence`, {
        evidenceType,
        description
      });
      
      return {
        success: true,
        data: response.data.data,
        message: 'Evidence submitted successfully',
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to submit evidence: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async resolveDispute({ disputeId, resolution, authToken, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const payload = {};
      if (resolution) payload.resolution = resolution;

      const response = await api.post(`/disputes/${disputeId}/resolve`, payload);
      
      return {
        success: true,
        data: response.data.data,
        message: 'Dispute resolved successfully',
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to resolve dispute: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Phase 4: Additional Tools

  async getTransactionDetails({ transactionId, authToken, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const response = await api.get(`/transactions/${transactionId}`);
      
      return {
        success: true,
        data: response.data.data,
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to get transaction details: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async getTransactionCategories({ authToken, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const response = await api.get('/transactions/categories');
      
      return {
        success: true,
        data: response.data.data,
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to get transaction categories: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async getUserProfile({ authToken, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const response = await api.get('/auth/me');
      
      return {
        success: true,
        data: response.data.data,
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to get user profile: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async getAllTransfers({ authToken, status, limit = 50, offset = 0, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const params = { limit, offset };
      if (status) params.status = status;

      const response = await api.get('/transfers', { params });
      
      return {
        success: true,
        data: response.data.data,
        pagination: response.data.pagination,
        count: response.data.data?.length || 0,
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to get transfers: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async getTransferDetails({ transferId, authToken, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const response = await api.get(`/transfers/${transferId}`);
      
      return {
        success: true,
        data: response.data.data,
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to get transfer details: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async cancelTransfer({ transferId, reason, authToken, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const payload = {};
      if (reason) payload.reason = reason;

      const response = await api.post(`/transfers/${transferId}/cancel`, payload);
      
      return {
        success: true,
        data: response.data.data,
        message: 'Transfer cancelled successfully',
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to cancel transfer: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async updateFraudAlert({ alertId, status, notes, authToken, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const payload = {};
      if (status) payload.status = status;
      if (notes) payload.notes = notes;

      const response = await api.put(`/fraud/alerts/${alertId}`, payload);
      
      return {
        success: true,
        data: response.data.data,
        message: 'Fraud alert updated successfully',
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to update fraud alert: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async updateDispute({ disputeId, status, reason, description, authToken, sessionId }) {
    const api = this.createApiClient(authToken);
    
    try {
      const payload = {};
      if (status) payload.status = status;
      if (reason) payload.reason = reason;
      if (description) payload.description = description;

      const response = await api.put(`/disputes/${disputeId}`, payload);
      
      return {
        success: true,
        data: response.data.data,
        message: 'Dispute updated successfully',
        sessionId
      };
    } catch (error) {
      throw new Error(`Failed to update dispute: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}

module.exports = new BankingTools();
