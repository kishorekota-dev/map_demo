/**
 * Environment Validation Utilities
 * Validates required environment variables and configuration
 */

const logger = require('./logger');

/**
 * Required environment variables
 */
const requiredEnvVars = [
  'NODE_ENV'
];

/**
 * Optional environment variables with defaults
 */
const optionalEnvVars = {
  PORT: 3001,
  HOST: 'localhost',
  LOG_LEVEL: 'info',
  RATE_LIMIT_WINDOW_MS: 900000,
  RATE_LIMIT_MAX: 100,
  INTENT_CONFIDENCE_THRESHOLD: 0.7,
  MAX_MESSAGE_LENGTH: 1000,
  MAX_CONTEXT_SIZE: 10000
};

/**
 * Validate environment variables
 */
function validateEnvironment() {
  const missingVars = [];
  const warnings = [];

  // Check required variables
  requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  });

  // Check for missing optional variables and set defaults
  Object.entries(optionalEnvVars).forEach(([varName, defaultValue]) => {
    if (!process.env[varName]) {
      process.env[varName] = defaultValue.toString();
      warnings.push(`${varName} not set, using default: ${defaultValue}`);
    }
  });

  // Validate specific configurations
  const port = parseInt(process.env.PORT, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    missingVars.push('PORT (must be a valid port number)');
  }

  const logLevel = process.env.LOG_LEVEL;
  const validLogLevels = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];
  if (!validLogLevels.includes(logLevel)) {
    warnings.push(`LOG_LEVEL '${logLevel}' is not valid, using 'info'`);
    process.env.LOG_LEVEL = 'info';
  }

  // Check for production-specific requirements
  if (process.env.NODE_ENV === 'production') {
    const productionRequiredVars = ['SESSION_SECRET', 'JWT_SECRET'];
    productionRequiredVars.forEach(varName => {
      if (!process.env[varName] || process.env[varName].includes('fallback')) {
        missingVars.push(`${varName} (required for production)`);
      }
    });
  }

  // Report warnings
  warnings.forEach(warning => {
    logger.warn(`Environment validation: ${warning}`);
  });

  // Throw error if required variables are missing
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  return true;
}

/**
 * Validate request data
 */
function validateRequestData(data, schema) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    errors.push('Request data must be an object');
    return { isValid: false, errors };
  }

  // Basic schema validation
  if (schema.required) {
    schema.required.forEach(field => {
      if (!(field in data) || data[field] === null || data[field] === undefined) {
        errors.push(`Field '${field}' is required`);
      }
    });
  }

  if (schema.fields) {
    Object.entries(schema.fields).forEach(([field, rules]) => {
      const value = data[field];
      
      if (value !== undefined && value !== null) {
        // Type validation
        if (rules.type && typeof value !== rules.type) {
          errors.push(`Field '${field}' must be of type ${rules.type}`);
        }

        // Length validation for strings
        if (rules.type === 'string' && typeof value === 'string') {
          if (rules.minLength && value.length < rules.minLength) {
            errors.push(`Field '${field}' must be at least ${rules.minLength} characters`);
          }
          if (rules.maxLength && value.length > rules.maxLength) {
            errors.push(`Field '${field}' must be no more than ${rules.maxLength} characters`);
          }
        }

        // Range validation for numbers
        if (rules.type === 'number' && typeof value === 'number') {
          if (rules.min !== undefined && value < rules.min) {
            errors.push(`Field '${field}' must be at least ${rules.min}`);
          }
          if (rules.max !== undefined && value > rules.max) {
            errors.push(`Field '${field}' must be no more than ${rules.max}`);
          }
        }

        // Custom validation
        if (rules.validate && typeof rules.validate === 'function') {
          const customResult = rules.validate(value);
          if (customResult !== true) {
            errors.push(customResult || `Field '${field}' failed custom validation`);
          }
        }
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Sanitize input data
 */
function sanitizeInput(input) {
  if (typeof input === 'string') {
    // Basic HTML entity encoding
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .trim();
  }
  
  if (typeof input === 'object' && input !== null) {
    const sanitized = {};
    Object.keys(input).forEach(key => {
      sanitized[key] = sanitizeInput(input[key]);
    });
    return sanitized;
  }
  
  return input;
}

module.exports = {
  validateEnvironment,
  validateRequestData,
  sanitizeInput
};