const express = require('express');
const router = express.Router();
const db = require('../database');

/**
 * @route   GET /health
 * @desc    Health check endpoint for service monitoring
 * @access  Public
 */
router.get('/', async (req, res) => {
  const healthCheck = {
    service: 'poc-banking-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
    },
    dependencies: {
      database: 'checking',
      nlpService: 'unknown',
      nluService: 'unknown',
      mcpService: 'unknown'
    }
  };

  // Check critical dependencies
  try {
    // Check database connection
    const dbHealth = await db.healthCheck();
    healthCheck.dependencies.database = dbHealth.status;
    healthCheck.database = {
      status: dbHealth.status,
      poolSize: dbHealth.poolSize,
      idleConnections: dbHealth.idleConnections,
      waitingClients: dbHealth.waitingClients
    };
    
    res.status(200).json(healthCheck);
  } catch (error) {
    healthCheck.status = 'unhealthy';
    healthCheck.error = error.message;
    healthCheck.dependencies.database = 'unhealthy';
    res.status(503).json(healthCheck);
  }
});

/**
 * @route   GET /health/ready
 * @desc    Readiness probe for container orchestration
 * @access  Public
 */
router.get('/ready', async (req, res) => {
  try {
    // TODO: Check if service is ready to accept requests
    // Example: Check database connectivity, required services availability
    
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   GET /health/live
 * @desc    Liveness probe for container orchestration
 * @access  Public
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;