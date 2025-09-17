/**
 * POC Banking Intent Service
 * 
 * Handles banking-specific intent detection and mapping for natural language
 * processing in the banking chatbot system.
 */

const logger = require('../utils/logger');

class PocBankingIntentService {
  constructor() {
    this.bankingIntents = this.initializeBankingIntents();
    this.entities = this.initializeEntities();
  }

  initializeBankingIntents() {
    return {
      'account.balance': {
        patterns: [
          'what is my balance',
          'check my balance',
          'show my account balance',
          'how much money do i have',
          'balance inquiry',
          'current balance',
          'account balance',
          'show balance',
          'check balance',
          'my balance',
          'what\'s my balance',
          'balance check'
        ],
        action: 'getAccountBalance',
        confidence: 0.9
      },
      'account.info': {
        patterns: [
          'show my account details',
          'account information',
          'account details',
          'my account info',
          'show account',
          'account summary',
          'account overview'
        ],
        action: 'getAccountInfo',
        confidence: 0.85
      },
      'transaction.history': {
        patterns: [
          'show my transactions',
          'transaction history',
          'recent transactions',
          'my transaction list',
          'show transaction history',
          'list transactions',
          'transaction details',
          'spending history',
          'payment history',
          'recent activity'
        ],
        action: 'getTransactionHistory',
        confidence: 0.88
      },
      'transfer.money': {
        patterns: [
          'transfer money',
          'send money',
          'make a transfer',
          'transfer funds',
          'move money',
          'send funds',
          'wire transfer',
          'bank transfer',
          'transfer to account',
          'send payment'
        ],
        action: 'transferMoney',
        confidence: 0.92
      },
      'card.info': {
        patterns: [
          'show my cards',
          'card details',
          'credit card info',
          'debit card info',
          'my cards',
          'card information',
          'list cards',
          'card status',
          'show cards'
        ],
        action: 'getCardInfo',
        confidence: 0.85
      },
      'card.block': {
        patterns: [
          'block my card',
          'freeze my card',
          'disable my card',
          'stop my card',
          'deactivate card',
          'block card',
          'freeze card',
          'card stolen',
          'lost card',
          'suspend card'
        ],
        action: 'blockCard',
        confidence: 0.95
      },
      'card.unblock': {
        patterns: [
          'unblock my card',
          'unfreeze my card',
          'enable my card',
          'activate my card',
          'reactivate card',
          'unblock card',
          'unfreeze card',
          'enable card'
        ],
        action: 'unblockCard',
        confidence: 0.95
      },
      'loan.info': {
        patterns: [
          'show my loans',
          'loan details',
          'loan information',
          'my loans',
          'loan status',
          'loan balance',
          'outstanding loans',
          'loan summary'
        ],
        action: 'getLoanInfo',
        confidence: 0.85
      },
      'bill.payment': {
        patterns: [
          'pay bill',
          'pay my bill',
          'make bill payment',
          'bill payment',
          'pay electricity bill',
          'pay water bill',
          'pay phone bill',
          'pay utility bill',
          'pay credit card bill'
        ],
        action: 'payBill',
        confidence: 0.90
      },
      'help.banking': {
        patterns: [
          'banking help',
          'what can you do',
          'banking services',
          'available services',
          'help with banking',
          'banking features',
          'what banking services',
          'banking options'
        ],
        action: 'showBankingHelp',
        confidence: 0.80
      }
    };
  }

