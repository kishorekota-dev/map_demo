const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Logger setup
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
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
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    correlationId: req.correlationId
  });
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});
app.use(limiter);

// Service URLs
const SERVICES = {
  customer: process.env.CUSTOMER_SERVICE_URL || 'http://localhost:3010',
  account: process.env.ACCOUNT_SERVICE_URL || 'http://localhost:3011',
  card: process.env.CARD_SERVICE_URL || 'http://localhost:3012',
  payment: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3013',
  fraud: process.env.FRAUD_SERVICE_URL || 'http://localhost:3014',
  auth: process.env.PARTY_AUTH_SERVICE_URL || 'http://localhost:3015'
};

// Proxy configuration
const createProxy = (target, pathRewrite = {}) => {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    onProxyReq: (proxyReq, req) => {
      // Forward correlation ID
      proxyReq.setHeader('X-Correlation-ID', req.correlationId);
      proxyReq.setHeader('X-Source-Service', 'api-gateway');
      
      // Forward authentication headers
      if (req.headers.authorization) {
        proxyReq.setHeader('Authorization', req.headers.authorization);
      }
      
      logger.debug('Proxying request', {
        method: req.method,
        path: req.path,
        target,
        correlationId: req.correlationId
      });
    },
    onProxyRes: (proxyRes, req) => {
      logger.debug('Proxy response received', {
        status: proxyRes.statusCode,
        correlationId: req.correlationId
      });
    },
    onError: (err, req, res) => {
      logger.error('Proxy error', {
        error: err.message,
        correlationId: req.correlationId
      });
      res.status(503).json({
        status: 'error',
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service temporarily unavailable',
          correlationId: req.correlationId
        }
      });
    }
  });
};

// Route definitions

// Authentication routes
app.use('/auth', createProxy(SERVICES.auth, { '^/auth': '' }));

// Customer routes (BIAN: Party Reference Data Management)
app.use('/customers', createProxy(SERVICES.customer, { '^/customers': '' }));
app.use('/sd-party-reference-data-management', createProxy(SERVICES.customer));

// Account routes (BIAN: Current Account, Savings Account)
app.use('/accounts', createProxy(SERVICES.account, { '^/accounts': '' }));
app.use('/sd-current-account', createProxy(SERVICES.account));
app.use('/sd-savings-account', createProxy(SERVICES.account));

// Card routes (BIAN: Card Management)
app.use('/cards', createProxy(SERVICES.card, { '^/cards': '' }));
app.use('/sd-card-management', createProxy(SERVICES.card));

// Payment routes (BIAN: Payment Execution)
app.use('/payments', createProxy(SERVICES.payment, { '^/payments': '' }));
app.use('/transfers', createProxy(SERVICES.payment, { '^/transfers': '' }));
app.use('/sd-payment-execution', createProxy(SERVICES.payment));

// Fraud routes (BIAN: Fraud Detection)
app.use('/fraud', createProxy(SERVICES.fraud, { '^/fraud': '' }));
app.use('/disputes', createProxy(SERVICES.fraud, { '^/disputes': '' }));
app.use('/sd-fraud-detection', createProxy(SERVICES.fraud));

// Health check endpoint
app.get('/health', async (req, res) => {
  const healthChecks = await Promise.allSettled(
    Object.entries(SERVICES).map(async ([name, url]) => {
      try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(`${url}/health`, { timeout: 5000 });
        const data = await response.json();
        return { name, status: 'healthy', data };
      } catch (error) {
        return { name, status: 'unhealthy', error: error.message };
      }
    })
  );

  const services = healthChecks.map(result => result.value || result.reason);
  const allHealthy = services.every(s => s.status === 'healthy');

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    gateway: {
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    },
    services
  });
});

// Readiness probe
app.get('/health/ready', (req, res) => {
  res.json({
    status: 'ready',
    timestamp: new Date().toISOString()
  });
});

// Liveness probe
app.get('/health/live', (req, res) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

// API documentation endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'POC Banking API Gateway',
    version: '1.0.0',
    description: 'API Gateway for BIAN-compliant banking microservices',
    endpoints: {
      authentication: '/auth',
      customers: '/customers or /sd-party-reference-data-management',
      accounts: '/accounts or /sd-current-account or /sd-savings-account',
      cards: '/cards or /sd-card-management',
      payments: '/payments or /sd-payment-execution',
      fraud: '/fraud or /sd-fraud-detection',
      health: '/health'
    },
    services: Object.keys(SERVICES)
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
      path: req.path
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Gateway error', {
    error: err.message,
    stack: err.stack,
    correlationId: req.correlationId
  });

  res.status(err.statusCode || 500).json({
    status: 'error',
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message,
      correlationId: req.correlationId
    }
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
  logger.info('Service endpoints:', SERVICES);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});
