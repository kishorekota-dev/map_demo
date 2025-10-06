require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const winston = require('winston');

// Import database
const db = require('./database');

// Import routes
const accountRoutes = require('./routes/accounts');
const transactionRoutes = require('./routes/transactions');
const cardRoutes = require('./routes/cards');
const transferRoutes = require('./routes/transfers');
const fraudRoutes = require('./routes/fraud');
const disputeRoutes = require('./routes/disputes');
const healthRoutes = require('./routes/health');

// Import middleware
const authMiddleware = require('./middleware/auth');
const validationMiddleware = require('./middleware/validation');
const securityMiddleware = require('./middleware/security');
const errorMiddleware = require('./middleware/error');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3005;

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    }),
    new winston.transports.File({ filename: 'logs/banking-service.log' })
  ]
});

// Global middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security middleware
app.use(securityMiddleware);

// Service discovery and health
app.use('/health', healthRoutes);

// API routes with authentication
app.use('/api/accounts', authMiddleware, accountRoutes);
app.use('/api/transactions', authMiddleware, transactionRoutes);
app.use('/api/cards', authMiddleware, cardRoutes);
app.use('/api/transfers', authMiddleware, transferRoutes);
app.use('/api/fraud', authMiddleware, fraudRoutes);
app.use('/api/disputes', authMiddleware, disputeRoutes);

// API documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    service: 'POC Banking Service',
    version: '1.0.0',
    description: 'Microservice for banking operations including accounts, transactions, cards, and fraud detection',
    endpoints: {
      accounts: '/api/accounts',
      transactions: '/api/transactions', 
      cards: '/api/cards',
      transfers: '/api/transfers',
      fraud: '/api/fraud',
      disputes: '/api/disputes',
      health: '/health'
    },
    authentication: 'JWT Bearer Token required for all API endpoints',
    contact: 'POC Development Team'
  });
});

// Error handling middleware
app.use(errorMiddleware);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Banking Service: Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down banking service gracefully');
  server.close(async () => {
    await db.close();
    logger.info('Banking service process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down banking service gracefully');
  server.close(async () => {
    await db.close();
    logger.info('Banking service process terminated');
    process.exit(0);
  });
});

// Start server
const server = app.listen(PORT, async () => {
  logger.info(`POC Banking Service running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Service endpoints available at http://localhost:${PORT}/api`);
  logger.info(`Health check available at http://localhost:${PORT}/health`);
  
  // Check database connection
  try {
    const health = await db.healthCheck();
    if (health.status === 'healthy') {
      logger.info(`Database connected: ${health.version.split(',')[0]}`);
      logger.info(`Connection pool: ${health.poolSize} total, ${health.idleConnections} idle`);
    } else {
      logger.error('Database health check failed:', health.error);
    }
  } catch (error) {
    logger.error('Database connection error:', error.message);
  }
});

module.exports = app;