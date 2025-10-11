/**
 * Intent Mapper Service
 * 
 * Centralized service for intent-based prompt selection and management.
 * Handles prompt retrieval, validation, and fallback logic.
 */

const intentConfig = require('../../config/intentConfig');
const logger = require('../utils/logger');

// Import prompt templates by category
const ACCOUNT_PROMPTS = require('./templates/account');
const TRANSACTION_PROMPTS = require('./templates/transaction');
const CARD_PROMPTS = require('./templates/card');
const SECURITY_PROMPTS = require('./templates/security');
const SUPPORT_PROMPTS = require('./templates/support');

// Combine all prompt templates
const ALL_PROMPTS = {
  ...ACCOUNT_PROMPTS,
  ...TRANSACTION_PROMPTS,
  ...CARD_PROMPTS,
  ...SECURITY_PROMPTS,
  ...SUPPORT_PROMPTS
};

/**
 * Intent Mapper Class
 * Provides methods for intent-based prompt selection and configuration
 */
class IntentMapper {
  constructor() {
    this.promptCache = new Map();
    this.fallbackPrompt = {
      system: `You are a helpful banking assistant. The user is authenticated and their identity is verified.
Provide accurate, helpful information about banking services.`,
      user: (context) => `User Question: ${context.question}\n\nUser ID: ${context.userId}\n\nProvide a helpful response.`
    };
    
    logger.info('IntentMapper initialized', {
      availableIntents: intentConfig.getAllIntents().length,
      availablePrompts: Object.keys(ALL_PROMPTS).length
    });
  }

  /**
   * Get complete intent configuration
   * @param {string} intent - Intent name
   * @returns {Object} Complete intent configuration
   */
  getIntentConfig(intent) {
    try {
      if (!intentConfig.isValidIntent(intent)) {
        logger.warn('Invalid intent requested', { intent });
        return null;
      }

      return intentConfig.getIntentConfig(intent);
    } catch (error) {
      logger.error('Error getting intent config', { intent, error: error.message });
      return null;
    }
  }

  /**
   * Get system prompt for intent
   * @param {string} intent - Intent name
   * @returns {string} System prompt text
   */
  getSystemPrompt(intent) {
    try {
      const config = intentConfig.getIntentConfig(intent);
      if (!config || !config.prompts || !config.prompts.systemPromptTemplate) {
        logger.warn('System prompt template not found, using fallback', { intent });
        return this.fallbackPrompt.system;
      }

      const template = config.prompts.systemPromptTemplate;
      const prompt = ALL_PROMPTS[template];

      if (!prompt) {
        logger.warn('System prompt not found in templates', { intent, template });
        return this.fallbackPrompt.system;
      }

      return prompt;
    } catch (error) {
      logger.error('Error getting system prompt', { intent, error: error.message });
      return this.fallbackPrompt.system;
    }
  }

  /**
   * Get user prompt function for intent
   * @param {string} intent - Intent name
   * @returns {Function} User prompt function
   */
  getUserPromptFunction(intent) {
    try {
      const config = intentConfig.getIntentConfig(intent);
      if (!config || !config.prompts || !config.prompts.userPromptTemplate) {
        logger.warn('User prompt template not found, using fallback', { intent });
        return this.fallbackPrompt.user;
      }

      const template = config.prompts.userPromptTemplate;
      const prompt = ALL_PROMPTS[template];

      if (!prompt) {
        logger.warn('User prompt not found in templates', { intent, template });
        return this.fallbackPrompt.user;
      }

      return prompt;
    } catch (error) {
      logger.error('Error getting user prompt function', { intent, error: error.message });
      return this.fallbackPrompt.user;
    }
  }

  /**
   * Build system message for intent
   * @param {string} intent - Intent name
   * @returns {string} Formatted system message
   */
  buildSystemMessage(intent) {
    const systemPrompt = this.getSystemPrompt(intent);
    
    logger.debug('Built system message', { intent, promptLength: systemPrompt.length });
    
    return systemPrompt;
  }

  /**
   * Build user message for intent with context
   * @param {string} intent - Intent name
   * @param {Object} context - Context object with user data
   * @returns {string} Formatted user message
   */
  buildUserMessage(intent, context) {
    const userPromptFn = this.getUserPromptFunction(intent);
    
    // Ensure required context fields
    if (!context.question) {
      logger.warn('Missing question in context', { intent });
      context.question = 'User inquiry';
    }
    if (!context.userId) {
      logger.warn('Missing userId in context', { intent });
    }

    const userMessage = userPromptFn(context);
    
    logger.debug('Built user message', { 
      intent, 
      contextFields: Object.keys(context),
      messageLength: userMessage.length 
    });
    
    return userMessage;
  }

