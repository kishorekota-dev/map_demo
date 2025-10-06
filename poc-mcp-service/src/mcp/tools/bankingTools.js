const logger = require('../../utils/logger');

/**
 * Banking Tools for MCP Server
 * Defines all available tools with JSON schemas
 */
class BankingTools {
  constructor() {
    // Tool definitions with schemas
    this.tools = [
      {
        name: 'get_account_balance',
        description: 'Get the current balance of a customer account',
        inputSchema: {
          type: 'object',
          properties: {
            accountId: {
              type: 'string',
              description: 'The unique account identifier'
            },
            sessionId: {
              type: 'string',
              description: 'Session identifier for tracking'
            }
          },
          required: ['accountId']
        }
      },
      {
        name: 'get_transactions',
        description: 'Retrieve transaction history for an account',
        inputSchema: {
          type: 'object',
          properties: {
            accountId: {
              type: 'string',
              description: 'The unique account identifier'
            },
            startDate: {
              type: 'string',
              description: 'Start date for transaction history (YYYY-MM-DD)',
              format: 'date'
            },
            endDate: {
              type: 'string',
              description: 'End date for transaction history (YYYY-MM-DD)',
              format: 'date'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of transactions to return',
              default: 10
            },
            sessionId: {
              type: 'string',
              description: 'Session identifier for tracking'
            }
          },
          required: ['accountId']
        }
      },
      {
        name: 'transfer_funds',
        description: 'Transfer money between accounts',
        inputSchema: {
          type: 'object',
          properties: {
            fromAccount: {
              type: 'string',
              description: 'Source account ID'
            },
            toAccount: {
              type: 'string',
              description: 'Destination account ID'
            },
            amount: {
              type: 'number',
              description: 'Amount to transfer',
              minimum: 0.01
            },
            description: {
              type: 'string',
              description: 'Transfer description/memo'
            },
            sessionId: {
              type: 'string',
              description: 'Session identifier for tracking'
            }
          },
          required: ['fromAccount', 'toAccount', 'amount']
        }
      },
      {
        name: 'manage_card',
        description: 'Manage credit/debit card services (block, unblock, activate)',
        inputSchema: {
          type: 'object',
          properties: {
            cardId: {
              type: 'string',
              description: 'The unique card identifier'
            },
            action: {
              type: 'string',
              description: 'Action to perform on the card',
              enum: ['block', 'unblock', 'activate', 'replace']
            },
            reason: {
              type: 'string',
              description: 'Reason for the action'
            },
            sessionId: {
              type: 'string',
              description: 'Session identifier for tracking'
            }
          },
          required: ['cardId', 'action']
        }
      },
      {
        name: 'dispute_transaction',
        description: 'File a dispute for a fraudulent or incorrect transaction',
        inputSchema: {
          type: 'object',
          properties: {
            transactionId: {
              type: 'string',
              description: 'The unique transaction identifier'
            },
            reason: {
              type: 'string',
              description: 'Reason for dispute',
              enum: ['fraud', 'unauthorized', 'incorrect_amount', 'duplicate', 'other']
            },
            description: {
              type: 'string',
              description: 'Detailed description of the dispute'
            },
            sessionId: {
              type: 'string',
              description: 'Session identifier for tracking'
            }
          },
          required: ['transactionId', 'reason']
        }
      },
      {
        name: 'get_account_info',
        description: 'Get detailed account information including type, status, and limits',
        inputSchema: {
          type: 'object',
          properties: {
            accountId: {
              type: 'string',
              description: 'The unique account identifier'
            },
            sessionId: {
              type: 'string',
              description: 'Session identifier for tracking'
            }
          },
          required: ['accountId']
        }
      }
    ];
  }

  /**
   * Get all available tools
   */
  getAllTools() {
    return this.tools;
  }

