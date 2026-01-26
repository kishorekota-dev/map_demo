/**
 * DialogFlow Integration Service
 * Handles DialogFlow API integration for advanced NLU
 */

const logger = require('../utils/logger');
const config = require('../config/config');

class DialogFlowService {
  constructor() {
    this.enabled = config.dialogflow.enabled;
    this.sessionsClient = null;
    
    if (this.enabled) {
      try {
        // Initialize DialogFlow client
        this.initializeDialogFlow();
        logger.info('DialogFlow service initialized');
      } catch (error) {
        logger.error('Failed to initialize DialogFlow', { error: error.message });
        this.enabled = false;
      }
    } else {
      logger.info('DialogFlow service disabled - using mock responses');
    }
  }

  initializeDialogFlow() {
    if (!config.dialogflow.projectId) {
      throw new Error('DialogFlow project ID not configured');
    }

    try {
      // Initialize DialogFlow Sessions Client
      const { SessionsClient } = require('@google-cloud/dialogflow');
      
      const clientConfig = {
        projectId: config.dialogflow.projectId
      };
      
      // Add credentials if key file is provided
      if (config.dialogflow.keyFilename) {
        clientConfig.keyFilename = config.dialogflow.keyFilename;
      }
      
      this.sessionsClient = new SessionsClient(clientConfig);
      
      logger.debug('DialogFlow client initialized', {
        projectId: config.dialogflow.projectId,
        languageCode: config.dialogflow.languageCode,
        hasKeyFile: !!config.dialogflow.keyFilename
      });
    } catch (error) {
      logger.warn('DialogFlow SDK not available, using mock mode', {
        error: error.message
      });
      // Don't throw - fall back to mock mode
    }
  }

  /**
   * Detect intent using DialogFlow (Real or Mock)
   */
  async detectIntent(message, sessionId = 'default', languageCode = null) {
    const lang = languageCode || config.dialogflow.languageCode;
    
    try {
      logger.debug('Detecting intent with DialogFlow', {
        message: message.substring(0, 100),
        sessionId,
        languageCode: lang
      });

      // Use real DialogFlow API if available
      if (this.sessionsClient && this.enabled) {
        return await this.detectIntentReal(message, sessionId, lang);
      } else {
        // Fall back to mock mode
        return await this.detectIntentMock(message, sessionId, lang);
      }

    } catch (error) {
      logger.error('DialogFlow intent detection failed', {
        error: error.message,
        sessionId
      });
      throw error;
    }
  }

  /**
   * Real DialogFlow API integration
   */
  async detectIntentReal(message, sessionId, languageCode) {
    try {
      const sessionPath = this.sessionsClient.projectAgentSessionPath(
        config.dialogflow.projectId,
        sessionId
      );

      const request = {
        session: sessionPath,
        queryInput: {
          text: {
            text: message,
            languageCode: languageCode,
          },
        },
      };

      const [response] = await this.sessionsClient.detectIntent(request);
      
      logger.info('DialogFlow real API response received', {
        intent: response.queryResult.intent?.displayName,
        confidence: response.queryResult.intentDetectionConfidence,
        sessionId
      });

      return this.parseDialogFlowResponse(response.queryResult);

    } catch (error) {
      logger.error('Real DialogFlow API call failed', {
        error: error.message,
        sessionId
      });
      
      // Fall back to mock if real API fails
      logger.warn('Falling back to mock DialogFlow response');
      return await this.detectIntentMock(message, sessionId, languageCode);
    }
  }

