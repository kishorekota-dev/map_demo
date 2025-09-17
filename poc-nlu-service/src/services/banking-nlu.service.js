/**
 * Banking-specific NLU Service
 * Handles banking domain intent detection and entity extraction
 */

const logger = require('../utils/logger');
const config = require('../config/config');

class BankingNLUService {
  constructor() {
    this.bankingIntents = this.initializeBankingIntents();
    this.bankingKeywords = this.initializeBankingKeywords();
    this.bankingEntities = this.initializeBankingEntities();
  }

  initializeBankingIntents() {
    return {
      'banking.balance.check': {
        patterns: [
          'check balance', 'what is my balance', 'show balance', 'account balance',
          'how much money', 'current balance', 'balance inquiry', 'my balance'
        ],
        confidence: 0.95,
        entities: ['account_type']
      },
      'banking.transaction.history': {
        patterns: [
          'transaction history', 'show transactions', 'recent transactions',
          'payment history', 'spending history', 'transaction list', 'my transactions'
        ],
        confidence: 0.90,
        entities: ['time_period', 'account_type']
      },
      'banking.transfer.money': {
        patterns: [
          'transfer money', 'send money', 'move money', 'wire transfer',
          'make transfer', 'send funds', 'transfer funds', 'pay someone'
        ],
        confidence: 0.92,
        entities: ['amount', 'recipient', 'account_number']
      },
      'banking.card.info': {
        patterns: [
          'card details', 'show cards', 'my cards', 'credit card info',
          'debit card info', 'card information', 'card status'
        ],
        confidence: 0.88,
        entities: ['card_type']
      },
      'banking.card.block': {
        patterns: [
          'block card', 'freeze card', 'disable card', 'stop card',
          'card stolen', 'lost card', 'deactivate card', 'suspend card'
        ],
        confidence: 0.95,
        entities: ['card_number', 'card_type']
      },
      'banking.card.unblock': {
        patterns: [
          'unblock card', 'unfreeze card', 'enable card', 'activate card',
          'reactivate card', 'restore card', 'unsuspend card'
        ],
        confidence: 0.95,
        entities: ['card_number', 'card_type']
      },
      'banking.loan.info': {
        patterns: [
          'loan details', 'my loans', 'loan information', 'loan status',
          'loan balance', 'outstanding loans', 'loan payment'
        ],
        confidence: 0.88,
        entities: ['loan_type']
      },
      'banking.bill.payment': {
        patterns: [
          'pay bill', 'bill payment', 'pay electricity', 'pay water bill',
          'utility payment', 'pay phone bill', 'pay credit card'
        ],
        confidence: 0.90,
        entities: ['bill_type', 'amount', 'account_number']
      },
      'banking.account.info': {
        patterns: [
          'account details', 'account information', 'show account',
          'account summary', 'account overview', 'my account'
        ],
        confidence: 0.85,
        entities: ['account_type']
      },
      'banking.help': {
        patterns: [
          'banking help', 'what can you do', 'banking services',
          'available services', 'banking options', 'help with banking'
        ],
        confidence: 0.80,
        entities: []
      }
    };
  }

  initializeBankingKeywords() {
    return [
      'balance', 'account', 'transaction', 'transfer', 'money', 'payment',
      'card', 'credit', 'debit', 'loan', 'bill', 'bank', 'banking',
      'funds', 'deposit', 'withdrawal', 'check', 'savings', 'checking'
    ];
  }

