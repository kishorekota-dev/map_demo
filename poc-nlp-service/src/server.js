/**
 * POC NLP Service Server
 * Natural Language Processing Microservice
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./utils/logger');
const nlpRoutes = require('./routes/nlp.routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandlers');
const config = require('./config/config');

class NLPService {
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
      max: 100, // limit each IP to 100 requests per windowMs
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
        service: 'poc-nlp-service',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: require('../package.json').version
      });
    });
  }

  setupRoutes() {
    this.app.use('/api/nlp', nlpRoutes);
    
    // Service info endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        service: 'POC NLP Service',
        version: require('../package.json').version,
        description: 'Natural Language Processing Microservice',
        endpoints: {
          health: '/health',
          nlp: '/api/nlp',
          process: '/api/nlp/process',
          analyze: '/api/nlp/analyze',
          entities: '/api/nlp/entities',
          sentiment: '/api/nlp/sentiment'
        },
        capabilities: [
          'Text Processing',
          'Tokenization',
          'Part-of-Speech Tagging',
          'Named Entity Recognition',
          'Sentiment Analysis',
          'Text Normalization',
          'Keyword Extraction'
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
      logger.info(`POC NLP Service started on port ${this.port}`);
      logger.info(`Health check: http://localhost:${this.port}/health`);
      logger.info(`API docs: http://localhost:${this.port}/api`);
    });
  }
}

// Start the service
const nlpService = new NLPService();
nlpService.start();

module.exports = nlpService;