const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const db = require('./database');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3010;

// Logger setup
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'customer-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Correlation ID middleware
app.use((req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || uuidv4();
  res.setHeader('X-Correlation-ID', req.correlationId);
  req.logger = logger;
  next();
});

// Request logging
app.use((req, res, next) => {
  logger.info('Request received', {
    method: req.method,
    path: req.path,
    correlationId: req.correlationId
  });
  next();
});

// Routes
app.use('/api/v1/auth', routes.auth);
app.use('/api/v1/customers', routes.customers);
app.use('/sd-party-reference-data-management/v1', routes.bian);

// Health check
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await db.healthCheck();
    res.json({
      status: 'healthy',
      service: 'customer-service',
      database: dbHealth,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      service: 'customer-service',
      error: error.message
    });
  }
});

app.get('/health/ready', (req, res) => {
  res.json({ status: 'ready', timestamp: new Date().toISOString() });
});

app.get('/health/live', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    correlationId: req.correlationId
  });

  res.status(err.statusCode || 500).json({
    status: 'error',
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message,
      details: err.details || {}
    },
    metadata: {
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    }
  });
});

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await db.healthCheck();
    logger.info('Database connection established');

    app.listen(PORT, () => {
      logger.info(`Customer Service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await db.close();
  process.exit(0);
});