  /**
   * Get required data fields for intent
   * @param {string} intent - Intent name
   * @returns {Array} Required field names
   */
  getRequiredData(intent) {
    return intentConfig.getRequiredDataForIntent(intent);
  }

  /**
   * Get optional data fields for intent
   * @param {string} intent - Intent name
   * @returns {Array} Optional field names
   */
  getOptionalData(intent) {
    return intentConfig.getOptionalDataForIntent(intent);
  }

  /**
   * Get all data fields (required + optional) for intent
   * @param {string} intent - Intent name
   * @returns {Object} Object with required and optional arrays
   */
  getAllDataFields(intent) {
    return {
      required: this.getRequiredData(intent),
      optional: this.getOptionalData(intent)
    };
  }

  /**
   * Check if intent needs user confirmation
   * @param {string} intent - Intent name
   * @returns {boolean} True if confirmation required
   */
  needsConfirmation(intent) {
    return intentConfig.needsConfirmation(intent);
  }

  /**
   * Get tools available for intent
   * @param {string} intent - Intent name
   * @returns {Array} Tool names
   */
  getToolsForIntent(intent) {
    return intentConfig.getToolsForIntent(intent);
  }

  /**
   * Get validation rules for intent
   * @param {string} intent - Intent name
   * @returns {Object} Validation rules
   */
  getValidationRules(intent) {
    return intentConfig.getValidationRules(intent);
  }

  /**
   * Get default values for intent
   * @param {string} intent - Intent name
   * @returns {Object} Default values
   */
  getDefaults(intent) {
    return intentConfig.getDefaults(intent);
  }

  /**
   * Validate intent exists
   * @param {string} intent - Intent name
   * @returns {boolean} True if valid intent
   */
  isValidIntent(intent) {
    return intentConfig.isValidIntent(intent);
  }

  /**
   * Get all available intents
   * @returns {Array} All intent names
   */
  getAllIntents() {
    return intentConfig.getAllIntents();
  }

  /**
   * Get intents by category
   * @param {string} category - Category name
   * @returns {Array} Intent names in category
   */
  getIntentsByCategory(category) {
    return intentConfig.getIntentsByCategory(category);
  }

  /**
   * Get category for intent
   * @param {string} intent - Intent name
   * @returns {string|null} Category name or null
   */
  getCategoryForIntent(intent) {
    return intentConfig.getCategoryForIntent(intent);
  }

  /**
   * Get intent metadata
   * @param {string} intent - Intent name
   * @returns {Object} Intent metadata
   */
  getIntentMetadata(intent) {
    const config = this.getIntentConfig(intent);
    return config ? config.metadata : {};
  }

  /**
   * Get intent behavior settings
   * @param {string} intent - Intent name
   * @returns {Object} Behavior settings
   */
  getIntentBehavior(intent) {
    const config = this.getIntentConfig(intent);
    return config ? config.behavior : {};
  }

  /**
   * Check if intent requires authentication
   * @param {string} intent - Intent name
   * @returns {boolean} True if auth required
   */
  requiresAuth(intent) {
    return intentConfig.requiresAuth(intent);
  }

  /**
   * Get confirmation message for intent
   * @param {string} intent - Intent name
   * @param {Object} context - Context with values to interpolate
   * @returns {string|null} Confirmation message or null
   */
  getConfirmationMessage(intent, context = {}) {
    const behavior = this.getIntentBehavior(intent);
    if (!behavior.confirmationMessage) {
      return null;
    }

    // Simple template interpolation
    let message = behavior.confirmationMessage;
    for (const [key, value] of Object.entries(context)) {
      message = message.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
    }

    return message;
  }

  /**
   * Check if intent is urgent (no delays)
   * @param {string} intent - Intent name
   * @returns {boolean} True if urgent
   */
  isUrgent(intent) {
    const behavior = this.getIntentBehavior(intent);
    return behavior.isUrgent === true;
  }

  /**
   * Get max retries for intent
   * @param {string} intent - Intent name
   * @returns {number} Max retry attempts
   */
  getMaxRetries(intent) {
    const behavior = this.getIntentBehavior(intent);
    return behavior.maxRetries || 3;
  }

  /**
   * Check if intent allows partial data
   * @param {string} intent - Intent name
   * @returns {boolean} True if partial data allowed
   */
  allowsPartialData(intent) {
    const behavior = this.getIntentBehavior(intent);
    return behavior.allowsPartialData !== false;
  }