  initializeEntities() {
    return {
      amounts: {
        patterns: [
          /\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/g,
          /(\d+)\s*dollars?/gi,
          /(\d+)\s*bucks?/gi
        ]
      },
      accountNumbers: {
        patterns: [
          /(?:account|acc)\s*(?:number|#|num)?\s*:?\s*(\d{4,})/gi,
          /(\d{4,16})/g
        ]
      },
      cardTypes: {
        patterns: [
          /(credit|debit|prepaid)\s*card/gi,
          /(visa|mastercard|amex|american\s*express)/gi
        ]
      },
      billTypes: {
        patterns: [
          /(electricity|electric|power|utility)\s*bill/gi,
          /(water|gas|phone|mobile|internet|cable)\s*bill/gi,
          /(credit\s*card|mortgage|loan)\s*payment/gi
        ]
      },
      timeframes: {
        patterns: [
          /(last|past)\s*(\d+)\s*(days?|weeks?|months?)/gi,
          /(today|yesterday|this\s*week|this\s*month)/gi,
          /(recent|latest)/gi
        ]
      }
    };
  }

  /**
   * Detect banking intent from user message
   */
  async detectBankingIntent(message) {
    try {
      logger.info('Detecting banking intent', { message });
      
      const normalizedMessage = message.toLowerCase().trim();
      let bestMatch = null;
      let highestConfidence = 0;

      // Check each banking intent
      for (const [intentName, intentData] of Object.entries(this.bankingIntents)) {
        for (const pattern of intentData.patterns) {
          if (this.matchesPattern(normalizedMessage, pattern)) {
            const confidence = this.calculateConfidence(normalizedMessage, pattern, intentData.confidence);
            
            if (confidence > highestConfidence) {
              highestConfidence = confidence;
              bestMatch = {
                intent: intentName,
                action: intentData.action,
                confidence: confidence,
                entities: this.extractEntities(message)
              };
            }
          }
        }
      }

      if (bestMatch && bestMatch.confidence > 0.6) {
        logger.info('Banking intent detected', { 
          intent: bestMatch.intent, 
          confidence: bestMatch.confidence 
        });
        return bestMatch;
      }

      logger.info('No banking intent detected', { message });
      return null;
    } catch (error) {
      logger.error('Error detecting banking intent', { message, error: error.message });
      return null;
    }
  }

  /**
   * Check if message matches a pattern
   */
  matchesPattern(message, pattern) {
    // Exact match
    if (message.includes(pattern)) {
      return true;
    }

    // Fuzzy matching for similar phrases
    const messageWords = message.split(/\s+/);
    const patternWords = pattern.split(/\s+/);
    
    let matchCount = 0;
    for (const patternWord of patternWords) {
      if (messageWords.some(word => word.includes(patternWord) || patternWord.includes(word))) {
        matchCount++;
      }
    }

    // Consider it a match if at least 60% of pattern words are found
    return (matchCount / patternWords.length) >= 0.6;
  }

  /**
   * Calculate confidence score for intent matching
   */
  calculateConfidence(message, pattern, baseConfidence) {
    const messageWords = message.split(/\s+/);
    const patternWords = pattern.split(/\s+/);
    
    // Exact match gets full confidence
    if (message.includes(pattern)) {
      return baseConfidence;
    }

    // Partial match gets reduced confidence
    let matchCount = 0;
    for (const patternWord of patternWords) {
      if (messageWords.some(word => word.includes(patternWord))) {
        matchCount++;
      }
    }

    const matchRatio = matchCount / patternWords.length;
    return baseConfidence * matchRatio;
  }

  /**
   * Extract entities from message
   */
  extractEntities(message) {
    const entities = {};

    for (const [entityType, entityData] of Object.entries(this.entities)) {
      const matches = [];
      
      for (const pattern of entityData.patterns) {
        const regexMatches = message.match(pattern);
        if (regexMatches) {
          matches.push(...regexMatches.filter(match => match));
        }
      }

      if (matches.length > 0) {
        entities[entityType] = [...new Set(matches)]; // Remove duplicates
      }
    }

    return entities;
  }

  /**
   * Get banking help information
   */
  getBankingHelp() {
    return {
      intent: 'help.banking',
      action: 'showBankingHelp',
      data: {
        services: [
          {
            category: 'Account Services',
            options: [
              'Check account balance',
              'View account information',
              'Account summary'
            ]
          },
          {
            category: 'Transaction Services',
            options: [
              'View transaction history',
              'Transfer money',
              'Send funds to another account'
            ]
          },
          {
            category: 'Card Services',
            options: [
              'View card details',
              'Block/unblock cards',
              'Check card status'
            ]
          },
          {
            category: 'Payment Services',
            options: [
              'Pay bills',
              'Utility payments',
              'Credit card payments'
            ]
          },
          {
            category: 'Loan Services',
            options: [
              'View loan information',
              'Check loan balance',
              'Loan payment details'
            ]
          }
        ],
        examples: [
          'What is my balance?',
          'Show my recent transactions',
          'Transfer $100 to account 12345',
          'Block my credit card',
          'Pay my electricity bill'
        ]
      }
    };
  }

  /**
   * Validate if message is banking-related
   */
  isBankingRelated(message) {
    const bankingKeywords = [
      'balance', 'account', 'transaction', 'transfer', 'money',
      'card', 'credit', 'debit', 'loan', 'payment', 'bill',
      'funds', 'deposit', 'withdrawal', 'banking', 'bank'
    ];

    const normalizedMessage = message.toLowerCase();
    return bankingKeywords.some(keyword => normalizedMessage.includes(keyword));
  }

  /**
   * Get intent examples for training
   */
  getIntentExamples() {
    const examples = {};
    
    for (const [intentName, intentData] of Object.entries(this.bankingIntents)) {
      examples[intentName] = {
        action: intentData.action,
        patterns: intentData.patterns.slice(0, 5), // First 5 patterns
        description: this.getIntentDescription(intentName)
      };
    }

    return examples;
  }

  /**
   * Get human-readable description for intent
   */
  getIntentDescription(intentName) {
    const descriptions = {
      'account.balance': 'Check account balance',
      'account.info': 'View account information',
      'transaction.history': 'View transaction history',
      'transfer.money': 'Transfer money between accounts',
      'card.info': 'View card details',
      'card.block': 'Block or freeze a card',
      'card.unblock': 'Unblock or activate a card',
      'loan.info': 'View loan information',
      'bill.payment': 'Pay bills and utilities',
      'help.banking': 'Get banking help and services information'
    };

    return descriptions[intentName] || 'Banking service';
  }
}

module.exports = PocBankingIntentService;