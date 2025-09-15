/**
 * Validation Utility Module
 * 
 * Centralizes input validation logic for better code reusability and maintainability.
 * Provides comprehensive validation functions with detailed error context.
 */

const logger = require('./logger');

/**
 * Validation result structure
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - Whether the validation passed
 * @property {string} error - Error message if validation failed
 * @property {Object} metadata - Additional validation metadata
 */

class ValidationUtils {
  /**
   * Validates a chat message input
   * @param {any} message - The message to validate
   * @param {Object} context - Validation context for logging
   * @returns {ValidationResult} Validation result
   */
  static validateChatMessage(message, context = {}) {
    const { requestId, sessionId, clientIP } = context;

    // Check if message exists
    if (!message) {
      logger.warn('Invalid request: Missing message', { 
        requestId, 
        sessionId, 
        clientIP,
        bodyKeys: context.bodyKeys || []
      });
      return {
        isValid: false,
        error: 'Message is required and must be a non-empty string',
        metadata: { 
          reason: 'missing_message',
          received: null
        }
      };
    }

    // Check if message is a string
    if (typeof message !== 'string') {
      logger.warn('Invalid request: Message not a string', { 
        requestId, 
        sessionId, 
        clientIP,
        messageType: typeof message,
        messageValue: JSON.stringify(message).substring(0, 100)
      });
      return {
        isValid: false,
        error: 'Message is required and must be a non-empty string',
        metadata: { 
          reason: 'invalid_type',
          expectedType: 'string',
          actualType: typeof message,
          received: message
        }
      };
    }

    // Check if message is not empty after trimming
    if (!message.trim()) {
      logger.warn('Invalid request: Empty message', { 
        requestId, 
        sessionId, 
        clientIP,
        messageLength: message.length
      });
      return {
        isValid: false,
        error: 'Message is required and must be a non-empty string',
        metadata: { 
          reason: 'empty_message',
          originalLength: message.length,
          trimmedLength: 0
        }
      };
    }

    // Validation passed
    return {
      isValid: true,
      error: null,
      metadata: {
        originalLength: message.length,
        trimmedLength: message.trim().length,
        preview: message.trim().substring(0, 50) + (message.trim().length > 50 ? '...' : '')
      }
    };
  }

  /**
   * Validates query parameters for pagination and filtering
   * @param {Object} query - Query parameters to validate
   * @param {Object} context - Validation context for logging
   * @returns {ValidationResult} Validation result
   */
  static validateQueryParams(query, context = {}) {
    const { requestId, sessionId, clientIP } = context;
    const errors = [];
    const metadata = {};

    // Validate limit parameter
    if (query.limit !== undefined) {
      const limit = parseInt(query.limit);
      if (isNaN(limit) || limit < 1 || limit > 100) {
        errors.push('Limit must be a number between 1 and 100');
        metadata.invalidLimit = query.limit;
      } else {
        metadata.limit = limit;
      }
    }

    // Validate offset parameter
    if (query.offset !== undefined) {
      const offset = parseInt(query.offset);
      if (isNaN(offset) || offset < 0) {
        errors.push('Offset must be a non-negative number');
        metadata.invalidOffset = query.offset;
      } else {
        metadata.offset = offset;
      }
    }

    // Validate sessionId parameter
    if (query.sessionId !== undefined) {
      if (typeof query.sessionId !== 'string' || !query.sessionId.trim()) {
        errors.push('SessionId must be a non-empty string');
        metadata.invalidSessionId = query.sessionId;
      } else {
        metadata.sessionId = query.sessionId.trim();
      }
    }

    if (errors.length > 0) {
      logger.warn('Invalid query parameters', {
        requestId,
        sessionId,
        clientIP,
        errors,
        providedParams: Object.keys(query),
        invalidParams: metadata
      });

      return {
        isValid: false,
        error: errors.join('; '),
        metadata: {
          reason: 'invalid_query_params',
          errors,
          ...metadata
        }
      };
    }

    return {
      isValid: true,
      error: null,
      metadata
    };
  }

  /**
   * Validates request headers for required values
   * @param {Object} headers - Request headers to validate
   * @param {Array} requiredHeaders - Array of required header names
   * @param {Object} context - Validation context for logging
   * @returns {ValidationResult} Validation result
   */
  static validateHeaders(headers, requiredHeaders = [], context = {}) {
    const { requestId, sessionId, clientIP } = context;
    const missing = [];
    const metadata = {};

    for (const header of requiredHeaders) {
      if (!headers[header]) {
        missing.push(header);
      } else {
        metadata[header] = headers[header];
      }
    }

    if (missing.length > 0) {
      logger.warn('Missing required headers', {
        requestId,
        sessionId,
        clientIP,
        missingHeaders: missing,
        providedHeaders: Object.keys(headers)
      });

      return {
        isValid: false,
        error: `Missing required headers: ${missing.join(', ')}`,
        metadata: {
          reason: 'missing_headers',
          missing,
          provided: Object.keys(headers)
        }
      };
    }

    return {
      isValid: true,
      error: null,
      metadata
    };
  }

