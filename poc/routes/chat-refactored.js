/**
 * Chat Routes - Refactored with Modular Architecture
 * 
 * Utilizes utility modules for validation, request handling, and performance monitoring.
 * Provides clean, maintainable, and reusable chat API endpoints.
 */

const express = require('express');
const router = express.Router();

// Core modules
const IntentDetector = require('../modules/intentDetector');
const ResponseGenerator = require('../modules/responseGenerator');
const logger = require('../utils/logger');
const config = require('../config/config');

// New utility modules
const ValidationUtils = require('../utils/validation');
const RequestUtils = require('../utils/requestUtils');
const performance = require('../utils/performance');

// Initialize modules
const intentDetector = new IntentDetector();
const responseGenerator = new ResponseGenerator();

// Apply global middleware for request logging and performance tracking
router.use(RequestUtils.createLoggingMiddleware('Chat API'));
router.use(performance.createPerformanceMiddleware({
  logSlowRequests: true,
  slowRequestThreshold: 500,
  trackMemory: true
}));

/**
 * POST /message - Process chat message
 * Main chat endpoint for processing user messages and generating responses
 */
router.post('/message', RequestUtils.asyncHandler(async (req, res) => {
  const context = RequestUtils.extractRequestContext(req);
  const { message, context: userContext = {} } = req.body;

  // Validate chat message
  const messageValidation = ValidationUtils.validateChatMessage(message, context);
  if (!messageValidation.isValid) {
    return RequestUtils.handleValidationError(res, req, messageValidation);
  }

  // Validate context
  const contextValidation = ValidationUtils.validateContext(userContext, context);
  if (!contextValidation.isValid) {
    return RequestUtils.handleValidationError(res, req, contextValidation);
  }

  // Sanitize message
  const sanitizedMessage = ValidationUtils.sanitizeMessage(message);
  
  // Log processing start
  logger.info('Processing chat message', {
    ...RequestUtils.createRequestMetadata(req, {
      messageLength: sanitizedMessage.length.sanitized,
      messagePreview: sanitizedMessage.preview,
      hasContext: contextValidation.metadata.isProvided,
      contextKeys: contextValidation.metadata.sanitizedKeys || []
    })
  });

  // Detect intent with performance tracking
  const intentResult = await performance.measureAsync(
    'intent_detection',
    () => intentDetector.detectIntent(sanitizedMessage.sanitized),
    { 
      requestId: context.requestId,
      messageLength: sanitizedMessage.length.sanitized 
    }
  );

  if (!intentResult.success) {
    logger.error('Intent detection failed', {
      requestId: context.requestId,
      error: intentResult.error.message,
      timing: intentResult.timing.durationMs
    });
    
    return RequestUtils.sendErrorResponse(
      res, req,
      'Failed to process message intent',
      500,
      { 
        requestId: context.requestId,
        processingStep: 'intent_detection',
        timing: intentResult.timing
      },
      'error'
    );
  }

  const intent = intentResult.result;
  
  logger.info('Intent detected successfully', {
    requestId: context.requestId,
    sessionId: context.sessionId,
    intent: intent.intent,
    confidence: intent.confidence,
    timing: intentResult.timing.durationMs
  });

  // Generate response with performance tracking
  const responseResult = await performance.measureAsync(
    'response_generation',
    () => responseGenerator.generateResponse(intent, contextValidation.metadata.sanitizedContext),
    { 
      requestId: context.requestId,
      intent: intent.intent,
      confidence: intent.confidence 
    }
  );

  if (!responseResult.success) {
    logger.error('Response generation failed', {
      requestId: context.requestId,
      intent: intent.intent,
      error: responseResult.error.message,
      timing: responseResult.timing.durationMs
    });
    
    return RequestUtils.sendErrorResponse(
      res, req,
      'Failed to generate response',
      500,
      { 
        requestId: context.requestId,
        processingStep: 'response_generation',
        intent: intent.intent,
        timing: responseResult.timing
      },
      'error'
    );
  }

  const response = responseResult.result;
  
  logger.info('Chat response generated successfully', {
    requestId: context.requestId,
    sessionId: context.sessionId,
    intent: intent.intent,
    confidence: intent.confidence,
    responseType: response.type,
    intentProcessingTime: intentResult.timing.durationMs,
    responseProcessingTime: responseResult.timing.durationMs
  });

  // Send successful response
  RequestUtils.sendSuccessResponse(
    res, req,
    {
      message: response.message,
      intent: {
        detected: intent.intent,
        confidence: intent.confidence,
        entities: intent.entities || []
      },
      response: {
        type: response.type,
        timestamp: new Date().toISOString()
      },
      conversation: {
        sessionId: context.sessionId,
        messageId: context.requestId
      }
    },
    'Chat response generated successfully',
    {
      performance: {
        intentProcessingTime: intentResult.timing.durationMs,
        responseProcessingTime: responseResult.timing.durationMs,
        totalProcessingTime: `${intentResult.timing.duration + responseResult.timing.duration}ms`
      },
      validation: {
        messageLength: sanitizedMessage.length,
        contextProvided: contextValidation.metadata.isProvided
      }
    }
  );
}));