  /**
   * Validate collected data against intent requirements
   * @param {string} intent - Intent name
   * @param {Object} collectedData - Data collected from user
   * @returns {Object} Validation result with missing/invalid fields
   */
  validateData(intent, collectedData) {
    const required = this.getRequiredData(intent);
    const rules = this.getValidationRules(intent);
    const behavior = this.getIntentBehavior(intent);

    const result = {
      valid: true,
      missing: [],
      invalid: [],
      warnings: []
    };

    // Check required fields
    if (behavior.requiresAllFields !== false) {
      for (const field of required) {
        if (!collectedData[field] && collectedData[field] !== 0) {
          result.missing.push(field);
          result.valid = false;
        }
      }
    }

    // Validate fields against rules
    for (const [field, rule] of Object.entries(rules)) {
      const value = collectedData[field];
      if (value === undefined || value === null) continue;

      // Type validation
      if (rule.type === 'number') {
        if (typeof value !== 'number' || isNaN(value)) {
          result.invalid.push({ field, reason: 'Must be a number' });
          result.valid = false;
        } else {
          if (rule.min !== undefined && value < rule.min) {
            result.invalid.push({ field, reason: `Must be at least ${rule.min}` });
            result.valid = false;
          }
          if (rule.max !== undefined && value > rule.max) {
            result.invalid.push({ field, reason: `Must be at most ${rule.max}` });
            result.valid = false;
          }
        }
      }

      // String validation
      if (rule.type === 'string') {
        if (typeof value !== 'string') {
          result.invalid.push({ field, reason: 'Must be a string' });
          result.valid = false;
        } else {
          if (rule.minLength && value.length < rule.minLength) {
            result.invalid.push({ field, reason: `Must be at least ${rule.minLength} characters` });
            result.valid = false;
          }
          if (rule.maxLength && value.length > rule.maxLength) {
            result.invalid.push({ field, reason: `Must be at most ${rule.maxLength} characters` });
            result.valid = false;
          }
          if (rule.pattern && !new RegExp(rule.pattern).test(value)) {
            result.invalid.push({ field, reason: 'Invalid format' });
            result.valid = false;
          }
        }
      }

      // Enum validation
      if (rule.type === 'enum') {
        if (!rule.values.includes(value)) {
          result.invalid.push({ 
            field, 
            reason: `Must be one of: ${rule.values.join(', ')}` 
          });
          result.valid = false;
        }
      }

      // Boolean validation
      if (rule.type === 'boolean') {
        if (typeof value !== 'boolean') {
          result.invalid.push({ field, reason: 'Must be true or false' });
          result.valid = false;
        }
      }
    }

    logger.debug('Data validation result', { intent, result });

    return result;
  }

  /**
   * Get context fields needed for intent
   * @param {string} intent - Intent name
   * @returns {Array} Context field names
   */
  getContextFields(intent) {
    const config = this.getIntentConfig(intent);
    return config?.prompts?.contextFields || [];
  }

  /**
   * Suggest similar intents (for typos or ambiguity)
   * @param {string} query - Query string
   * @returns {Array} Similar intent names
   */
  suggestIntents(query) {
    const allIntents = this.getAllIntents();
    const patterns = intentConfig.INTENT_PATTERNS;
    
    const suggestions = [];
    const lowerQuery = query.toLowerCase();

    for (const intent of allIntents) {
      const intentPatterns = patterns[intent] || [];
      for (const pattern of intentPatterns) {
        if (pattern.toLowerCase().includes(lowerQuery) || 
            lowerQuery.includes(pattern.toLowerCase())) {
          suggestions.push(intent);
          break;
        }
      }
    }

    return [...new Set(suggestions)]; // Remove duplicates
  }
}

// Create singleton instance
const intentMapper = new IntentMapper();

// Export both class and singleton
module.exports = intentMapper;
module.exports.IntentMapper = IntentMapper;

// Export convenience functions (backward compatibility)
module.exports.getPromptForIntent = (intent) => intentMapper.getIntentConfig(intent);
module.exports.buildSystemMessage = (intent) => intentMapper.buildSystemMessage(intent);
module.exports.buildUserMessage = (intent, context) => intentMapper.buildUserMessage(intent, context);
module.exports.getRequiredDataForIntent = (intent) => intentMapper.getRequiredData(intent);
module.exports.getOptionalDataForIntent = (intent) => intentMapper.getOptionalData(intent);
module.exports.needsConfirmation = (intent) => intentMapper.needsConfirmation(intent);
module.exports.getToolsForIntent = (intent) => intentMapper.getToolsForIntent(intent);
