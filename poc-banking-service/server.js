require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const winston = require('winston');

console.log('Loading modules...');

// Wrap in error handler
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error.message);
  console.error('Stack:', error.stack);
  console.error('Code:', error.code);
  process.exit(1);
});

// Import database
const db = require('./database');
console.log('Database module loaded');

// Import routes
const authRoutes = require('./routes/auth');
console.log('Auth routes loaded');
const accountRoutes = require('./routes/accounts');
console.log('Account routes loaded');
const transactionRoutes = require('./routes/transactions');
console.log('Transaction routes loaded');
const cardRoutes = require('./routes/cards');
console.log('Card routes loaded');
const transferRoutes = require('./routes/transfers');
console.log('Transfer routes loaded');
const fraudRoutes = require('./routes/fraud');
console.log('Fraud routes loaded');
const disputeRoutes = require('./routes/disputes');
console.log('Dispute routes loaded');
const healthRoutes = require('./routes/health');
console.log('Health routes loaded');

// Import middleware
const authMiddleware = require('./middleware/auth');
console.log('Auth middleware loaded');
const validationMiddleware = require('./middleware/validation');
console.log('Validation middleware loaded');
const securityMiddleware = require('./middleware/security');
console.log('Security middleware loaded');
const errorMiddleware = require('./middleware/error');
console.log('Error middleware loaded');

console.log('All modules loaded successfully');

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
      styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:", "https://unpkg.com"]
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

// Serve static files for API documentation
app.use(express.static('public'));

// Serve OpenAPI spec
app.get('/openapi.yaml', (req, res) => {
  res.sendFile(__dirname + '/openapi.yaml');
});

// Security middleware - apply general rate limiting
app.use(securityMiddleware.generalRateLimit);

// Service discovery and health
app.use('/health', healthRoutes);

// Authentication routes (no auth required)
app.use('/api/v1/auth', authRoutes);

// API routes with authentication
app.use('/api/v1/accounts', authMiddleware.authenticateToken, accountRoutes);
app.use('/api/v1/transactions', authMiddleware.authenticateToken, transactionRoutes);
app.use('/api/v1/cards', authMiddleware.authenticateToken, cardRoutes);
app.use('/api/v1/transfers', authMiddleware.authenticateToken, transferRoutes);
app.use('/api/v1/fraud', authMiddleware.authenticateToken, fraudRoutes);
app.use('/api/v1/disputes', authMiddleware.authenticateToken, disputeRoutes);

// API documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    service: 'POC Banking Service',
    version: '1.0.0',
    description: 'Microservice for banking operations with JWT authentication and RBAC',
    endpoints: {
      auth: '/api/v1/auth',
      accounts: '/api/v1/accounts',
      transactions: '/api/v1/transactions',
      cards: '/api/v1/cards',
      transfers: '/api/v1/transfers',
      fraud: '/api/v1/fraud',
      disputes: '/api/v1/disputes',
      health: '/health',
      docs: '/api/docs'
    },
    authentication: {
      type: 'JWT Bearer Token',
      login: 'POST /api/v1/auth/login',
      refresh: 'POST /api/v1/auth/refresh',
      logout: 'POST /api/v1/auth/logout',
      profile: 'GET /api/v1/auth/me'
    },
    swagger: {
      spec: '/openapi.yaml',
      ui: '/api-docs.html'
    },
    note: 'All endpoints require JWT Bearer token authentication (except /api/v1/auth)',
    contact: 'POC Development Team'
  });
});

// Error handling middleware
app.use(errorMiddleware.errorHandler);

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