/**
 * POST /analyze - Analyze message intent
 * Endpoint for analyzing message intent without generating response
 */
router.post('/analyze', RequestUtils.asyncHandler(async (req, res) => {
  const context = RequestUtils.extractRequestContext(req);
  const { message } = req.body;

  // Validate message
  const validation = ValidationUtils.validateChatMessage(message, context);
  if (!validation.isValid) {
    return RequestUtils.handleValidationError(res, req, validation);
  }

  const sanitizedMessage = ValidationUtils.sanitizeMessage(message);
  
  logger.info('Analyzing message intent', RequestUtils.createRequestMetadata(req, {
    messageLength: sanitizedMessage.length.sanitized,
    messagePreview: sanitizedMessage.preview
  }));

  // Analyze intent with performance tracking
  const result = await performance.measureAsync(
    'intent_analysis',
    () => intentDetector.detectIntent(sanitizedMessage.sanitized),
    { 
      requestId: context.requestId,
      operation: 'analyze_only'
    }
  );

  if (!result.success) {
    return RequestUtils.sendErrorResponse(
      res, req,
      'Failed to analyze message intent',
      500,
      { 
        requestId: context.requestId,
        timing: result.timing,
        error: result.error.message
      },
      'error'
    );
  }

  const intent = result.result;
  
  logger.info('Intent analysis completed', {
    requestId: context.requestId,
    intent: intent.intent,
    confidence: intent.confidence,
    timing: result.timing.durationMs
  });

  RequestUtils.sendSuccessResponse(
    res, req,
    {
      intent: intent.intent,
      confidence: intent.confidence,
      entities: intent.entities || [],
      analysis: {
        messageLength: sanitizedMessage.length.sanitized,
        timestamp: new Date().toISOString()
      }
    },
    'Intent analysis completed',
    {
      performance: {
        analysisTime: result.timing.durationMs
      },
      message: {
        originalLength: sanitizedMessage.length.original,
        sanitizedLength: sanitizedMessage.length.sanitized
      }
    }
  );
}));

/**
 * GET /history - Get conversation history
 * Endpoint for retrieving conversation history with pagination
 */
router.get('/history', RequestUtils.asyncHandler(async (req, res) => {
  const context = RequestUtils.extractRequestContext(req);
  
  // Validate query parameters
  const queryValidation = ValidationUtils.validateQueryParams(req.query, context);
  if (!queryValidation.isValid) {
    return RequestUtils.handleValidationError(res, req, queryValidation);
  }

  // Extract pagination parameters
  const pagination = RequestUtils.extractPaginationParams(req.query);
  const sessionId = req.query.sessionId || context.sessionId;

  logger.info('Retrieving conversation history', RequestUtils.createRequestMetadata(req, {
    sessionId,
    pagination,
    queryParams: queryValidation.metadata
  }));

  // Simulate history retrieval (replace with actual implementation)
  const result = performance.measureSync(
    'history_retrieval',
    () => {
      // Mock history data
      const mockHistory = [
        {
          messageId: 'msg1',
          message: 'Hello',
          response: 'Hi there! How can I help you?',
          intent: 'greeting',
          timestamp: new Date().toISOString()
        }
      ];
      
      return {
        messages: mockHistory.slice(pagination.offset, pagination.offset + pagination.limit),
        total: mockHistory.length
      };
    },
    { 
      requestId: context.requestId,
      sessionId,
      pagination
    }
  );

  const { messages, total } = result.result;
  
  logger.info('Conversation history retrieved', {
    requestId: context.requestId,
    sessionId,
    messageCount: messages.length,
    totalMessages: total,
    timing: result.timing.durationMs
  });

  RequestUtils.sendSuccessResponse(
    res, req,
    {
      messages,
      session: {
        sessionId,
        messageCount: total
      }
    },
    'Conversation history retrieved',
    {
      ...RequestUtils.createPaginationMetadata(total, pagination),
      performance: {
        retrievalTime: result.timing.durationMs
      }
    }
  );
}));

