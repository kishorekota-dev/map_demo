import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCPAction, MCPClientConfig, APIResponse } from '../types';

export class MCPClientService {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private config: MCPClientConfig;
  private isConnected = false;
  private authToken: string | null = null;

  constructor(config: MCPClientConfig) {
    this.config = config;
  }

  /**
   * Initialize and connect to MCP server
   */
  async connect(): Promise<boolean> {
    try {
      // Create transport to MCP server
      this.transport = new StdioClientTransport({
        command: 'node',
        args: [this.config.serverPath],
      });

      // Create MCP client
      this.client = new Client({
        name: 'enterprise-banking-chatbot',
        version: '1.0.0',
      });

      // Connect to server
      await this.client.connect(this.transport);
      this.isConnected = true;
      
      console.log('Connected to MCP server');
      return true;
    } catch (error) {
      console.error('Failed to connect to MCP server:', error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
    this.isConnected = false;
    this.client = null;
    this.transport = null;
  }

  /**
   * Check if connected to MCP server
   */
  isClientConnected(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void {
    this.authToken = token;
  }

  /**
   * Execute MCP action with authentication and authorization
   */
  async executeAction(action: MCPAction): Promise<APIResponse> {
    if (!this.isClientConnected()) {
      await this.connect();
    }

    if (!this.client) {
      return {
        success: false,
        error: 'MCP client not connected',
        code: 'MCP_NOT_CONNECTED'
      };
    }

    const startTime = Date.now();

    try {
      // Add authentication and session context if available
      const parameters = {
        ...action.parameters,
        ...(this.authToken && { 
          authToken: this.authToken,
          timestamp: new Date().toISOString()
        }),
      };

      // Execute tool call with enhanced error handling
      const result = await this.client.callTool({
        name: action.tool,
        arguments: parameters,
      });

      const executionTime = Date.now() - startTime;

      // Handle authentication errors
      if (result.content?.[0]?.type === 'text' && 
          result.content[0].text?.includes('authentication')) {
        return {
          success: false,
          error: 'Authentication required or expired',
          code: 'AUTH_REQUIRED',
          data: null,
          executionTime
        };
      }

      // Handle authorization errors
      if (result.content?.[0]?.type === 'text' && 
          result.content[0].text?.includes('permission')) {
        return {
          success: false,
          error: 'Insufficient permissions',
          code: 'AUTH_PERMISSION_DENIED',
          data: null,
          executionTime
        };
      }

      return {
        success: true,
        data: result.content?.[0]?.type === 'text' ? 
              JSON.parse(result.content[0].text) : result.content,
        executionTime
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('MCP action execution error:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'MCP_EXECUTION_ERROR',
        executionTime
      };
    }
  }

  /**
   * Authentication operations
   */
  async authenticate(credentials: { username: string; password: string }): Promise<APIResponse> {
    return this.executeAction({
      tool: 'authenticate',
      parameters: credentials,
    });
  }

  async validateToken(token: string): Promise<APIResponse> {
    return this.executeAction({
      tool: 'validate_token',
      parameters: { token },
    });
  }

  /**
   * Customer management operations
   */
  async getCustomerProfile(customerId: string): Promise<APIResponse> {
    return this.executeAction({
      tool: 'get_customer_profile',
      parameters: { customerId },
    });
  }

  async updateCustomerProfile(customerId: string, updates: Record<string, any>): Promise<APIResponse> {
    return this.executeAction({
      tool: 'update_customer_profile',
      parameters: { customerId, ...updates },
    });
  }

  async searchCustomers(criteria: Record<string, any>): Promise<APIResponse> {
    return this.executeAction({
      tool: 'search_customers',
      parameters: criteria,
    });
  }

  /**
   * Account operations
   */
  async getAccountDetails(accountId: string): Promise<APIResponse> {
    return this.executeAction({
      tool: 'get_account_details',
      parameters: { accountId },
    });
  }

  async getAccountBalance(accountId: string): Promise<APIResponse> {
    return this.executeAction({
      tool: 'get_account_balance',
      parameters: { accountId },
    });
  }

  async getCustomerAccounts(customerId: string): Promise<APIResponse> {
    return this.executeAction({
      tool: 'get_customer_accounts',
      parameters: { customerId },
    });
  }

  async openAccount(accountData: Record<string, any>): Promise<APIResponse> {
    return this.executeAction({
      tool: 'open_account',
      parameters: accountData,
    });
  }

  async closeAccount(accountId: string, reason: string): Promise<APIResponse> {
    return this.executeAction({
      tool: 'close_account',
      parameters: { accountId, reason },
    });
  }

  /**
   * Transaction operations
   */
  async getTransactionHistory(accountId: string, filters?: Record<string, any>): Promise<APIResponse> {
    return this.executeAction({
      tool: 'get_transaction_history',
      parameters: { accountId, ...filters },
    });
  }

  async getTransactionDetails(transactionId: string): Promise<APIResponse> {
    return this.executeAction({
      tool: 'get_transaction_details',
      parameters: { transactionId },
    });
  }

  async searchTransactions(criteria: Record<string, any>): Promise<APIResponse> {
    return this.executeAction({
      tool: 'search_transactions',
      parameters: criteria,
    });
  }

  /**
   * Payment operations
   */
  async makePayment(paymentData: Record<string, any>): Promise<APIResponse> {
    return this.executeAction({
      tool: 'make_payment',
      parameters: paymentData,
    });
  }

  async transferFunds(transferData: Record<string, any>): Promise<APIResponse> {
    return this.executeAction({
      tool: 'transfer_funds',
      parameters: transferData,
    });
  }

  async schedulePayment(paymentData: Record<string, any>): Promise<APIResponse> {
    return this.executeAction({
      tool: 'schedule_payment',
      parameters: paymentData,
    });
  }

  async getPaymentHistory(customerId: string, filters?: Record<string, any>): Promise<APIResponse> {
    return this.executeAction({
      tool: 'get_payment_history',
      parameters: { customerId, ...filters },
    });
  }

  /**
   * Card operations
   */
  async getCardDetails(cardId: string): Promise<APIResponse> {
    return this.executeAction({
      tool: 'get_card_details',
      parameters: { cardId },
    });
  }

  async getCustomerCards(customerId: string): Promise<APIResponse> {
    return this.executeAction({
      tool: 'get_customer_cards',
      parameters: { customerId },
    });
  }

  async blockCard(cardId: string, reason: string): Promise<APIResponse> {
    return this.executeAction({
      tool: 'block_card',
      parameters: { cardId, reason },
    });
  }

  async unblockCard(cardId: string): Promise<APIResponse> {
    return this.executeAction({
      tool: 'unblock_card',
      parameters: { cardId },
    });
  }

  async setCardLimit(cardId: string, limitType: string, amount: number): Promise<APIResponse> {
    return this.executeAction({
      tool: 'set_card_limit',
      parameters: { cardId, limitType, amount },
    });
  }

  async activateCard(cardId: string, activationCode: string): Promise<APIResponse> {
    return this.executeAction({
      tool: 'activate_card',
      parameters: { cardId, activationCode },
    });
  }

  /**
   * Dispute operations
   */
  async createDispute(disputeData: Record<string, any>): Promise<APIResponse> {
    return this.executeAction({
      tool: 'create_dispute',
      parameters: disputeData,
    });
  }

  async getDisputeStatus(disputeId: string): Promise<APIResponse> {
    return this.executeAction({
      tool: 'get_dispute_status',
      parameters: { disputeId },
    });
  }

  async getCustomerDisputes(customerId: string): Promise<APIResponse> {
    return this.executeAction({
      tool: 'get_customer_disputes',
      parameters: { customerId },
    });
  }

  async updateDispute(disputeId: string, updates: Record<string, any>): Promise<APIResponse> {
    return this.executeAction({
      tool: 'update_dispute',
      parameters: { disputeId, ...updates },
    });
  }

  /**
   * Fraud operations
   */
  async reportFraud(fraudData: Record<string, any>): Promise<APIResponse> {
    return this.executeAction({
      tool: 'report_fraud',
      parameters: fraudData,
    });
  }

  async getFraudAlerts(customerId: string): Promise<APIResponse> {
    return this.executeAction({
      tool: 'get_fraud_alerts',
      parameters: { customerId },
    });
  }

  async investigateFraud(alertId: string): Promise<APIResponse> {
    return this.executeAction({
      tool: 'investigate_fraud',
      parameters: { alertId },
    });
  }

  /**
   * Utility operations
   */
  async validateAccount(accountNumber: string): Promise<APIResponse> {
    return this.executeAction({
      tool: 'validate_account',
      parameters: { accountNumber },
    });
  }

  async calculateInterest(accountId: string, amount: number, days: number): Promise<APIResponse> {
    return this.executeAction({
      tool: 'calculate_interest',
      parameters: { accountId, amount, days },
    });
  }

  async getExchangeRate(fromCurrency: string, toCurrency: string): Promise<APIResponse> {
    return this.executeAction({
      tool: 'get_exchange_rate',
      parameters: { fromCurrency, toCurrency },
    });
  }

  /**
   * Get available tools from MCP server
   */
  async getAvailableTools(): Promise<string[]> {
    if (!this.isClientConnected()) {
      await this.connect();
    }

    if (!this.client) {
      return [];
    }

    try {
      const tools = await this.client.listTools();
      return tools.tools?.map(tool => tool.name) || [];
    } catch (error) {
      console.error('Error getting available tools:', error);
      return [];
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.executeAction({
        tool: 'health_check',
        parameters: {},
      });
      return result.success;
    } catch {
      return false;
    }
  }
}

export default MCPClientService;
