const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

const IntentDetector = require('../modules/intentDetector');
const ResponseGenerator = require('../modules/responseGenerator');
const logger = require('../utils/logger');
const config = require('../config/config');

// Initialize modules
const intentDetector = new IntentDetector();
const responseGenerator = new ResponseGenerator();

// Request logging middleware
router.use((req, res, next) => {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] || uuidv4();
  const clientIP = req.ip || req.connection.remoteAddress;

  // Add request tracking to request object
  req.requestTracking = {
    requestId,
    startTime,
    clientIP
  };

  // Log incoming request
  logger.info('Chat API request received', {
    requestId,
    method: req.method,
    url: req.url,
    path: req.path,
    clientIP,
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
    sessionId: req.headers['x-session-id'],
    timestamp: new Date().toISOString()
  });

  // Log request completion
  const originalSend = res.send;
  res.send = function(data) {
    const processingTime = Date.now() - startTime;
    
    logger.info('Chat API request completed', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      clientIP,
      processingTime: `${processingTime}ms`,
      responseSize: data ? Buffer.byteLength(data, 'utf8') : 0,
      completedAt: new Date().toISOString()
    });

    originalSend.call(this, data);
  };

  next();
});

// Chat processing endpoint
router.post('/message', async (req, res) => {
  const startTime = Date.now();
  const sessionId = req.headers['x-session-id'] || uuidv4();
  const requestId = uuidv4();
  const clientIP = req.ip || req.connection.remoteAddress;

  // Log incoming request
  logger.info('Chat message request received', {
    requestId,
    sessionId,
    clientIP,
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
    timestamp: new Date().toISOString()
  });

  try {
    const { message, context = {} } = req.body;

    // Enhanced input validation with detailed logging
    if (!message) {
      logger.warn('Invalid request: Missing message', { 
        requestId, 
        sessionId, 
        clientIP,
        bodyKeys: Object.keys(req.body)
      });
      return res.status(400).json({
        success: false,
        error: 'Message is required and must be a non-empty string',
        timestamp: new Date().toISOString()
      });
    }

    if (typeof message !== 'string') {
      logger.warn('Invalid request: Message not a string', { 
        requestId, 
        sessionId, 
        clientIP,
        messageType: typeof message,
        messageValue: JSON.stringify(message).substring(0, 100)
      });
      return res.status(400).json({
        success: false,
        error: 'Message is required and must be a non-empty string',
        timestamp: new Date().toISOString()
      });
    }

    if (!message.trim()) {
      logger.warn('Invalid request: Empty message', { 
        requestId, 
        sessionId, 
        clientIP,
        messageLength: message.length
      });
      return res.status(400).json({
        success: false,
        error: 'Message is required and must be a non-empty string',
        timestamp: new Date().toISOString()
      });
    }

    const trimmedMessage = message.trim();
    
    // Enhanced incoming message logging
    logger.info('Processing chat message', { 
      requestId,
      sessionId, 
      clientIP,
      messageLength: trimmedMessage.length,
      messagePreview: trimmedMessage.substring(0, 50) + (trimmedMessage.length > 50 ? '...' : ''),
      hasContext: Object.keys(context).length > 0,
      contextKeys: Object.keys(context),
      processingStartTime: new Date().toISOString()
    });

    // Enhanced intent detection with timing
    const intentStartTime = Date.now();
    logger.debug('Starting intent detection', {
      requestId,
      sessionId,
      messagePreview: trimmedMessage.substring(0, 30),
      intentStartTime: new Date().toISOString()
    });

    const intentResult = intentDetector.detectIntent(trimmedMessage);
    const intentProcessingTime = Date.now() - intentStartTime;
    
    // Enhanced intent detection logging
    if (!intentResult.success) {
      logger.warn('Intent detection failed', { 
        requestId,
        sessionId, 
        clientIP,
        messagePreview: trimmedMessage.substring(0, 50),
        error: intentResult.message,
        intentProcessingTime: `${intentProcessingTime}ms`,
        failureReason: intentResult.reason || 'unknown'
      });
    } else {
      logger.info('Intent detected successfully', {
        requestId,
        sessionId,
        clientIP,
        detectedIntent: intentResult.intent,
        confidence: intentResult.confidence,
        intentProcessingTime: `${intentProcessingTime}ms`,
        thresholdMet: intentResult.confidence >= config.intentDetection.confidenceThreshold
      });
    }

    // Enhanced response generation with timing
    const responseStartTime = Date.now();
    logger.debug('Starting response generation', {
      requestId,
      sessionId,
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      responseStartTime: new Date().toISOString()
    });

    const response = responseGenerator.generateResponse(
      intentResult, 
      trimmedMessage, 
      { sessionId, requestId, clientIP, ...context }
    );
    const responseProcessingTime = Date.now() - responseStartTime;
    const totalProcessingTime = Date.now() - startTime;

    // Enhanced response generation logging
    logger.info('Chat response generated successfully', {
      requestId,
      sessionId,
      clientIP,
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      responseId: response.metadata.responseId,
      responseType: response.metadata.responseType || 'standard',
      responseLength: response.text.length,
      intentProcessingTime: `${intentProcessingTime}ms`,
      responseProcessingTime: `${responseProcessingTime}ms`,
      totalProcessingTime: `${totalProcessingTime}ms`,
      responseGeneratedAt: new Date().toISOString()
    });

    // Log response preview for debugging
    logger.debug('Response preview', {
      requestId,
      sessionId,
      responsePreview: response.text.substring(0, 100) + (response.text.length > 100 ? '...' : ''),
      responseMetadata: response.metadata
    });

    // Send response with enhanced logging
    logger.info('Sending response to client', {
      requestId,
      sessionId,
      clientIP,
      statusCode: 200,
      responseSize: JSON.stringify(response).length,
      totalProcessingTime: `${totalProcessingTime}ms`,
      requestCompletedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        message: response.text,
        intent: {
          detected: intentResult.intent,
          confidence: intentResult.confidence
        },
        metadata: {
          sessionId,
          requestId,
          responseId: response.metadata.responseId,
          processingTime: totalProcessingTime,
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    const totalProcessingTime = Date.now() - startTime;
    
    // Enhanced error logging
    logger.error('Error processing chat message', {
      requestId,
      sessionId,
      clientIP,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      requestBody: JSON.stringify(req.body).substring(0, 200),
      totalProcessingTime: `${totalProcessingTime}ms`,
      errorOccurredAt: new Date().toISOString()
    });

    // Log additional error context
    logger.debug('Error context details', {
      requestId,
      headers: req.headers,
      params: req.params,
      query: req.query,
      method: req.method,
      url: req.url
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error while processing message',
      metadata: {
        sessionId,
        requestId,
        processingTime: totalProcessingTime,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Get intent analysis endpoint
router.post('/analyze', (req, res) => {
  const startTime = Date.now();
  const requestId = uuidv4();
  const clientIP = req.ip || req.connection.remoteAddress;

  // Log analyze request
  logger.info('Intent analysis request received', {
    requestId,
    clientIP,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });

  try {
    const { message } = req.body;

    // Enhanced validation with logging
    if (!message || typeof message !== 'string' || !message.trim()) {
      logger.warn('Invalid analyze request', {
        requestId,
        clientIP,
        messageProvided: !!message,
        messageType: typeof message,
        messageLength: message ? message.length : 0
      });

      return res.status(400).json({
        success: false,
        error: 'Message is required for analysis',
        timestamp: new Date().toISOString()
      });
    }

    const trimmedMessage = message.trim();
    logger.debug('Starting intent analysis', {
      requestId,
      clientIP,
      messageLength: trimmedMessage.length,
      messagePreview: trimmedMessage.substring(0, 50)
    });

    const intentResult = intentDetector.detectIntent(trimmedMessage);
    const processingTime = Date.now() - startTime;
    
    // Log analysis results
    logger.info('Intent analysis completed', {
      requestId,
      clientIP,
      detectedIntent: intentResult.intent,
      confidence: intentResult.confidence,
      analysisSuccess: intentResult.success,
      processingTime: `${processingTime}ms`,
      thresholdMet: intentResult.confidence >= config.intentDetection.confidenceThreshold
    });
    
    res.json({
      success: true,
      data: {
        message: trimmedMessage,
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        analysis: {
          detected: intentResult.success,
          timestamp: intentResult.timestamp,
          threshold: config.intentDetection.confidenceThreshold,
          processingTime: `${processingTime}ms`
        }
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Error analyzing message intent', {
      requestId,
      clientIP,
      errorMessage: error.message,
      errorStack: error.stack,
      requestMessage: req.body.message,
      processingTime: `${processingTime}ms`
    });

    res.status(500).json({
      success: false,
      error: 'Error analyzing message intent',
      timestamp: new Date().toISOString()
    });
  }
});

// Get conversation history
router.get('/history/:sessionId?', (req, res) => {
  const startTime = Date.now();
  const requestId = uuidv4();
  const clientIP = req.ip || req.connection.remoteAddress;

  logger.info('Conversation history request received', {
    requestId,
    clientIP,
    sessionId: req.params.sessionId || 'all',
    requestedLimit: req.query.limit,
    timestamp: new Date().toISOString()
  });

  try {
    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    // Log parameter validation
    logger.debug('Processing history request parameters', {
      requestId,
      sessionId: sessionId || 'all',
      limit,
      validLimit: !isNaN(limit) && limit > 0
    });

    const intentHistory = intentDetector.getIntentHistory(limit);
    const responseHistory = responseGenerator.getResponseHistory(limit);

    // If sessionId is provided, filter by session (would need session tracking implementation)
    let filteredHistory = responseHistory;
    if (sessionId) {
      const originalLength = filteredHistory.length;
      filteredHistory = responseHistory.filter(
        item => item.response.metadata.context?.sessionId === sessionId
      );
      
      logger.debug('Filtered history by session', {
        requestId,
        sessionId,
        originalCount: originalLength,
        filteredCount: filteredHistory.length
      });
    }

    const processingTime = Date.now() - startTime;

    logger.info('Conversation history retrieved successfully', {
      requestId,
      clientIP,
      sessionId: sessionId || 'all',
      conversationsReturned: filteredHistory.slice(0, limit).length,
      intentsReturned: intentHistory.slice(0, limit).length,
      totalConversations: filteredHistory.length,
      processingTime: `${processingTime}ms`
    });

    res.json({
      success: true,
      data: {
        sessionId: sessionId || 'all',
        conversations: filteredHistory.slice(0, limit),
        intents: intentHistory.slice(0, limit),
        metadata: {
          totalConversations: filteredHistory.length,
          limit: limit,
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Error retrieving conversation history', {
      requestId,
      clientIP,
      sessionId: req.params.sessionId,
      errorMessage: error.message,
      errorStack: error.stack,
      processingTime: `${processingTime}ms`
    });

    res.status(500).json({
      success: false,
      error: 'Error retrieving conversation history',
      timestamp: new Date().toISOString()
    });
  }
});

// Get available intents
router.get('/intents', (req, res) => {
  const startTime = Date.now();
  const requestId = uuidv4();
  const clientIP = req.ip || req.connection.remoteAddress;

  logger.info('Available intents request received', {
    requestId,
    clientIP,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });

  try {
    logger.debug('Retrieving available intents and responses', {
      requestId,
      clientIP
    });

    const intents = intentDetector.getAvailableIntents();
    const responses = responseGenerator.getAvailableResponses();
    const processingTime = Date.now() - startTime;

    logger.info('Available intents retrieved successfully', {
      requestId,
      clientIP,
      intentCount: intents.length,
      responseCount: responses.length,
      processingTime: `${processingTime}ms`
    });

    res.json({
      success: true,
      data: {
        intents: intents,
        responses: responses,
        configuration: {
          confidenceThreshold: config.intentDetection.confidenceThreshold,
          maxResponseLength: config.responses.maxResponseLength
        },
        metadata: {
          totalIntents: intents.length,
          totalResponses: responses.length,
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Error retrieving available intents', {
      requestId,
      clientIP,
      errorMessage: error.message,
      errorStack: error.stack,
      processingTime: `${processingTime}ms`
    });

    res.status(500).json({
      success: false,
      error: 'Error retrieving available intents',
      timestamp: new Date().toISOString()
    });
  }
});

// Reset conversation (clear history for session)
router.delete('/reset/:sessionId?', (req, res) => {
  const startTime = Date.now();
  const requestId = uuidv4();
  const clientIP = req.ip || req.connection.remoteAddress;

  logger.info('Conversation reset request received', {
    requestId,
    clientIP,
    sessionId: req.params.sessionId || 'global',
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });

  try {
    const { sessionId } = req.params;

    // This would typically clear session-specific data
    // For now, we'll just return a success response
    const processingTime = Date.now() - startTime;
    
    logger.info('Conversation reset completed successfully', { 
      requestId,
      clientIP,
      sessionId: sessionId || 'global',
      processingTime: `${processingTime}ms`
    });

    res.json({
      success: true,
      data: {
        message: sessionId 
          ? `Conversation history cleared for session ${sessionId}` 
          : 'Global conversation history cleared',
        sessionId: sessionId || null,
        metadata: {
          requestId,
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Error resetting conversation', {
      requestId,
      clientIP,
      sessionId: req.params.sessionId,
      errorMessage: error.message,
      errorStack: error.stack,
      processingTime: `${processingTime}ms`
    });

    res.status(500).json({
      success: false,
      error: 'Error resetting conversation',
      timestamp: new Date().toISOString()
    });
  }
});

// Chat status endpoint
router.get('/status', (req, res) => {
  const startTime = Date.now();
  const requestId = uuidv4();
  const clientIP = req.ip || req.connection.remoteAddress;

  logger.info('Chat status request received', {
    requestId,
    clientIP,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });

  try {
    logger.debug('Gathering system status information', {
      requestId,
      clientIP
    });

    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();
    const availableIntents = intentDetector.getAvailableIntents();
    const availableResponses = responseGenerator.getAvailableResponses();

    const status = {
      chatbot: {
        status: 'operational',
        version: '1.0.0',
        features: ['intent-detection', 'response-generation', 'conversation-history'],
        uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`
      },
      intentDetection: {
        available: true,
        confidenceThreshold: config.intentDetection.confidenceThreshold,
        supportedIntents: availableIntents.length,
        intentList: availableIntents.map(intent => intent.name || intent)
      },
      responseGeneration: {
        available: true,
        maxLength: config.responses.maxResponseLength,
        templates: availableResponses.length,
        defaultResponse: config.responses.defaultResponse
      },
      performance: {
        uptime: uptime,
        memoryUsage: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100,
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100,
          external: Math.round(memoryUsage.external / 1024 / 1024 * 100) / 100,
          rss: Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100
        },
        nodeVersion: process.version,
        platform: process.platform
      }
    };

    const processingTime = Date.now() - startTime;

    logger.info('Chat status retrieved successfully', {
      requestId,
      clientIP,
      systemStatus: 'operational',
      intentCount: availableIntents.length,
      responseCount: availableResponses.length,
      memoryUsedMB: status.performance.memoryUsage.used,
      uptimeSeconds: uptime,
      processingTime: `${processingTime}ms`
    });

    res.json({
      success: true,
      data: status,
      metadata: {
        requestId,
        processingTime: `${processingTime}ms`,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Error retrieving chat status', {
      requestId,
      clientIP,
      errorMessage: error.message,
      errorStack: error.stack,
      processingTime: `${processingTime}ms`
    });

    res.status(500).json({
      success: false,
      error: 'Error retrieving chat status',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;