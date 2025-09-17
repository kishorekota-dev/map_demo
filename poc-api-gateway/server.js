require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const winston = require('winston');

// Import middleware
const authMiddleware = require('./middleware/auth');
const rateLimitMiddleware = require('./middleware/rateLimit');
const proxyMiddleware = require('./middleware/proxy');
const errorMiddleware = require('./middleware/error');
const securityMiddleware = require('./middleware/security');

// Import routes
const healthRoutes = require('./routes/health');
const metricsRoutes = require('./routes/metrics');

// Import services
const serviceRegistry = require('./services/serviceRegistry');
const loadBalancer = require('./services/loadBalancer');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

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
    new winston.transports.File({ filename: 'logs/api-gateway.log' })
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(compression());

app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security middleware
app.use(securityMiddleware);

// Rate limiting middleware
app.use(rateLimitMiddleware);

// Health and metrics endpoints (no auth required)
app.use('/health', healthRoutes);
app.use('/metrics', metricsRoutes);

// API Gateway info endpoint
app.get('/api', (req, res) => {
  res.json({
    service: 'POC API Gateway',
    version: '1.0.0',
    description: 'Central API Gateway for POC microservices architecture',
    services: {
      banking: '/api/banking/*',
      nlp: '/api/nlp/*',
      nlu: '/api/nlu/*',
      mcp: '/api/mcp/*'
    },
    authentication: 'JWT Bearer Token required for protected endpoints',
    documentation: '/api/docs',
    health: '/health',
    metrics: '/metrics'
  });
});

// Service-specific routing with authentication and load balancing

// Banking Service Routes
app.use('/api/banking',
  authMiddleware,
  proxyMiddleware({
    serviceName: 'poc-banking-service',
    pathRewrite: { '^/api/banking': '/api' },
    changeOrigin: true
  })
);

// NLP Service Routes  
app.use('/api/nlp',
  authMiddleware,
  proxyMiddleware({
    serviceName: 'poc-nlp-service',
    pathRewrite: { '^/api/nlp': '/api' },
    changeOrigin: true
  })
);

// NLU Service Routes
app.use('/api/nlu',
  authMiddleware,
  proxyMiddleware({
    serviceName: 'poc-nlu-service', 
    pathRewrite: { '^/api/nlu': '/api' },
    changeOrigin: true
  })
);

// MCP Service Routes
app.use('/api/mcp',
  authMiddleware,
  proxyMiddleware({
    serviceName: 'poc-mcp-service',
    pathRewrite: { '^/api/mcp': '/api' },
    changeOrigin: true
  })
);

// Public endpoints (no authentication required)
app.use('/api/public/nlp',
  rateLimitMiddleware,
  proxyMiddleware({
    serviceName: 'poc-nlp-service',
    pathRewrite: { '^/api/public/nlp': '/api/public' },
    changeOrigin: true
  })
);

app.use('/api/public/nlu',
  rateLimitMiddleware,
  proxyMiddleware({
    serviceName: 'poc-nlu-service',
    pathRewrite: { '^/api/public/nlu': '/api/public' },
    changeOrigin: true
  })
);

// Error handling middleware
app.use(errorMiddleware);

// 404 handler
app.use('*', (req, res) => {
  logger.warn('Route not found', {
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    error: 'API Gateway: Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    availableServices: {
      banking: '/api/banking',
      nlp: '/api/nlp',
      nlu: '/api/nlu',
      mcp: '/api/mcp'
    }
  });
});

// Initialize service registry and load balancer
async function initializeServices() {
  try {
    await serviceRegistry.initialize();
    await loadBalancer.initialize();
    
    logger.info('Service registry and load balancer initialized');
  } catch (error) {
    logger.error('Failed to initialize services', { error: error.message });
  }
}

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received, shutting down API Gateway gracefully`);
  
  server.close(async () => {
    try {
      await serviceRegistry.shutdown();
      await loadBalancer.shutdown();
      logger.info('API Gateway shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error: error.message });
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const server = app.listen(PORT, async () => {
  logger.info(`POC API Gateway running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Gateway endpoints available at http://localhost:${PORT}/api`);
  logger.info(`Health check available at http://localhost:${PORT}/health`);
  
  // Initialize services after server starts
  await initializeServices();
});

module.exports = app;