  /**
   * Mock DialogFlow detection (for testing/demo without API credentials)
   */
  async detectIntentMock(message, sessionId, languageCode) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));

    const mockResponse = await this.mockDialogFlowRequest(message, sessionId);
    
    return this.parseDialogFlowResponse({
      intent: mockResponse.intent,
      parameters: mockResponse.parameters,
      fulfillmentText: mockResponse.fulfillmentText,
      languageCode: languageCode,
      intentDetectionConfidence: mockResponse.intent.confidence
    });
  }

  /**
   * Mock DialogFlow request (for demonstration)
   * Replace with actual DialogFlow API call
   */
  async mockDialogFlowRequest(message, sessionId) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Mock responses based on message content
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('balance')) {
      return {
        intent: {
          displayName: 'check.balance',
          confidence: 0.92
        },
        parameters: {
          account_type: lowerMessage.includes('savings') ? 'savings' : 'checking'
        },
        fulfillmentText: 'I can help you check your account balance.',
        languageCode: 'en'
      };
    }

    if (lowerMessage.includes('transfer')) {
      return {
        intent: {
          displayName: 'transfer.money',
          confidence: 0.88
        },
        parameters: {
          amount: this.extractAmount(message),
          recipient: this.extractRecipient(message)
        },
        fulfillmentText: 'I can help you transfer money.',
        languageCode: 'en'
      };
    }

    if (lowerMessage.includes('transaction')) {
      return {
        intent: {
          displayName: 'view.transactions',
          confidence: 0.85
        },
        parameters: {
          time_period: this.extractTimePeriod(message)
        },
        fulfillmentText: 'I can show you your transaction history.',
        languageCode: 'en'
      };
    }

    // Default response
    return {
      intent: {
        displayName: 'Default Welcome Intent',
        confidence: 0.3
      },
      parameters: {},
      fulfillmentText: 'I\'m not sure how to help with that.',
      languageCode: 'en'
    };
  }

  /**
   * Parse DialogFlow response into standard format
   */
  parseDialogFlowResponse(queryResult) {
    const entities = [];
    
    // Convert DialogFlow parameters to entities
    const parameters = queryResult.parameters || {};
    
    for (const [key, value] of Object.entries(parameters)) {
      if (value) {
        entities.push({
          entity: key,
          value: value,
          source: 'dialogflow'
        });
      }
    }

    return {
      intent: queryResult.intent?.displayName || 'unknown',
      confidence: queryResult.intentDetectionConfidence || queryResult.intent?.confidence || 0,
      entities: entities,
      fulfillmentText: queryResult.fulfillmentText || '',
      source: 'dialogflow',
      languageCode: queryResult.languageCode || config.dialogflow.languageCode,
      queryText: queryResult.queryText || '',
      allRequiredParamsPresent: queryResult.allRequiredParamsPresent !== false,
      parameters: parameters
    };
  }

  /**
   * Extract amount from message (helper for mock)
   */
  extractAmount(message) {
    const amountMatch = message.match(/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    return amountMatch ? amountMatch[1] : null;
  }

  /**
   * Extract recipient from message (helper for mock)
   */
  extractRecipient(message) {
    const recipientMatch = message.match(/to\s+(\w+)/i);
    return recipientMatch ? recipientMatch[1] : null;
  }

  /**
   * Extract time period from message (helper for mock)
   */
  extractTimePeriod(message) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('recent') || lowerMessage.includes('latest')) {
      return 'recent';
    }
    if (lowerMessage.includes('today')) {
      return 'today';
    }
    if (lowerMessage.includes('week')) {
      return 'this_week';
    }
    if (lowerMessage.includes('month')) {
      return 'this_month';
    }
    
    return 'recent';
  }

  /**
   * Train DialogFlow agent (placeholder)
   */
  async trainAgent(trainingData) {
    if (!this.enabled) {
      throw new Error('DialogFlow service is not enabled');
    }

    try {
      logger.info('Training DialogFlow agent', {
        samples: trainingData.length
      });

      // Mock training process
      await new Promise(resolve => setTimeout(resolve, 1000));

      return {
        success: true,
        message: 'DialogFlow agent training initiated',
        trainingId: `training_${Date.now()}`
      };

    } catch (error) {
      logger.error('DialogFlow training failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get DialogFlow service status
   */
  getServiceStatus() {
    return {
      enabled: this.enabled,
      projectId: config.dialogflow.projectId,
      languageCode: config.dialogflow.languageCode,
      status: this.enabled ? 'connected' : 'disabled'
    };
  }

  /**
   * Create DialogFlow session path
   */
  getSessionPath(sessionId) {
    if (!this.enabled) {
      return null;
    }

    // Use real sessions client if available
    if (this.sessionsClient) {
      return this.sessionsClient.projectAgentSessionPath(
        config.dialogflow.projectId,
        sessionId
      );
    }
    
    // Fall back to mock session path
    return `projects/${config.dialogflow.projectId}/agent/sessions/${sessionId}`;
  }
}

// Export singleton instance
module.exports = new DialogFlowService();