/**
 * POC Banking Service Module
 * 
 * Handles banking operations including account management, transactions,
 * balance inquiries, and other banking-related services.
 */

const logger = require('../utils/logger');

class PocBankingService {
  constructor() {
    // Mock banking data for demonstration
    this.accounts = this.initializeMockAccounts();
    this.transactions = this.initializeMockTransactions();
    this.cards = this.initializeMockCards();
    this.loans = this.initializeMockLoans();
  }

  initializeMockAccounts() {
    return {
      'user123': {
        accountId: 'ACC-001-123456',
        accountNumber: '****1234',
        accountType: 'Checking',
        balance: 2500.75,
        currency: 'USD',
        status: 'active',
        lastUpdated: new Date().toISOString()
      },
      'user456': {
        accountId: 'ACC-002-456789',
        accountNumber: '****5678',
        accountType: 'Savings',
        balance: 15000.00,
        currency: 'USD',
        status: 'active',
        lastUpdated: new Date().toISOString()
      }
    };
  }

  initializeMockTransactions() {
    return {
      'user123': [
        {
          transactionId: 'TXN-001',
          date: '2025-09-17',
          type: 'debit',
          amount: -45.99,
          description: 'Amazon Purchase',
          category: 'shopping',
          balance: 2500.75
        },
        {
          transactionId: 'TXN-002',
          date: '2025-09-16',
          type: 'credit',
          amount: 2000.00,
          description: 'Salary Deposit',
          category: 'income',
          balance: 2546.74
        },
        {
          transactionId: 'TXN-003',
          date: '2025-09-15',
          type: 'debit',
          amount: -120.00,
          description: 'Grocery Store',
          category: 'food',
          balance: 546.74
        }
      ]
    };
  }

  initializeMockCards() {
    return {
      'user123': [
        {
          cardId: 'CARD-001',
          cardNumber: '****1234',
          cardType: 'Debit',
          status: 'active',
          expiryDate: '12/27',
          dailyLimit: 1000.00,
          usedToday: 165.99
        },
        {
          cardId: 'CARD-002',
          cardNumber: '****5678',
          cardType: 'Credit',
          status: 'active',
          expiryDate: '08/26',
          creditLimit: 5000.00,
          currentBalance: 1250.50
        }
      ]
    };
  }

  initializeMockLoans() {
    return {
      'user123': [
        {
          loanId: 'LOAN-001',
          loanType: 'Personal Loan',
          principalAmount: 10000.00,
          remainingBalance: 6500.00,
          interestRate: 8.5,
          monthlyPayment: 350.00,
          nextPaymentDate: '2025-10-01',
          status: 'active'
        }
      ]
    };
  }

