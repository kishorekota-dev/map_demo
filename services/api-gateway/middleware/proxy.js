const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
const serviceRegistryModule = require('../services/serviceRegistry');
const loadBalancerModule = require('../services/loadBalancer');
const circuitBreakerModule = require('../services/circuitBreaker');
const logger = require('../utils/logger');
const { recordProxyMetrics } = require('../routes/metrics');

// These modules export factory singletons rather than ready-to-use instances.
// Instantiate them here so the proxy uses the same shared singletons as the
// rest of the gateway. The load balancer depends on the service registry.
const serviceRegistry = serviceRegistryModule.getInstance();
const loadBalancer = loadBalancerModule.getInstance(serviceRegistry);
const circuitBreaker = circuitBreakerModule.getInstance();

/**
 * Create proxy middleware for routing requests to microservices
 * @param {Object} options - Proxy configuration options
 * @returns {Function} Express middleware function
 */
const createServiceProxy = (options) => {
  const {
    serviceName,
    pathRewrite = {},
    changeOrigin = true,
    timeout = parseInt(process.env.PROXY_TIMEOUT) || 30000,
    retryAttempts = parseInt(process.env.PROXY_RETRY_ATTEMPTS) || 3
  } = options;

  return createProxyMiddleware({
    target: 'http://localhost', // Will be dynamically replaced
    changeOrigin,
    pathRewrite,
    timeout,
    
    // Dynamic target resolution using service discovery
    router: (req) => {
      try {
        // Get service instance from load balancer (returns the registered
        // service object, which stores a full `url`).
        const serviceInstance = loadBalancer.getServiceInstance(serviceName);

        if (!serviceInstance) {
          logger.warn(`No healthy instances found for service: ${serviceName}`);

          // Fallback to environment variable
          const fallbackUrl = getFallbackUrl(serviceName);
          if (fallbackUrl) {
            logger.info(`Using fallback URL for ${serviceName}: ${fallbackUrl}`);
            return fallbackUrl;
          }

          throw new Error(`Service ${serviceName} is unavailable`);
        }

        // The registry stores the target as `url` (e.g. http://localhost:3005),
        // not separate host/port fields.
        const targetUrl = serviceInstance.url;
        logger.debug(`Routing request to ${serviceName}`, {
          target: targetUrl,
          path: req.path,
          method: req.method
        });
        
        return targetUrl;
      } catch (error) {
        logger.error(`Service routing failed for ${serviceName}`, {
          error: error.message,
          path: req.path,
          method: req.method
        });
        throw error;
      }
    },

    // Request logging and modification
    onProxyReq: (proxyReq, req, res) => {
      // Add request ID for tracing
      const requestId = req.id || require('uuid').v4();
      proxyReq.setHeader('X-Request-ID', requestId);
      proxyReq.setHeader('X-Gateway-Service', 'poc-api-gateway');
      proxyReq.setHeader('X-Target-Service', serviceName);
      
      // Forward user context
      if (req.user) {
        const userId = req.userId || req.user.userId || req.user.id || req.user.sub;
        const userRole = req.userRole || req.user.role || req.user.roles?.[0];
        if (userId) proxyReq.setHeader('X-User-ID', String(userId));
        if (userRole) proxyReq.setHeader('X-User-Role', String(userRole));
      }
      
      logger.info(`Proxying request to ${serviceName}`, {
        requestId,
        method: req.method,
        path: req.path,
        target: proxyReq.getHeader('host'),
        userId: req.user?.id
      });

      // express.json() has already consumed the stream. Re-serialize parsed
      // bodies after all proxy headers are set; writing the body can flush the
      // outgoing headers on newer Node releases.
      fixRequestBody(proxyReq, req, res);
    },

    // Response logging and modification
    onProxyRes: (proxyRes, req, res) => {
      const requestId = req.id || proxyRes.getHeader('X-Request-ID');
      
      // Add gateway headers
      proxyRes.headers['X-Gateway-Service'] = 'poc-api-gateway';
      proxyRes.headers['X-Response-Time'] = Date.now() - req.startTime;
      
      logger.info(`Received response from ${serviceName}`, {
        requestId,
        statusCode: proxyRes.statusCode,
        method: req.method,
        path: req.path,
        responseTime: Date.now() - req.startTime
      });

      // Record metrics
      recordMetrics(serviceName, req.method, proxyRes.statusCode, Date.now() - req.startTime);
    },

    // Error handling
    onError: (err, req, res) => {
      const requestId = req.id || require('uuid').v4();
      
      logger.error(`Proxy error for ${serviceName}`, {
        requestId,
        error: err.message,
        method: req.method,
        path: req.path,
        userId: req.user?.id
      });

      // Circuit breaker logic
      circuitBreaker.recordFailure(serviceName);

      // Determine appropriate error response
      let statusCode = 502; // Bad Gateway
      let errorMessage = 'Service temporarily unavailable';

      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        statusCode = 503; // Service Unavailable
        errorMessage = 'Service is currently down';
      } else if (err.code === 'ETIMEDOUT') {
        statusCode = 504; // Gateway Timeout
        errorMessage = 'Service request timed out';
      }

      // Check if response hasn't been sent yet
      if (!res.headersSent) {
        res.status(statusCode).json({
          error: 'Gateway Error',
          message: errorMessage,
          service: serviceName,
          requestId,
          timestamp: new Date().toISOString(),
          code: err.code || 'PROXY_ERROR'
        });
      }
    },

    // Retry logic
    retry: {
      retries: retryAttempts,
      retryDelay: parseInt(process.env.PROXY_RETRY_DELAY) || 1000,
      retryCondition: (err) => {
        // Retry on network errors but not on client errors (4xx)
        return err.code === 'ECONNREFUSED' || 
               err.code === 'ETIMEDOUT' || 
               err.code === 'ENOTFOUND';
      }
    }
  });
};

