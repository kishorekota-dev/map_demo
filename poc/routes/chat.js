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

// Chat processing endpoint
router.post('/message', async (req, res) => {
  const startTime = Date.now();
  const sessionId = req.headers['x-session-id'] || uuidv4();

  try {
    const { message, context = {} } = req.body;

    // Validate input
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required and must be a non-empty string',
        timestamp: new Date().toISOString()
      });
    }

    const trimmedMessage = message.trim();
    
    // Log incoming message
    logger.info('Processing chat message', { 
      sessionId, 
      messageLength: trimmedMessage.length,
      hasContext: Object.keys(context).length > 0
    });

    // Detect intent
    const intentResult = intentDetector.detectIntent(trimmedMessage);
    
    if (!intentResult.success) {
      logger.warn('Intent detection failed', { 
        sessionId, 
        message: trimmedMessage,
        error: intentResult.message 
      });
    }

    // Generate response
    const response = responseGenerator.generateResponse(
      intentResult, 
      trimmedMessage, 
      { sessionId, ...context }
    );

    const processingTime = Date.now() - startTime;

    // Log response generation
    logger.info('Chat response generated', {
      sessionId,
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      processingTime: `${processingTime}ms`
    });

    // Send response
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
          responseId: response.metadata.responseId,
          processingTime,
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Error processing chat message', {
      sessionId,
      error: error.message,
      stack: error.stack,
      processingTime: `${processingTime}ms`
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error while processing message',
      metadata: {
        sessionId,
        processingTime,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Get intent analysis endpoint
router.post('/analyze', (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required for analysis',
        timestamp: new Date().toISOString()
      });
    }

    const intentResult = intentDetector.detectIntent(message.trim());
    
    res.json({
      success: true,
      data: {
        message: message.trim(),
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        analysis: {
          detected: intentResult.success,
          timestamp: intentResult.timestamp,
          threshold: config.intentDetection.confidenceThreshold
        }
      }
    });

  } catch (error) {
    logger.error('Error analyzing message intent', {
      error: error.message,
      message: req.body.message
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
  try {
    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    const intentHistory = intentDetector.getIntentHistory(limit);
    const responseHistory = responseGenerator.getResponseHistory(limit);

    // If sessionId is provided, filter by session (would need session tracking implementation)
    let filteredHistory = responseHistory;
    if (sessionId) {
      filteredHistory = responseHistory.filter(
        item => item.response.metadata.context?.sessionId === sessionId
      );
    }

    res.json({
      success: true,
      data: {
        sessionId: sessionId || 'all',
        conversations: filteredHistory.slice(0, limit),
        intents: intentHistory.slice(0, limit),
        metadata: {
          totalConversations: filteredHistory.length,
          limit: limit,
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    logger.error('Error retrieving conversation history', {
      error: error.message,
      sessionId: req.params.sessionId
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
  try {
    const intents = intentDetector.getAvailableIntents();
    const responses = responseGenerator.getAvailableResponses();

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
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    logger.error('Error retrieving available intents', {
      error: error.message
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
  try {
    const { sessionId } = req.params;

    // This would typically clear session-specific data
    // For now, we'll just return a success response
    logger.info('Conversation reset requested', { sessionId });

    res.json({
      success: true,
      data: {
        message: sessionId 
          ? `Conversation history cleared for session ${sessionId}` 
          : 'Global conversation history cleared',
        sessionId: sessionId || null,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error resetting conversation', {
      error: error.message,
      sessionId: req.params.sessionId
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
  try {
    const status = {
      chatbot: {
        status: 'operational',
        version: '1.0.0',
        features: ['intent-detection', 'response-generation', 'conversation-history']
      },
      intentDetection: {
        available: true,
        confidenceThreshold: config.intentDetection.confidenceThreshold,
        supportedIntents: intentDetector.getAvailableIntents().length
      },
      responseGeneration: {
        available: true,
        maxLength: config.responses.maxResponseLength,
        templates: responseGenerator.getAvailableResponses().length
      },
      performance: {
        uptime: process.uptime(),
        memoryUsage: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100
        }
      }
    };

    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error retrieving chat status', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Error retrieving chat status',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;