  /**
   * Execute a tool
   */
  async executeTool(toolName, args) {
    logger.info('Executing banking tool', {
      tool: toolName,
      args: Object.keys(args || {})
    });

    const handler = this.getToolHandler(toolName);
    if (!handler) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    try {
      const result = await handler(args);
      
      logger.info('Tool execution completed', {
        tool: toolName,
        success: true
      });
      
      return result;
    } catch (error) {
      logger.error('Tool execution failed', {
        tool: toolName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get tool handler function
   */
  getToolHandler(toolName) {
    const handlers = {
      get_account_balance: this.getAccountBalance.bind(this),
      get_transactions: this.getTransactions.bind(this),
      transfer_funds: this.transferFunds.bind(this),
      manage_card: this.manageCard.bind(this),
      dispute_transaction: this.disputeTransaction.bind(this),
      get_account_info: this.getAccountInfo.bind(this)
    };

    return handlers[toolName];
  }

  /**
   * Tool: Get Account Balance
   */
  async getAccountBalance({ accountId, sessionId }) {
    // Mock implementation - replace with real banking API
    const mockBalances = {
      ACC001: { available: 5234.56, current: 5234.56, currency: 'USD' },
      ACC002: { available: 15000.00, current: 15234.50, currency: 'USD' },
      ACC003: { available: 750.25, current: 750.25, currency: 'USD' }
    };

    const balance = mockBalances[accountId] || { available: 1000.00, current: 1000.00, currency: 'USD' };

    return {
      success: true,
      data: {
        accountId,
        balance: balance.available,
        availableBalance: balance.available,
        currentBalance: balance.current,
        currency: balance.currency,
        timestamp: new Date().toISOString()
      },
      sessionId
    };
  }

  /**
   * Tool: Get Transactions
   */
  async getTransactions({ accountId, startDate, endDate, limit = 10, sessionId }) {
    // Mock implementation
    const mockTransactions = [
      {
        id: 'TXN001',
        date: '2024-01-15',
        description: 'Grocery Store',
        amount: -85.32,
        category: 'Food & Dining',
        status: 'posted'
      },
      {
        id: 'TXN002',
        date: '2024-01-14',
        description: 'Paycheck Deposit',
        amount: 2500.00,
        category: 'Income',
        status: 'posted'
      },
      {
        id: 'TXN003',
        date: '2024-01-13',
        description: 'Electric Bill',
        amount: -125.50,
        category: 'Utilities',
        status: 'posted'
      },
      {
        id: 'TXN004',
        date: '2024-01-12',
        description: 'Coffee Shop',
        amount: -5.75,
        category: 'Food & Dining',
        status: 'posted'
      },
      {
        id: 'TXN005',
        date: '2024-01-11',
        description: 'Gas Station',
        amount: -42.00,
        category: 'Auto & Transport',
        status: 'posted'
      }
    ];

    return {
      success: true,
      data: {
        accountId,
        transactions: mockTransactions.slice(0, limit),
        count: mockTransactions.length,
        startDate,
        endDate
      },
      sessionId
    };
  }

  /**
   * Tool: Transfer Funds
   */
  async transferFunds({ fromAccount, toAccount, amount, description, sessionId }) {
    // Mock implementation - would integrate with real banking API
    const transferId = `TXF${Date.now()}`;

    return {
      success: true,
      data: {
        transferId,
        fromAccount,
        toAccount,
        amount,
        description: description || 'Transfer',
        status: 'pending',
        estimatedCompletionTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour
        confirmationRequired: true,
        timestamp: new Date().toISOString()
      },
      message: 'Transfer initiated successfully. Confirmation required.',
      sessionId
    };
  }

  /**
   * Tool: Manage Card
   */
  async manageCard({ cardId, action, reason, sessionId }) {
    // Mock implementation
    const actionResults = {
      block: 'Card has been blocked successfully',
      unblock: 'Card has been unblocked successfully',
      activate: 'Card has been activated successfully',
      replace: 'Replacement card has been ordered'
    };

    return {
      success: true,
      data: {
        cardId,
        action,
        reason,
        status: 'completed',
        newStatus: action === 'block' ? 'blocked' : action === 'unblock' ? 'active' : 'active',
        timestamp: new Date().toISOString()
      },
      message: actionResults[action] || 'Card action completed',
      sessionId
    };
  }

  /**
   * Tool: Dispute Transaction
   */
  async disputeTransaction({ transactionId, reason, description, sessionId }) {
    // Mock implementation
    const disputeId = `DIS${Date.now()}`;

    return {
      success: true,
      data: {
        disputeId,
        transactionId,
        reason,
        description,
        status: 'submitted',
        estimatedResolutionDays: 10,
        caseNumber: disputeId,
        timestamp: new Date().toISOString()
      },
      message: 'Dispute filed successfully. You will receive updates via email.',
      sessionId
    };
  }

  /**
   * Tool: Get Account Info
   */
  async getAccountInfo({ accountId, sessionId }) {
    // Mock implementation
    const mockAccounts = {
      ACC001: {
        accountId: 'ACC001',
        accountType: 'Checking',
        accountName: 'Primary Checking',
        status: 'active',
        openDate: '2020-01-15',
        interestRate: 0.01,
        minimumBalance: 25.00,
        overdraftProtection: true
      },
      ACC002: {
        accountId: 'ACC002',
        accountType: 'Savings',
        accountName: 'High Yield Savings',
        status: 'active',
        openDate: '2020-01-15',
        interestRate: 4.5,
        minimumBalance: 500.00,
        overdraftProtection: false
      }
    };

    const accountInfo = mockAccounts[accountId] || {
      accountId,
      accountType: 'Checking',
      accountName: 'Account',
      status: 'active',
      openDate: '2020-01-01',
      interestRate: 0.01,
      minimumBalance: 25.00,
      overdraftProtection: false
    };

    return {
      success: true,
      data: accountInfo,
      sessionId
    };
  }
}

// Export singleton instance
module.exports = new BankingTools();
