/**
 * DialogFlow Integration Service
 * Handles DialogFlow API integration for advanced NLU
 */

const logger = require('../utils/logger');
const config = require('../config/config');

class DialogFlowService {
  constructor() {
    this.enabled = config.dialogflow.enabled;
    
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
      logger.info('DialogFlow service disabled');
    }
  }

  initializeDialogFlow() {
    if (!config.dialogflow.projectId) {
      throw new Error('DialogFlow project ID not configured');
    }

    // Note: Actual DialogFlow SDK initialization would go here
    // const { SessionsClient } = require('@google-cloud/dialogflow');
    // this.sessionsClient = new SessionsClient({
    //   keyFilename: config.dialogflow.keyFilename
    // });
    
    logger.debug('DialogFlow client initialized', {
      projectId: config.dialogflow.projectId,
      languageCode: config.dialogflow.languageCode
    });
  }

  /**
   * Detect intent using DialogFlow
   */
  async detectIntent(message, sessionId = 'default') {
    if (!this.enabled) {
      throw new Error('DialogFlow service is not enabled');
    }

    try {
      logger.debug('Detecting intent with DialogFlow', {
        message: message.substring(0, 100),
        sessionId
      });

      // Mock DialogFlow response for demonstration
      // In real implementation, this would call DialogFlow API
      const mockResponse = await this.mockDialogFlowRequest(message, sessionId);
      
      return this.parseDialogFlowResponse(mockResponse);

    } catch (error) {
      logger.error('DialogFlow intent detection failed', {
        error: error.message,
        sessionId
      });
      throw error;
    }
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
  parseDialogFlowResponse(response) {
    const entities = [];
    
    // Convert DialogFlow parameters to entities
    if (response.parameters) {
      for (const [key, value] of Object.entries(response.parameters)) {
        if (value) {
          entities.push({
            entity: key,
            value: value,
            source: 'dialogflow'
          });
        }
      }
    }

    return {
      intent: response.intent.displayName,
      confidence: response.intent.confidence || 0,
      entities: entities,
      fulfillmentText: response.fulfillmentText,
      source: 'dialogflow',
      languageCode: response.languageCode
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

    // In real implementation:
    // return this.sessionsClient.projectAgentSessionPath(
    //   config.dialogflow.projectId,
    //   sessionId
    // );
    
    return `projects/${config.dialogflow.projectId}/agent/sessions/${sessionId}`;
  }
}

module.exports = DialogFlowService;