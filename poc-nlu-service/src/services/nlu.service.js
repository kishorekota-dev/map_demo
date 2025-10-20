/**
 * NLU Core Service
 * Handles intent detection, entity extraction, and natural language understanding
 */

const axios = require('axios');
const NodeCache = require('node-cache');
const logger = require('../utils/logger');
const config = require('../config/config');
const dialogflowService = require('./dialogflow.service'); // Singleton instance
const bankingNLU = require('./banking-nlu.service'); // Singleton instance

class NLUService {
  constructor() {
    this.cache = new NodeCache({
      stdTTL: config.cache.ttl,
      checkperiod: config.cache.checkPeriod
    });
    
    // Both services are already singleton instances
    this.dialogflowService = dialogflowService;
    this.bankingNLU = bankingNLU;
    this.contexts = new Map();
    
    this.initializeIntents();
    logger.info('NLU Service initialized');
  }

  initializeIntents() {
    this.generalIntents = {
      'greeting': {
        patterns: [
          'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
          'howdy', 'greetings', 'sup', 'what\'s up'
        ],
        confidence: 0.9
      },
      'farewell': {
        patterns: [
          'goodbye', 'bye', 'see you', 'farewell', 'talk to you later',
          'have a good day', 'catch you later', 'take care'
        ],
        confidence: 0.9
      },
      'help': {
        patterns: [
          'help', 'assist', 'support', 'what can you do', 'how does this work',
          'need help', 'assistance', 'guide me'
        ],
        confidence: 0.8
      },
      'affirmation': {
        patterns: [
          'yes', 'yeah', 'yep', 'sure', 'okay', 'ok', 'correct', 'right',
          'absolutely', 'definitely', 'of course'
        ],
        confidence: 0.95
      },
      'negation': {
        patterns: [
          'no', 'nope', 'nah', 'not really', 'incorrect', 'wrong',
          'definitely not', 'absolutely not'
        ],
        confidence: 0.95
      },
      'thanks': {
        patterns: [
          'thank you', 'thanks', 'appreciate it', 'grateful', 'cheers',
          'much appreciated', 'thank you very much'
        ],
        confidence: 0.9
      }
    };
  }

