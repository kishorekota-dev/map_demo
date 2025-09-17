#!/usr/bin/env node

/**
 * Enterprise Banking HTTP MCP Server v3.0
 * HTTP-based Model Context Protocol server for the comprehensive enterprise banking API
 * Provides REST endpoints for authentication, customer management, accounts, transactions,
 * payments, credit cards, disputes, fraud detection, and system monitoring
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');

// Debug logging utility
class DebugLogger {
  constructor(component = 'MCP-HTTP') {
    this.component = component;
    this.isDebugMode = process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true';
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${this.component}] [${level}]`;
    
    if (data) {
      return `${prefix} ${message} | Data: ${JSON.stringify(data, null, 2)}`;
    }
    return `${prefix} ${message}`;
  }

  info(message, data = null) {
    console.log(this.formatMessage('INFO', message, data));
  }

  debug(message, data = null) {
    if (this.isDebugMode) {
      console.log(this.formatMessage('DEBUG', message, data));
    }
  }

  warn(message, data = null) {
    console.warn(this.formatMessage('WARN', message, data));
  }

  error(message, error = null, data = null) {
    const errorData = error ? { 
      message: error.message, 
      stack: error.stack, 
      ...(data || {}) 
    } : data;
    console.error(this.formatMessage('ERROR', message, errorData));
  }

  trace(method, endpoint, params = null, response = null) {
    if (this.isDebugMode) {
      this.debug(`${method} ${endpoint}`, { params, response });
    }
  }
}

class EnterpriseBankingHTTPMCPServer {
  constructor() {
    this.logger = new DebugLogger('MCP-HTTP-SERVER');
    this.app = express();
    this.port = process.env.MCP_PORT || 3001;
    this.apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000/api/v1';
    this.authTokens = new Map(); // Store auth tokens by session ID
    
    this.logger.info('🚀 Initializing Enterprise Banking HTTP MCP Server', {
      port: this.port,
      apiBaseUrl: this.apiBaseUrl,
      debugMode: this.logger.isDebugMode
    });
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
    
    this.logger.debug('✅ Server initialization complete');
  }

  setupMiddleware() {
    this.logger.debug('🔧 Setting up middleware...');
    
    // Security middleware
    this.app.use(helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    }));
    this.logger.debug('✅ Helmet security middleware configured');
    
    // CORS configuration
    const corsOptions = {
      origin: [
        'http://localhost:3002', // ChatBot UI
        'http://localhost:3003', // Web UI
        'http://localhost:3004', // Agent UI
        'http://localhost:5173', // Vite dev server
        'http://localhost:3000'  // Backend API
      ],
      credentials: true
    };
    this.app.use(cors(corsOptions));
    this.logger.debug('✅ CORS middleware configured', { allowedOrigins: corsOptions.origin });

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // Limit each IP to 1000 requests per windowMs
      message: 'Too many requests from this IP, please try again later.'
    });
    this.app.use(limiter);
    this.logger.debug('✅ Rate limiting configured (1000 req/15min)');

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.logger.debug('✅ Body parsing middleware configured (10MB limit)');

    // Enhanced request logging middleware
    this.app.use((req, res, next) => {
      const startTime = Date.now();
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Add request ID to request object
      req.requestId = requestId;
      
      this.logger.info(`📥 Incoming Request`, {
        requestId,
        method: req.method,
        path: req.path,
        query: req.query,
        headers: {
          'user-agent': req.headers['user-agent'],
          'content-type': req.headers['content-type'],
          'authorization': req.headers.authorization ? '[PRESENT]' : '[MISSING]'
        },
        body: req.method === 'POST' || req.method === 'PUT' ? 
          this.sanitizeRequestBody(req.body) : undefined
      });

      // Override res.json to log responses
      const originalJson = res.json.bind(res);
      res.json = (data) => {
        const duration = Date.now() - startTime;
        this.logger.info(`📤 Response Sent`, {
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          responseSize: JSON.stringify(data).length,
          success: res.statusCode >= 200 && res.statusCode < 300
        });
        
        this.logger.debug(`Response Data for ${requestId}`, { data });
        return originalJson(data);
      };

      next();
    });
    
    this.logger.debug('✅ Enhanced request logging middleware configured');
  }

  sanitizeRequestBody(body) {
    if (!body) return body;
    
    const sanitized = { ...body };
    // Remove sensitive fields from logs
    const sensitiveFields = ['password', 'ssn', 'cardNumber', 'cvv', 'token'];
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    return sanitized;
  }

  setupRoutes() {
    this.logger.debug('🛤️ Setting up routes...');

    // Health check
    this.app.get('/health', (req, res) => {
      this.logger.debug('Health check requested');
      const healthData = {
        status: 'healthy',
        service: 'Enterprise Banking MCP Server',
        version: '3.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        apiBaseUrl: this.apiBaseUrl,
        activeSessions: this.authTokens.size
      };
      this.logger.debug('Health check response', healthData);
      res.json(healthData);
    });

    // Get available tools/capabilities
    this.app.get('/tools', (req, res) => {
      this.logger.debug('Tools list requested');
      const tools = this.getAvailableTools();
      this.logger.debug(`Returning ${tools.length} available tools`);
      res.json({ tools });
    });

    // Authentication endpoints
    this.app.post('/auth/login', async (req, res) => {
      try {
        const { email, password, loginType = 'CUSTOMER', sessionId } = req.body;
        this.logger.info('🔐 Login attempt', { 
          email, 
          loginType, 
          sessionId,
          requestId: req.requestId 
        });
        
        const result = await this.enterpriseLogin(email, password, loginType, sessionId, req.requestId);
        this.logger.info('🔐 Login result', { 
          success: result.success, 
          sessionId,
          requestId: req.requestId 
        });
        
        res.json(result);
      } catch (error) {
        this.logger.error('❌ Login error', error, { requestId: req.requestId });
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/auth/register', async (req, res) => {
      try {
        this.logger.info('👤 Customer registration attempt', { 
          email: req.body.email,
          requestId: req.requestId 
        });
        
        const result = await this.registerCustomer(req.body, req.requestId);
        this.logger.info('👤 Registration result', { 
          success: result.success,
          requestId: req.requestId 
        });
        
        res.json(result);
      } catch (error) {
        this.logger.error('❌ Registration error', error, { requestId: req.requestId });
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/auth/logout', async (req, res) => {
      try {
        const { sessionId } = req.body;
        this.logger.info('🚪 Logout attempt', { sessionId, requestId: req.requestId });
        
        const result = await this.logout(sessionId, req.requestId);
        this.logger.info('🚪 Logout result', { 
          success: result.success,
          sessionId,
          requestId: req.requestId 
        });
        
        res.json(result);
      } catch (error) {
        this.logger.error('❌ Logout error', error, { requestId: req.requestId });
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/auth/change-password', async (req, res) => {
      try {
        this.logger.info('🔑 Password change attempt', { requestId: req.requestId });
        const result = await this.changePassword(req.body, req.headers.authorization, req.requestId);
        this.logger.info('🔑 Password change result', { 
          success: result.success,
          requestId: req.requestId 
        });
        res.json(result);
      } catch (error) {
        this.logger.error('❌ Password change error', error, { requestId: req.requestId });
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/auth/verify-email', async (req, res) => {
      try {
        this.logger.info('✉️ Email verification attempt', { requestId: req.requestId });
        const result = await this.verifyEmail(req.body, req.requestId);
        this.logger.info('✉️ Email verification result', { 
          success: result.success,
          requestId: req.requestId 
        });
        res.json(result);
      } catch (error) {
        this.logger.error('❌ Email verification error', error, { requestId: req.requestId });
        res.status(500).json({ error: error.message });
      }
    });

    // Customer profile endpoints
    this.app.get('/customers/profile', async (req, res) => {
      try {
        this.logger.info('👤 Customer profile request', { requestId: req.requestId });
        const result = await this.getCustomerProfile(req.headers.authorization, req.requestId);
        this.logger.info('👤 Customer profile result', { 
          success: result.success,
          requestId: req.requestId 
        });
        res.json(result);
      } catch (error) {
        this.logger.error('❌ Customer profile error', error, { requestId: req.requestId });
        res.status(500).json({ error: error.message });
      }
    });

    this.app.put('/customers/profile', async (req, res) => {
      try {
        this.logger.info('👤 Customer profile update', { requestId: req.requestId });
        const result = await this.updateCustomerProfile(req.body, req.headers.authorization, req.requestId);
        this.logger.info('👤 Customer profile update result', { 
          success: result.success,
          requestId: req.requestId 
        });
        res.json(result);
      } catch (error) {
        this.logger.error('❌ Customer profile update error', error, { requestId: req.requestId });
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/customers/search', async (req, res) => {
      try {
        this.logger.info('🔍 Customer search request', { 
          query: req.query,
          requestId: req.requestId 
        });
        const result = await this.searchCustomers(req.query, req.headers.authorization, req.requestId);
        this.logger.info('🔍 Customer search result', { 
          success: result.success,
          resultCount: result.data?.customers?.length || 0,
          requestId: req.requestId 
        });
        res.json(result);
      } catch (error) {
        this.logger.error('❌ Customer search error', error, { requestId: req.requestId });
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/customers/:customerId', async (req, res) => {
      try {
        this.logger.info('👤 Customer details request', { 
          customerId: req.params.customerId,
          requestId: req.requestId 
        });
        const result = await this.getCustomerDetails(req.params.customerId, req.headers.authorization, req.requestId);
        this.logger.info('👤 Customer details result', { 
          success: result.success,
          customerId: req.params.customerId,
          requestId: req.requestId 
        });
        res.json(result);
      } catch (error) {
        this.logger.error('❌ Customer details error', error, { requestId: req.requestId });
        res.status(500).json({ error: error.message });
      }
    });

    // Account endpoints
    this.app.get('/accounts', async (req, res) => {
      try {
        this.logger.info('💳 Accounts request', { 
          query: req.query,
          requestId: req.requestId 
        });
        const result = await this.getCustomerAccounts(req.query, req.headers.authorization, req.requestId);
        this.logger.info('💳 Accounts result', { 
          success: result.success,
          accountCount: result.data?.accounts?.length || 0,
          requestId: req.requestId 
        });
        res.json(result);
      } catch (error) {
        this.logger.error('❌ Accounts error', error, { requestId: req.requestId });
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/accounts', async (req, res) => {
      try {
        this.logger.info('💳 Account creation request', { 
          accountType: req.body.accountType,
          requestId: req.requestId 
        });
        const result = await this.createAccount(req.body, req.headers.authorization, req.requestId);
        this.logger.info('💳 Account creation result', { 
          success: result.success,
          requestId: req.requestId 
        });
        res.json(result);
      } catch (error) {
        this.logger.error('❌ Account creation error', error, { requestId: req.requestId });
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/accounts/:accountId', async (req, res) => {
      try {
        this.logger.info('💳 Account details request', { 
          accountId: req.params.accountId,
          requestId: req.requestId 
        });
        const result = await this.getAccountDetails(req.params.accountId, req.headers.authorization, req.requestId);
        this.logger.info('💳 Account details result', { 
          success: result.success,
          accountId: req.params.accountId,
          requestId: req.requestId 
        });
        res.json(result);
      } catch (error) {
        this.logger.error('❌ Account details error', error, { requestId: req.requestId });
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/accounts/:accountId/balance', async (req, res) => {
      try {
        this.logger.info('💰 Account balance request', { 
          accountId: req.params.accountId,
          requestId: req.requestId 
        });
        const result = await this.getAccountBalance(req.params.accountId, req.headers.authorization, req.requestId);
        this.logger.info('💰 Account balance result', { 
          success: result.success,
          accountId: req.params.accountId,
          balance: result.data?.balance || 'N/A',
          requestId: req.requestId 
        });
        res.json(result);
      } catch (error) {
        this.logger.error('❌ Account balance error', error, { requestId: req.requestId });
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/accounts/:accountId/statement', async (req, res) => {
      try {
        this.logger.info('📄 Account statement request', { 
          accountId: req.params.accountId,
          query: req.query,
          requestId: req.requestId 
        });
        const result = await this.getAccountStatement({
          accountId: req.params.accountId,
          ...req.query
        }, req.headers.authorization, req.requestId);
        this.logger.info('📄 Account statement result', { 
          success: result.success,
          accountId: req.params.accountId,
          requestId: req.requestId 
        });
        res.json(result);
      } catch (error) {
        this.logger.error('❌ Account statement error', error, { requestId: req.requestId });
        res.status(500).json({ error: error.message });
      }
    });

    // Transaction endpoints
    this.app.get('/transactions', async (req, res) => {
      try {
        this.logger.info('💰 Transactions request', { 
          query: req.query,
          requestId: req.requestId 
        });
        const result = await this.getTransactions(req.query, req.headers.authorization, req.requestId);
        this.logger.info('💰 Transactions result', { 
          success: result.success,
          transactionCount: result.data?.transactions?.length || 0,
          requestId: req.requestId 
        });
        res.json(result);
      } catch (error) {
        this.logger.error('❌ Transactions error', error, { requestId: req.requestId });
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/transactions/transfer', async (req, res) => {
      try {
        this.logger.info('💸 Fund transfer request', { 
          fromAccount: req.body.fromAccountId,
          toAccount: req.body.toAccountId,
          amount: req.body.amount,
          requestId: req.requestId 
        });
        const result = await this.transferFunds(req.body, req.headers.authorization, req.requestId);
        this.logger.info('💸 Fund transfer result', { 
          success: result.success,
          requestId: req.requestId 
        });
        res.json(result);
      } catch (error) {
        this.logger.error('❌ Fund transfer error', error, { requestId: req.requestId });
        res.status(500).json({ error: error.message });
      }
    });

    // Payment endpoints
    this.app.post('/payments', async (req, res) => {
      try {
        this.logger.info('💳 Payment request', { 
          accountId: req.body.accountId,
          amount: req.body.amount,
          paymentMethod: req.body.paymentMethod,
          requestId: req.requestId 
        });
        const result = await this.makePayment(req.body, req.headers.authorization, req.requestId);
        this.logger.info('💳 Payment result', { 
          success: result.success,
          requestId: req.requestId 
        });
        res.json(result);
      } catch (error) {
        this.logger.error('❌ Payment error', error, { requestId: req.requestId });
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/payments', async (req, res) => {
      try {
        this.logger.info('💳 Payment history request', { 
          query: req.query,
          requestId: req.requestId 
        });
        const result = await this.getPaymentHistory(req.query, req.headers.authorization, req.requestId);
        this.logger.info('💳 Payment history result', { 
          success: result.success,
          paymentCount: result.data?.payments?.length || 0,
          requestId: req.requestId 
        });
        res.json(result);
      } catch (error) {
        this.logger.error('❌ Payment history error', error, { requestId: req.requestId });
        res.status(500).json({ error: error.message });
      }
    });

    // Card endpoints
    this.app.get('/cards', async (req, res) => {
      try {
        const result = await this.getCards(req.query, req.headers.authorization);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/cards/apply', async (req, res) => {
      try {
        const result = await this.applyCreditCard(req.body, req.headers.authorization);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/cards/:cardId', async (req, res) => {
      try {
        const result = await this.getCardDetails(req.params.cardId, req.headers.authorization);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/cards/:cardId/block', async (req, res) => {
      try {
        const result = await this.blockCard({
          cardId: req.params.cardId,
          ...req.body
        }, req.headers.authorization);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/cards/:cardId/unblock', async (req, res) => {
      try {
        const result = await this.unblockCard({
          cardId: req.params.cardId,
          ...req.body
        }, req.headers.authorization);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Dispute endpoints
    this.app.post('/disputes', async (req, res) => {
      try {
        const result = await this.createDispute(req.body, req.headers.authorization);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/disputes', async (req, res) => {
      try {
        const result = await this.getDisputes(req.query, req.headers.authorization);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Fraud endpoints
    this.app.post('/fraud/report', async (req, res) => {
      try {
        const result = await this.reportFraud(req.body, req.headers.authorization);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/fraud/alerts', async (req, res) => {
      try {
        const result = await this.getFraudAlerts(req.query, req.headers.authorization);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Generic tool execution endpoint
    this.app.post('/tools/:toolName', async (req, res) => {
      try {
        const { toolName } = req.params;
        const result = await this.executeTool(toolName, req.body, req.headers.authorization);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ 
        error: 'Endpoint not found',
        availableEndpoints: [
          'GET /health',
          'GET /tools',
          'POST /auth/login',
          'POST /auth/register',
          'GET /accounts',
          'GET /transactions',
          'POST /payments',
          'GET /cards'
        ]
      });
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      console.error('Server Error:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: error.message 
      });
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down MCP HTTP server gracefully...');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n🛑 Shutting down MCP HTTP server gracefully...');
      process.exit(0);
    });
  }

  getAvailableTools() {
    return [
      {
        name: 'enterprise_login',
        description: 'Login to the enterprise banking system',
        method: 'POST',
        endpoint: '/auth/login',
        parameters: ['email', 'password', 'loginType', 'sessionId']
      },
      {
        name: 'register_customer',
        description: 'Register a new customer',
        method: 'POST',
        endpoint: '/auth/register',
        parameters: ['firstName', 'lastName', 'email', 'password', 'dateOfBirth', 'phoneNumber', 'ssn', 'addressLine1', 'city', 'state', 'zipCode', 'employmentStatus', 'annualIncome']
      },
      {
        name: 'get_customer_accounts',
        description: 'Get customer accounts',
        method: 'GET',
        endpoint: '/accounts',
        parameters: ['page', 'limit', 'accountType', 'status']
      },
      {
        name: 'get_account_balance',
        description: 'Get account balance',
        method: 'GET',
        endpoint: '/accounts/{accountId}/balance',
        parameters: ['accountId']
      },
      {
        name: 'get_transactions',
        description: 'Get transaction history',
        method: 'GET',
        endpoint: '/transactions',
        parameters: ['accountId', 'page', 'limit', 'startDate', 'endDate']
      },
      {
        name: 'transfer_funds',
        description: 'Transfer funds between accounts',
        method: 'POST',
        endpoint: '/transactions/transfer',
        parameters: ['fromAccountId', 'toAccountId', 'amount', 'description']
      },
      {
        name: 'make_payment',
        description: 'Make a payment',
        method: 'POST',
        endpoint: '/payments',
        parameters: ['accountId', 'amount', 'paymentMethod', 'memo']
      },
      {
        name: 'get_cards',
        description: 'Get customer credit cards',
        method: 'GET',
        endpoint: '/cards',
        parameters: ['page', 'limit', 'cardType', 'status']
      },
      {
        name: 'apply_credit_card',
        description: 'Apply for a new credit card',
        method: 'POST',
        endpoint: '/cards/apply',
        parameters: ['cardType', 'requestedCreditLimit', 'purpose']
      },
      {
        name: 'block_card',
        description: 'Block a credit card',
        method: 'POST',
        endpoint: '/cards/{cardId}/block',
        parameters: ['cardId', 'reason', 'notes']
      },
      {
        name: 'unblock_card',
        description: 'Unblock a credit card',
        method: 'POST',
        endpoint: '/cards/{cardId}/unblock',
        parameters: ['cardId', 'reason']
      }
    ];
  }

  async makeRequest(method, endpoint, data = null, authHeader = null, requestId = null) {
    const requestStartTime = Date.now();
    
    try {
      this.logger.debug('🌐 API Request Starting', {
        requestId,
        method,
        endpoint,
        url: `${this.apiBaseUrl}${endpoint}`,
        hasAuth: !!authHeader,
        hasData: !!data,
        dataSize: data ? JSON.stringify(data).length : 0
      });

      const config = {
        method,
        url: `${this.apiBaseUrl}${endpoint}`,
        headers: { 'Content-Type': 'application/json' },
      };

      if (authHeader) {
        config.headers.Authorization = authHeader;
        this.logger.debug('🔑 Authorization header added', { requestId });
      }
      if (data) {
        config.data = data;
        this.logger.debug('📦 Request data attached', { 
          requestId,
          sanitizedData: this.sanitizeRequestBody(data)
        });
      }

      const response = await axios(config);
      const duration = Date.now() - requestStartTime;
      
      this.logger.debug('✅ API Request Success', {
        requestId,
        method,
        endpoint,
        statusCode: response.status,
        duration: `${duration}ms`,
        responseSize: JSON.stringify(response.data).length
      });

      return {
        success: true,
        data: response.data,
        statusCode: response.status
      };
    } catch (error) {
      const duration = Date.now() - requestStartTime;
      
      if (error.response) {
        const errorMsg = error.response.data?.message || error.response.data?.error || 'API request failed';
        this.logger.warn('⚠️ API Request Failed', {
          requestId,
          method,
          endpoint,
          statusCode: error.response.status,
          duration: `${duration}ms`,
          error: errorMsg,
          responseData: error.response.data
        });
        
        return {
          success: false,
          error: `API Error (${error.response.status}): ${errorMsg}`,
          statusCode: error.response.status
        };
      } else if (error.request) {
        this.logger.error('🔌 Network Error', error, {
          requestId,
          method,
          endpoint,
          duration: `${duration}ms`,
          message: 'Unable to reach the API server'
        });
        
        return {
          success: false,
          error: 'Network error: Unable to reach the API server',
          statusCode: 503
        };
      } else {
        this.logger.error('💥 Request Configuration Error', error, {
          requestId,
          method,
          endpoint,
          duration: `${duration}ms`
        });
        
        return {
          success: false,
          error: `Request error: ${error.message}`,
          statusCode: 500
        };
      }
    }
  }

  // Authentication Methods
  async enterpriseLogin(email, password, loginType = 'CUSTOMER', sessionId, requestId) {
    this.logger.info('🔐 Processing enterprise login', {
      requestId,
      email,
      loginType,
      sessionId
    });
    
    const response = await this.makeRequest('POST', '/auth/login', { email, password, loginType }, null, requestId);
    
    if (response.success && response.data.token && sessionId) {
      // Store auth token for this session
      this.authTokens.set(sessionId, response.data.token);
      this.logger.info('🎫 Auth token stored for session', {
        requestId,
        sessionId,
        activeSessions: this.authTokens.size
      });
    }
    
    const result = {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        `✅ Successfully logged in as ${loginType}` : 
        `❌ Login failed: ${response.error}`
    };
    
    this.logger.info('🔐 Login processing complete', {
      requestId,
      success: result.success,
      loginType,
      sessionId
    });
    
    return result;
  }

  async registerCustomer(customerData, requestId) {
    this.logger.info('👤 Processing customer registration', {
      requestId,
      email: customerData.email
    });
    
    const response = await this.makeRequest('POST', '/auth/register', customerData, null, requestId);
    
    const result = {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        '✅ Customer registration successful!' : 
        `❌ Customer registration failed: ${response.error}`
    };
    
    this.logger.info('👤 Registration processing complete', {
      requestId,
      success: result.success,
      email: customerData.email
    });
    
    return result;
  }

  async logout(sessionId, requestId) {
    this.logger.info('🚪 Processing logout', {
      requestId,
      sessionId,
      hadToken: this.authTokens.has(sessionId)
    });
    
    if (sessionId && this.authTokens.has(sessionId)) {
      this.authTokens.delete(sessionId);
      this.logger.info('🗑️ Session token removed', {
        requestId,
        sessionId,
        remainingSessions: this.authTokens.size
      });
    }
    
    const result = {
      success: true,
      data: null,
      message: '✅ Successfully logged out'
    };
    
    this.logger.info('🚪 Logout processing complete', {
      requestId,
      sessionId
    });
    
    return result;
  }

  async changePassword(passwordData, authHeader) {
    const response = await this.makeRequest('POST', '/auth/change-password', passwordData, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        '✅ Password changed successfully!' : 
        `❌ Password change failed: ${response.error}`
    };
  }

  async verifyEmail(verificationData) {
    const response = await this.makeRequest('POST', '/auth/verify-email', verificationData);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        '✅ Email verified successfully!' : 
        `❌ Email verification failed: ${response.error}`
    };
  }

  // Customer Profile Methods
  async getCustomerProfile(authHeader) {
    const response = await this.makeRequest('GET', '/customers/profile', null, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        '👤 Customer Profile Retrieved' : 
        `❌ Failed to retrieve customer profile: ${response.error}`
    };
  }

  async updateCustomerProfile(updateData, authHeader) {
    const response = await this.makeRequest('PUT', '/customers/profile', updateData, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        '✅ Customer profile updated successfully!' : 
        `❌ Failed to update customer profile: ${response.error}`
    };
  }

  async searchCustomers(searchParams, authHeader) {
    const queryString = new URLSearchParams(searchParams).toString();
    const endpoint = '/customers' + (queryString ? `?${queryString}` : '');
    const response = await this.makeRequest('GET', endpoint, null, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        '👥 Customer Search Results' : 
        `❌ Customer search failed: ${response.error}`
    };
  }

  async getCustomerDetails(customerId, authHeader) {
    const response = await this.makeRequest('GET', `/customers/${customerId}`, null, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        `👤 Customer Details (${customerId})` : 
        `❌ Failed to retrieve customer details: ${response.error}`
    };
  }

  // Account Methods
  async getCustomerAccounts(filters, authHeader) {
    const queryString = new URLSearchParams(filters).toString();
    const endpoint = '/accounts' + (queryString ? `?${queryString}` : '');
    const response = await this.makeRequest('GET', endpoint, null, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        '💳 Customer Accounts' : 
        `❌ Failed to retrieve accounts: ${response.error}`
    };
  }

  async createAccount(accountData, authHeader) {
    const response = await this.makeRequest('POST', '/accounts', accountData, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        '✅ Account created successfully!' : 
        `❌ Account creation failed: ${response.error}`
    };
  }

  async getAccountDetails(accountId, authHeader) {
    const response = await this.makeRequest('GET', `/accounts/${accountId}`, null, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        `💳 Account Details (${accountId})` : 
        `❌ Failed to retrieve account details: ${response.error}`
    };
  }

  async getAccountBalance(accountId, authHeader) {
    const response = await this.makeRequest('GET', `/accounts/${accountId}/balance`, null, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        `💰 Account Balance (${accountId})` : 
        `❌ Failed to retrieve account balance: ${response.error}`
    };
  }

  async getAccountStatement(statementParams, authHeader) {
    const { accountId, ...queryParams } = statementParams;
    const queryString = new URLSearchParams(queryParams).toString();
    const endpoint = `/accounts/${accountId}/statement` + (queryString ? `?${queryString}` : '');
    const response = await this.makeRequest('GET', endpoint, null, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        '📄 Account Statement' : 
        `❌ Failed to retrieve account statement: ${response.error}`
    };
  }

  // Transaction Methods
  async getTransactions(filters, authHeader) {
    const queryString = new URLSearchParams(filters).toString();
    const endpoint = '/transactions' + (queryString ? `?${queryString}` : '');
    const response = await this.makeRequest('GET', endpoint, null, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        '💰 Transaction History' : 
        `❌ Failed to retrieve transactions: ${response.error}`
    };
  }

  async transferFunds(transferData, authHeader) {
    const response = await this.makeRequest('POST', '/balance-transfers', transferData, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        '✅ Transfer completed successfully!' : 
        `❌ Transfer failed: ${response.error}`
    };
  }

  // Payment Methods
  async makePayment(paymentData, authHeader) {
    const response = await this.makeRequest('POST', '/payments', paymentData, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        '✅ Payment submitted successfully!' : 
        `❌ Payment failed: ${response.error}`
    };
  }

  async getPaymentHistory(paymentParams, authHeader) {
    const queryString = new URLSearchParams(paymentParams).toString();
    const endpoint = '/payments' + (queryString ? `?${queryString}` : '');
    const response = await this.makeRequest('GET', endpoint, null, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        '💰 Payment History' : 
        `❌ Failed to retrieve payment history: ${response.error}`
    };
  }

  // Card Methods
  async getCards(cardParams, authHeader) {
    const queryString = new URLSearchParams(cardParams).toString();
    const endpoint = '/cards' + (queryString ? `?${queryString}` : '');
    const response = await this.makeRequest('GET', endpoint, null, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        '💳 Credit Cards' : 
        `❌ Failed to retrieve cards: ${response.error}`
    };
  }

  async applyCreditCard(applicationData, authHeader) {
    const response = await this.makeRequest('POST', '/cards/apply', applicationData, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        '✅ Credit card application submitted!' : 
        `❌ Credit card application failed: ${response.error}`
    };
  }

  async getCardDetails(cardId, authHeader) {
    const response = await this.makeRequest('GET', `/cards/${cardId}`, null, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        `💳 Card Details (${cardId})` : 
        `❌ Failed to retrieve card details: ${response.error}`
    };
  }

  async blockCard(blockData, authHeader) {
    const { cardId, ...data } = blockData;
    const response = await this.makeRequest('POST', `/cards/${cardId}/block`, data, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        '🚫 Card blocked successfully!' : 
        `❌ Card block failed: ${response.error}`
    };
  }

  async unblockCard(unblockData, authHeader) {
    const { cardId, ...data } = unblockData;
    const response = await this.makeRequest('POST', `/cards/${cardId}/unblock`, data, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        '✅ Card unblocked successfully!' : 
        `❌ Card unblock failed: ${response.error}`
    };
  }

  // Dispute Methods
  async createDispute(disputeData, authHeader) {
    const response = await this.makeRequest('POST', '/disputes', disputeData, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        '✅ Dispute created successfully!' : 
        `❌ Dispute creation failed: ${response.error}`
    };
  }

  async getDisputes(disputeParams, authHeader) {
    const queryString = new URLSearchParams(disputeParams).toString();
    const endpoint = '/disputes' + (queryString ? `?${queryString}` : '');
    const response = await this.makeRequest('GET', endpoint, null, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        '⚖️ Disputes' : 
        `❌ Failed to retrieve disputes: ${response.error}`
    };
  }

  // Fraud Methods
  async reportFraud(fraudData, authHeader) {
    const response = await this.makeRequest('POST', '/fraud/report', fraudData, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        '✅ Fraud report submitted successfully!' : 
        `❌ Fraud report failed: ${response.error}`
    };
  }

  async getFraudAlerts(alertParams, authHeader) {
    const queryString = new URLSearchParams(alertParams).toString();
    const endpoint = '/fraud/alerts' + (queryString ? `?${queryString}` : '');
    const response = await this.makeRequest('GET', endpoint, null, authHeader);
    return {
      success: response.success,
      data: response.data,
      error: response.error,
      message: response.success ? 
        '🚨 Fraud Alerts' : 
        `❌ Failed to retrieve fraud alerts: ${response.error}`
    };
  }

  // Generic tool execution
  async executeTool(toolName, params, authHeader) {
    try {
      switch (toolName) {
        case 'enterprise_login':
          return await this.enterpriseLogin(params.email, params.password, params.loginType, params.sessionId);
        case 'register_customer':
          return await this.registerCustomer(params);
        case 'get_customer_accounts':
          return await this.getCustomerAccounts(params, authHeader);
        case 'get_account_balance':
          return await this.getAccountBalance(params.accountId, authHeader);
        case 'get_transactions':
          return await this.getTransactions(params, authHeader);
        case 'transfer_funds':
          return await this.transferFunds(params, authHeader);
        case 'make_payment':
          return await this.makePayment(params, authHeader);
        case 'get_cards':
          return await this.getCards(params, authHeader);
        case 'apply_credit_card':
          return await this.applyCreditCard(params, authHeader);
        case 'block_card':
          return await this.blockCard(params, authHeader);
        case 'unblock_card':
          return await this.unblockCard(params, authHeader);
        default:
          return {
            success: false,
            error: `Unknown tool: ${toolName}`,
            message: `❌ Tool ${toolName} not found`
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: `❌ Tool execution failed: ${error.message}`
      };
    }
  }

  async start() {
    try {
      await new Promise((resolve, reject) => {
        this.app.listen(this.port, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      console.log(`🏦 Enterprise Banking HTTP MCP Server v3.0.0 running on port ${this.port}`);
      console.log(`📡 API Base URL: ${this.apiBaseUrl}`);
      console.log(`🌐 Server URL: http://localhost:${this.port}`);
      console.log(`🔧 Health Check: http://localhost:${this.port}/health`);
      console.log(`📋 Available Tools: http://localhost:${this.port}/tools`);
      console.log('🚀 Server is ready to handle HTTP requests!');
    } catch (error) {
      console.error('❌ Failed to start MCP HTTP server:', error);
      process.exit(1);
    }
  }
}

// Start the server
const server = new EnterpriseBankingHTTPMCPServer();
server.start().catch(console.error);

module.exports = EnterpriseBankingHTTPMCPServer;
