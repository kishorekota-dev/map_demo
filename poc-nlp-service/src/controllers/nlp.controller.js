/**
 * NLP Controller
 * Handles HTTP requests for NLP operations
 */

const nlpService = require('../services/nlp.service');
const logger = require('../utils/logger');

class NLPController {
  /**
   * Process text with comprehensive NLP analysis
   */
  async processText(req, res) {
    try {
      const { text, options = {} } = req.body;
      
      logger.info('Processing text request', {
        textLength: text.length,
        hasOptions: Object.keys(options).length > 0
      });

      const result = await nlpService.processText(text, options);
      
      if (result.success) {
        res.json({
          success: true,
          data: result.data
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      logger.error('Error in processText', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Analyze text structure
   */
  async analyzeStructure(req, res) {
    try {
      const { text } = req.body;
      
      logger.info('Analyzing text structure', { textLength: text.length });

      const result = await nlpService.analyzeStructure(text);
      
      if (result.success) {
        res.json({
          success: true,
          data: result.data
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      logger.error('Error in analyzeStructure', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Analyze sentiment
   */
  async analyzeSentiment(req, res) {
    try {
      const { text } = req.body;
      
      logger.info('Analyzing sentiment', { textLength: text.length });

      const sentiment = nlpService.analyzeSentiment(text);
      
      res.json({
        success: true,
        data: sentiment
      });
    } catch (error) {
      logger.error('Error in analyzeSentiment', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Extract entities
   */
  async extractEntities(req, res) {
    try {
      const { text } = req.body;
      
      logger.info('Extracting entities', { textLength: text.length });

      const entities = nlpService.extractEntities(text);
      
      res.json({
        success: true,
        data: entities
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
   * Extract keywords
   */
  async extractKeywords(req, res) {
    try {
      const { text, limit = 10 } = req.body;
      
      logger.info('Extracting keywords', { textLength: text.length, limit });

      const keywords = nlpService.extractKeywords(text, limit);
      
      res.json({
        success: true,
        data: keywords
      });
    } catch (error) {
      logger.error('Error in extractKeywords', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Tokenize text
   */
  async tokenizeText(req, res) {
    try {
      const { text } = req.body;
      
      logger.info('Tokenizing text', { textLength: text.length });

      const tokens = nlpService.tokenize(text);
      
      res.json({
        success: true,
        data: {
          tokens,
          count: tokens.length
        }
      });
    } catch (error) {
      logger.error('Error in tokenizeText', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * Normalize text
   */
  async normalizeText(req, res) {
    try {
      const { text } = req.body;
      
      logger.info('Normalizing text', { textLength: text.length });

      const normalized = nlpService.normalizeText(text);
      
      res.json({
        success: true,
        data: {
          original: text,
          normalized,
          changes: {
            lengthChange: normalized.length - text.length,
            caseLowered: text !== text.toLowerCase(),
            punctuationRemoved: /[^\w\s]/.test(text)
          }
        }
      });
    } catch (error) {
      logger.error('Error in normalizeText', { error: error.message });
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
      const health = nlpService.getServiceHealth();
      
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
      const health = nlpService.getServiceHealth();
      
      res.json({
        success: true,
        data: {
          service: 'POC NLP Service',
          version: '1.0.0',
          capabilities: health.capabilities,
          endpoints: {
            process: '/api/nlp/process',
            analyze: '/api/nlp/analyze',
            sentiment: '/api/nlp/sentiment',
            entities: '/api/nlp/entities',
            keywords: '/api/nlp/keywords',
            tokenize: '/api/nlp/tokenize',
            normalize: '/api/nlp/normalize',
            health: '/api/nlp/health'
          },
          examples: {
            process: {
              method: 'POST',
              url: '/api/nlp/process',
              body: { text: 'Hello world, how are you today?' }
            },
            sentiment: {
              method: 'POST',
              url: '/api/nlp/sentiment',
              body: { text: 'I love this service!' }
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
}

module.exports = new NLPController();