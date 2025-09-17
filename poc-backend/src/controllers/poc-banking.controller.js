/**
 * POC Banking Controller
 * 
 * Handles HTTP requests for banking operations and integrates with
 * banking services and intent detection.
 */

const PocBankingService = require('../services/poc-banking.service');
const PocBankingIntentService = require('../services/poc-banking-intent.service');
const logger = require('../utils/logger');

class PocBankingController {
  constructor() {
    this.bankingService = new PocBankingService();
    this.intentService = new PocBankingIntentService();
  }

  /**
   * Process banking chat message
   */
  async processBankingMessage(req, res) {
    try {
      const { message, userId = 'user123' } = req.body;
      
      if (!message) {
        return res.status(400).json({
          success: false,
          error: 'Message is required'
        });
      }

      logger.info('Processing banking message', { userId, message });

      // Detect banking intent
      const intentResult = await this.intentService.detectBankingIntent(message);
      
      if (!intentResult) {
        return res.json({
          success: true,
          data: {
            response: "I didn't understand your banking request. You can ask me about account balance, transactions, transfers, cards, loans, or bill payments. Type 'banking help' for more options.",
            intent: null,
            suggestions: [
              'What is my balance?',
              'Show my transactions',
              'Transfer money',
              'Block my card',
              'Banking help'
            ]
          }
        });
      }

      // Process the detected intent
      const response = await this.executeIntent(intentResult, userId, req.body);
      
      return res.json({
        success: true,
        data: {
          response: response.message,
          intent: intentResult.intent,
          action: intentResult.action,
          data: response.data,
          confidence: intentResult.confidence
        }
      });

    } catch (error) {
      logger.error('Error processing banking message', { error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Execute detected banking intent
   */
  async executeIntent(intentResult, userId, requestData) {
    const { action, entities } = intentResult;

    switch (action) {
      case 'getAccountBalance':
        return await this.handleGetAccountBalance(userId);
      
      case 'getAccountInfo':
        return await this.handleGetAccountInfo(userId);
      
      case 'getTransactionHistory':
        return await this.handleGetTransactionHistory(userId, entities);
      
      case 'transferMoney':
        return await this.handleTransferMoney(userId, entities, requestData);
      
      case 'getCardInfo':
        return await this.handleGetCardInfo(userId);
      
      case 'blockCard':
        return await this.handleBlockCard(userId, entities, requestData);
      
      case 'unblockCard':
        return await this.handleUnblockCard(userId, entities, requestData);
      
      case 'getLoanInfo':
        return await this.handleGetLoanInfo(userId);
      
      case 'payBill':
        return await this.handlePayBill(userId, entities, requestData);
      
      case 'showBankingHelp':
        return await this.handleShowBankingHelp();
      
      default:
        return {
          message: 'Sorry, I cannot process that banking request at the moment.',
          data: null
        };
    }
  }

  /**
   * Handle account balance request
   */
  async handleGetAccountBalance(userId) {
    const result = await this.bankingService.getAccountBalance(userId);
    
    if (result.success) {
      const { accountType, balance, currency } = result.data;
      return {
        message: `Your ${accountType} account balance is ${currency} ${balance.toLocaleString()}.`,
        data: result.data
      };
    } else {
      return {
        message: 'Sorry, I could not retrieve your account balance at the moment.',
        data: null
      };
    }
  }

  /**
   * Handle account information request
   */
  async handleGetAccountInfo(userId) {
    const result = await this.bankingService.getAccountInfo(userId);
    
    if (result.success) {
      const { accountNumber, accountType, balance, currency, status } = result.data;
      return {
        message: `Account Information:\n- Account: ${accountNumber}\n- Type: ${accountType}\n- Balance: ${currency} ${balance.toLocaleString()}\n- Status: ${status}`,
        data: result.data
      };
    } else {
      return {
        message: 'Sorry, I could not retrieve your account information at the moment.',
        data: null
      };
    }
  }

  /**
   * Handle transaction history request
   */
  async handleGetTransactionHistory(userId, entities) {
    const limit = entities?.amounts?.[0] ? parseInt(entities.amounts[0]) : 10;
    const result = await this.bankingService.getTransactionHistory(userId, Math.min(limit, 20));
    
    if (result.success) {
      const { transactions, total } = result.data;
      
      if (transactions.length === 0) {
        return {
          message: 'No transactions found.',
          data: result.data
        };
      }

      let message = `Here are your recent transactions:\n\n`;
      transactions.forEach((txn, index) => {
        const sign = txn.amount >= 0 ? '+' : '';
        message += `${index + 1}. ${txn.date}: ${sign}$${Math.abs(txn.amount)} - ${txn.description}\n`;
      });
      
      if (total > transactions.length) {
        message += `\nShowing ${transactions.length} of ${total} transactions.`;
      }

      return {
        message,
        data: result.data
      };
    } else {
      return {
        message: 'Sorry, I could not retrieve your transaction history at the moment.',
        data: null
      };
    }
  }

  /**
   * Handle money transfer request
   */
  async handleTransferMoney(userId, entities, requestData) {
    const { transferTo, amount, description } = requestData;
    
    if (!transferTo || !amount) {
      return {
        message: 'To transfer money, I need the recipient account and amount. Please provide both details.',
        data: {
          required: ['transferTo', 'amount'],
          example: 'Transfer $100 to account 12345'
        }
      };
    }

    const transferData = {
      toAccount: transferTo,
      amount: parseFloat(amount),
      description: description || 'Money transfer'
    };

    const result = await this.bankingService.transferMoney(userId, transferData);
    
    if (result.success) {
      const { transferId, amount, toAccount, newBalance } = result.data;
      return {
        message: `Transfer successful! $${amount} has been sent to account ${toAccount}. Your new balance is $${newBalance.toLocaleString()}. Transfer ID: ${transferId}`,
        data: result.data
      };
    } else {
      return {
        message: `Transfer failed: ${result.error}`,
        data: null
      };
    }
  }

  /**
   * Handle card information request
   */
  async handleGetCardInfo(userId) {
    const result = await this.bankingService.getCardInfo(userId);
    
    if (result.success) {
      const { cards } = result.data;
      
      if (cards.length === 0) {
        return {
          message: 'No cards found on your account.',
          data: result.data
        };
      }

      let message = 'Here are your cards:\n\n';
      cards.forEach((card, index) => {
        message += `${index + 1}. ${card.cardType} Card ${card.cardNumber} - Status: ${card.status}\n`;
        if (card.cardType === 'Credit') {
          message += `   Credit Limit: $${card.creditLimit.toLocaleString()}, Balance: $${card.currentBalance.toLocaleString()}\n`;
        } else {
          message += `   Daily Limit: $${card.dailyLimit.toLocaleString()}, Used Today: $${card.usedToday.toLocaleString()}\n`;
        }
      });

      return {
        message,
        data: result.data
      };
    } else {
      return {
        message: 'Sorry, I could not retrieve your card information at the moment.',
        data: null
      };
    }
  }

  /**
   * Handle card blocking request
   */
  async handleBlockCard(userId, entities, requestData) {
    const { cardId } = requestData;
    
    if (!cardId) {
      return {
        message: 'Please specify which card you want to block by providing the card ID.',
        data: null
      };
    }

    const result = await this.bankingService.updateCardStatus(userId, cardId, 'block');
    
    if (result.success) {
      return {
        message: `Your card ${cardId} has been blocked successfully. If this was due to theft or loss, please contact customer service.`,
        data: result.data
      };
    } else {
      return {
        message: `Could not block the card: ${result.error}`,
        data: null
      };
    }
  }

  /**
   * Handle card unblocking request
   */
  async handleUnblockCard(userId, entities, requestData) {
    const { cardId } = requestData;
    
    if (!cardId) {
      return {
        message: 'Please specify which card you want to unblock by providing the card ID.',
        data: null
      };
    }

    const result = await this.bankingService.updateCardStatus(userId, cardId, 'unblock');
    
    if (result.success) {
      return {
        message: `Your card ${cardId} has been unblocked successfully and is now active.`,
        data: result.data
      };
    } else {
      return {
        message: `Could not unblock the card: ${result.error}`,
        data: null
      };
    }
  }

  /**
   * Handle loan information request
   */
  async handleGetLoanInfo(userId) {
    const result = await this.bankingService.getLoanInfo(userId);
    
    if (result.success) {
      const { loans } = result.data;
      
      if (loans.length === 0) {
        return {
          message: 'You have no active loans.',
          data: result.data
        };
      }

      let message = 'Here are your loans:\n\n';
      loans.forEach((loan, index) => {
        message += `${index + 1}. ${loan.loanType}\n`;
        message += `   Remaining Balance: $${loan.remainingBalance.toLocaleString()}\n`;
        message += `   Monthly Payment: $${loan.monthlyPayment.toLocaleString()}\n`;
        message += `   Next Payment: ${loan.nextPaymentDate}\n`;
        message += `   Status: ${loan.status}\n\n`;
      });

      return {
        message,
        data: result.data
      };
    } else {
      return {
        message: 'Sorry, I could not retrieve your loan information at the moment.',
        data: null
      };
    }
  }

  /**
   * Handle bill payment request
   */
  async handlePayBill(userId, entities, requestData) {
    const { billType, amount, accountNumber } = requestData;
    
    if (!billType || !amount) {
      return {
        message: 'To pay a bill, I need the bill type and amount. Please provide both details.',
        data: {
          required: ['billType', 'amount'],
          example: 'Pay electricity bill $150'
        }
      };
    }

    const billData = {
      billType,
      amount: parseFloat(amount),
      accountNumber: accountNumber || 'N/A'
    };

    const result = await this.bankingService.payBill(userId, billData);
    
    if (result.success) {
      const { paymentId, billType, amount, newBalance } = result.data;
      return {
        message: `Bill payment successful! $${amount} has been paid for your ${billType}. Your new balance is $${newBalance.toLocaleString()}. Payment ID: ${paymentId}`,
        data: result.data
      };
    } else {
      return {
        message: `Bill payment failed: ${result.error}`,
        data: null
      };
    }
  }

  /**
   * Handle banking help request
   */
  async handleShowBankingHelp() {
    const helpInfo = this.intentService.getBankingHelp();
    
    let message = "🏦 Banking Services Available:\n\n";
    
    helpInfo.data.services.forEach(service => {
      message += `📋 ${service.category}:\n`;
      service.options.forEach(option => {
        message += `   • ${option}\n`;
      });
      message += '\n';
    });

    message += "💡 Example commands:\n";
    helpInfo.data.examples.forEach(example => {
      message += `   • "${example}"\n`;
    });

    return {
      message,
      data: helpInfo.data
    };
  }

  /**
   * Get account balance endpoint
   */
  async getAccountBalance(req, res) {
    try {
      const userId = req.params.userId || req.user?.id || 'user123';
      const result = await this.bankingService.getAccountBalance(userId);
      
      return res.json(result);
    } catch (error) {
      logger.error('Error in getAccountBalance endpoint', { error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get transaction history endpoint
   */
  async getTransactionHistory(req, res) {
    try {
      const userId = req.params.userId || req.user?.id || 'user123';
      const limit = parseInt(req.query.limit) || 10;
      
      const result = await this.bankingService.getTransactionHistory(userId, limit);
      
      return res.json(result);
    } catch (error) {
      logger.error('Error in getTransactionHistory endpoint', { error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Transfer money endpoint
   */
  async transferMoney(req, res) {
    try {
      const userId = req.params.userId || req.user?.id || 'user123';
      const transferData = req.body;
      
      const result = await this.bankingService.transferMoney(userId, transferData);
      
      return res.json(result);
    } catch (error) {
      logger.error('Error in transferMoney endpoint', { error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get banking help endpoint
   */
  async getBankingHelp(req, res) {
    try {
      const helpInfo = this.intentService.getBankingHelp();
      
      return res.json({
        success: true,
        data: helpInfo
      });
    } catch (error) {
      logger.error('Error in getBankingHelp endpoint', { error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
}

module.exports = PocBankingController;