require('dotenv').config();
const { assertProductionConfiguration } = require('./platform/configuration');
assertProductionConfiguration();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const winston = require('winston');

// Import middleware
// These modules export OBJECTS with named members, so destructure the actual
// exports rather than treating the module export as a function.
const { authMiddleware } = require('./middleware/auth');
const rateLimitMiddleware = require('./middleware/rateLimit');
const { createServiceProxy, getServicingRequestTimeoutMs } = require('./middleware/proxy');
const { errorHandler } = require('./middleware/error');
const securityMiddleware = require('./middleware/security');

// Import routes
const healthRoutes = require('./routes/health');
const metricsRoutes = require('./routes/metrics');
const { createControlPlaneRouter } = require('./control-plane');
const { ControlPlaneStore } = require('./control-plane/store');
const { PostgresControlPlaneStore } = require('./control-plane/postgres-store');
const { createOperationsRouter } = require('./operations');
const { createIdentityRouter } = require('./identity');
const { PlatformReadiness } = require('./platform/readiness');
const { createPlatformRouter } = require('./platform');

// Import services. These modules export factory singletons via getInstance(),
// so instantiate them here. Constructing the registry kicks off health checks;
// the load balancer depends on the registry instance.
const serviceRegistryModule = require('./services/serviceRegistry');
const loadBalancerModule = require('./services/loadBalancer');
const serviceRegistry = serviceRegistryModule.getInstance();
const loadBalancer = loadBalancerModule.getInstance(serviceRegistry);

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
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Session-ID',
    'X-Interaction-ID',
    'X-Request-ID'
  ]
}));

app.use(compression());

// Authorization codes, state, and search terms must never enter access logs.
morgan.token('safe-path', (req) => req.originalUrl.split('?')[0]);
app.use(morgan(':remote-addr :method :safe-path :status :res[content-length] :response-time ms', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

app.use(express.json({ limit: '10mb', verify: (req, _res, buffer) => {
  if (req.originalUrl.startsWith('/api/operations/webhooks/')) req.rawBody = Buffer.from(buffer);
} }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Attach a correlation ID and start time before any proxied request. The proxy
// layer uses both values for tracing, response headers, and latency metrics.
app.use((req, res, next) => {
  req.startTime = Date.now();
  req.id = req.get('X-Request-ID') || require('uuid').v4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

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
      chat: '/api/chat/*',
      sessions: '/api/sessions/*',
      health: '/api/health',
      banking: '/api/banking/*',
      nlp: '/api/nlp/*',
      nlu: '/api/nlu/*',
      mcp: '/api/mcp/*',
      orchestrator: '/api/orchestrator/*',
      controlPlane: '/api/control-plane/*',
      operations: '/api/operations/*',
      identity: '/api/identity/*',
      platform: '/api/platform/*'
    },
    authentication: 'JWT Bearer Token required for protected endpoints',
    documentation: '/api/docs',
    health: '/health',
    metrics: '/metrics'
  });
});

// Service-specific routing with authentication and load balancing

// The control plane owns its stricter operator/tenant authentication. Published
// runtime configuration is read through the same verified identity boundary.
const controlPlaneStore = process.env.CONTROL_PLANE_DATABASE_URL
  ? new PostgresControlPlaneStore() : new ControlPlaneStore();
const controlPlaneRouter = createControlPlaneRouter({ store: controlPlaneStore });
app.use('/api/control-plane', controlPlaneRouter);
const operationsRouter = createOperationsRouter({ configStore: controlPlaneStore });
const platformReadiness = new PlatformReadiness({ configStore: controlPlaneStore, operationsStore: operationsRouter.store,
  redisStatus: rateLimitMiddleware.readiness });
app.locals.platformReadiness = platformReadiness;
app.use('/api/operations', operationsRouter);
app.use('/api/identity', rateLimitMiddleware.authLimiter, createIdentityRouter({ store: operationsRouter.store }));
app.use('/api/platform', createPlatformRouter({ configStore: controlPlaneStore, readiness: platformReadiness }));

// Chat Backend compatibility routes used by the frontend.
// Service names below match the registry's standardized names (chat-backend,
// banking, nlp, nlu, mcp, ai-orchestrator) so routes resolve correctly.
app.use('/api/chat',
  authMiddleware,
  createServiceProxy({
    serviceName: 'chat-backend',
    pathRewrite: { '^/api/chat': '/api/chat' },
    timeout: getServicingRequestTimeoutMs(),
    changeOrigin: true
  })
);

app.use('/api/sessions',
  authMiddleware,
  createServiceProxy({
    serviceName: 'chat-backend',
    pathRewrite: { '^/api/sessions': '/api/sessions' },
    changeOrigin: true
  })
);

app.use('/api/health',
  rateLimitMiddleware,
  createServiceProxy({
    serviceName: 'chat-backend',
    pathRewrite: { '^/api/health': '/api/health' },
    changeOrigin: true
  })
);

// Banking Service Routes
// Authentication must be reachable before a caller has a token. The banking
// service still protects authenticated auth endpoints such as /me itself.
app.use('/api/banking/v1/auth',
  rateLimitMiddleware.authLimiter,
  createServiceProxy({
    serviceName: 'banking',
    pathRewrite: { '^/api/banking': '/api' },
    changeOrigin: true
  })
);

app.use('/api/banking',
  authMiddleware,
  createServiceProxy({
    serviceName: 'banking',
    pathRewrite: { '^/api/banking': '/api' },
    changeOrigin: true
  })
);

// NLP Compatibility Routes
app.use('/api/nlp',
  authMiddleware,
  createServiceProxy({
    serviceName: 'nlp',
    pathRewrite: { '^/api/nlp': '/api' },
    changeOrigin: true
  })
);

// NLU Service Routes
app.use('/api/nlu',
  authMiddleware,
  createServiceProxy({
    serviceName: 'nlu',
    changeOrigin: true
  })
);

// MCP Service Routes
app.use('/api/mcp',
  authMiddleware,
  createServiceProxy({
    serviceName: 'mcp',
    pathRewrite: { '^/api/mcp': '/api/mcp' },
    changeOrigin: true
  })
);

// AI Orchestrator Routes
app.use('/api/orchestrator',
  authMiddleware,
  createServiceProxy({
    serviceName: 'ai-orchestrator',
    pathRewrite: { '^/api/orchestrator': '/api/orchestrator' },
    timeout: getServicingRequestTimeoutMs(),
    changeOrigin: true
  })
);

// Public endpoints (no authentication required)
app.use('/api/public/nlp',
  rateLimitMiddleware,
  createServiceProxy({
    serviceName: 'nlp',
    pathRewrite: { '^/api/public/nlp': '/api/public' },
    changeOrigin: true
  })
);

app.use('/api/public/nlu',
  rateLimitMiddleware,
  createServiceProxy({
    serviceName: 'nlu',
    pathRewrite: { '^/api/public/nlu': '/api/public' },
    changeOrigin: true
  })
);

// Error handling middleware
app.use(errorHandler);

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
      chat: '/api/chat',
      sessions: '/api/sessions',
      health: '/api/health',
      banking: '/api/banking',
      nlp: '/api/nlp',
      nlu: '/api/nlu',
      mcp: '/api/mcp',
      orchestrator: '/api/orchestrator',
      controlPlane: '/api/control-plane',
      operations: '/api/operations',
      identity: '/api/identity',
      platform: '/api/platform'
    }
  });
});

