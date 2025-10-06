const express = require('express');
const router = express.Router();
const axios = require('axios');

const services = {
  'chat-backend': process.env.CHAT_BACKEND_URL || 'http://localhost:3006',
  'banking': process.env.BANKING_SERVICE_URL || 'http://localhost:3005',
  'nlp': process.env.NLP_SERVICE_URL || 'http://localhost:3002',
  'nlu': process.env.NLU_SERVICE_URL || 'http://localhost:3003',
  'mcp': process.env.MCP_SERVICE_URL || 'http://localhost:3004'
};

/**
 * GET /health
 * Health check for API Gateway
 */
router.get('/', (req, res) => {
  res.json({
    service: 'poc-api-gateway',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: require('../package.json').version,
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * GET /health/services
 * Check health of all downstream services
 */
router.get('/services', async (req, res) => {
  const healthChecks = {};
  
  for (const [name, url] of Object.entries(services)) {
    try {
      const response = await axios.get(`${url}/health`, { timeout: 5000 });
      healthChecks[name] = {
        status: 'healthy',
        url,
        responseTime: response.headers['x-response-time'] || 'N/A',
        data: response.data
      };
    } catch (error) {
      healthChecks[name] = {
        status: 'unhealthy',
        url,
        error: error.message,
        code: error.code
      };
    }
  }

  const allHealthy = Object.values(healthChecks).every(check => check.status === 'healthy');

  res.status(allHealthy ? 200 : 503).json({
    gateway: 'healthy',
    services: healthChecks,
    overallStatus: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /health/ready
 * Readiness probe for Kubernetes
 */
router.get('/ready', async (req, res) => {
  // Check if at least critical services are available
  const criticalServices = ['chat-backend', 'banking', 'nlu'];
  let ready = true;

  for (const service of criticalServices) {
    try {
      await axios.get(`${services[service]}/health`, { timeout: 3000 });
    } catch (error) {
      ready = false;
      break;
    }
  }

  res.status(ready ? 200 : 503).json({
    ready,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /health/live
 * Liveness probe for Kubernetes
 */
router.get('/live', (req, res) => {
  res.json({
    alive: true,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
