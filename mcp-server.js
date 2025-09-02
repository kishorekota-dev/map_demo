#!/usr/bin/env node

/**
 * MCP Server for Credit Card Enterprise API
 * Model Context Protocol server that provides tools to interact with the credit card backend API
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');

class CreditCardMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'credit-card-enterprise-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000/api/v1';
    this.authToken = null;
    
    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'authenticate',
            description: 'Authenticate with the credit card API and get access token',
            inputSchema: {
              type: 'object',
              properties: {
                email: {
                  type: 'string',
                  description: 'User email address',
                },
                password: {
                  type: 'string',
                  description: 'User password',
                },
              },
              required: ['email', 'password'],
            },
          },
          {
            name: 'get_accounts',
            description: 'Retrieve user accounts with optional filtering and pagination',
            inputSchema: {
              type: 'object',
              properties: {
                page: {
                  type: 'number',
                  description: 'Page number for pagination',
                },
                limit: {
                  type: 'number',
                  description: 'Number of items per page',
                },
                status: {
                  type: 'string',
                  enum: ['ACTIVE', 'SUSPENDED', 'CLOSED'],
                  description: 'Filter by account status',
                },
                accountType: {
                  type: 'string',
                  enum: ['CREDIT', 'DEBIT', 'SAVINGS', 'CHECKING'],
                  description: 'Filter by account type',
                },
              },
            },
          },
          {
            name: 'create_account',
            description: 'Create a new credit card account',
            inputSchema: {
              type: 'object',
              properties: {
                accountType: {
                  type: 'string',
                  enum: ['CREDIT', 'DEBIT', 'SAVINGS', 'CHECKING'],
                  description: 'Type of account to create',
                },
                creditLimit: {
                  type: 'number',
                  description: 'Credit limit for credit accounts',
                },
                initialDeposit: {
                  type: 'number',
                  description: 'Initial deposit for savings/checking accounts',
                },
              },
              required: ['accountType'],
            },
          },
          {
            name: 'get_account_details',
            description: 'Get detailed information about a specific account',
            inputSchema: {
              type: 'object',
              properties: {
                accountId: {
                  type: 'string',
                  description: 'Account ID to retrieve details for',
                },
              },
              required: ['accountId'],
            },
          },
          {
            name: 'get_transactions',
            description: 'Retrieve transactions with filtering and pagination',
            inputSchema: {
              type: 'object',
              properties: {
                page: {
                  type: 'number',
                  description: 'Page number for pagination',
                },
                limit: {
                  type: 'number',
                  description: 'Number of items per page',
                },
                accountId: {
                  type: 'string',
                  description: 'Filter by account ID',
                },
                status: {
                  type: 'string',
                  enum: ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'],
                  description: 'Filter by transaction status',
                },
                type: {
                  type: 'string',
                  enum: ['DEBIT', 'CREDIT', 'TRANSFER', 'PAYMENT', 'WITHDRAWAL'],
                  description: 'Filter by transaction type',
                },
                startDate: {
                  type: 'string',
                  description: 'Start date filter (YYYY-MM-DD)',
                },
                endDate: {
                  type: 'string',
                  description: 'End date filter (YYYY-MM-DD)',
                },
              },
            },
          },
          {
            name: 'create_transaction',
            description: 'Create a new transaction',
            inputSchema: {
              type: 'object',
              properties: {
                accountId: {
                  type: 'string',
                  description: 'Account ID for the transaction',
                },
                amount: {
                  type: 'number',
                  description: 'Transaction amount',
                },
                type: {
                  type: 'string',
                  enum: ['DEBIT', 'CREDIT', 'TRANSFER', 'PAYMENT', 'WITHDRAWAL'],
                  description: 'Type of transaction',
                },
                description: {
                  type: 'string',
                  description: 'Transaction description',
                },
                merchantId: {
                  type: 'string',
                  description: 'Merchant ID (optional)',
                },
                category: {
                  type: 'string',
                  description: 'Transaction category',
                },
              },
              required: ['accountId', 'amount', 'type', 'description'],
            },
          },
          {
            name: 'get_cards',
            description: 'Retrieve credit/debit cards with filtering',
            inputSchema: {
              type: 'object',
              properties: {
                page: {
                  type: 'number',
                  description: 'Page number for pagination',
                },
                limit: {
                  type: 'number',
                  description: 'Number of items per page',
                },
                status: {
                  type: 'string',
                  enum: ['ACTIVE', 'BLOCKED', 'EXPIRED', 'CANCELLED'],
                  description: 'Filter by card status',
                },
                type: {
                  type: 'string',
                  enum: ['CREDIT', 'DEBIT'],
                  description: 'Filter by card type',
                },
              },
            },
          },
          {
            name: 'create_card',
            description: 'Create a new credit or debit card',
            inputSchema: {
              type: 'object',
              properties: {
                accountId: {
                  type: 'string',
                  description: 'Account ID to associate with the card',
                },
                cardType: {
                  type: 'string',
                  enum: ['CREDIT', 'DEBIT'],
                  description: 'Type of card to create',
                },
                cardCategory: {
                  type: 'string',
                  enum: ['STANDARD', 'GOLD', 'PLATINUM', 'BLACK'],
                  description: 'Card category/tier',
                },
                deliveryAddress: {
                  type: 'object',
                  properties: {
                    street: { type: 'string' },
                    city: { type: 'string' },
                    state: { type: 'string' },
                    zipCode: { type: 'string' },
                    country: { type: 'string' },
                  },
                  description: 'Delivery address for the physical card',
                },
              },
              required: ['accountId', 'cardType', 'cardCategory'],
            },
          },
          {
            name: 'get_fraud_cases',
            description: 'Retrieve fraud cases with filtering',
            inputSchema: {
              type: 'object',
              properties: {
                page: {
                  type: 'number',
                  description: 'Page number for pagination',
                },
                limit: {
                  type: 'number',
                  description: 'Number of items per page',
                },
                status: {
                  type: 'string',
                  enum: ['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED'],
                  description: 'Filter by case status',
                },
                priority: {
                  type: 'string',
                  enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
                  description: 'Filter by priority level',
                },
                riskScore: {
                  type: 'number',
                  description: 'Filter by minimum risk score',
                },
              },
            },
          },
          {
            name: 'create_fraud_case',
            description: 'Create a new fraud case',
            inputSchema: {
              type: 'object',
              properties: {
                accountId: {
                  type: 'string',
                  description: 'Account ID associated with the fraud case',
                },
                transactionId: {
                  type: 'string',
                  description: 'Transaction ID if related to a specific transaction',
                },
                description: {
                  type: 'string',
                  description: 'Description of the fraud case',
                },
                priority: {
                  type: 'string',
                  enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
                  description: 'Priority level of the case',
                },
                riskScore: {
                  type: 'number',
                  minimum: 0,
                  maximum: 100,
                  description: 'Risk score (0-100)',
                },
                category: {
                  type: 'string',
                  description: 'Fraud category',
                },
              },
              required: ['accountId', 'description', 'priority', 'riskScore', 'category'],
            },
          },
          {
            name: 'get_disputes',
            description: 'Retrieve dispute cases with filtering',
            inputSchema: {
              type: 'object',
              properties: {
                page: {
                  type: 'number',
                  description: 'Page number for pagination',
                },
                limit: {
                  type: 'number',
                  description: 'Number of items per page',
                },
                status: {
                  type: 'string',
                  enum: ['PENDING', 'INVESTIGATING', 'RESOLVED', 'REJECTED'],
                  description: 'Filter by dispute status',
                },
                type: {
                  type: 'string',
                  enum: ['CHARGEBACK', 'BILLING_ERROR', 'FRAUD', 'QUALITY_ISSUE'],
                  description: 'Filter by dispute type',
                },
              },
            },
          },
          {
            name: 'health_check',
            description: 'Check the health status of the credit card API',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_user_profile',
            description: 'Get current user profile and permissions',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_permissions',
            description: 'Get user role permissions and access levels',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'authenticate':
            return await this.authenticate(args);
          case 'get_accounts':
            return await this.getAccounts(args);
          case 'create_account':
            return await this.createAccount(args);
          case 'get_account_details':
            return await this.getAccountDetails(args);
          case 'get_transactions':
            return await this.getTransactions(args);
          case 'create_transaction':
            return await this.createTransaction(args);
          case 'get_cards':
            return await this.getCards(args);
          case 'create_card':
            return await this.createCard(args);
          case 'get_fraud_cases':
            return await this.getFraudCases(args);
          case 'create_fraud_case':
            return await this.createFraudCase(args);
          case 'get_disputes':
            return await this.getDisputes(args);
          case 'health_check':
            return await this.healthCheck();
          case 'get_user_profile':
            return await this.getUserProfile();
          case 'get_permissions':
            return await this.getPermissions();
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Error executing tool ${name}: ${error.message}`
        );
      }
    });
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  // Helper method to make authenticated API requests
  async makeRequest(method, endpoint, data = null, requireAuth = true) {
    const config = {
      method,
      url: `${this.apiBaseUrl}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (requireAuth && this.authToken) {
      config.headers.Authorization = `Bearer ${this.authToken}`;
    }

    if (data) {
      config.data = data;
    }

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Network Error: ${error.message}`);
    }
  }

  // Tool implementations
  async authenticate(args) {
    const { email, password } = args;
    
    try {
      const response = await this.makeRequest('POST', '/auth/login', {
        email,
        password,
      }, false);

      this.authToken = response.token;
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Authentication successful',
              user: response.user,
              role: response.user.role,
              permissions: response.user.permissions,
              accountIds: response.user.accountIds,
              tokenExpires: response.expiresAt,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error.message,
            }, null, 2),
          },
        ],
      };
    }
  }

  async getAccounts(args) {
    const queryParams = new URLSearchParams();
    
    Object.entries(args).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString());
      }
    });

    const endpoint = `/accounts${queryParams.toString() ? `?${queryParams}` : ''}`;
    const data = await this.makeRequest('GET', endpoint);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async createAccount(args) {
    const data = await this.makeRequest('POST', '/accounts', args);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async getAccountDetails(args) {
    const { accountId } = args;
    const data = await this.makeRequest('GET', `/accounts/${accountId}`);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async getTransactions(args) {
    const queryParams = new URLSearchParams();
    
    Object.entries(args).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString());
      }
    });

    const endpoint = `/transactions${queryParams.toString() ? `?${queryParams}` : ''}`;
    const data = await this.makeRequest('GET', endpoint);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async createTransaction(args) {
    const data = await this.makeRequest('POST', '/transactions', args);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async getCards(args) {
    const queryParams = new URLSearchParams();
    
    Object.entries(args).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString());
      }
    });

    const endpoint = `/cards${queryParams.toString() ? `?${queryParams}` : ''}`;
    const data = await this.makeRequest('GET', endpoint);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async createCard(args) {
    const data = await this.makeRequest('POST', '/cards', args);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async getFraudCases(args) {
    const queryParams = new URLSearchParams();
    
    Object.entries(args).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString());
      }
    });

    const endpoint = `/fraud/cases${queryParams.toString() ? `?${queryParams}` : ''}`;
    const data = await this.makeRequest('GET', endpoint);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async createFraudCase(args) {
    const data = await this.makeRequest('POST', '/fraud/cases', args);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async getDisputes(args) {
    const queryParams = new URLSearchParams();
    
    Object.entries(args).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString());
      }
    });

    const endpoint = `/disputes${queryParams.toString() ? `?${queryParams}` : ''}`;
    const data = await this.makeRequest('GET', endpoint);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async healthCheck() {
    const data = await this.makeRequest('GET', '/health', null, false);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async getUserProfile() {
    const data = await this.makeRequest('GET', '/auth/me');
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async getPermissions() {
    const data = await this.makeRequest('GET', '/auth/permissions');
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Credit Card Enterprise MCP server running on stdio');
  }
}

// Start the server
const server = new CreditCardMCPServer();
server.run().catch(console.error);
