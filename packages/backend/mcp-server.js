#!/usr/bin/env node

/**
 * Enterprise Banking MCP Server v2.0
 * Model Context Protocol server for the enterprise banking API with BIAN compliance
 * Provides comprehensive tools for customer management, accounts, transactions, and payments
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

class EnterpriseBankingMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'enterprise-banking-mcp',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3001/api/v1';
    this.authToken = null;
    this.userRole = null;
    
    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Authentication Tools
          {
            name: 'enterprise_login',
            description: 'Login to the enterprise banking system with customer or admin credentials',
            inputSchema: {
              type: 'object',
              properties: {
                email: { type: 'string', description: 'Email address' },
                password: { type: 'string', description: 'Password' },
                loginType: { type: 'string', enum: ['CUSTOMER', 'ADMIN'], description: 'Type of login', default: 'CUSTOMER' }
              },
              required: ['email', 'password'],
            },
          },
          {
            name: 'register_customer',
            description: 'Register a new customer with complete profile information',
            inputSchema: {
              type: 'object',
              properties: {
                firstName: { type: 'string', description: 'First name' },
                lastName: { type: 'string', description: 'Last name' },
                email: { type: 'string', description: 'Email address' },
                password: { type: 'string', description: 'Password' },
                dateOfBirth: { type: 'string', description: 'Date of birth (YYYY-MM-DD)' },
                phoneNumber: { type: 'string', description: 'Phone number (XXX-XXX-XXXX)' },
                ssn: { type: 'string', description: 'SSN (XXX-XX-XXXX)' },
                addressLine1: { type: 'string', description: 'Address line 1' },
                city: { type: 'string', description: 'City' },
                state: { type: 'string', description: 'State (2-letter code)' },
                zipCode: { type: 'string', description: 'ZIP code' },
                employmentStatus: { type: 'string', enum: ['FULL_TIME', 'PART_TIME', 'SELF_EMPLOYED', 'RETIRED', 'STUDENT', 'UNEMPLOYED'] },
                annualIncome: { type: 'string', enum: ['0-25000', '25000-50000', '50000-75000', '75000-100000', '100000-150000', '150000+'] }
              },
              required: ['firstName', 'lastName', 'email', 'password', 'dateOfBirth', 'phoneNumber', 'ssn', 'addressLine1', 'city', 'state', 'zipCode', 'employmentStatus', 'annualIncome'],
            },
          },
          
          // Customer Profile Management
          {
            name: 'get_customer_profile',
            description: 'Get detailed customer profile information',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'update_customer_profile',
            description: 'Update customer profile information',
            inputSchema: {
              type: 'object',
              properties: {
                phoneNumber: { type: 'string', description: 'Phone number' },
                email: { type: 'string', description: 'Email address' },
                addressLine1: { type: 'string', description: 'Address line 1' },
                city: { type: 'string', description: 'City' },
                state: { type: 'string', description: 'State' },
                zipCode: { type: 'string', description: 'ZIP code' }
              },
            },
          },
          
          // Account Management
          {
            name: 'get_customer_accounts',
            description: 'Get customer accounts with filtering',
            inputSchema: {
              type: 'object',
              properties: {
                page: { type: 'number', description: 'Page number', default: 1 },
                limit: { type: 'number', description: 'Items per page', default: 10 },
                accountType: { type: 'string', enum: ['CREDIT', 'DEBIT', 'SAVINGS', 'CHECKING'] },
                status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED'] }
              },
            },
          },
          {
            name: 'get_account_details',
            description: 'Get detailed account information',
            inputSchema: {
              type: 'object',
              properties: {
                accountId: { type: 'string', description: 'Account ID' }
              },
              required: ['accountId'],
            },
          },
          
          // Transaction Management
          {
            name: 'get_transactions',
            description: 'Get transaction history with filtering',
            inputSchema: {
              type: 'object',
              properties: {
                page: { type: 'number', description: 'Page number', default: 1 },
                limit: { type: 'number', description: 'Items per page', default: 20 },
                accountId: { type: 'string', description: 'Account ID filter' },
                transactionType: { type: 'string', enum: ['PURCHASE', 'PAYMENT', 'TRANSFER', 'WITHDRAWAL', 'DEPOSIT', 'FEE', 'INTEREST'] },
                status: { type: 'string', enum: ['PENDING', 'AUTHORIZED', 'SETTLED', 'DECLINED', 'REVERSED'] },
                startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
                endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' }
              },
            },
          },
          
          // Payment Management
          {
            name: 'make_payment',
            description: 'Make a payment to a credit card account',
            inputSchema: {
              type: 'object',
              properties: {
                accountId: { type: 'string', description: 'Account ID' },
                amount: { type: 'number', description: 'Payment amount' },
                paymentMethod: { type: 'string', enum: ['ACH', 'WIRE', 'CHECK', 'DEBIT_CARD'] },
                memo: { type: 'string', description: 'Payment memo' }
              },
              required: ['accountId', 'amount', 'paymentMethod'],
            },
          },
          
          // Credit Card Management
          {
            name: 'apply_credit_card',
            description: 'Apply for a new credit card',
            inputSchema: {
              type: 'object',
              properties: {
                cardType: { type: 'string', enum: ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'] },
                requestedCreditLimit: { type: 'number', description: 'Requested credit limit' },
                purpose: { type: 'string', enum: ['PERSONAL', 'BUSINESS', 'BALANCE_TRANSFER', 'EMERGENCY'] }
              },
              required: ['cardType', 'requestedCreditLimit'],
            },
          },
          
          // System Information
          {
            name: 'get_system_health',
            description: 'Get system health and status information',
            inputSchema: { type: 'object', properties: {} },
          }
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'enterprise_login':
            return await this.enterpriseLogin(args.email, args.password, args.loginType);
          case 'register_customer':
            return await this.registerCustomer(args);
          case 'get_customer_profile':
            return await this.getCustomerProfile();
          case 'update_customer_profile':
            return await this.updateCustomerProfile(args);
          case 'get_customer_accounts':
            return await this.getCustomerAccounts(args);
          case 'get_account_details':
            return await this.getAccountDetails(args.accountId);
          case 'get_transactions':
            return await this.getTransactions(args);
          case 'make_payment':
            return await this.makePayment(args);
          case 'apply_credit_card':
            return await this.applyCreditCard(args);
          case 'get_system_health':
            return await this.getSystemHealth();
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) throw error;
        console.error(`Error in tool ${name}:`, error);
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error.message}`);
      }
    });
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Server Error]:', error);
    };
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async makeRequest(method, endpoint, data = null, requiresAuth = true) {
    try {
      if (requiresAuth && !this.authToken) {
        throw new Error('Authentication required. Please login first.');
      }

      const config = {
        method,
        url: `${this.apiBaseUrl}${endpoint}`,
        headers: { 'Content-Type': 'application/json' },
      };

      if (requiresAuth && this.authToken) {
        config.headers.Authorization = `Bearer ${this.authToken}`;
      }
      if (data) config.data = data;

      const response = await axios(config);
      return response.data;
    } catch (error) {
      if (error.response) {
        const errorMsg = error.response.data?.message || error.response.data?.error || 'API request failed';
        throw new Error(`API Error (${error.response.status}): ${errorMsg}`);
      } else if (error.request) {
        throw new Error('Network error: Unable to reach the API server');
      } else {
        throw new Error(`Request error: ${error.message}`);
      }
    }
  }

  // Authentication Methods
  async enterpriseLogin(email, password, loginType = 'CUSTOMER') {
    try {
      const response = await this.makeRequest('POST', '/auth/login', { email, password, loginType }, false);
      this.authToken = response.token;
      this.userRole = response.user?.role || loginType;
      
      return {
        content: [{
          type: 'text',
          text: `✅ Successfully logged in as ${loginType}\n\nCustomer ID: ${response.user?.customerId || 'N/A'}\nEmail: ${response.user?.email}\nRole: ${this.userRole}\n\n🔐 Authentication token stored for subsequent requests.`,
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Login failed: ${error.message}` }],
      };
    }
  }

  async registerCustomer(customerData) {
    try {
      const response = await this.makeRequest('POST', '/auth/register', customerData, false);
      return {
        content: [{
          type: 'text',
          text: `✅ Customer registration successful!\n\nCustomer Number: ${response.customerNumber}\nCustomer ID: ${response.customerId}\nEmail: ${response.email}\nStatus: ${response.accountStatus}\nKYC Status: ${response.kycStatus}\n\n📋 Next steps:\n1. Verify email address\n2. Complete KYC documentation\n3. Login to access banking services`,
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Customer registration failed: ${error.message}` }],
      };
    }
  }

  async getCustomerProfile() {
    try {
      const response = await this.makeRequest('GET', '/customers/profile');
      return {
        content: [{ type: 'text', text: `👤 Customer Profile\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Failed to retrieve customer profile: ${error.message}` }],
      };
    }
  }

  async updateCustomerProfile(updateData) {
    try {
      const response = await this.makeRequest('PUT', '/customers/profile', updateData);
      return {
        content: [{ type: 'text', text: `✅ Customer profile updated successfully!\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Failed to update customer profile: ${error.message}` }],
      };
    }
  }

  async getCustomerAccounts(filters = {}) {
    try {
      const queryParams = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
      
      const endpoint = '/accounts' + (queryParams.toString() ? `?${queryParams.toString()}` : '');
      const response = await this.makeRequest('GET', endpoint);
      
      return {
        content: [{ type: 'text', text: `💳 Customer Accounts\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Failed to retrieve accounts: ${error.message}` }],
      };
    }
  }

  async getAccountDetails(accountId) {
    try {
      const response = await this.makeRequest('GET', `/accounts/${accountId}`);
      return {
        content: [{ type: 'text', text: `💳 Account Details (${accountId})\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Failed to retrieve account details: ${error.message}` }],
      };
    }
  }

  async getTransactions(filters = {}) {
    try {
      const queryParams = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
      
      const endpoint = '/transactions' + (queryParams.toString() ? `?${queryParams.toString()}` : '');
      const response = await this.makeRequest('GET', endpoint);
      
      return {
        content: [{ type: 'text', text: `💰 Transaction History\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Failed to retrieve transactions: ${error.message}` }],
      };
    }
  }

  async makePayment(paymentData) {
    try {
      const response = await this.makeRequest('POST', '/payments', paymentData);
      return {
        content: [{
          type: 'text',
          text: `✅ Payment submitted successfully!\n\nPayment ID: ${response.paymentId}\nAmount: $${response.amount}\nAccount: ${response.accountId}\nMethod: ${response.paymentMethod}\nStatus: ${response.status}\n\n📋 Your payment is being processed.`,
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Payment failed: ${error.message}` }],
      };
    }
  }

  async applyCreditCard(applicationData) {
    try {
      const response = await this.makeRequest('POST', '/cards/apply', applicationData);
      return {
        content: [{
          type: 'text',
          text: `✅ Credit card application submitted!\n\nApplication ID: ${response.applicationId}\nStatus: ${response.status}\nCard Type: ${response.cardType}\nRequested Limit: $${response.requestedCreditLimit}\n\n📋 Your application is being processed.`,
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Credit card application failed: ${error.message}` }],
      };
    }
  }

  async getSystemHealth() {
    try {
      const response = await this.makeRequest('GET', '../health', null, false);
      return {
        content: [{ type: 'text', text: `🏥 System Health\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Failed to retrieve system health: ${error.message}` }],
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('🏦 Enterprise Banking MCP Server v2.0.0 running on stdio');
    console.error('📡 API Base URL:', this.apiBaseUrl);
    console.error('🔧 Tools available: Authentication, Customer Management, Accounts, Transactions, Payments');
  }
}

// Start the server
const server = new EnterpriseBankingMCPServer();
server.run().catch(console.error);
