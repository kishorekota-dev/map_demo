/**
 * Intent Service
 * Handles intent detection and analysis for chat messages
 */

const logger = require('../utils/logger');

class IntentService {
  constructor() {
    this.intents = this._initializeIntents();
    this.entityPatterns = this._initializeEntityPatterns();
  }

  /**
   * Detect intent from a message
   */
  async detectIntent(message) {
    try {
      logger.debug('Detecting intent for message', {
        messageLength: message.length,
        messagePreview: message.substring(0, 50)
      });

      if (!message || typeof message !== 'string') {
        throw new Error('Message must be a non-empty string');
      }

      const normalizedMessage = message.toLowerCase().trim();
      
      // Extract entities first
      const entities = this._extractEntities(normalizedMessage);
      
      // Detect intent based on keywords and patterns
      const intentResults = this._analyzeIntentPatterns(normalizedMessage);
      
      // Get the best matching intent
      const bestIntent = this._selectBestIntent(intentResults);
      
      // Calculate confidence based on various factors
      const confidence = this._calculateConfidence(bestIntent, normalizedMessage, entities);

      const result = {
        intent: bestIntent.name,
        confidence: Math.min(confidence, 1.0),
        entities,
        alternativeIntents: intentResults
          .filter(intent => intent.name !== bestIntent.name)
          .slice(0, 3)
          .map(intent => ({
            intent: intent.name,
            confidence: intent.score
          }))
      };

      logger.debug('Intent detection completed', {
        detectedIntent: result.intent,
        confidence: result.confidence,
        entityCount: entities.length,
        alternativeCount: result.alternativeIntents.length
      });

      return result;

    } catch (error) {
      logger.error('Error detecting intent', {
        error: error.message,
        stack: error.stack,
        messageLength: message?.length
      });
      
      throw new Error(`Intent detection failed: ${error.message}`);
    }
  }

  /**
   * Get all available intents
   */
  async getAvailableIntents() {
    try {
      logger.debug('Retrieving available intents');

      const availableIntents = Object.values(this.intents).map(intent => ({
        name: intent.name,
        description: intent.description,
        category: intent.category,
        examples: intent.examples.slice(0, 3), // Limit examples
        entities: intent.expectedEntities || []
      }));

      logger.debug('Available intents retrieved', {
        intentCount: availableIntents.length
      });

      return availableIntents;

    } catch (error) {
      logger.error('Error retrieving available intents', {
        error: error.message,
        stack: error.stack
      });
      
      throw new Error(`Intent retrieval failed: ${error.message}`);
    }
  }

  /**
   * Analyze intent patterns in message
   * @private
   */
  _analyzeIntentPatterns(message) {
    const results = [];

    Object.values(this.intents).forEach(intent => {
      let score = 0;
      let matchCount = 0;

      // Check keywords
      intent.keywords.forEach(keyword => {
        if (message.includes(keyword.toLowerCase())) {
          score += keyword.length > 4 ? 0.3 : 0.2; // Longer keywords get higher score
          matchCount++;
        }
      });

      // Check patterns
      intent.patterns.forEach(pattern => {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(message)) {
          score += 0.4;
          matchCount++;
        }
      });

      // Check phrases
      intent.phrases.forEach(phrase => {
        if (message.includes(phrase.toLowerCase())) {
          score += 0.5;
          matchCount++;
        }
      });

      // Normalize score based on match count and intent complexity
      if (matchCount > 0) {
        score = score / Math.max(1, intent.keywords.length + intent.patterns.length + intent.phrases.length);
        score = Math.min(score, 1.0);
        
        results.push({
          name: intent.name,
          score,
          matchCount,
          category: intent.category
        });
      }
    });

    // Sort by score descending
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Select the best intent from analysis results
   * @private
   */
  _selectBestIntent(intentResults) {
    if (intentResults.length === 0) {
      return this.intents.general_inquiry;
    }

    // Return the highest scoring intent
    const bestResult = intentResults[0];
    return this.intents[bestResult.name] || this.intents.general_inquiry;
  }

