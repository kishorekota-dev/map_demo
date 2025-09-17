const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Import configurations and utilities
const config = require('./config');
const logger = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandlers');
const { requestLogger } = require('./middleware/requestLogger');
const { validateEnvironment } = require('./utils/validation');

// Import routes
const chatRoutes = require('./routes/chat');
const healthRoutes = require('./routes/health');
const pocBankingRoutes = require('./routes/poc-banking.routes');

class ChatbotServer {
  constructor() {
    this.app = express();
    this.port = config.server.port;
    
    // Validate environment on startup
    this.validateEnvironment();
    
    // Initialize middleware and routes
    this.initializeSecurityMiddleware();
    this.initializeGeneralMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  validateEnvironment() {
    try {
      validateEnvironment();
      logger.info('Environment validation passed');
    } catch (error) {
      logger.error('Environment validation failed:', error.message);
      process.exit(1);
    }
  }

  initializeSecurityMiddleware() {
    // Security headers
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration
    const corsOptions = {
      origin: config.cors.allowedOrigins,
      credentials: config.cors.credentials,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID', 'X-Request-ID'],
      exposedHeaders: ['X-Request-ID', 'X-Response-Time']
    };
    this.app.use(cors(corsOptions));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(config.rateLimit.windowMs / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        // Skip rate limiting for health checks
        return req.path === '/api/health' || req.path === '/health';
      }
    });
    this.app.use('/api', limiter);
  }

  initializeGeneralMiddleware() {
    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ 
      limit: config.server.bodyLimit,
      strict: true
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: config.server.bodyLimit 
    }));

    // Request logging
    if (config.env === 'development') {
      this.app.use(morgan('dev'));
    } else {
      this.app.use(morgan('combined', {
        stream: {
          write: (message) => logger.info(message.trim())
        }
      }));
    }

    // Custom request logger middleware
    this.app.use(requestLogger);

    // Health check endpoint (before other middlewares)
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        success: true,
        message: 'Server is healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.env,
        version: require('../package.json').version
      });
    });
  }

  initializeRoutes() {
    // API routes
    this.app.use('/api/chat', chatRoutes);
    this.app.use('/api/health', healthRoutes);
    this.app.use('/api/banking', pocBankingRoutes);

    // API documentation route
    this.app.get('/api', (req, res) => {
      res.json({
        success: true,
        message: 'Chatbot POC API',
        version: require('../package.json').version,
        endpoints: {
          chat: '/api/chat',
          health: '/api/health',
          banking: '/api/banking'
        },
        documentation: {
          openapi: '/api/docs',
          postman: '/api/postman'
        }
      });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        message: 'Chatbot POC Backend Server',
        version: require('../package.json').version,
        environment: config.env,
        api: {
          baseUrl: `/api`,
          documentation: `/api`,
          health: `/health`
        }
      });
    });
  }

  initializeErrorHandling() {
    // 404 handler (must be after all routes)
    this.app.use(notFoundHandler);

    // Global error handler (must be last)
    this.app.use(errorHandler);
  }

  start() {
    const server = this.app.listen(this.port, () => {
      logger.info(`🚀 Chatbot POC Backend Server Started`);
      logger.info(`📡 Server running on port ${this.port}`);
      logger.info(`🌍 Environment: ${config.env}`);
      logger.info(`🔧 API Base URL: http://localhost:${this.port}/api`);
      logger.info(`❤️  Health Check: http://localhost:${this.port}/health`);
      
      if (config.env === 'development') {
        logger.info(`📚 API Documentation: http://localhost:${this.port}/api`);
      }
    });

    // Graceful shutdown handling
    const gracefulShutdown = (signal) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);
      
      server.close((err) => {
        if (err) {
          logger.error('Error during server shutdown:', err);
          process.exit(1);
        }
        
        logger.info('Server shut down gracefully');
        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions and rejections
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('UNHANDLED_REJECTION');
    });

    return server;
  }

  getApp() {
    return this.app;
  }
}

module.exports = ChatbotServer;