/**
 * POC NLU Service Server
 * Natural Language Understanding Microservice
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./utils/logger');
const nluRoutes = require('./routes/nlu.routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandlers');
const config = require('./config/config');

class NLUService {
  constructor() {
    this.app = express();
    this.port = config.port;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors({
      origin: config.cors.origin,
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 200, // limit each IP to 200 requests per windowMs
      message: {
        error: 'Too many requests from this IP, please try again later.'
      }
    });
    this.app.use('/api', limiter);

    // Request parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging
    this.app.use(morgan('combined', {
      stream: { write: (message) => logger.info(message.trim()) }
    }));

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        service: 'poc-nlu-service',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: require('../package.json').version
      });
    });
  }

  setupRoutes() {
    this.app.use('/api/nlu', nluRoutes);
    
    // Service info endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        service: 'POC NLU Service',
        version: require('../package.json').version,
        description: 'Natural Language Understanding Microservice',
        endpoints: {
          health: '/health',
          nlu: '/api/nlu',
          intents: '/api/nlu/intents',
          entities: '/api/nlu/entities',
          dialogflow: '/api/nlu/dialogflow',
          banking: '/api/nlu/banking',
          train: '/api/nlu/train'
        },
        capabilities: [
          'Intent Detection',
          'Entity Extraction',
          'Context Management',
          'DialogFlow Integration',
          'Banking Domain Understanding',
          'Multi-language Support',
          'Confidence Scoring',
          'Training Data Management'
        ]
      });
    });
  }

  setupErrorHandling() {
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  start() {
    this.app.listen(this.port, () => {
      logger.info(`POC NLU Service started on port ${this.port}`);
      logger.info(`Health check: http://localhost:${this.port}/health`);
      logger.info(`API docs: http://localhost:${this.port}/api`);
    });
  }
}

// Start the service
const nluService = new NLUService();
nluService.start();

module.exports = nluService;