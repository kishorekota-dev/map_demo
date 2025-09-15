const config = require('../config/config');
const logger = require('../utils/logger');

class IntentDetector {
  constructor() {
    this.intents = this.loadIntents();
    this.confidenceThreshold = config.intentDetection.confidenceThreshold;
    this.intentHistory = [];
    this.maxHistory = config.intentDetection.maxIntentHistory;
  }

  loadIntents() {
    return {
      greeting: {
        patterns: [
          /^(hi|hello|hey|good morning|good afternoon|good evening)/i,
          /^(greetings|howdy|what's up|whats up)/i,
          /^(how are you|how do you do)/i
        ],
        keywords: ['hi', 'hello', 'hey', 'morning', 'afternoon', 'evening', 'greetings'],
        confidence: 0.9
      },
      
      question: {
        patterns: [
          /^(what|who|where|when|why|how|which|can you|could you|would you)/i,
          /\?$/,
          /^(tell me|explain|describe|show me)/i
        ],
        keywords: ['what', 'who', 'where', 'when', 'why', 'how', 'which', 'tell', 'explain'],
        confidence: 0.8
      },

      help: {
        patterns: [
          /^(help|support|assist|guidance)/i,
          /^(i need help|can you help|how do i)/i,
          /^(what can you do|what are your capabilities)/i
        ],
        keywords: ['help', 'support', 'assist', 'guidance', 'capabilities'],
        confidence: 0.9
      },

      goodbye: {
        patterns: [
          /^(bye|goodbye|see you|farewell|take care)/i,
          /^(thank you|thanks|thx)/i,
          /^(that's all|thats all|i'm done|im done)/i
        ],
        keywords: ['bye', 'goodbye', 'farewell', 'thanks', 'done'],
        confidence: 0.9
      },

      affirmation: {
        patterns: [
          /^(yes|yeah|yep|sure|ok|okay|alright|correct|right)/i,
          /^(that's right|thats right|exactly|absolutely)/i
        ],
        keywords: ['yes', 'yeah', 'sure', 'ok', 'correct', 'right', 'exactly'],
        confidence: 0.8
      },

      negation: {
        patterns: [
          /^(no|nope|not really|don't|dont|never)/i,
          /^(that's wrong|thats wrong|incorrect|false)/i
        ],
        keywords: ['no', 'nope', 'not', 'dont', 'never', 'wrong', 'incorrect'],
        confidence: 0.8
      },

      complaint: {
        patterns: [
          /^(problem|issue|error|bug|broken|not working)/i,
          /^(i have a problem|something is wrong|this doesn't work)/i,
          /^(complaint|complain|frustrated|annoying)/i
        ],
        keywords: ['problem', 'issue', 'error', 'broken', 'complaint', 'frustrated'],
        confidence: 0.7
      },

      compliment: {
        patterns: [
          /^(good|great|excellent|awesome|amazing|wonderful)/i,
          /^(you're helpful|youre helpful|well done|perfect)/i,
          /^(i like|love|appreciate)/i
        ],
        keywords: ['good', 'great', 'excellent', 'awesome', 'helpful', 'perfect', 'love'],
        confidence: 0.7
      }
    };
  }

  detectIntent(message) {
    try {
      if (!message || typeof message !== 'string') {
        return this.createIntentResult('unknown', 0, 'Invalid message format');
      }

      const cleanMessage = message.trim().toLowerCase();
      const results = [];

      // Check each intent
      Object.entries(this.intents).forEach(([intentName, intentData]) => {
        const confidence = this.calculateConfidence(cleanMessage, intentData);
        if (confidence > 0) {
          results.push({
            intent: intentName,
            confidence: confidence,
            message: cleanMessage
          });
        }
      });

      // Sort by confidence
      results.sort((a, b) => b.confidence - a.confidence);

      // Get the best match
      const bestMatch = results.length > 0 ? results[0] : null;
      
      // Check if confidence meets threshold
      if (bestMatch && bestMatch.confidence >= this.confidenceThreshold) {
        this.addToHistory(bestMatch);
        return this.createIntentResult(bestMatch.intent, bestMatch.confidence, 'Intent detected successfully');
      }

      // No confident match found
      return this.createIntentResult('unknown', 0, 'No intent detected with sufficient confidence');

    } catch (error) {
      logger.error('Error in intent detection:', { error: error.message, message });
      return this.createIntentResult('error', 0, 'Error during intent detection');
    }
  }

  calculateConfidence(message, intentData) {
    let confidence = 0;
    let matches = 0;
    let totalChecks = 0;

    // Check patterns
    if (intentData.patterns) {
      totalChecks += intentData.patterns.length;
      intentData.patterns.forEach(pattern => {
        if (pattern.test(message)) {
          matches++;
          confidence += 0.4; // Pattern match gives high confidence
        }
      });
    }

    // Check keywords
    if (intentData.keywords) {
      const messageWords = message.split(/\s+/);
      const keywordMatches = intentData.keywords.filter(keyword => 
        messageWords.some(word => word.includes(keyword))
      );
      
      if (keywordMatches.length > 0) {
        const keywordConfidence = (keywordMatches.length / intentData.keywords.length) * 0.3;
        confidence += keywordConfidence;
        matches += keywordMatches.length;
      }
      totalChecks += intentData.keywords.length;
    }

    // Apply base confidence from intent definition
    if (matches > 0 && intentData.confidence) {
      confidence = Math.min(confidence * intentData.confidence, 1.0);
    }

    return Math.round(confidence * 100) / 100; // Round to 2 decimal places
  }

  createIntentResult(intent, confidence, message) {
    return {
      intent,
      confidence,
      message,
      timestamp: new Date().toISOString(),
      success: intent !== 'error'
    };
  }

  addToHistory(intentResult) {
    this.intentHistory.unshift({
      ...intentResult,
      timestamp: new Date().toISOString()
    });

    // Maintain history size
    if (this.intentHistory.length > this.maxHistory) {
      this.intentHistory = this.intentHistory.slice(0, this.maxHistory);
    }
  }

  getIntentHistory(limit = 10) {
    return this.intentHistory.slice(0, limit);
  }

  getAvailableIntents() {
    return Object.keys(this.intents).map(intent => ({
      name: intent,
      description: `Detects ${intent} related messages`,
      patterns: this.intents[intent].patterns?.map(p => p.toString()) || [],
      keywords: this.intents[intent].keywords || []
    }));
  }

  // Method to add custom intents (for future extensibility)
  addCustomIntent(name, intentData) {
    if (!name || !intentData) {
      throw new Error('Intent name and data are required');
    }

    this.intents[name] = {
      patterns: intentData.patterns || [],
      keywords: intentData.keywords || [],
      confidence: intentData.confidence || 0.7
    };

    logger.info(`Custom intent '${name}' added successfully`);
  }
}

module.exports = IntentDetector;