// Initialize service registry and load balancer.
// Both singletons are already constructed (and the registry has started its
// health checks) when their getInstance() factories ran above. There are no
// async initialize() methods to call, so this simply confirms readiness.
function initializeServices() {
  try {
    const stats = serviceRegistry.getStatistics();
    logger.info('Service registry and load balancer initialized', {
      registeredServices: stats.total,
      strategy: loadBalancer.strategy
    });
  } catch (error) {
    logger.error('Failed to initialize services', { error: error.message });
  }
}

// Graceful shutdown handling.
// The registry exposes cleanup() (which stops its health-check timer and clears
// state); the load balancer holds no external resources, so we just reset its
// in-memory counters.
let server;
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received, shutting down API Gateway gracefully`);

  const close = async () => {
    try {
      serviceRegistry.cleanup();
      loadBalancer.resetStatistics();
      await controlPlaneRouter.close();
      await operationsRouter.close();
      await rateLimitMiddleware.cleanup();
      logger.info('API Gateway shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error: error.message });
      process.exit(1);
    }
  };
  if (server) server.close(close);
  else void close();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Production validates its own durable dependencies before accepting traffic.
// Downstream readiness is separate so dependency startup order remains safe.
async function start() {
  if (process.env.NODE_ENV === 'production') {
    await controlPlaneStore.read();
    await controlPlaneStore.pool.query('SELECT tenant_id,kind,id FROM servicing_control_plane_records LIMIT 0');
    await operationsRouter.store.initialize();
  }
  server = app.listen(PORT, () => {
  logger.info(`POC API Gateway running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Gateway endpoints available at http://localhost:${PORT}/api`);
  logger.info(`Health check available at http://localhost:${PORT}/health`);

  // Confirm services are initialized after server starts
  initializeServices();
  });
  return server;
}
if (require.main === module) start().catch(async () => {
  logger.error('Gateway startup failed: verify durable storage, schema migrations and deployment configuration.');
  serviceRegistry.cleanup();
  await Promise.allSettled([controlPlaneRouter.close(), operationsRouter.close(), rateLimitMiddleware.cleanup()]);
  process.exitCode = 1;
});

module.exports = app;
module.exports.start = start;
