const express = require('express');
const router = express.Router();

/**
 * GET /health
 * Health check endpoint
 */
router.get('/', async (req, res) => {
  const { mcpClient } = req.app.locals;
  
  try {
    // Check database connection
    const { sequelize } = require('../models');
    await sequelize.authenticate();
    const dbHealthy = true;
    
    // Check MCP service
    const mcpHealth = await mcpClient.healthCheck();
    const mcpHealthy = mcpHealth?.overall === 'healthy' || mcpHealth?.healthy === true;
    
    const health = {
      status: dbHealthy && mcpHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'poc-ai-orchestrator',
      version: '1.0.0',
      uptime: process.uptime(),
      checks: {
        database: {
          status: dbHealthy ? 'up' : 'down'
        },
        mcpService: {
          status: mcpHealthy ? 'up' : 'down',
          url: mcpClient.baseUrl
        },
        memory: {
          used: process.memoryUsage().heapUsed,
          total: process.memoryUsage().heapTotal
        }
      }
    };

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

module.exports = router;