/**
 * Get fallback URL for service from environment variables
 * @param {string} serviceName - Name of the service
 * @returns {string|null} Fallback URL or null
 */
const getFallbackUrl = (serviceName) => {
  // Keys must match the standardized service names registered in the service
  // registry (chat-backend, banking, nlp, nlu, mcp, ai-orchestrator).
  const fallbackMap = {
    'chat-backend': process.env.CHAT_BACKEND_URL,
    'banking': process.env.BANKING_SERVICE_URL,
    'nlp': process.env.NLP_SERVICE_URL || process.env.NLU_SERVICE_URL,
    'nlu': process.env.NLU_SERVICE_URL,
    'mcp': process.env.MCP_SERVICE_URL,
    'ai-orchestrator': process.env.AI_ORCHESTRATOR_URL
  };

  return fallbackMap[serviceName] || null;
};

/**
 * Record metrics for monitoring
 * @param {string} service - Service name
 * @param {string} method - HTTP method
 * @param {number} statusCode - Response status code
 * @param {number} responseTime - Response time in milliseconds
 */
const recordMetrics = (service, method, statusCode, responseTime) => {
  recordProxyMetrics(service, method, statusCode, responseTime);

  logger.debug('Recording metrics', {
    service,
    method,
    statusCode,
    responseTime,
    category: 'metrics'
  });
};

/**
 * Middleware to add request timing
 */
const addRequestTiming = (req, res, next) => {
  req.startTime = Date.now();
  req.id = require('uuid').v4();
  next();
};

/**
 * Middleware to check circuit breaker status
 */
const checkCircuitBreaker = (serviceName) => {
  return (req, res, next) => {
    if (circuitBreaker.isOpen(serviceName)) {
      logger.warn(`Circuit breaker is open for ${serviceName}`, {
        path: req.path,
        method: req.method,
        userId: req.user?.id
      });

      return res.status(503).json({
        error: 'Service unavailable',
        message: `${serviceName} is currently experiencing issues`,
        code: 'CIRCUIT_BREAKER_OPEN',
        timestamp: new Date().toISOString()
      });
    }
    next();
  };
};

module.exports = {
  createServiceProxy,
  addRequestTiming,
  checkCircuitBreaker
};
