/**
 * Chat Service
 * Handles chat business logic and response generation
 */

const logger = require('../utils/logger');
const PocBankingIntentService = require('./poc-banking-intent.service');
const PocBankingService = require('./poc-banking.service');

class ChatService {
  constructor() {
    this.conversations = new Map(); // In-memory storage for demo
    this.responses = this._initializeResponses();
    this.bankingIntentService = new PocBankingIntentService();
    this.bankingService = new PocBankingService();
  }

  /**
   * Generate response based on intent and context
   */
  async generateResponse(intent, context = {}, sessionId) {
    try {
      logger.debug('Generating response', {
        intent: intent.intent,
        confidence: intent.confidence,
        sessionId,
        hasContext: Object.keys(context).length > 0
      });

      // Get or create conversation session
      const conversation = this._getOrCreateConversation(sessionId);
      
      // Add user message to conversation history
      conversation.messages.push({
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'user',
        intent: intent.intent,
        confidence: intent.confidence,
        timestamp: new Date().toISOString(),
        context
      });

      // Generate response based on intent
      const response = this._generateResponseByIntent(intent, context, conversation);
      
      // Add bot response to conversation history
      conversation.messages.push({
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'bot',
        message: response.message,
        responseType: response.type,
        timestamp: new Date().toISOString()
      });

      // Update conversation metadata
      conversation.lastActivity = new Date().toISOString();
      conversation.messageCount = conversation.messages.length;

      logger.debug('Response generated successfully', {
        intent: intent.intent,
        responseType: response.type,
        sessionId,
        messageCount: conversation.messageCount
      });

      return response;

    } catch (error) {
      logger.error('Error generating response', {
        error: error.message,
        stack: error.stack,
        intent: intent?.intent,
        sessionId
      });
      
      throw new Error(`Response generation failed: ${error.message}`);
    }
  }

