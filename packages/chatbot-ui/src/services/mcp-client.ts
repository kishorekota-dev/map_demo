import { MCPAction, MCPClientConfig, APIResponse } from '../types';

export class MCPClientService {
  private config: MCPClientConfig;
  private isConnected = false;
  private authToken: string | null = null;
  private baseURL: string;

  constructor(config: MCPClientConfig) {
    this.config = config;
    this.baseURL = this.normalizeBaseURL(config.apiBaseUrl || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api/v1');
  }

  /**
   * Normalize base URL to ensure it doesn't end with /api/v1 twice
   */
  private normalizeBaseURL(url: string): string {
    // Remove trailing slash
    url = url.replace(/\/$/, '');
    // If URL already ends with /api/v1, use as-is
    if (url.endsWith('/api/v1')) {
      return url;
    }
    // Otherwise, append /api/v1
    return `${url}/api/v1`;
  }

  /**
   * Initialize and connect to backend API
   */
  async connect(): Promise<boolean> {
    try {
      // Test connection to backend API health endpoint
      const response = await fetch(`${this.baseURL}/health`);
      this.isConnected = response.ok;
      console.log('MCP Client connected to backend API:', this.isConnected);
      return this.isConnected;
    } catch (error) {
      console.error('Failed to connect to backend API:', error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.authToken = null;
    console.log('MCP Client disconnected');
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void {
    this.authToken = token;
  }

  /**
   * Get account balance
   */
  async getAccountBalance(accountId: string): Promise<APIResponse> {
    try {
      const response = await fetch(`${this.baseURL}/accounts/${accountId}/balance`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` })
        }
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          data: undefined,
          error: result.message || 'Failed to get account balance',
          metadata: {
            statusCode: response.status,
            timestamp: new Date().toISOString()
          }
        };
      }

      return {
        success: true,
        data: result,
        error: undefined,
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

  /**
   * Get transaction history
   */
  async getTransactionHistory(accountId: string, limit = 10): Promise<APIResponse> {
    try {
      const response = await fetch(`${this.baseURL}/transactions?accountId=${accountId}&limit=${limit}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` })
        }
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          data: undefined,
          error: result.message || 'Failed to get transaction history',
          metadata: {
            statusCode: response.status,
            timestamp: new Date().toISOString()
          }
        };
      }

      return {
        success: true,
        data: result,
        error: undefined,
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

  /**
   * Transfer funds
   */
  async transferFunds(fromAccount: string, toAccount: string, amount: number): Promise<APIResponse> {
    try {
      const response = await fetch(`${this.baseURL}/transactions/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` })
        },
        body: JSON.stringify({
          fromAccountId: fromAccount,
          toAccountId: toAccount,
          amount: amount,
          description: 'Transfer via chatbot'
        })
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          data: undefined,
          error: result.message || 'Failed to transfer funds',
          metadata: {
            statusCode: response.status,
            timestamp: new Date().toISOString()
          }
        };
      }

      return {
        success: true,
        data: result,
        error: undefined,
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

  /**
   * Pay bill
   */
  async payBill(accountId: string, billId: string, amount: number): Promise<APIResponse> {
    try {
      const response = await fetch(`${this.baseURL}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` })
        },
        body: JSON.stringify({
          accountId: accountId,
          amount: amount,
          description: `Bill payment for ${billId}`,
          paymentMethod: 'ACH'
        })
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          data: undefined,
          error: result.message || 'Failed to pay bill',
          metadata: {
            statusCode: response.status,
            timestamp: new Date().toISOString()
          }
        };
      }

      return {
        success: true,
        data: result,
        error: undefined,
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

  /**
   * Get card details
   */
  async getCardDetails(cardId: string): Promise<APIResponse> {
    try {
      const response = await fetch(`${this.baseURL}/cards/${cardId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` })
        }
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          data: undefined,
          error: result.message || 'Failed to get card details',
          metadata: {
            statusCode: response.status,
            timestamp: new Date().toISOString()
          }
        };
      }

      return {
        success: true,
        data: result,
        error: undefined,
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

  /**
   * Block/unblock card
   */
  async toggleCardStatus(cardId: string, blocked: boolean): Promise<APIResponse> {
    try {
      const endpoint = blocked ? 'block' : 'unblock';
      const response = await fetch(`${this.baseURL}/cards/${cardId}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` })
        },
        body: JSON.stringify({
          reason: blocked ? 'Blocked via chatbot' : 'Unblocked via chatbot'
        })
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          data: undefined,
          error: result.message || `Failed to ${blocked ? 'block' : 'unblock'} card`,
          metadata: {
            statusCode: response.status,
            timestamp: new Date().toISOString()
          }
        };
      }

      return {
        success: true,
        data: result,
        error: undefined,
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

  /**
   * Get available services
   */
  async getAvailableServices(): Promise<APIResponse> {
    try {
      const response = await fetch(`${this.baseURL}/accounts`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` })
        }
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          data: undefined,
          error: result.message || 'Failed to get services',
          metadata: {
            statusCode: response.status,
            timestamp: new Date().toISOString()
          }
        };
      }

      return {
        success: true,
        data: result,
        error: undefined,
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

  /**
   * Authenticate user
   */
  async authenticateUser(credentials: { username: string; password: string }): Promise<APIResponse> {
    try {
      const response = await fetch(`${this.baseURL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: credentials.username,
          password: credentials.password
        }),
      });

      const result = await response.json();
      
      if (response.ok && result.token) {
        this.setAuthToken(result.token);
        return {
          success: true,
          data: result,
          error: undefined,
          metadata: {
            statusCode: response.status,
            timestamp: new Date().toISOString()
          }
        };
      } else {
        return {
          success: false,
          data: null,
          error: result.message || 'Authentication failed',
          metadata: {
            statusCode: response.status,
            timestamp: new Date().toISOString()
          }
        };
      }
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Authentication error',
        metadata: {
          statusCode: 500,
          timestamp: new Date().toISOString()
        }
      };
    }
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
}
