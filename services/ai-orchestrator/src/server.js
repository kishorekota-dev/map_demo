require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('../config');
const logger = require('./utils/logger');
const { initializeDatabase } = require('./models');
const EnhancedMCPClient = require('./services/enhancedMCPClient');
const SessionManager = require('./services/sessionManager');
const WorkflowService = require('./services/workflowService');

// Import routes
const orchestratorRoutes = require('./routes/orchestrator.routes');
const healthRoutes = require('./routes/health');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandlers');

// Initialize Express app
const app = express();
const PORT = config.server.port;

/**
 * Initialize services
 */
async function initializeServices() {
  try {
    logger.info('Initializing AI Orchestrator services...');

    // Initialize database
    await initializeDatabase();
    logger.info('Database initialized');

    // Initialize Enhanced MCP Client (hybrid protocol support)
    const mcpClient = new EnhancedMCPClient();
    await mcpClient.initialize();
    logger.info('Enhanced MCP Client initialized with hybrid protocol support');

    // Initialize Session Manager
    const sessionManager = new SessionManager();
    logger.info('Session Manager initialized');

    // Initialize Workflow Service
    const workflowService = new WorkflowService(mcpClient, sessionManager);
    logger.info('Workflow Service initialized');

    // Store services in app locals
    app.locals.mcpClient = mcpClient;
    app.locals.sessionManager = sessionManager;
    app.locals.workflowService = workflowService;

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Configure middleware
 */
function configureMiddleware() {
  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"]
      }
    }
  }));

  // CORS
  app.use(cors({
    origin: config.cors.allowedOrigins,
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID', 'X-Request-ID']
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    message: {
      success: false,
      message: 'Too many requests, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use('/api', limiter);

  // Compression
  app.use(compression());

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  if (config.server.env === 'development') {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined', {
      stream: {
        write: (message) => logger.info(message.trim())
      }
    }));
  }

  // Custom request logger
  app.use(logger.requestMiddleware);
}

/**
 * Configure routes
 */
function configureRoutes() {
  // Health check
  app.get('/', (req, res) => {
    res.json({
      service: 'POC AI Orchestrator',
      version: '1.0.0',
      status: 'operational',
      description: 'AI Orchestrator with LangGraph workflow and MCP integration',
      endpoints: {
        health: '/health',
        orchestrator: '/api/orchestrator'
      },
      features: [
        'LangGraph workflow execution',
        'Intent-based prompt selection',
        'Human-in-the-loop support',
        'MCP tool integration',
        'PostgreSQL session management',
        'Conversation state persistence'
      ],
      timestamp: new Date().toISOString()
    });
  });

  // API routes
  app.use('/health', healthRoutes);
  app.use('/api/orchestrator', orchestratorRoutes);

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);
}

/**
 * Start server
 */
async function startServer() {
  try {
    // Initialize services first
    await initializeServices();

    // Configure middleware
    configureMiddleware();

    // Configure routes
    configureRoutes();

    // Start listening
    const server = app.listen(PORT, () => {
      logger.info('╔═══════════════════════════════════════════════════════════╗');
      logger.info('║         POC AI Orchestrator Service Started              ║');
      logger.info('╚═══════════════════════════════════════════════════════════╝');
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`🌍 Environment: ${config.server.env}`);
      logger.info(`🔧 API Base: http://localhost:${PORT}/api/orchestrator`);
      logger.info(`❤️  Health Check: http://localhost:${PORT}/health`);
      logger.info(`🤖 MCP Service: ${config.mcp.serviceUrl}`);
      logger.info('');
      logger.info('Features:');
      logger.info('  • LangGraph workflow execution');
      logger.info('  • Intent-based processing');
      logger.info('  • Human-in-the-loop');
      logger.info('  • MCP tool integration');
      logger.info('  • Session management (PostgreSQL)');
      logger.info('═══════════════════════════════════════════════════════════');
    });

    // Graceful shutdown
    const gracefulShutdown = (signal) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);
      
      server.close(async (err) => {
        if (err) {
          logger.error('Error during shutdown', { error: err.message });
          process.exit(1);
        }

        try {
          // Stop session cleanup
          if (app.locals.sessionManager) {
            app.locals.sessionManager.stopCleanup();
          }

          // Close database connection
          const { sequelize } = require('./models');
          await sequelize.close();
          
          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during cleanup', { error: error.message });
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Start the server
startServer();

module.exports = app;
