/**
 * Chat Controller
 * Handles all chat-related HTTP requests
 */

const { validationResult } = require('express-validator');
const chatService = require('../services/chatService');
const intentService = require('../services/intentService');
const logger = require('../utils/logger');
const { createResponse, createErrorResponse } = require('../utils/responseHelpers');
const { performance } = require('../utils/performance');

class ChatController {
  /**
   * Send a chat message and get response
   * POST /api/chat/message
   */
  async sendMessage(req, res, next) {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(
          createErrorResponse('Validation failed', 400, errors.array())
        );
      }

      const { message, context = {} } = req.body;
      const sessionId = req.headers['x-session-id'] || req.sessionId;
      const requestId = req.headers['x-request-id'] || req.requestId;

      logger.info('Processing chat message', {
        requestId,
        sessionId,
        messageLength: message.length,
        hasContext: Object.keys(context).length > 0
      });

      // Measure intent detection performance
      const intentResult = await performance.measureAsync(
        'intent_detection',
        () => intentService.detectIntent(message),
        { requestId, messageLength: message.length }
      );

      if (!intentResult.success) {
        logger.error('Intent detection failed', {
          requestId,
          error: intentResult.error.message
        });
        
        return res.status(500).json(
          createErrorResponse('Failed to process message intent', 500, null, requestId)
        );
      }

      const intent = intentResult.result;

      // Measure response generation performance
      const responseResult = await performance.measureAsync(
        'response_generation',
        () => chatService.generateResponse(intent, context, sessionId),
        { requestId, intent: intent.intent }
      );

      if (!responseResult.success) {
        logger.error('Response generation failed', {
          requestId,
          intent: intent.intent,
          error: responseResult.error.message
        });
        
        return res.status(500).json(
          createErrorResponse('Failed to generate response', 500, null, requestId)
        );
      }

      const response = responseResult.result;

      // Log successful processing
      logger.info('Chat message processed successfully', {
        requestId,
        sessionId,
        intent: intent.intent,
        confidence: intent.confidence,
        responseType: response.type,
        processingTime: {
          intent: intentResult.timing.durationMs,
          response: responseResult.timing.durationMs,
          total: intentResult.timing.durationMs + responseResult.timing.durationMs
        }
      });