  /**
   * Process banking chat message with enhanced banking capabilities
   */
  async processBankingChat(message, userId = 'user123', sessionId) {
    try {
      logger.info('Processing banking chat message', { userId, message, sessionId });

      // Check if message is banking-related
      const isBankingRelated = this.bankingIntentService.isBankingRelated(message);
      
      if (!isBankingRelated) {
        // Fall back to regular chat processing
        return {
          success: true,
          data: {
            response: "I can help you with banking services like checking your balance, viewing transactions, transferring money, managing cards, and paying bills. What would you like to do?",
            intent: null,
            isBankingRelated: false,
            suggestions: [
              'Check my balance',
              'Show transactions',
              'Transfer money',
              'Card information',
              'Banking help'
            ]
          }
        };
      }

      // Detect banking intent
      const intentResult = await this.bankingIntentService.detectBankingIntent(message);
      
      if (!intentResult) {
        return {
          success: true,
          data: {
            response: "I understand you're asking about banking, but I'm not sure exactly what you need. You can ask me about account balance, transactions, transfers, cards, loans, or bill payments. Type 'banking help' for more options.",
            intent: null,
            isBankingRelated: true,
            suggestions: [
              'What is my balance?',
              'Show my transactions',
              'Transfer money',
              'Block my card',
              'Banking help'
            ]
          }
        };
      }

      // Execute banking action
      const bankingResponse = await this._executeBankingIntent(intentResult, userId, message);
      
      // Update conversation history
      const conversation = this._getOrCreateConversation(sessionId);
      conversation.messages.push(
        {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'user',
          message,
          intent: intentResult.intent,
          confidence: intentResult.confidence,
          timestamp: new Date().toISOString(),
          userId
        },
        {
          id: `msg_${Date.now() + 1}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'bot',
          message: bankingResponse.response,
          intent: intentResult.intent,
          action: intentResult.action,
          timestamp: new Date().toISOString(),
          data: bankingResponse.data
        }
      );

      conversation.lastActivity = new Date().toISOString();
      conversation.messageCount = conversation.messages.length;

      return {
        success: true,
        data: {
          response: bankingResponse.response,
          intent: intentResult.intent,
          action: intentResult.action,
          confidence: intentResult.confidence,
          data: bankingResponse.data,
          isBankingRelated: true
        }
      };

    } catch (error) {
      logger.error('Error processing banking chat', { userId, message, error: error.message });
      return {
        success: false,
        error: 'Failed to process banking request'
      };
    }
  }

  /**
   * Get chat history for a session
   */
  async getChatHistory(sessionId, offset = 0, limit = 10) {
    try {
      logger.debug('Retrieving chat history', {
        sessionId,
        offset,
        limit
      });

      const conversation = this.conversations.get(sessionId);
      
      if (!conversation) {
        return {
          messages: [],
          total: 0
        };
      }

      const messages = conversation.messages
        .slice(offset, offset + limit)
        .map(msg => ({
          id: msg.id,
          type: msg.type,
          message: msg.message,
          intent: msg.intent,
          confidence: msg.confidence,
          timestamp: msg.timestamp,
          responseType: msg.responseType
        }));

      return {
        messages,
        total: conversation.messages.length
      };

    } catch (error) {
      logger.error('Error retrieving chat history', {
        error: error.message,
        stack: error.stack,
        sessionId
      });
      
      throw new Error(`History retrieval failed: ${error.message}`);
    }
  }

  /**
   * Reset conversation for a session
   */
  async resetConversation(sessionId) {
    try {
      logger.debug('Resetting conversation', { sessionId });

      const conversation = this.conversations.get(sessionId);
      const previousMessageCount = conversation ? conversation.messages.length : 0;

      // Reset or create new conversation
      this.conversations.set(sessionId, {
        sessionId,
        messages: [],
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        messageCount: 0,
        resetCount: conversation ? (conversation.resetCount || 0) + 1 : 1
      });

      return {
        resetAt: new Date().toISOString(),
        previousMessageCount
      };

    } catch (error) {
      logger.error('Error resetting conversation', {
        error: error.message,
        stack: error.stack,
        sessionId
      });
      
      throw new Error(`Conversation reset failed: ${error.message}`);
    }
  }

  /**
   * Get or create conversation session
   * @private
   */
  _getOrCreateConversation(sessionId) {
    if (!this.conversations.has(sessionId)) {
      this.conversations.set(sessionId, {
        sessionId,
        messages: [],
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        messageCount: 0,
        resetCount: 0
      });
    }
    
    return this.conversations.get(sessionId);
  }

  /**
   * Generate response based on detected intent
   * @private
   */
  _generateResponseByIntent(intent, context, conversation) {
    const intentName = intent.intent;
    const responses = this.responses[intentName] || this.responses.default;
    
    // Select response template
    const template = responses[Math.floor(Math.random() * responses.length)];
    
    // Replace placeholders with context data
    let message = template.message;
    if (context && Object.keys(context).length > 0) {
      message = this._replacePlaceholders(message, context);
    }

    // Add conversational context
    if (conversation.messages.length > 0) {
      const recentMessages = conversation.messages.slice(-3);
      const hasRecentGreeting = recentMessages.some(msg => 
        msg.intent === 'greeting' && Date.now() - new Date(msg.timestamp).getTime() < 30000
      );
      
      if (intentName === 'greeting' && hasRecentGreeting) {
        message = "I'm still here to help! What can I do for you?";
      }
    }

    return {
      message,
      type: template.type || 'text',
      intent: intentName,
      confidence: intent.confidence
    };
  }

  /**
   * Replace placeholders in response templates
   * @private
   */
  _replacePlaceholders(message, context) {
    let result = message;
    
    // Replace common placeholders
    Object.keys(context).forEach(key => {
      const placeholder = `{${key}}`;
      if (result.includes(placeholder)) {
        result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), context[key]);
      }
    });

    return result;
  }

  /**
   * Initialize response templates
   * @private
   */
  _initializeResponses() {
    return {
      greeting: [
        { message: "Hello! How can I help you today?", type: "text" },
        { message: "Hi there! What can I do for you?", type: "text" },
        { message: "Welcome! I'm here to assist you.", type: "text" }
      ],
      farewell: [
        { message: "Goodbye! Have a great day!", type: "text" },
        { message: "Thank you for chatting with me. Take care!", type: "text" },
        { message: "See you later! Feel free to come back anytime.", type: "text" }
      ],
      account_inquiry: [
        { message: "I can help you with account information. What specific details do you need?", type: "text" },
        { message: "Let me assist you with your account. What would you like to know?", type: "text" }
      ],
      balance_inquiry: [
        { message: "I can help you check your account balance. Please provide your account details.", type: "text" },
        { message: "To check your balance, I'll need to verify your account information first.", type: "text" }
      ],
      transfer_request: [
        { message: "I can help you with money transfers. What type of transfer would you like to make?", type: "text" },
        { message: "To process a transfer, I'll need some information from you. What are the transfer details?", type: "text" }
      ],
      payment_inquiry: [
        { message: "I can assist with payment-related questions. What do you need help with?", type: "text" },
        { message: "Let me help you with your payment inquiry. Please provide more details.", type: "text" }
      ],
      help_request: [
        { message: "I'm here to help! I can assist with account inquiries, transfers, payments, and general banking questions. What do you need?", type: "text" },
        { message: "How can I assist you today? I can help with various banking services and questions.", type: "text" }
      ],
      technical_support: [
        { message: "I can help with technical issues. Please describe the problem you're experiencing.", type: "text" },
        { message: "Let me assist you with technical support. What issue are you having?", type: "text" }
      ],
      complaint: [
        { message: "I understand your concern and I'm here to help resolve it. Please tell me more about the issue.", type: "text" },
        { message: "I apologize for any inconvenience. Let me help you address this matter.", type: "text" }
      ],
      general_inquiry: [
        { message: "I'm here to help! Could you please provide more details about what you're looking for?", type: "text" },
        { message: "I'd be happy to assist you. Can you tell me more about what you need?", type: "text" }
      ],
      default: [
        { message: "I'm not sure I understand. Could you please rephrase your question?", type: "text" },
        { message: "I didn't quite catch that. Can you provide more details about what you need?", type: "text" },
        { message: "I'm here to help! Please let me know how I can assist you.", type: "text" }
      ]
    };
  }

  /**
   * Execute banking intent and return response
   * @private
   */
  async _executeBankingIntent(intentResult, userId, originalMessage) {
    const { action, entities } = intentResult;

    try {
      switch (action) {
        case 'getAccountBalance':
          const balanceResult = await this.bankingService.getAccountBalance(userId);
          if (balanceResult.success) {
            const { accountType, balance, currency } = balanceResult.data;
            return {
              response: `Your ${accountType} account balance is ${currency} ${balance.toLocaleString()}.`,
              data: balanceResult.data
            };
          } else {
            return {
              response: 'Sorry, I could not retrieve your account balance at the moment.',
              data: null
            };
          }

        case 'getAccountInfo':
          const accountResult = await this.bankingService.getAccountInfo(userId);
          if (accountResult.success) {
            const { accountNumber, accountType, balance, currency, status } = accountResult.data;
            return {
              response: `Account Information:\n- Account: ${accountNumber}\n- Type: ${accountType}\n- Balance: ${currency} ${balance.toLocaleString()}\n- Status: ${status}`,
              data: accountResult.data
            };
          } else {
            return {
              response: 'Sorry, I could not retrieve your account information at the moment.',
              data: null
            };
          }

        case 'getTransactionHistory':
          const limit = entities?.amounts?.[0] ? parseInt(entities.amounts[0]) : 5;
          const transactionResult = await this.bankingService.getTransactionHistory(userId, Math.min(limit, 10));
          if (transactionResult.success) {
            const { transactions } = transactionResult.data;
            if (transactions.length === 0) {
              return {
                response: 'No transactions found.',
                data: transactionResult.data
              };
            }

            let response = `Here are your recent transactions:\n\n`;
            transactions.forEach((txn, index) => {
              const sign = txn.amount >= 0 ? '+' : '';
              response += `${index + 1}. ${txn.date}: ${sign}$${Math.abs(txn.amount)} - ${txn.description}\n`;
            });

            return {
              response,
              data: transactionResult.data
            };
          } else {
            return {
              response: 'Sorry, I could not retrieve your transaction history at the moment.',
              data: null
            };
          }

        case 'getCardInfo':
          const cardResult = await this.bankingService.getCardInfo(userId);
          if (cardResult.success) {
            const { cards } = cardResult.data;
            if (cards.length === 0) {
              return {
                response: 'No cards found on your account.',
                data: cardResult.data
              };
            }

            let response = 'Here are your cards:\n\n';
            cards.forEach((card, index) => {
              response += `${index + 1}. ${card.cardType} Card ${card.cardNumber} - Status: ${card.status}\n`;
            });

            return {
              response,
              data: cardResult.data
            };
          } else {
            return {
              response: 'Sorry, I could not retrieve your card information at the moment.',
              data: null
            };
          }

        case 'getLoanInfo':
          const loanResult = await this.bankingService.getLoanInfo(userId);
          if (loanResult.success) {
            const { loans } = loanResult.data;
            if (loans.length === 0) {
              return {
                response: 'You have no active loans.',
                data: loanResult.data
              };
            }

            let response = 'Here are your loans:\n\n';
            loans.forEach((loan, index) => {
              response += `${index + 1}. ${loan.loanType}\n`;
              response += `   Remaining Balance: $${loan.remainingBalance.toLocaleString()}\n`;
              response += `   Monthly Payment: $${loan.monthlyPayment.toLocaleString()}\n`;
              response += `   Next Payment: ${loan.nextPaymentDate}\n\n`;
            });

            return {
              response,
              data: loanResult.data
            };
          } else {
            return {
              response: 'Sorry, I could not retrieve your loan information at the moment.',
              data: null
            };
          }

        case 'showBankingHelp':
          const helpInfo = this.bankingIntentService.getBankingHelp();
          let response = "🏦 Banking Services Available:\n\n";
          
          helpInfo.data.services.forEach(service => {
            response += `📋 ${service.category}:\n`;
            service.options.forEach(option => {
              response += `   • ${option}\n`;
            });
            response += '\n';
          });

          response += "💡 Example commands:\n";
          helpInfo.data.examples.forEach(example => {
            response += `   • "${example}"\n`;
          });

          return {
            response,
            data: helpInfo.data
          };

        case 'transferMoney':
        case 'blockCard':
        case 'unblockCard':
        case 'payBill':
          return {
            response: `To ${action.replace(/([A-Z])/g, ' $1').toLowerCase()}, I need additional information. Please use the specific banking features or provide more details about your request.`,
            data: {
              action,
              message: 'Additional information required',
              suggestion: 'Please provide specific details for this transaction'
            }
          };

        default:
          return {
            response: 'I understand you need banking assistance, but I\'m not sure how to help with that specific request. Please try rephrasing or ask for banking help.',
            data: null
          };
      }
    } catch (error) {
      logger.error('Error executing banking intent', { action, userId, error: error.message });
      return {
        response: 'Sorry, there was an error processing your banking request. Please try again.',
        data: null
      };
    }
  }

  /**
   * Get conversation statistics
   */
  async getConversationStats() {
    try {
      const stats = {
        totalSessions: this.conversations.size,
        totalMessages: 0,
        activeSessions: 0,
        averageMessagesPerSession: 0
      };

      const now = Date.now();
      const activeThreshold = 30 * 60 * 1000; // 30 minutes

      for (const conversation of this.conversations.values()) {
        stats.totalMessages += conversation.messageCount;
        
        if (now - new Date(conversation.lastActivity).getTime() < activeThreshold) {
          stats.activeSessions++;
        }
      }

      stats.averageMessagesPerSession = stats.totalSessions > 0 
        ? Math.round(stats.totalMessages / stats.totalSessions * 100) / 100 
        : 0;

      return stats;

    } catch (error) {
      logger.error('Error getting conversation stats', {
        error: error.message,
        stack: error.stack
      });
      
      throw new Error(`Stats retrieval failed: ${error.message}`);
    }
  }
}

module.exports = new ChatService();