  /**
   * Calculate confidence score
   * @private
   */
  _calculateConfidence(intent, message, entities) {
    let confidence = 0.6; // Base confidence

    // Boost confidence based on intent-specific factors
    if (intent.keywords.some(keyword => message.includes(keyword.toLowerCase()))) {
      confidence += 0.2;
    }

    if (intent.phrases.some(phrase => message.includes(phrase.toLowerCase()))) {
      confidence += 0.3;
    }

    // Entity presence can boost confidence
    if (entities.length > 0 && intent.expectedEntities) {
      const entityMatch = entities.some(entity => 
        intent.expectedEntities.includes(entity.type)
      );
      if (entityMatch) {
        confidence += 0.1;
      }
    }

    // Message length factor
    if (message.length > 50) {
      confidence += 0.05; // Longer messages might be more specific
    }

    return Math.min(confidence, 0.95); // Cap at 95%
  }

  /**
   * Extract entities from message
   * @private
   */
  _extractEntities(message) {
    const entities = [];

    // Extract different types of entities
    Object.entries(this.entityPatterns).forEach(([type, patterns]) => {
      patterns.forEach(pattern => {
        const regex = new RegExp(pattern.regex, 'gi');
        let match;
        
        while ((match = regex.exec(message)) !== null) {
          entities.push({
            type,
            value: match[1] || match[0],
            start: match.index,
            end: match.index + match[0].length,
            confidence: pattern.confidence || 0.8
          });
        }
      });
    });

    return entities;
  }

  /**
   * Initialize intent definitions
   * @private
   */
  _initializeIntents() {
    return {
      greeting: {
        name: 'greeting',
        description: 'User greets the chatbot',
        category: 'social',
        keywords: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'],
        phrases: ['how are you', 'nice to meet you'],
        patterns: ['\\b(hello|hi|hey)\\b'],
        examples: ['Hello', 'Hi there', 'Good morning', 'Hey how are you?'],
        expectedEntities: []
      },

      farewell: {
        name: 'farewell',
        description: 'User says goodbye',
        category: 'social',
        keywords: ['bye', 'goodbye', 'see you', 'talk later', 'thanks'],
        phrases: ['thank you', 'have a good day', 'take care'],
        patterns: ['\\b(bye|goodbye)\\b', 'see you (later|soon)'],
        examples: ['Goodbye', 'Thanks, bye!', 'See you later', 'Take care'],
        expectedEntities: []
      },

      account_inquiry: {
        name: 'account_inquiry',
        description: 'User asks about account information',
        category: 'banking',
        keywords: ['account', 'profile', 'information', 'details', 'status'],
        phrases: ['my account', 'account information', 'account details', 'account status'],
        patterns: ['\\b(account|profile)\\s+(info|information|details|status)\\b'],
        examples: ['Tell me about my account', 'What is my account status?', 'Show account details'],
        expectedEntities: ['account_number', 'account_type']
      },

      balance_inquiry: {
        name: 'balance_inquiry',
        description: 'User wants to check account balance',
        category: 'banking',
        keywords: ['balance', 'amount', 'money', 'funds', 'available'],
        phrases: ['check balance', 'account balance', 'how much money', 'available funds'],
        patterns: ['\\b(check|show|what.+)\\s+(balance|funds)\\b', '\\bhow much\\s+(money|funds)\\b'],
        examples: ['What is my balance?', 'Check my account balance', 'How much money do I have?'],
        expectedEntities: ['account_number', 'amount']
      },

      transfer_request: {
        name: 'transfer_request',
        description: 'User wants to transfer money',
        category: 'banking',
        keywords: ['transfer', 'send', 'move', 'pay', 'payment'],
        phrases: ['send money', 'transfer funds', 'make payment', 'move money'],
        patterns: ['\\b(transfer|send|move)\\s+(money|funds)\\b', '\\bmake\\s+(payment|transfer)\\b'],
        examples: ['I want to transfer money', 'Send funds to another account', 'Make a payment'],
        expectedEntities: ['amount', 'account_number', 'recipient']
      },

      payment_inquiry: {
        name: 'payment_inquiry',
        description: 'User asks about payments',
        category: 'banking',
        keywords: ['payment', 'bill', 'pay', 'due', 'pending'],
        phrases: ['payment history', 'pending payments', 'bill payment', 'payment status'],
        patterns: ['\\b(payment|bill)\\s+(history|status|due)\\b'],
        examples: ['Show my payment history', 'What payments are due?', 'Check payment status'],
        expectedEntities: ['payment_id', 'amount', 'date']
      },

      help_request: {
        name: 'help_request',
        description: 'User asks for help or assistance',
        category: 'support',
        keywords: ['help', 'assist', 'support', 'guide', 'how to'],
        phrases: ['can you help', 'need assistance', 'how do i', 'what can you do'],
        patterns: ['\\b(help|assist|support)\\b', '\\bhow\\s+(do|can)\\s+i\\b', '\\bwhat\\s+can\\s+you\\b'],
        examples: ['Can you help me?', 'I need assistance', 'What can you do?', 'How do I check my balance?'],
        expectedEntities: []
      },

      technical_support: {
        name: 'technical_support',
        description: 'User reports technical issues',
        category: 'support',
        keywords: ['problem', 'issue', 'error', 'bug', 'not working', 'broken'],
        phrases: ['technical problem', 'system error', 'not working', 'having trouble'],
        patterns: ['\\b(problem|issue|error)\\b', '\\bnot\\s+working\\b', '\\bhaving\\s+trouble\\b'],
        examples: ['I have a technical problem', 'The system is not working', 'There is an error'],
        expectedEntities: ['error_code', 'system_component']
      },

      complaint: {
        name: 'complaint',
        description: 'User makes a complaint',
        category: 'support',
        keywords: ['complain', 'unhappy', 'dissatisfied', 'frustrated', 'angry'],
        phrases: ['not happy', 'poor service', 'want to complain', 'file complaint'],
        patterns: ['\\b(complain|complaint)\\b', '\\bnot\\s+(happy|satisfied)\\b'],
        examples: ['I want to file a complaint', 'I am not happy with the service', 'This is frustrating'],
        expectedEntities: ['complaint_type', 'service_area']
      },

      general_inquiry: {
        name: 'general_inquiry',
        description: 'General questions or inquiries',
        category: 'general',
        keywords: ['question', 'ask', 'know', 'tell', 'information'],
        phrases: ['i want to know', 'can you tell me', 'i have a question'],
        patterns: ['\\b(question|ask|know|tell)\\b'],
        examples: ['I have a question', 'Can you tell me about...', 'I want to know'],
        expectedEntities: []
      }
    };
  }