  /**
   * Get account balance for a user
   */
  async getAccountBalance(userId) {
    try {
      logger.info('Fetching account balance', { userId });
      
      const account = this.accounts[userId];
      if (!account) {
        throw new Error('Account not found');
      }

      return {
        success: true,
        data: {
          accountNumber: account.accountNumber,
          accountType: account.accountType,
          balance: account.balance,
          currency: account.currency,
          lastUpdated: account.lastUpdated
        }
      };
    } catch (error) {
      logger.error('Error fetching account balance', { userId, error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get account information for a user
   */
  async getAccountInfo(userId) {
    try {
      logger.info('Fetching account information', { userId });
      
      const account = this.accounts[userId];
      if (!account) {
        throw new Error('Account not found');
      }

      return {
        success: true,
        data: account
      };
    } catch (error) {
      logger.error('Error fetching account information', { userId, error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get transaction history for a user
   */
  async getTransactionHistory(userId, limit = 10) {
    try {
      logger.info('Fetching transaction history', { userId, limit });
      
      const transactions = this.transactions[userId] || [];
      const limitedTransactions = transactions.slice(0, limit);

      return {
        success: true,
        data: {
          transactions: limitedTransactions,
          total: transactions.length,
          limit: limit
        }
      };
    } catch (error) {
      logger.error('Error fetching transaction history', { userId, error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Simulate money transfer
   */
  async transferMoney(userId, transferData) {
    try {
      logger.info('Processing money transfer', { userId, transferData });
      
      const { toAccount, amount, description } = transferData;
      const account = this.accounts[userId];
      
      if (!account) {
        throw new Error('Source account not found');
      }

      if (amount <= 0) {
        throw new Error('Transfer amount must be positive');
      }

      if (account.balance < amount) {
        throw new Error('Insufficient funds');
      }

      // Simulate transfer processing
      const transferId = `TRF-${Date.now()}`;
      const newBalance = account.balance - amount;
      
      // Update account balance
      this.accounts[userId].balance = newBalance;
      this.accounts[userId].lastUpdated = new Date().toISOString();

      // Add transaction record
      const newTransaction = {
        transactionId: transferId,
        date: new Date().toISOString().split('T')[0],
        type: 'debit',
        amount: -amount,
        description: `Transfer to ${toAccount} - ${description}`,
        category: 'transfer',
        balance: newBalance
      };

      if (!this.transactions[userId]) {
        this.transactions[userId] = [];
      }
      this.transactions[userId].unshift(newTransaction);

      return {
        success: true,
        data: {
          transferId,
          amount,
          toAccount,
          newBalance,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('Error processing money transfer', { userId, error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get card information for a user
   */
  async getCardInfo(userId) {
    try {
      logger.info('Fetching card information', { userId });
      
      const cards = this.cards[userId] || [];

      return {
        success: true,
        data: {
          cards,
          total: cards.length
        }
      };
    } catch (error) {
      logger.error('Error fetching card information', { userId, error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get loan information for a user
   */
  async getLoanInfo(userId) {
    try {
      logger.info('Fetching loan information', { userId });
      
      const loans = this.loans[userId] || [];

      return {
        success: true,
        data: {
          loans,
          total: loans.length
        }
      };
    } catch (error) {
      logger.error('Error fetching loan information', { userId, error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Block or unblock a card
   */
  async updateCardStatus(userId, cardId, action) {
    try {
      logger.info('Updating card status', { userId, cardId, action });
      
      const userCards = this.cards[userId];
      if (!userCards) {
        throw new Error('No cards found for user');
      }

      const card = userCards.find(c => c.cardId === cardId);
      if (!card) {
        throw new Error('Card not found');
      }

      const newStatus = action === 'block' ? 'blocked' : 'active';
      card.status = newStatus;

      return {
        success: true,
        data: {
          cardId,
          status: newStatus,
          message: `Card has been ${action}ed successfully`
        }
      };
    } catch (error) {
      logger.error('Error updating card status', { userId, cardId, action, error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process bill payment
   */
  async payBill(userId, billData) {
    try {
      logger.info('Processing bill payment', { userId, billData });
      
      const { billType, amount, accountNumber } = billData;
      const account = this.accounts[userId];
      
      if (!account) {
        throw new Error('Account not found');
      }

      if (amount <= 0) {
        throw new Error('Payment amount must be positive');
      }

      if (account.balance < amount) {
        throw new Error('Insufficient funds for bill payment');
      }

      // Simulate bill payment processing
      const paymentId = `PAY-${Date.now()}`;
      const newBalance = account.balance - amount;
      
      // Update account balance
      this.accounts[userId].balance = newBalance;
      this.accounts[userId].lastUpdated = new Date().toISOString();

      // Add transaction record
      const newTransaction = {
        transactionId: paymentId,
        date: new Date().toISOString().split('T')[0],
        type: 'debit',
        amount: -amount,
        description: `Bill Payment - ${billType} (${accountNumber})`,
        category: 'bill_payment',
        balance: newBalance
      };

      if (!this.transactions[userId]) {
        this.transactions[userId] = [];
      }
      this.transactions[userId].unshift(newTransaction);

      return {
        success: true,
        data: {
          paymentId,
          billType,
          amount,
          accountNumber,
          newBalance,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('Error processing bill payment', { userId, error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = PocBankingService;