/**
 * GET /intents - Get available intents
 * Endpoint for retrieving list of available intents
 */
router.get('/intents', RequestUtils.asyncHandler(async (req, res) => {
  const context = RequestUtils.extractRequestContext(req);
  
  logger.info('Retrieving available intents', RequestUtils.createRequestMetadata(req));

  const result = performance.measureSync(
    'intent_listing',
    () => intentDetector.getAvailableIntents(),
    { requestId: context.requestId }
  );

  const intents = result.result;
  
  logger.info('Available intents retrieved', {
    requestId: context.requestId,
    intentCount: intents.length,
    timing: result.timing.durationMs
  });

  RequestUtils.sendSuccessResponse(
    res, req,
    {
      intents,
      count: intents.length,
      categories: [...new Set(intents.map(i => i.category).filter(Boolean))]
    },
    'Available intents retrieved',
    {
      performance: {
        retrievalTime: result.timing.durationMs
      }
    }
  );
}));

/**
 * GET /status - Get system status
 * Endpoint for system health and performance monitoring
 */
router.get('/status', RequestUtils.asyncHandler(async (req, res) => {
  const context = RequestUtils.extractRequestContext(req);
  
  logger.info('Checking system status', RequestUtils.createRequestMetadata(req));

  const result = performance.measureSync(
    'status_check',
    () => {
      const systemMetrics = performance.getSystemMetrics();
      const performanceStats = performance.getPerformanceStats();
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        system: systemMetrics,
        performance: performanceStats,
        modules: {
          intentDetector: !!intentDetector,
          responseGenerator: !!responseGenerator
        }
      };
    },
    { requestId: context.requestId }
  );

  const status = result.result;
  
  logger.info('System status checked', {
    requestId: context.requestId,
    status: status.status,
    timing: result.timing.durationMs,
    systemHealth: {
      memoryUsage: status.system.memory.formatted.heapUsed,
      uptime: status.system.process.uptimeFormatted,
      activeTimers: status.system.performance.activeTimers
    }
  });

  RequestUtils.sendSuccessResponse(
    res, req,
    status,
    'System status retrieved',
    {
      performance: {
        statusCheckTime: result.timing.durationMs
      }
    }
  );
}));

/**
 * DELETE /reset - Reset conversation
 * Endpoint for resetting conversation state
 */
router.delete('/reset', RequestUtils.asyncHandler(async (req, res) => {
  const context = RequestUtils.extractRequestContext(req);
  const sessionId = req.headers['x-session-id'] || req.query.sessionId;

  if (!sessionId) {
    return RequestUtils.sendErrorResponse(
      res, req,
      'Session ID is required for reset operation',
      400,
      { 
        requestId: context.requestId,
        operation: 'reset'
      }
    );
  }

  logger.info('Resetting conversation', RequestUtils.createRequestMetadata(req, {
    sessionId,
    operation: 'reset'
  }));

  const result = performance.measureSync(
    'conversation_reset',
    () => {
      // Simulate conversation reset (replace with actual implementation)
      return {
        sessionId,
        resetAt: new Date().toISOString(),
        previousMessageCount: 0 // Mock value
      };
    },
    { 
      requestId: context.requestId,
      sessionId
    }
  );

  const resetResult = result.result;
  
  logger.info('Conversation reset completed', {
    requestId: context.requestId,
    sessionId,
    timing: result.timing.durationMs,
    previousMessageCount: resetResult.previousMessageCount
  });

  RequestUtils.sendSuccessResponse(
    res, req,
    {
      message: 'Conversation reset successfully',
      session: {
        sessionId,
        resetAt: resetResult.resetAt,
        previousMessageCount: resetResult.previousMessageCount
      }
    },
    'Conversation reset completed',
    {
      performance: {
        resetTime: result.timing.durationMs
      }
    }
  );
}));

module.exports = router;