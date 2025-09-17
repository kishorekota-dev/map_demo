import { MCPAction, MCPClientConfig, APIResponse } from '../types';

// Debug logging utility for MCP Client
class ClientDebugLogger {
  private component: string;
  private isDebugMode: boolean;

  constructor(component = 'MCP-HTTP-CLIENT') {
    this.component = component;
    this.isDebugMode = process.env.NODE_ENV === 'development' || 
                      process.env.NEXT_PUBLIC_DEBUG === 'true' ||
                      localStorage?.getItem('mcp_debug') === 'true';
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${this.component}] [${level}]`;
    
    if (data) {
      return `${prefix} ${message} | Data: ${JSON.stringify(data, null, 2)}`;
    }
    return `${prefix} ${message}`;
  }

  info(message: string, data?: any): void {
    console.log(this.formatMessage('INFO', message, data));
  }

  debug(message: string, data?: any): void {
    if (this.isDebugMode) {
      console.log(this.formatMessage('DEBUG', message, data));
    }
  }

  warn(message: string, data?: any): void {
    console.warn(this.formatMessage('WARN', message, data));
  }

  error(message: string, error?: any, data?: any): void {
    const errorData = error ? { 
      message: error.message, 
      stack: error.stack, 
      ...(data || {}) 
    } : data;
    console.error(this.formatMessage('ERROR', message, errorData));
  }

  trace(method: string, endpoint: string, params?: any, response?: any): void {
    if (this.isDebugMode) {
      this.debug(`${method} ${endpoint}`, { params, response });
    }
  }

  timing(operation: string, startTime: number): void {
    if (this.isDebugMode) {
      const duration = Date.now() - startTime;
      this.debug(`⏱️ ${operation} completed in ${duration}ms`);
    }
  }
}

export class HTTPMCPClientService {
  private config: MCPClientConfig;
  private logger: ClientDebugLogger;
  private isConnected = false;
  private authToken: string | null = null;
  private sessionId: string;
  private mcpBaseURL: string;
  private requestCounter = 0;

  constructor(config: MCPClientConfig) {
    this.config = config;
    this.logger = new ClientDebugLogger('MCP-HTTP-CLIENT');
    this.sessionId = this.generateSessionId();
    this.mcpBaseURL = config.mcpServerUrl || 'http://localhost:3001';
    
    this.logger.info('🚀 HTTP MCP Client initialized', {
      sessionId: this.sessionId,
      mcpBaseURL: this.mcpBaseURL,
      debugMode: this.logger['isDebugMode'],
      config: {
        timeout: config.timeout,
        retryAttempts: config.retryAttempts,
        apiBaseUrl: config.apiBaseUrl
      }
    });
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.logger.debug('🎫 Generated new session ID', { sessionId });
    return sessionId;
  }

  /**
   * Generate unique request ID for tracing
   */
  private generateRequestId(): string {
    return `req_${this.sessionId}_${++this.requestCounter}`;
  }

  /**
   * Sanitize sensitive data for logging
   */
  private sanitizeData(data: any): any {
    if (!data) return data;
    
    const sanitized = { ...data };
    const sensitiveFields = ['password', 'token', 'ssn', 'cardNumber', 'cvv', 'authorization'];
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }

  /**
   * Make HTTP request with comprehensive logging
   */
  private async makeHTTPRequest(
    method: string, 
    endpoint: string, 
    data?: any, 
    headers: Record<string, string> = {}
  ): Promise<{ response: Response; result: any; requestId: string }> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();
    const url = `${this.mcpBaseURL}${endpoint}`;
    
    this.logger.info(`📤 ${method} Request Starting`, {
      requestId,
      endpoint,
      url,
      hasData: !!data,
      headers: this.sanitizeData(headers)
    });
    
    this.logger.debug('📦 Request Details', {
      requestId,
      method,
      endpoint,
      sanitizedData: this.sanitizeData(data),
      fullHeaders: headers
    });

    try {
      const requestOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      if (data) {
        requestOptions.body = JSON.stringify(data);
      }

      const response = await fetch(url, requestOptions);
      const result = await response.json();
      
      this.logger.timing(`${method} ${endpoint}`, startTime);
      
      this.logger.info(`📥 ${method} Response Received`, {
        requestId,
        endpoint,
        statusCode: response.status,
        ok: response.ok,
        duration: `${Date.now() - startTime}ms`,
        responseSize: JSON.stringify(result).length
      });
      
      this.logger.debug('📋 Response Details', {
        requestId,
        result: this.sanitizeData(result),
        headers: Object.fromEntries(response.headers.entries())
      });

      return { response, result, requestId };
    } catch (error) {
      this.logger.timing(`${method} ${endpoint} (FAILED)`, startTime);
      this.logger.error(`❌ ${method} Request Failed`, error, {
        requestId,
        endpoint,
        url,
        duration: `${Date.now() - startTime}ms`
      });
      throw error;
    }
  }

  /**
   * Initialize and connect to MCP HTTP server
   */
  async connect(): Promise<boolean> {
    const startTime = Date.now();
    this.logger.info('🔗 Attempting to connect to MCP HTTP Server', {
      mcpBaseURL: this.mcpBaseURL,
      sessionId: this.sessionId
    });

    try {
      const { response, result, requestId } = await this.makeHTTPRequest('GET', '/health');
      
      if (response.ok) {
        this.isConnected = true;
        this.logger.info('✅ Successfully connected to MCP HTTP Server', {
          requestId,
          serverInfo: result,
          duration: `${Date.now() - startTime}ms`
        });
        return true;
      } else {
        this.isConnected = false;
        this.logger.error('❌ MCP HTTP Server health check failed', null, {
          requestId,
          statusCode: response.status,
          result
        });
        return false;
      }
    } catch (error) {
      this.isConnected = false;
      this.logger.error('❌ Failed to connect to MCP HTTP server', error, {
        mcpBaseURL: this.mcpBaseURL,
        duration: `${Date.now() - startTime}ms`
      });
      return false;
    }
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect(): Promise<void> {
    this.logger.info('🔌 Disconnecting from MCP HTTP server', {
      sessionId: this.sessionId,
      hasAuthToken: !!this.authToken,
      wasConnected: this.isConnected
    });

    if (this.authToken && this.sessionId) {
      try {
        await this.logout();
        this.logger.debug('✅ Logout completed during disconnect');
      } catch (error) {
        this.logger.warn('⚠️ Warning during logout in disconnect', error);
      }
    }
    
    this.isConnected = false;
    this.authToken = null;
    
    this.logger.info('✅ Disconnected from MCP HTTP server', {
      sessionId: this.sessionId
    });
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void {
    this.logger.info('🎫 Setting authentication token', {
      sessionId: this.sessionId,
      tokenLength: token?.length || 0,
      previouslyAuthenticated: !!this.authToken
    });
    
    this.authToken = token;
    
    this.logger.debug('✅ Authentication token set successfully');
  }

  /**
   * Get available tools from MCP server
   */
  async getAvailableTools(): Promise<APIResponse> {
    this.logger.info('🛠️ Fetching available tools', {
      sessionId: this.sessionId
    });

    try {
      const { response, result, requestId } = await this.makeHTTPRequest('GET', '/tools');

      if (!response.ok) {
        this.logger.warn('⚠️ Failed to get available tools', {
          requestId,
          statusCode: response.status,
          error: result.error
        });

        return {
          success: false,
          data: undefined,
          error: result.error || 'Failed to get available tools',
          metadata: {
            statusCode: response.status,
            timestamp: new Date().toISOString(),
            requestId
          }
        };
      }

      this.logger.info('✅ Available tools retrieved successfully', {
        requestId,
        toolCount: result.tools?.length || 0
      });

      this.logger.debug('🛠️ Available tools list', {
        requestId,
        tools: result.tools?.map((tool: any) => tool.name)
      });

      return {
        success: true,
        data: result,
        error: undefined,
        metadata: {
          statusCode: response.status,
          timestamp: new Date().toISOString(),
          requestId
        }
      };
    } catch (error) {
      this.logger.error('❌ Error fetching available tools', error);
      
      return {
        success: false,
        data: undefined,
        error: error instanceof Error ? error.message : 'Network error',
        metadata: {
          statusCode: 500,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Execute MCP tool
   */
  async executeTool(toolName: string, params: Record<string, any>): Promise<APIResponse> {
    this.logger.info('🔧 Executing MCP tool', {
      sessionId: this.sessionId,
      toolName,
      hasAuthToken: !!this.authToken,
      paramKeys: Object.keys(params)
    });

    this.logger.debug('🔧 Tool execution details', {
      toolName,
      sanitizedParams: this.sanitizeData(params)
    });

    try {
      const headers: Record<string, string> = {};

      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
        this.logger.debug('🔑 Authorization header added for tool execution');
      }

      const { response, result, requestId } = await this.makeHTTPRequest(
        'POST', 
        `/tools/${toolName}`, 
        params, 
        headers
      );

      if (!response.ok) {
        this.logger.warn('⚠️ Tool execution failed', {
          requestId,
          toolName,
          statusCode: response.status,
          error: result.error
        });

        return {
          success: false,
          data: undefined,
          error: result.error || `Tool execution failed: ${toolName}`,
          metadata: {
            statusCode: response.status,
            timestamp: new Date().toISOString(),
            requestId,
            toolName
          }
        };
      }

      this.logger.info('✅ Tool executed successfully', {
        requestId,
        toolName,
        success: result.success !== false,
        hasData: !!result.data
      });

      this.logger.debug('🔧 Tool execution result', {
        requestId,
        toolName,
        sanitizedResult: this.sanitizeData(result)
      });

      return {
        success: result.success !== false,
        data: result.data || result,
        error: result.error,
        metadata: {
          statusCode: response.status,
          timestamp: new Date().toISOString(),
          message: result.message,
          requestId,
          toolName
        }
      };
    } catch (error) {
      this.logger.error('❌ Tool execution error', error, {
        toolName,
        sessionId: this.sessionId
      });

      return {
        success: false,
        data: undefined,
        error: error instanceof Error ? error.message : 'Network error',
        metadata: {
          statusCode: 500,
          timestamp: new Date().toISOString(),
          toolName
        }
      };
    }
  }

  /**
   * Login to enterprise banking system
   */
  async login(email: string, password: string, loginType = 'CUSTOMER'): Promise<APIResponse> {
    this.logger.info('🔐 Attempting login', {
      sessionId: this.sessionId,
      email,
      loginType,
      mcpBaseURL: this.mcpBaseURL
    });

    try {
      const { response, result, requestId } = await this.makeHTTPRequest('POST', '/auth/login', {
        email,
        password,
        loginType,
        sessionId: this.sessionId
      });

      if (response.ok && result.success && result.data?.token) {
        this.setAuthToken(result.data.token);
        
        this.logger.info('✅ Login successful', {
          requestId,
          email,
          loginType,
          hasToken: !!result.data.token,
          userData: this.sanitizeData(result.data)
        });

        return {
          success: true,
          data: result.data,
          error: undefined,
          metadata: {
            statusCode: response.status,
            timestamp: new Date().toISOString(),
            message: result.message,
            requestId
          }
        };
      } else {
        this.logger.warn('⚠️ Login failed', {
          requestId,
          email,
          loginType,
          statusCode: response.status,
          error: result.error || result.message
        });

        return {
          success: false,
          data: null,
          error: result.error || result.message || 'Authentication failed',
          metadata: {
            statusCode: response.status,
            timestamp: new Date().toISOString(),
            requestId
          }
        };
      }
    } catch (error) {
      this.logger.error('❌ Login error', error, {
        email,
        loginType,
        sessionId: this.sessionId
      });

      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Network error during login',
        metadata: {
          statusCode: 500,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Logout from enterprise banking system
   */
  async logout(): Promise<APIResponse> {
    this.logger.info('🚪 Attempting logout', {
      sessionId: this.sessionId,
      hasAuthToken: !!this.authToken
    });

    try {
      const { response, result, requestId } = await this.makeHTTPRequest('POST', '/auth/logout', {
        sessionId: this.sessionId
      });

      const previouslyAuthenticated = !!this.authToken;
      this.authToken = null;

      this.logger.info('✅ Logout completed', {
        requestId,
        sessionId: this.sessionId,
        previouslyAuthenticated,
        statusCode: response.status
      });

      return {
        success: true,
        data: result.data,
        error: undefined,
        metadata: {
          statusCode: response.status,
          timestamp: new Date().toISOString(),
          message: result.message,
          requestId
        }
      };
    } catch (error) {
      this.authToken = null; // Clear token even on error
      
      this.logger.error('❌ Logout error', error, {
        sessionId: this.sessionId
      });

      return {
        success: false,
        data: undefined,
        error: error instanceof Error ? error.message : 'Logout failed',
        metadata: {
          statusCode: 500,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Get account balance
   */
  async getAccountBalance(accountId: string): Promise<APIResponse> {
    return this.executeTool('get_account_balance', { accountId });
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(accountId: string, limit = 10): Promise<APIResponse> {
    return this.executeTool('get_transactions', { accountId, limit });
  }

  /**
   * Transfer funds
   */
  async transferFunds(fromAccount: string, toAccount: string, amount: number): Promise<APIResponse> {
    return this.executeTool('transfer_funds', {
      fromAccountId: fromAccount,
      toAccountId: toAccount,
      amount: amount,
      description: 'Transfer via chatbot'
    });
  }

  /**
   * Pay bill
   */
  async payBill(accountId: string, billId: string, amount: number): Promise<APIResponse> {
    return this.executeTool('make_payment', {
      accountId: accountId,
      amount: amount,
      description: `Bill payment for ${billId}`,
      paymentMethod: 'ACH'
    });
  }

  /**
   * Get card details
   */
  async getCardDetails(cardId: string): Promise<APIResponse> {
    return this.executeTool('get_card_details', { cardId });
  }

  /**
   * Block/unblock card
   */
  async toggleCardStatus(cardId: string, blocked: boolean): Promise<APIResponse> {
    const toolName = blocked ? 'block_card' : 'unblock_card';
    return this.executeTool(toolName, {
      cardId,
      reason: blocked ? 'Blocked via chatbot' : 'Unblocked via chatbot'
    });
  }

  /**
   * Get available services (accounts)
   */
  async getAvailableServices(): Promise<APIResponse> {
    return this.executeTool('get_customer_accounts', {});
  }

  /**
   * Authenticate user (legacy compatibility)
   */
  async authenticateUser(credentials: { username: string; password: string }): Promise<APIResponse> {
    return this.login(credentials.username, credentials.password);
  }

  /**
   * Handle banking actions based on intent
   */
  async handleBankingAction(intent: string, entities: Record<string, any>): Promise<APIResponse> {
    switch (intent) {
      case 'check_balance':
        if (entities.accountId) {
          return this.getAccountBalance(entities.accountId);
        }
        break;
      
      case 'view_transactions':
        if (entities.accountId) {
          return this.getTransactionHistory(entities.accountId, entities.limit || 10);
        }
        break;
      
      case 'transfer_money':
        if (entities.fromAccount && entities.toAccount && entities.amount) {
          return this.transferFunds(entities.fromAccount, entities.toAccount, entities.amount);
        }
        break;
      
      case 'pay_bill':
        if (entities.accountId && entities.billId && entities.amount) {
          return this.payBill(entities.accountId, entities.billId, entities.amount);
        }
        break;
      
      case 'card_details':
        if (entities.cardId) {
          return this.getCardDetails(entities.cardId);
        }
        break;
      
      case 'block_card':
      case 'unblock_card':
        if (entities.cardId) {
          const blocked = intent === 'block_card';
          return this.toggleCardStatus(entities.cardId, blocked);
        }
        break;
      
      default:
        return {
          success: false,
          data: null,
          error: `Unknown banking action: ${intent}`,
          metadata: {
            statusCode: 400,
            timestamp: new Date().toISOString()
          }
        };
    }
    
    return {
      success: false,
      data: null,
      error: 'Missing required parameters for banking action',
      metadata: {
        statusCode: 400,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Check if client is connected
   */
  isClientConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get MCP server info
   */
  async getServerInfo(): Promise<APIResponse> {
    try {
      const response = await fetch(`${this.mcpBaseURL}/health`);
      const result = await response.json();

      return {
        success: response.ok,
        data: result,
        error: response.ok ? undefined : 'Failed to get server info',
        metadata: {
          statusCode: response.status,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        data: undefined,
        error: error instanceof Error ? error.message : 'Network error',
        metadata: {
          statusCode: 500,
          timestamp: new Date().toISOString()
        }
      };
    }
  }
}

// For backward compatibility, also export as default
export default HTTPMCPClientService;