  /**
   * Initialize entity extraction patterns
   * @private
   */
  _initializeEntityPatterns() {
    return {
      amount: [
        { regex: '\\$([0-9,]+(?:\\.[0-9]{2})?)', confidence: 0.9 },
        { regex: '([0-9,]+(?:\\.[0-9]{2})?)\\s*dollars?', confidence: 0.8 },
        { regex: '([0-9,]+(?:\\.[0-9]{2})?)\\s*usd', confidence: 0.8 }
      ],
      account_number: [
        { regex: '\\b([0-9]{8,12})\\b', confidence: 0.7 },
        { regex: 'account\\s+(?:number\\s+)?([0-9]{8,12})', confidence: 0.9 }
      ],
      date: [
        { regex: '\\b([0-9]{1,2})/([0-9]{1,2})/([0-9]{4})\\b', confidence: 0.9 },
        { regex: '\\b([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})\\b', confidence: 0.9 },
        { regex: '\\b(today|tomorrow|yesterday)\\b', confidence: 0.8 }
      ],
      phone: [
        { regex: '\\b([0-9]{3})-([0-9]{3})-([0-9]{4})\\b', confidence: 0.9 },
        { regex: '\\b\\(([0-9]{3})\\)\\s*([0-9]{3})-([0-9]{4})\\b', confidence: 0.9 }
      ],
      email: [
        { regex: '\\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})\\b', confidence: 0.95 }
      ]
    };
  }
}

module.exports = new IntentService();