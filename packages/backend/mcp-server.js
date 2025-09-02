#!/usr/bin/env node

/**
 * Enterprise Banking MCP Server v2.1
 * Model Context Protocol server for the comprehensive enterprise banking API with BIAN compliance
 * Provides complete tools for authentication, customer management, accounts, transactions, payments,
 * credit cards, disputes, fraud detection, and system monitoring
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
        version: '2.1.0',
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
                // Basic Information
                customerType: { type: 'string', enum: ['INDIVIDUAL', 'BUSINESS', 'JOINT'], description: 'Customer type', default: 'INDIVIDUAL' },
                title: { type: 'string', enum: ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof'], description: 'Title' },
                firstName: { type: 'string', description: 'First name' },
                lastName: { type: 'string', description: 'Last name' },
                dateOfBirth: { type: 'string', description: 'Date of birth (YYYY-MM-DD)' },
                placeOfBirth: { type: 'string', description: 'Place of birth' },
                
                // Contact Information
                email: { type: 'string', description: 'Email address' },
                password: { type: 'string', description: 'Password (min 8 chars, upper, lower, number, special)' },
                phoneNumber: { type: 'string', description: 'Phone number (XXX-XXX-XXXX)' },
                alternatePhoneNumber: { type: 'string', description: 'Alternate phone number (XXX-XXX-XXXX)' },
                
                // Address Information
                addressLine1: { type: 'string', description: 'Address line 1' },
                addressLine2: { type: 'string', description: 'Address line 2' },
                city: { type: 'string', description: 'City' },
                state: { type: 'string', description: 'State (2-letter code)' },
                zipCode: { type: 'string', description: 'ZIP code (XXXXX or XXXXX-XXXX)' },
                country: { type: 'string', description: 'Country', default: 'USA' },
                
                // Identification
                ssn: { type: 'string', description: 'SSN (XXX-XX-XXXX)' },
                driversLicenseNumber: { type: 'string', description: 'Driver\'s license number' },
                driversLicenseState: { type: 'string', description: 'Driver\'s license state' },
                
                // Employment Information
                employmentStatus: { type: 'string', enum: ['FULL_TIME', 'PART_TIME', 'SELF_EMPLOYED', 'RETIRED', 'STUDENT', 'UNEMPLOYED'] },
                employer: { type: 'string', description: 'Employer name' },
                jobTitle: { type: 'string', description: 'Job title' },
                workPhoneNumber: { type: 'string', description: 'Work phone number (XXX-XXX-XXXX)' },
                annualIncome: { type: 'string', enum: ['0-25000', '25000-50000', '50000-75000', '75000-100000', '100000-150000', '150000+'] },
                
                // Business Information (for business customers)
                businessName: { type: 'string', description: 'Business name' },
                businessType: { type: 'string', enum: ['LLC', 'Corporation', 'Partnership', 'Sole Proprietorship'], description: 'Business type' },
                ein: { type: 'string', description: 'EIN (XX-XXXXXXX)' },
                
                // Preferences
                preferredLanguage: { type: 'string', description: 'Preferred language', default: 'EN' },
                marketingOptIn: { type: 'boolean', description: 'Marketing opt-in', default: false }
              },
              required: ['firstName', 'lastName', 'email', 'password', 'dateOfBirth', 'phoneNumber', 'ssn', 'addressLine1', 'city', 'state', 'zipCode', 'employmentStatus', 'annualIncome'],
            },
          },
          {
            name: 'change_password',
            description: 'Change user password',
            inputSchema: {
              type: 'object',
              properties: {
                currentPassword: { type: 'string', description: 'Current password' },
                newPassword: { type: 'string', description: 'New password (min 8 chars, upper, lower, number, special)' }
              },
              required: ['currentPassword', 'newPassword'],
            },
          },
          {
            name: 'logout',
            description: 'Logout from the system',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'verify_email',
            description: 'Verify email address with verification code',
            inputSchema: {
              type: 'object',
              properties: {
                email: { type: 'string', description: 'Email address' },
                verificationCode: { type: 'string', description: 'Verification code' }
              },
              required: ['email', 'verificationCode'],
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
                phoneNumber: { type: 'string', description: 'Phone number (XXX-XXX-XXXX)' },
                alternatePhoneNumber: { type: 'string', description: 'Alternate phone number (XXX-XXX-XXXX)' },
                email: { type: 'string', description: 'Email address' },
                addressLine1: { type: 'string', description: 'Address line 1' },
                addressLine2: { type: 'string', description: 'Address line 2' },
                city: { type: 'string', description: 'City' },
                state: { type: 'string', description: 'State (2-letter code)' },
                zipCode: { type: 'string', description: 'ZIP code' },
                employmentStatus: { type: 'string', enum: ['FULL_TIME', 'PART_TIME', 'SELF_EMPLOYED', 'RETIRED', 'STUDENT', 'UNEMPLOYED'] },
                employer: { type: 'string', description: 'Employer name' },
                jobTitle: { type: 'string', description: 'Job title' },
                workPhoneNumber: { type: 'string', description: 'Work phone number (XXX-XXX-XXXX)' },
                annualIncome: { type: 'string', enum: ['0-25000', '25000-50000', '50000-75000', '75000-100000', '100000-150000', '150000+'] },
                preferredLanguage: { type: 'string', enum: ['EN', 'ES', 'FR', 'DE', 'IT', 'PT', 'ZH', 'JA', 'KO', 'AR'] },
                marketingOptIn: { type: 'boolean', description: 'Marketing opt-in preference' }
              },
            },
          },
          {
            name: 'search_customers',
            description: 'Search customers (Admin/Manager/Support only)',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'General search query' },
                customerNumber: { type: 'string', description: 'Customer number' },
                email: { type: 'string', description: 'Email address' },
                phoneNumber: { type: 'string', description: 'Phone number' },
                firstName: { type: 'string', description: 'First name' },
                lastName: { type: 'string', description: 'Last name' },
                customerType: { type: 'string', enum: ['INDIVIDUAL', 'BUSINESS', 'JOINT'], description: 'Customer type' },
                kycStatus: { type: 'string', enum: ['PENDING', 'IN_PROGRESS', 'VERIFIED', 'REJECTED'], description: 'KYC status' },
                accountStatus: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'], description: 'Account status' },
                riskRating: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'], description: 'Risk rating' },
                page: { type: 'number', description: 'Page number', default: 1 },
                limit: { type: 'number', description: 'Items per page', default: 20 }
              },
            },
          },
          {
            name: 'get_customer_details',
            description: 'Get detailed customer information by ID (Admin/Manager/Support only)',
            inputSchema: {
              type: 'object',
              properties: {
                customerId: { type: 'string', description: 'Customer ID' }
              },
              required: ['customerId'],
            },
          },
          {
            name: 'update_customer_kyc',
            description: 'Update customer KYC status (Admin/Manager only)',
            inputSchema: {
              type: 'object',
              properties: {
                customerId: { type: 'string', description: 'Customer ID' },
                kycStatus: { type: 'string', enum: ['PENDING', 'IN_PROGRESS', 'VERIFIED', 'REJECTED'], description: 'KYC status' },
                riskRating: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'], description: 'Risk rating' },
                notes: { type: 'string', description: 'KYC notes' }
              },
              required: ['customerId', 'kycStatus'],
            },
          },
          {
            name: 'lock_customer',
            description: 'Lock customer account (Admin/Manager only)',
            inputSchema: {
              type: 'object',
              properties: {
                customerId: { type: 'string', description: 'Customer ID' },
                reason: { type: 'string', description: 'Reason for locking' }
              },
              required: ['customerId'],
            },
          },
          {
            name: 'unlock_customer',
            description: 'Unlock customer account (Admin/Manager only)',
            inputSchema: {
              type: 'object',
              properties: {
                customerId: { type: 'string', description: 'Customer ID' },
                reason: { type: 'string', description: 'Reason for unlocking' }
              },
              required: ['customerId'],
            },
          },
          {
            name: 'get_customer_audit_logs',
            description: 'Get customer audit logs (Admin/Manager/Support only)',
            inputSchema: {
              type: 'object',
              properties: {
                customerId: { type: 'string', description: 'Customer ID' },
                page: { type: 'number', description: 'Page number', default: 1 },
                limit: { type: 'number', description: 'Items per page', default: 50 }
              },
              required: ['customerId'],
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
                accountType: { type: 'string', enum: ['CREDIT', 'DEBIT', 'SAVINGS', 'CHECKING'], description: 'Account type filter' },
                status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED'], description: 'Account status filter' },
                sortBy: { type: 'string', enum: ['created_at', 'balance', 'account_type'], description: 'Sort by field' },
                sortOrder: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order', default: 'desc' }
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
          {
            name: 'create_account',
            description: 'Create a new account',
            inputSchema: {
              type: 'object',
              properties: {
                accountType: { type: 'string', enum: ['CREDIT', 'DEBIT', 'SAVINGS', 'CHECKING'], description: 'Account type' },
                productType: { type: 'string', description: 'Product type/name' },
                initialDeposit: { type: 'number', description: 'Initial deposit amount' },
                currency: { type: 'string', description: 'Currency code', default: 'USD' }
              },
              required: ['accountType', 'productType'],
            },
          },
          {
            name: 'update_account',
            description: 'Update account information',
            inputSchema: {
              type: 'object',
              properties: {
                accountId: { type: 'string', description: 'Account ID' },
                accountName: { type: 'string', description: 'Account name' },
                status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED'], description: 'Account status' },
                preferences: { type: 'object', description: 'Account preferences' }
              },
              required: ['accountId'],
            },
          },
          {
            name: 'get_account_balance',
            description: 'Get account balance information',
            inputSchema: {
              type: 'object',
              properties: {
                accountId: { type: 'string', description: 'Account ID' }
              },
              required: ['accountId'],
            },
          },
          {
            name: 'get_account_statement',
            description: 'Get account statement',
            inputSchema: {
              type: 'object',
              properties: {
                accountId: { type: 'string', description: 'Account ID' },
                startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
                endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
                format: { type: 'string', enum: ['JSON', 'PDF', 'CSV'], description: 'Statement format', default: 'JSON' }
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
                paymentMethod: { type: 'string', enum: ['ACH', 'WIRE', 'CHECK', 'DEBIT_CARD'], description: 'Payment method' },
                memo: { type: 'string', description: 'Payment memo' },
                scheduledDate: { type: 'string', description: 'Scheduled payment date (YYYY-MM-DD)' }
              },
              required: ['accountId', 'amount', 'paymentMethod'],
            },
          },
          {
            name: 'get_payment_history',
            description: 'Get payment history',
            inputSchema: {
              type: 'object',
              properties: {
                accountId: { type: 'string', description: 'Account ID filter' },
                startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
                endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
                status: { type: 'string', enum: ['PENDING', 'PROCESSED', 'FAILED', 'CANCELLED'], description: 'Payment status' },
                page: { type: 'number', description: 'Page number', default: 1 },
                limit: { type: 'number', description: 'Items per page', default: 20 }
              },
            },
          },
          
          // Dispute Management
          {
            name: 'create_dispute',
            description: 'Create a transaction dispute',
            inputSchema: {
              type: 'object',
              properties: {
                transactionId: { type: 'string', description: 'Transaction ID' },
                disputeType: { type: 'string', enum: ['FRAUD', 'BILLING_ERROR', 'PRODUCT_NOT_RECEIVED', 'PRODUCT_DEFECTIVE', 'DUPLICATE_CHARGE', 'OTHER'], description: 'Dispute type' },
                description: { type: 'string', description: 'Dispute description' },
                amount: { type: 'number', description: 'Disputed amount' },
                evidence: { type: 'array', items: { type: 'string' }, description: 'Evidence documents' }
              },
              required: ['transactionId', 'disputeType', 'description'],
            },
          },
          {
            name: 'get_disputes',
            description: 'Get dispute history',
            inputSchema: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['PENDING', 'INVESTIGATING', 'RESOLVED', 'DENIED'], description: 'Dispute status' },
                page: { type: 'number', description: 'Page number', default: 1 },
                limit: { type: 'number', description: 'Items per page', default: 20 }
              },
            },
          },
          
          // Fraud Detection
          {
            name: 'report_fraud',
            description: 'Report suspected fraud',
            inputSchema: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['UNAUTHORIZED_TRANSACTION', 'IDENTITY_THEFT', 'CARD_SKIMMING', 'PHISHING', 'OTHER'], description: 'Fraud type' },
                description: { type: 'string', description: 'Fraud description' },
                transactionIds: { type: 'array', items: { type: 'string' }, description: 'Related transaction IDs' },
                reportDate: { type: 'string', description: 'Incident date (YYYY-MM-DD)' }
              },
              required: ['type', 'description'],
            },
          },
          {
            name: 'get_fraud_alerts',
            description: 'Get fraud alerts and notifications',
            inputSchema: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['ACTIVE', 'RESOLVED', 'DISMISSED'], description: 'Alert status' },
                severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], description: 'Alert severity' },
                page: { type: 'number', description: 'Page number', default: 1 },
                limit: { type: 'number', description: 'Items per page', default: 20 }
              },
            },
          },
          
          // Credit Card Management
          {
            name: 'get_cards',
            description: 'Get customer credit cards',
            inputSchema: {
              type: 'object',
              properties: {
                page: { type: 'number', description: 'Page number', default: 1 },
                limit: { type: 'number', description: 'Items per page', default: 10 },
                cardType: { type: 'string', enum: ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'], description: 'Card type filter' },
                status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'BLOCKED', 'EXPIRED'], description: 'Card status filter' }
              },
            },
          },
          {
            name: 'get_card_details',
            description: 'Get detailed card information',
            inputSchema: {
              type: 'object',
              properties: {
                cardId: { type: 'string', description: 'Card ID' }
              },
              required: ['cardId'],
            },
          },
          {
            name: 'apply_credit_card',
            description: 'Apply for a new credit card',
            inputSchema: {
              type: 'object',
              properties: {
                cardType: { type: 'string', enum: ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'], description: 'Card type' },
                productName: { type: 'string', description: 'Card product name' },
                requestedCreditLimit: { type: 'number', description: 'Requested credit limit' },
                purpose: { type: 'string', enum: ['PERSONAL', 'BUSINESS', 'BALANCE_TRANSFER', 'EMERGENCY'], description: 'Card purpose' },
                annualFeeAccepted: { type: 'boolean', description: 'Accept annual fee', default: false }
              },
              required: ['cardType', 'requestedCreditLimit'],
            },
          },
          {
            name: 'update_card',
            description: 'Update card information',
            inputSchema: {
              type: 'object',
              properties: {
                cardId: { type: 'string', description: 'Card ID' },
                cardholderName: { type: 'string', description: 'Cardholder name' },
                billingAddress: { type: 'object', description: 'Billing address' },
                preferences: { type: 'object', description: 'Card preferences' }
              },
              required: ['cardId'],
            },
          },
          {
            name: 'block_card',
            description: 'Block a credit card',
            inputSchema: {
              type: 'object',
              properties: {
                cardId: { type: 'string', description: 'Card ID' },
                reason: { type: 'string', enum: ['LOST', 'STOLEN', 'FRAUD', 'DAMAGED', 'OTHER'], description: 'Block reason' },
                notes: { type: 'string', description: 'Additional notes' }
              },
              required: ['cardId', 'reason'],
            },
          },
          {
            name: 'unblock_card',
            description: 'Unblock a credit card',
            inputSchema: {
              type: 'object',
              properties: {
                cardId: { type: 'string', description: 'Card ID' },
                reason: { type: 'string', description: 'Unblock reason' }
              },
              required: ['cardId'],
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
          // Authentication Tools
          case 'enterprise_login':
            return await this.enterpriseLogin(args.email, args.password, args.loginType);
          case 'register_customer':
            return await this.registerCustomer(args);
          case 'change_password':
            return await this.changePassword(args);
          case 'logout':
            return await this.logout();
          case 'verify_email':
            return await this.verifyEmail(args);
          
          // Customer Profile Management
          case 'get_customer_profile':
            return await this.getCustomerProfile();
          case 'update_customer_profile':
            return await this.updateCustomerProfile(args);
          case 'search_customers':
            return await this.searchCustomers(args);
          case 'get_customer_details':
            return await this.getCustomerDetails(args.customerId);
          case 'update_customer_kyc':
            return await this.updateCustomerKYC(args);
          case 'lock_customer':
            return await this.lockCustomer(args);
          case 'unlock_customer':
            return await this.unlockCustomer(args);
          case 'get_customer_audit_logs':
            return await this.getCustomerAuditLogs(args);
          
          // Account Management
          case 'get_customer_accounts':
            return await this.getCustomerAccounts(args);
          case 'get_account_details':
            return await this.getAccountDetails(args.accountId);
          case 'create_account':
            return await this.createAccount(args);
          case 'update_account':
            return await this.updateAccount(args);
          case 'get_account_balance':
            return await this.getAccountBalance(args.accountId);
          case 'get_account_statement':
            return await this.getAccountStatement(args);
          
          // Transaction Management
          case 'get_transactions':
            return await this.getTransactions(args);
          
          // Credit Card Management
          case 'get_cards':
            return await this.getCards(args);
          case 'get_card_details':
            return await this.getCardDetails(args.cardId);
          case 'apply_credit_card':
            return await this.applyCreditCard(args);
          case 'update_card':
            return await this.updateCard(args);
          case 'block_card':
            return await this.blockCard(args);
          case 'unblock_card':
            return await this.unblockCard(args);
          
          // Payment Management
          case 'make_payment':
            return await this.makePayment(args);
          case 'get_payment_history':
            return await this.getPaymentHistory(args);
          
          // Dispute Management
          case 'create_dispute':
            return await this.createDispute(args);
          case 'get_disputes':
            return await this.getDisputes(args);
          
          // Fraud Detection
          case 'report_fraud':
            return await this.reportFraud(args);
          case 'get_fraud_alerts':
            return await this.getFraudAlerts(args);
          
          // System Information
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

  // Additional Authentication Methods
  async changePassword(passwordData) {
    try {
      const response = await this.makeRequest('POST', '/auth/change-password', passwordData);
      return {
        content: [{ type: 'text', text: `✅ Password changed successfully!` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Password change failed: ${error.message}` }],
      };
    }
  }

  async logout() {
    try {
      await this.makeRequest('POST', '/auth/logout');
      this.authToken = null;
      this.userRole = null;
      return {
        content: [{ type: 'text', text: `✅ Successfully logged out` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Logout failed: ${error.message}` }],
      };
    }
  }

  async verifyEmail(verificationData) {
    try {
      const response = await this.makeRequest('POST', '/auth/verify-email', verificationData, false);
      return {
        content: [{ type: 'text', text: `✅ Email verified successfully!` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Email verification failed: ${error.message}` }],
      };
    }
  }

  // Extended Customer Management Methods
  async searchCustomers(searchParams) {
    try {
      const queryParams = new URLSearchParams();
      Object.entries(searchParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
      
      const endpoint = '/customers' + (queryParams.toString() ? `?${queryParams.toString()}` : '');
      const response = await this.makeRequest('GET', endpoint);
      
      return {
        content: [{ type: 'text', text: `👥 Customer Search Results\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Customer search failed: ${error.message}` }],
      };
    }
  }

  async getCustomerDetails(customerId) {
    try {
      const response = await this.makeRequest('GET', `/customers/${customerId}`);
      return {
        content: [{ type: 'text', text: `👤 Customer Details (${customerId})\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Failed to retrieve customer details: ${error.message}` }],
      };
    }
  }

  async updateCustomerKYC(kycData) {
    try {
      const { customerId, ...updateData } = kycData;
      const response = await this.makeRequest('PUT', `/customers/${customerId}/kyc`, updateData);
      return {
        content: [{ type: 'text', text: `✅ Customer KYC updated successfully!\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ KYC update failed: ${error.message}` }],
      };
    }
  }

  async lockCustomer(lockData) {
    try {
      const { customerId, ...data } = lockData;
      const response = await this.makeRequest('POST', `/customers/${customerId}/lock`, data);
      return {
        content: [{ type: 'text', text: `🔒 Customer account locked successfully!\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Customer lock failed: ${error.message}` }],
      };
    }
  }

  async unlockCustomer(unlockData) {
    try {
      const { customerId, ...data } = unlockData;
      const response = await this.makeRequest('POST', `/customers/${customerId}/unlock`, data);
      return {
        content: [{ type: 'text', text: `🔓 Customer account unlocked successfully!\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Customer unlock failed: ${error.message}` }],
      };
    }
  }

  async getCustomerAuditLogs(auditParams) {
    try {
      const { customerId, ...queryParams } = auditParams;
      const params = new URLSearchParams();
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, value.toString());
        }
      });
      
      const endpoint = `/customers/${customerId}/audit-logs` + (params.toString() ? `?${params.toString()}` : '');
      const response = await this.makeRequest('GET', endpoint);
      
      return {
        content: [{ type: 'text', text: `📊 Customer Audit Logs\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Failed to retrieve audit logs: ${error.message}` }],
      };
    }
  }

  // Extended Account Management Methods
  async createAccount(accountData) {
    try {
      const response = await this.makeRequest('POST', '/accounts', accountData);
      return {
        content: [{ type: 'text', text: `✅ Account created successfully!\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Account creation failed: ${error.message}` }],
      };
    }
  }

  async updateAccount(accountData) {
    try {
      const { accountId, ...updateData } = accountData;
      const response = await this.makeRequest('PUT', `/accounts/${accountId}`, updateData);
      return {
        content: [{ type: 'text', text: `✅ Account updated successfully!\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Account update failed: ${error.message}` }],
      };
    }
  }

  async getAccountBalance(accountId) {
    try {
      const response = await this.makeRequest('GET', `/accounts/${accountId}/balance`);
      return {
        content: [{ type: 'text', text: `💰 Account Balance (${accountId})\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Failed to retrieve account balance: ${error.message}` }],
      };
    }
  }

  async getAccountStatement(statementParams) {
    try {
      const { accountId, ...queryParams } = statementParams;
      const params = new URLSearchParams();
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, value.toString());
        }
      });
      
      const endpoint = `/accounts/${accountId}/statement` + (params.toString() ? `?${params.toString()}` : '');
      const response = await this.makeRequest('GET', endpoint);
      
      return {
        content: [{ type: 'text', text: `📄 Account Statement\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Failed to retrieve account statement: ${error.message}` }],
      };
    }
  }

  // Extended Card Management Methods
  async getCards(cardParams = {}) {
    try {
      const queryParams = new URLSearchParams();
      Object.entries(cardParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
      
      const endpoint = '/cards' + (queryParams.toString() ? `?${queryParams.toString()}` : '');
      const response = await this.makeRequest('GET', endpoint);
      
      return {
        content: [{ type: 'text', text: `💳 Credit Cards\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Failed to retrieve cards: ${error.message}` }],
      };
    }
  }

  async getCardDetails(cardId) {
    try {
      const response = await this.makeRequest('GET', `/cards/${cardId}`);
      return {
        content: [{ type: 'text', text: `💳 Card Details (${cardId})\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Failed to retrieve card details: ${error.message}` }],
      };
    }
  }

  async updateCard(cardData) {
    try {
      const { cardId, ...updateData } = cardData;
      const response = await this.makeRequest('PUT', `/cards/${cardId}`, updateData);
      return {
        content: [{ type: 'text', text: `✅ Card updated successfully!\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Card update failed: ${error.message}` }],
      };
    }
  }

  async blockCard(blockData) {
    try {
      const { cardId, ...data } = blockData;
      const response = await this.makeRequest('POST', `/cards/${cardId}/block`, data);
      return {
        content: [{ type: 'text', text: `🚫 Card blocked successfully!\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Card block failed: ${error.message}` }],
      };
    }
  }

  async unblockCard(unblockData) {
    try {
      const { cardId, ...data } = unblockData;
      const response = await this.makeRequest('POST', `/cards/${cardId}/unblock`, data);
      return {
        content: [{ type: 'text', text: `✅ Card unblocked successfully!\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Card unblock failed: ${error.message}` }],
      };
    }
  }

  // Extended Payment Management Methods
  async getPaymentHistory(paymentParams = {}) {
    try {
      const queryParams = new URLSearchParams();
      Object.entries(paymentParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
      
      const endpoint = '/payments' + (queryParams.toString() ? `?${queryParams.toString()}` : '');
      const response = await this.makeRequest('GET', endpoint);
      
      return {
        content: [{ type: 'text', text: `💰 Payment History\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Failed to retrieve payment history: ${error.message}` }],
      };
    }
  }

  // Dispute Management Methods
  async createDispute(disputeData) {
    try {
      const response = await this.makeRequest('POST', '/disputes', disputeData);
      return {
        content: [{ type: 'text', text: `✅ Dispute created successfully!\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Dispute creation failed: ${error.message}` }],
      };
    }
  }

  async getDisputes(disputeParams = {}) {
    try {
      const queryParams = new URLSearchParams();
      Object.entries(disputeParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
      
      const endpoint = '/disputes' + (queryParams.toString() ? `?${queryParams.toString()}` : '');
      const response = await this.makeRequest('GET', endpoint);
      
      return {
        content: [{ type: 'text', text: `⚖️ Disputes\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Failed to retrieve disputes: ${error.message}` }],
      };
    }
  }

  // Fraud Detection Methods
  async reportFraud(fraudData) {
    try {
      const response = await this.makeRequest('POST', '/fraud/report', fraudData);
      return {
        content: [{ type: 'text', text: `✅ Fraud report submitted successfully!\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Fraud report failed: ${error.message}` }],
      };
    }
  }

  async getFraudAlerts(alertParams = {}) {
    try {
      const queryParams = new URLSearchParams();
      Object.entries(alertParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
      
      const endpoint = '/fraud/alerts' + (queryParams.toString() ? `?${queryParams.toString()}` : '');
      const response = await this.makeRequest('GET', endpoint);
      
      return {
        content: [{ type: 'text', text: `🚨 Fraud Alerts\n\n${JSON.stringify(response, null, 2)}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `❌ Failed to retrieve fraud alerts: ${error.message}` }],
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
    console.error('🏦 Enterprise Banking MCP Server v2.1.0 running on stdio');
    console.error('📡 API Base URL:', this.apiBaseUrl);
    console.error('🔧 Tools available: Authentication, Customer Management, Accounts, Transactions, Payments, Cards, Disputes, Fraud Detection');
  }
}

// Start the server
const server = new EnterpriseBankingMCPServer();
server.run().catch(console.error);
