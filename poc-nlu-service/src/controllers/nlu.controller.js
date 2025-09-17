/**
 * NLU Controller
 * Handles HTTP requests for NLU operations
 */

const nluService = require('../services/nlu.service');
const bankingNLU = require('../services/banking-nlu.service');
const dialogflowService = require('../services/dialogflow.service');
const logger = require('../utils/logger');

class NLUController {
  /**
   * Detect intent from user message
   */
  async detectIntent(req, res) {
    try {
      const { message, userId = 'default', sessionId = 'default' } = req.body;
      
      logger.info('Intent detection request', {
        messageLength: message.length,
        userId,
        sessionId
      });

      const result = await nluService.detectIntent(message, userId, sessionId);
      
      if (result.success) {
        res.json({
          success: true,
          data: result.data
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          data: result.data
        });
      }
    } catch (error) {
      logger.error('Error in detectIntent', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Detect banking-specific intent
   */
  async detectBankingIntent(req, res) {
    try {
      const { message } = req.body;
      
      logger.info('Banking intent detection', { messageLength: message.length });

      const result = await bankingNLU.detectBankingIntent(message);
      
      res.json({
        success: true,
        data: result || {
          intent: null,
          confidence: 0,
          message: 'No banking intent detected'
        }
      });
    } catch (error) {
      logger.error('Error in detectBankingIntent', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Extract entities from message
   */
  async extractEntities(req, res) {
    try {
      const { message, domain = 'general' } = req.body;
      
      logger.info('Entity extraction', { messageLength: message.length, domain });

      let entities = [];
      
      if (domain === 'banking') {
        entities = bankingNLU.extractBankingEntities(message);
      } else {
        entities = nluService.extractBasicEntities(message);
      }
      
      res.json({
        success: true,
        data: {
          entities,
          count: entities.length,
          domain
        }
      });
    } catch (error) {
      logger.error('Error in extractEntities', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Use DialogFlow for intent detection
   */
  async useDialogFlow(req, res) {
    try {
      const { message, sessionId = 'default' } = req.body;
      
      logger.info('DialogFlow intent detection', {
        messageLength: message.length,
        sessionId
      });

      const result = await dialogflowService.detectIntent(message, sessionId);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error in useDialogFlow', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Get available intents
   */
  async getAvailableIntents(req, res) {
    try {
      const intents = nluService.getAvailableIntents();
      
      res.json({
        success: true,
        data: intents
      });
    } catch (error) {
      logger.error('Error in getAvailableIntents', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get banking intents
   */
  async getBankingIntents(req, res) {
    try {
      const intents = bankingNLU.getAvailableIntents();
      const examples = bankingNLU.getIntentExamples();
      
      res.json({
        success: true,
        data: {
          intents,
          examples,
          count: intents.length
        }
      });
    } catch (error) {
      logger.error('Error in getBankingIntents', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get banking entities
   */
  async getBankingEntities(req, res) {
    try {
      const entityTypes = bankingNLU.getBankingEntityTypes();
      
      res.json({
        success: true,
        data: {
          entityTypes,
          count: entityTypes.length,
          descriptions: {
            amount: 'Monetary amounts and currency values',
            account_number: 'Bank account numbers and identifiers',
            card_type: 'Credit/debit card types and brands',
            account_type: 'Account types (checking, savings, etc.)',
            bill_type: 'Types of bills and utility payments',
            time_period: 'Time periods and date ranges',
            loan_type: 'Types of loans and mortgages'
          }
        }
      });
    } catch (error) {
      logger.error('Error in getBankingEntities', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Update context for session
   */
  async updateContext(req, res) {
    try {
      const { sessionId } = req.params;
      const { context } = req.body;
      
      logger.info('Updating context', { sessionId, contextKeys: Object.keys(context) });

      nluService.updateContext(sessionId, context);
      
      res.json({
        success: true,
        data: {
          sessionId,
          message: 'Context updated successfully'
        }
      });
    } catch (error) {
      logger.error('Error in updateContext', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get context for session
   */
  async getContext(req, res) {
    try {
      const { sessionId } = req.params;
      
      const context = nluService.getContext(sessionId);
      
      res.json({
        success: true,
        data: {
          sessionId,
          context
        }
      });
    } catch (error) {
      logger.error('Error in getContext', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Clear context for session
   */
  async clearContext(req, res) {
    try {
      const { sessionId } = req.params;
      
      nluService.clearContext(sessionId);
      
      res.json({
        success: true,
        data: {
          sessionId,
          message: 'Context cleared successfully'
        }
      });
    } catch (error) {
      logger.error('Error in clearContext', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Train NLU model
   */
  async trainModel(req, res) {
    try {
      const { trainingData } = req.body;
      
      logger.info('Training model', { samples: trainingData.length });

      const result = await nluService.trainModel(trainingData);
      
      if (result.success) {
        res.json({
          success: true,
          data: result
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      logger.error('Error in trainModel', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get service health
   */
  async getHealth(req, res) {
    try {
      const health = nluService.getServiceHealth();
      
      res.json({
        success: true,
        data: health
      });
    } catch (error) {
      logger.error('Error in getHealth', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get service capabilities
   */
  async getCapabilities(req, res) {
    try {
      const health = nluService.getServiceHealth();
      const bankingIntents = bankingNLU.getAvailableIntents();
      const bankingEntities = bankingNLU.getBankingEntityTypes();
      
      res.json({
        success: true,
        data: {
          service: 'POC NLU Service',
          version: '1.0.0',
          capabilities: health.capabilities,
          statistics: health.statistics,
          banking: {
            intents: bankingIntents.length,
            entities: bankingEntities.length
          },
          endpoints: {
            detectIntent: '/api/nlu/intents',
            bankingIntent: '/api/nlu/banking',
            extractEntities: '/api/nlu/entities',
            dialogflow: '/api/nlu/dialogflow',
            context: '/api/nlu/context/:sessionId',
            train: '/api/nlu/train',
            health: '/api/nlu/health'
          },
          examples: {
            detectIntent: {
              method: 'POST',
              url: '/api/nlu/intents',
              body: {
                message: 'What is my account balance?',
                userId: 'user123',
                sessionId: 'session456'
              }
            },
            bankingIntent: {
              method: 'POST',
              url: '/api/nlu/banking',
              body: {
                message: 'Transfer $100 to John'
              }
            }
          }
        }
      });
    } catch (error) {
      logger.error('Error in getCapabilities', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get DialogFlow status
   */
  async getDialogFlowStatus(req, res) {
    try {
      const status = dialogflowService.getServiceStatus();
      
      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      logger.error('Error in getDialogFlowStatus', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
}

module.exports = new NLUController();