  initializeBankingEntities() {
    return {
      amount: {
        patterns: [
          /\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/g,
          /(\d+)\s*dollars?/gi,
          /(\d+)\s*bucks?/gi
        ]
      },
      account_number: {
        patterns: [
          /(?:account|acc)\s*(?:number|#|num)?\s*:?\s*(\d{4,})/gi,
          /(\d{4,16})/g
        ]
      },
      card_type: {
        patterns: [
          /(credit|debit|prepaid)\s*card/gi,
          /(visa|mastercard|amex|american\s*express)/gi
        ]
      },
      account_type: {
        patterns: [
          /(checking|savings|current)\s*account/gi,
          /(checking|savings|current)/gi
        ]
      },
      bill_type: {
        patterns: [
          /(electricity|electric|power|utility)\s*bill/gi,
          /(water|gas|phone|mobile|internet|cable)\s*bill/gi,
          /(credit\s*card|mortgage|loan)\s*payment/gi
        ]
      },
      time_period: {
        patterns: [
          /(last|past)\s*(\d+)\s*(days?|weeks?|months?)/gi,
          /(today|yesterday|this\s*week|this\s*month)/gi,
          /(recent|latest)/gi
        ]
      },
      loan_type: {
        patterns: [
          /(personal|home|auto|student|business)\s*loan/gi,
          /(mortgage|car\s*loan)/gi
        ]
      }
    };
  }

  /**
   * Check if message is banking-related
   */
  isBankingRelated(message) {
    const normalizedMessage = message.toLowerCase();
    return this.bankingKeywords.some(keyword => 
      normalizedMessage.includes(keyword)
    );
  }

  /**
   * Detect banking-specific intent
   */
  async detectBankingIntent(message) {
    try {
      if (!this.isBankingRelated(message)) {
        return null;
      }

      const normalizedMessage = message.toLowerCase().trim();
      let bestMatch = null;
      let highestConfidence = 0;

      // Check each banking intent
      for (const [intentName, intentData] of Object.entries(this.bankingIntents)) {
        for (const pattern of intentData.patterns) {
          if (this.matchesPattern(normalizedMessage, pattern)) {
            const confidence = this.calculateConfidence(normalizedMessage, pattern, intentData.confidence);
            
            if (confidence > highestConfidence && confidence > config.nlu.confidenceThreshold) {
              highestConfidence = confidence;
              bestMatch = {
                intent: intentName,
                confidence: confidence,
                entities: this.extractBankingEntities(message, intentData.entities),
                domain: 'banking',
                source: 'banking-nlu'
              };
            }
          }
        }
      }

      if (bestMatch) {
        logger.debug('Banking intent detected', {
          intent: bestMatch.intent,
          confidence: bestMatch.confidence
        });
      }

      return bestMatch;

    } catch (error) {
      logger.error('Error detecting banking intent', {
        message,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Extract banking-specific entities
   */
  extractBankingEntities(message, expectedEntities = []) {
    const entities = [];

    for (const [entityType, entityData] of Object.entries(this.bankingEntities)) {
      // Only extract expected entities if specified
      if (expectedEntities.length > 0 && !expectedEntities.includes(entityType)) {
        continue;
      }

      for (const pattern of entityData.patterns) {
        const matches = [...message.matchAll(pattern)];
        
        for (const match of matches) {
          entities.push({
            entity: entityType,
            value: match[1] || match[0],
            source: match[0],
            startIndex: match.index,
            endIndex: match.index + match[0].length
          });
        }
      }
    }

    // Remove duplicates and sort by position
    const uniqueEntities = entities
      .filter((entity, index, self) => 
        index === self.findIndex(e => 
          e.entity === entity.entity && e.value === entity.value
        )
      )
      .sort((a, b) => a.startIndex - b.startIndex);

    return uniqueEntities;
  }

  /**
   * Check if message matches a pattern
   */
  matchesPattern(message, pattern) {
    // Exact substring match
    if (message.includes(pattern)) {
      return true;
    }

    // Fuzzy word matching
    const messageWords = message.split(/\s+/);
    const patternWords = pattern.split(/\s+/);
    
    let matchCount = 0;
    for (const patternWord of patternWords) {
      if (messageWords.some(word => 
        word.includes(patternWord) || patternWord.includes(word)
      )) {
        matchCount++;
      }
    }

    // Require at least 70% word match
    return (matchCount / patternWords.length) >= 0.7;
  }

  /**
   * Calculate confidence score
   */
  calculateConfidence(message, pattern, baseConfidence) {
    // Exact match gets full confidence
    if (message.includes(pattern)) {
      return baseConfidence;
    }

    // Partial match gets reduced confidence
    const messageWords = message.split(/\s+/);
    const patternWords = pattern.split(/\s+/);
    
    let matchCount = 0;
    let exactMatches = 0;

    for (const patternWord of patternWords) {
      for (const messageWord of messageWords) {
        if (messageWord === patternWord) {
          exactMatches++;
          matchCount++;
          break;
        } else if (messageWord.includes(patternWord) || patternWord.includes(messageWord)) {
          matchCount++;
          break;
        }
      }
    }

    const matchRatio = matchCount / patternWords.length;
    const exactRatio = exactMatches / patternWords.length;
    
    // Boost confidence for exact word matches
    const confidenceMultiplier = 0.6 + (exactRatio * 0.4);
    
    return baseConfidence * matchRatio * confidenceMultiplier;
  }

  /**
   * Get available banking intents
   */
  getAvailableIntents() {
    return Object.keys(this.bankingIntents);
  }

  /**
   * Get banking entity types
   */
  getBankingEntityTypes() {
    return Object.keys(this.bankingEntities);
  }

  /**
   * Get intent examples for training
   */
  getIntentExamples() {
    const examples = {};
    
    for (const [intentName, intentData] of Object.entries(this.bankingIntents)) {
      examples[intentName] = {
        patterns: intentData.patterns.slice(0, 3), // First 3 patterns
        entities: intentData.entities,
        confidence: intentData.confidence,
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
      'banking.balance.check': 'Check account balance',
      'banking.transaction.history': 'View transaction history',
      'banking.transfer.money': 'Transfer money between accounts',
      'banking.card.info': 'View card information',
      'banking.card.block': 'Block or freeze a card',
      'banking.card.unblock': 'Unblock or activate a card',
      'banking.loan.info': 'View loan information',
      'banking.bill.payment': 'Pay bills and utilities',
      'banking.account.info': 'View account details',
      'banking.help': 'Get banking help and assistance'
    };

    return descriptions[intentName] || 'Banking service';
  }

  /**
   * Validate banking intent request
   */
  validateBankingRequest(intent, entities) {
    const intentData = this.bankingIntents[intent];
    if (!intentData) {
      return {
        valid: false,
        error: 'Unknown banking intent'
      };
    }

    // Check for required entities
    const missingEntities = [];
    for (const requiredEntity of intentData.entities) {
      if (!entities.some(e => e.entity === requiredEntity)) {
        missingEntities.push(requiredEntity);
      }
    }

    if (missingEntities.length > 0) {
      return {
        valid: false,
        error: 'Missing required entities',
        missingEntities
      };
    }

    return { valid: true };
  }
}

module.exports = BankingNLUService;