  /**
   * Detect intent from user message
   */
  async detectIntent(message, userId = 'default', sessionId = 'default') {
    try {
      if (!message || typeof message !== 'string') {
        throw new Error('Valid message is required');
      }

      const normalizedMessage = message.toLowerCase().trim();
      const cacheKey = `intent_${Buffer.from(normalizedMessage).toString('base64')}`;
      
      // Check cache first
      const cachedResult = this.cache.get(cacheKey);
      if (cachedResult) {
        logger.debug('Intent result from cache', { message: normalizedMessage });
        return cachedResult;
      }

      logger.info('Detecting intent', { 
        message: normalizedMessage,
        userId,
        sessionId 
      });

      const startTime = Date.now();
      let intentResult = null;

      // Try banking-specific NLU first
      if (this.bankingNLU.isBankingRelated(message)) {
        intentResult = await this.bankingNLU.detectBankingIntent(message);
        if (intentResult && intentResult.confidence > config.nlu.confidenceThreshold) {
          logger.info('Banking intent detected', {
            intent: intentResult.intent,
            confidence: intentResult.confidence
          });
        }
      }

      // Fallback to DialogFlow if available and no banking intent found
      if (!intentResult && config.dialogflow.enabled) {
        try {
          intentResult = await this.dialogflowService.detectIntent(message, sessionId);
        } catch (dfError) {
          logger.warn('DialogFlow detection failed, falling back to local', {
            error: dfError.message
          });
        }
      }

      // Fallback to local intent detection
      if (!intentResult) {
        intentResult = await this.detectLocalIntent(normalizedMessage);
      }

      // Enhance with NLP analysis if available
      if (intentResult) {
        try {
          const nlpAnalysis = await this.enhanceWithNLP(message);
          intentResult.nlpAnalysis = nlpAnalysis;
        } catch (nlpError) {
          logger.warn('NLP enhancement failed', { error: nlpError.message });
        }
      }

      // Add context and metadata
      const result = {
        success: true,
        data: {
          intent: intentResult?.intent || 'unknown',
          confidence: intentResult?.confidence || 0,
          entities: intentResult?.entities || [],
          context: this.getContext(sessionId),
          isBanking: this.bankingNLU.isBankingRelated(message),
          processingTime: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          sessionId,
          userId
        }
      };

      // Update context
      this.updateContext(sessionId, {
        lastIntent: result.data.intent,
        lastMessage: message,
        timestamp: new Date().toISOString()
      });

      // Cache the result
      this.cache.set(cacheKey, result);

      logger.info('Intent detection completed', {
        intent: result.data.intent,
        confidence: result.data.confidence,
        processingTime: result.data.processingTime
      });

      return result;

    } catch (error) {
      logger.error('Error detecting intent', {
        message,
        error: error.message,
        userId,
        sessionId
      });

      return {
        success: false,
        error: error.message,
        data: {
          intent: 'error',
          confidence: 0,
          entities: [],
          context: {},
          processingTime: 0,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Detect intent using local patterns
   */
  async detectLocalIntent(message) {
    let bestMatch = null;
    let highestConfidence = 0;

    // Check general intents
    for (const [intentName, intentData] of Object.entries(this.generalIntents)) {
      for (const pattern of intentData.patterns) {
        if (this.matchesPattern(message, pattern)) {
          const confidence = this.calculateConfidence(message, pattern, intentData.confidence);
          
          if (confidence > highestConfidence) {
            highestConfidence = confidence;
            bestMatch = {
              intent: intentName,
              confidence: confidence,
              entities: this.extractBasicEntities(message),
              source: 'local'
            };
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * Check if message matches a pattern
   */
  matchesPattern(message, pattern) {
    // Exact match
    if (message.includes(pattern)) {
      return true;
    }

    // Word boundary matching
    const patternWords = pattern.split(/\s+/);
    const messageWords = message.split(/\s+/);
    
    let matchCount = 0;
    for (const patternWord of patternWords) {
      if (messageWords.some(word => word.includes(patternWord))) {
        matchCount++;
      }
    }

    return (matchCount / patternWords.length) >= 0.7;
  }

  /**
   * Calculate confidence score
   */
  calculateConfidence(message, pattern, baseConfidence) {
    if (message.includes(pattern)) {
      return baseConfidence;
    }

    const patternWords = pattern.split(/\s+/);
    const messageWords = message.split(/\s+/);
    
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
   * Extract basic entities from message
   */
  extractBasicEntities(message) {
    const entities = [];

    // Extract numbers
    const numbers = message.match(/\d+/g);
    if (numbers) {
      entities.push(...numbers.map(num => ({
        entity: 'number',
        value: parseInt(num),
        source: message
      })));
    }

    // Extract currency amounts
    const amounts = message.match(/\$\d+(?:\.\d{2})?/g);
    if (amounts) {
      entities.push(...amounts.map(amount => ({
        entity: 'currency',
        value: parseFloat(amount.replace('$', '')),
        source: amount
      })));
    }

    // Extract dates (simple patterns)
    const dates = message.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g);
    if (dates) {
      entities.push(...dates.map(date => ({
        entity: 'date',
        value: date,
        source: date
      })));
    }

    return entities;
  }

  /**
   * Enhance intent with NLP analysis
   */
  async enhanceWithNLP(message) {
    try {
      const response = await axios.post(`${config.services.nlp}/api/nlp/process`, {
        text: message
      }, { timeout: 5000 });

      if (response.data.success) {
        return {
          sentiment: response.data.data.processed.sentiment,
          entities: response.data.data.processed.entities,
          keywords: response.data.data.processed.keywords
        };
      }
    } catch (error) {
      logger.debug('NLP enhancement not available', { error: error.message });
    }

    return null;
  }

  /**
   * Get context for session
   */
  getContext(sessionId) {
    return this.contexts.get(sessionId) || {};
  }

  /**
   * Update context for session
   */
  updateContext(sessionId, contextData) {
    const existingContext = this.contexts.get(sessionId) || {};
    const updatedContext = { ...existingContext, ...contextData };
    
    this.contexts.set(sessionId, updatedContext);

    // Clean up old contexts
    if (this.contexts.size > config.nlu.context.maxContexts) {
      const oldestKey = this.contexts.keys().next().value;
      this.contexts.delete(oldestKey);
    }
  }

  /**
   * Clear context for session
   */
  clearContext(sessionId) {
    this.contexts.delete(sessionId);
    logger.debug('Context cleared', { sessionId });
  }

  /**
   * Get available intents
   */
  getAvailableIntents() {
    const intents = {
      general: Object.keys(this.generalIntents),
      banking: this.bankingNLU.getAvailableIntents(),
      total: 0
    };

    intents.total = intents.general.length + intents.banking.length;
    return intents;
  }

  /**
   * Train intent model (placeholder for future ML integration)
   */
  async trainModel(trainingData) {
    try {
      logger.info('Training model with data', {
        samples: trainingData.length
      });

      // Placeholder for actual training logic
      // This would integrate with ML frameworks or DialogFlow training API

      return {
        success: true,
        message: 'Model training initiated',
        samples: trainingData.length
      };
    } catch (error) {
      logger.error('Error training model', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get service health and statistics
   */
  getServiceHealth() {
    return {
      status: 'healthy',
      capabilities: [
        'Intent Detection',
        'Entity Extraction',
        'Context Management',
        'Banking Domain NLU',
        'DialogFlow Integration',
        'Confidence Scoring',
        'Multi-language Support'
      ],
      statistics: {
        cacheSize: this.cache.keys().length,
        activeSessions: this.contexts.size,
        intentsAvailable: this.getAvailableIntents().total
      },
      configuration: {
        confidenceThreshold: config.nlu.confidenceThreshold,
        dialogflowEnabled: config.dialogflow.enabled,
        bankingDomainEnabled: true
      },
      performance: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      }
    };
  }
}

module.exports = new NLUService();