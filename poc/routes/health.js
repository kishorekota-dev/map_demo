const express = require('express');
const router = express.Router();
const config = require('../config/config');

// Health check endpoint
router.get('/', (req, res) => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: require('../package.json').version,
    environment: config.server.env,
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100,
      external: Math.round(process.memoryUsage().external / 1024 / 1024 * 100) / 100
    }
  };

  res.json({
    success: true,
    data: healthStatus
  });
});

// Detailed health check
router.get('/detailed', (req, res) => {
  const detailedHealth = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    server: {
      uptime: process.uptime(),
      version: process.version,
      platform: process.platform,
      architecture: process.arch
    },
    application: {
      version: require('../package.json').version,
      environment: config.server.env,
      port: config.server.port
    },
    system: {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    }
  };

  res.json({
    success: true,
    data: detailedHealth
  });
});

module.exports = router;