      // Send response
      res.json(createResponse({
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
          sessionId,
          messageId: requestId
        }
      }, 'Message processed successfully', {
        performance: {
          intentProcessingTime: intentResult.timing.durationMs,
          responseProcessingTime: responseResult.timing.durationMs,
          totalProcessingTime: intentResult.timing.durationMs + responseResult.timing.durationMs
        }
      }));

    } catch (error) {
      logger.logError(error, req);
      next(error);
    }
  }

  /**
   * Analyze message intent without generating response
   * POST /api/chat/analyze
   */
  async analyzeIntent(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(
          createErrorResponse('Validation failed', 400, errors.array())
        );
      }

      const { message } = req.body;
      const requestId = req.headers['x-request-id'] || req.requestId;

      logger.info('Analyzing message intent', {
        requestId,
        messageLength: message.length
      });

      const result = await performance.measureAsync(
        'intent_analysis',
        () => intentService.detectIntent(message),
        { requestId, operation: 'analyze_only' }
      );

      if (!result.success) {
        logger.error('Intent analysis failed', {
          requestId,
          error: result.error.message
        });
        
        return res.status(500).json(
          createErrorResponse('Failed to analyze message intent', 500, null, requestId)
        );
      }

      const intent = result.result;

      logger.info('Intent analysis completed', {
        requestId,
        intent: intent.intent,
        confidence: intent.confidence
      });

      res.json(createResponse({
        intent: intent.intent,
        confidence: intent.confidence,
        entities: intent.entities || [],
        analysis: {
          messageLength: message.length,
          timestamp: new Date().toISOString()
        }
      }, 'Intent analysis completed', {
        performance: {
          analysisTime: result.timing.durationMs
        }
      }));

    } catch (error) {
      logger.logError(error, req);
      next(error);
    }
  }

  /**
   * Get chat history
   * GET /api/chat/history
   */
  async getChatHistory(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json(
          createErrorResponse('Validation failed', 400, errors.array())
        );
      }

      const { sessionId, offset = 0, limit = 10 } = req.query;
      const requestId = req.headers['x-request-id'] || req.requestId;
      const currentSessionId = sessionId || req.headers['x-session-id'] || req.sessionId;

      logger.info('Retrieving chat history', {
        requestId,
        sessionId: currentSessionId,
        offset: parseInt(offset),
        limit: parseInt(limit)
      });

      const result = await performance.measureAsync(
        'history_retrieval',
        () => chatService.getChatHistory(currentSessionId, parseInt(offset), parseInt(limit)),
        { requestId, sessionId: currentSessionId }
      );

      if (!result.success) {
        logger.error('History retrieval failed', {
          requestId,
          sessionId: currentSessionId,
          error: result.error.message
        });
        
        return res.status(500).json(
          createErrorResponse('Failed to retrieve chat history', 500, null, requestId)
        );
      }

      const { messages, total } = result.result;

      logger.info('Chat history retrieved', {
        requestId,
        sessionId: currentSessionId,
        messageCount: messages.length,
        totalMessages: total
      });

      res.json(createResponse({
        messages,
        session: {
          sessionId: currentSessionId,
          messageCount: total
        },
        pagination: {
          offset: parseInt(offset),
          limit: parseInt(limit),
          total,
          hasMore: (parseInt(offset) + parseInt(limit)) < total
        }
      }, 'Chat history retrieved successfully', {
        performance: {
          retrievalTime: result.timing.durationMs
        }
      }));

    } catch (error) {
      logger.logError(error, req);
      next(error);
    }
  }

  /**
   * Get available intents
   * GET /api/chat/intents
   */
  async getAvailableIntents(req, res, next) {
    try {
      const requestId = req.headers['x-request-id'] || req.requestId;

      logger.info('Retrieving available intents', { requestId });

      const result = await performance.measureAsync(
        'intent_listing',
        () => intentService.getAvailableIntents(),
        { requestId }
      );

      if (!result.success) {
        logger.error('Failed to retrieve available intents', {
          requestId,
          error: result.error.message
        });
        
        return res.status(500).json(
          createErrorResponse('Failed to retrieve available intents', 500, null, requestId)
        );
      }

      const intents = result.result;

      logger.info('Available intents retrieved', {
        requestId,
        intentCount: intents.length
      });

      res.json(createResponse({
        intents,
        count: intents.length,
        categories: [...new Set(intents.map(i => i.category).filter(Boolean))]
      }, 'Available intents retrieved successfully', {
        performance: {
          retrievalTime: result.timing.durationMs
        }
      }));

    } catch (error) {
      logger.logError(error, req);
      next(error);
    }
  }

  /**
   * Reset conversation
   * DELETE /api/chat/reset
   */
  async resetConversation(req, res, next) {
    try {
      const sessionId = req.body.sessionId || req.headers['x-session-id'] || req.sessionId;
      const requestId = req.headers['x-request-id'] || req.requestId;

      if (!sessionId) {
        return res.status(400).json(
          createErrorResponse('Session ID is required for reset operation', 400, null, requestId)
        );
      }

      logger.info('Resetting conversation', {
        requestId,
        sessionId
      });

      const result = await performance.measureAsync(
        'conversation_reset',
        () => chatService.resetConversation(sessionId),
        { requestId, sessionId }
      );

      if (!result.success) {
        logger.error('Conversation reset failed', {
          requestId,
          sessionId,
          error: result.error.message
        });
        
        return res.status(500).json(
          createErrorResponse('Failed to reset conversation', 500, null, requestId)
        );
      }

      const resetResult = result.result;

      logger.info('Conversation reset completed', {
        requestId,
        sessionId,
        previousMessageCount: resetResult.previousMessageCount
      });

      res.json(createResponse({
        message: 'Conversation reset successfully',
        session: {
          sessionId,
          resetAt: resetResult.resetAt,
          previousMessageCount: resetResult.previousMessageCount
        }
      }, 'Conversation reset completed', {
        performance: {
          resetTime: result.timing.durationMs
        }
      }));

    } catch (error) {
      logger.logError(error, req);
      next(error);
    }
  }
}

module.exports = new ChatController();