  /**
   * Validates JSON request body structure
   * @param {any} body - Request body to validate
   * @param {Array} requiredFields - Array of required field names
   * @param {Object} context - Validation context for logging
   * @returns {ValidationResult} Validation result
   */
  static validateRequestBody(body, requiredFields = [], context = {}) {
    const { requestId, sessionId, clientIP } = context;
    
    // Check if body exists
    if (!body || typeof body !== 'object') {
      logger.warn('Invalid request body: Not an object', {
        requestId,
        sessionId,
        clientIP,
        bodyType: typeof body,
        bodyValue: body
      });

      return {
        isValid: false,
        error: 'Request body must be a valid JSON object',
        metadata: {
          reason: 'invalid_body_type',
          expectedType: 'object',
          actualType: typeof body
        }
      };
    }

    const missing = [];
    const metadata = {
      providedFields: Object.keys(body)
    };

    // Check for required fields
    for (const field of requiredFields) {
      if (!(field in body)) {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      logger.warn('Missing required fields in request body', {
        requestId,
        sessionId,
        clientIP,
        missingFields: missing,
        providedFields: Object.keys(body)
      });

      return {
        isValid: false,
        error: `Missing required fields: ${missing.join(', ')}`,
        metadata: {
          reason: 'missing_fields',
          missing,
          provided: Object.keys(body)
        }
      };
    }

    return {
      isValid: true,
      error: null,
      metadata
    };
  }

  /**
   * Creates a standardized error response
   * @param {string} error - Error message
   * @param {number} statusCode - HTTP status code
   * @param {Object} metadata - Additional error metadata
   * @returns {Object} Standardized error response
   */
  static createErrorResponse(error, statusCode = 400, metadata = {}) {
    return {
      success: false,
      error,
      statusCode,
      timestamp: new Date().toISOString(),
      metadata
    };
  }

  /**
   * Sanitizes and prepares message for processing
   * @param {string} message - Raw message input
   * @returns {Object} Sanitized message data
   */
  static sanitizeMessage(message) {
    const trimmed = message.trim();
    
    return {
      original: message,
      sanitized: trimmed,
      length: {
        original: message.length,
        sanitized: trimmed.length
      },
      preview: trimmed.substring(0, 50) + (trimmed.length > 50 ? '...' : ''),
      isEmpty: trimmed.length === 0
    };
  }

  /**
   * Validates and sanitizes context object
   * @param {any} context - Context object to validate
   * @param {Object} validationContext - Validation context for logging
   * @returns {ValidationResult} Validation result with sanitized context
   */
  static validateContext(context, validationContext = {}) {
    const { requestId, sessionId, clientIP } = validationContext;

    // Context is optional, so null/undefined is valid
    if (context === null || context === undefined) {
      return {
        isValid: true,
        error: null,
        metadata: {
          sanitizedContext: {},
          isProvided: false
        }
      };
    }

    // Context must be an object if provided
    if (typeof context !== 'object' || Array.isArray(context)) {
      logger.warn('Invalid context: Not an object', {
        requestId,
        sessionId,
        clientIP,
        contextType: typeof context,
        isArray: Array.isArray(context)
      });

      return {
        isValid: false,
        error: 'Context must be an object',
        metadata: {
          reason: 'invalid_context_type',
          expectedType: 'object',
          actualType: typeof context,
          isArray: Array.isArray(context)
        }
      };
    }

    // Sanitize context by removing potentially harmful fields
    const sanitized = {};
    const allowedFields = ['sessionId', 'userId', 'conversationId', 'preferences', 'metadata'];
    
    for (const [key, value] of Object.entries(context)) {
      if (allowedFields.includes(key)) {
        sanitized[key] = value;
      }
    }

    return {
      isValid: true,
      error: null,
      metadata: {
        sanitizedContext: sanitized,
        isProvided: true,
        originalKeys: Object.keys(context),
        sanitizedKeys: Object.keys(sanitized),
        filteredKeys: Object.keys(context).filter(key => !allowedFields.includes(key))
      }
    };
  }
}

module.exports = ValidationUtils;