/**
 * Health Controller
 * Handles health check and system status endpoints
 */

const logger = require('../utils/logger');
const config = require('../config');

class HealthController {
  /**
   * Basic health check
   * GET /api/health
   */
  async basicHealthCheck(req, res) {
    const health = {
      success: true,
      message: 'Service is healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.env,
      version: require('../../package.json').version
    };

    logger.debug('Health check performed', {
      requestId: req.headers['x-request-id'],
      uptime: health.uptime
    });

    res.json(health);
  }

  /**
   * Detailed health check with system information
   * GET /api/health/detailed
   */
  async detailedHealthCheck(req, res) {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const health = {
      success: true,
      message: 'Detailed system health',
      timestamp: new Date().toISOString(),
      system: {
        uptime: process.uptime(),
        memory: {
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
          external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        },
        node: {
          version: process.version,
          platform: process.platform,
          arch: process.arch
        }
      },
      environment: config.env,
      version: require('../../package.json').version,
      configuration: {
        port: config.server.port,
        cors: {
          allowedOrigins: config.cors.allowedOrigins
        },
        rateLimit: {
          windowMs: config.rateLimit.windowMs,
          max: config.rateLimit.max
        },
        logging: {
          level: config.logging.level,
          fileEnabled: config.logging.file.enabled
        }
      }
    };

    logger.debug('Detailed health check performed', {
      requestId: req.headers['x-request-id'],
      memoryUsed: health.system.memory.heapUsed,
      uptime: health.system.uptime
    });

    res.json(health);
  }

  /**
   * Readiness check for container orchestration
   * GET /api/health/ready
   */
  async readinessCheck(req, res) {
    // Check if the service is ready to accept traffic
    // This could include database connections, external service dependencies, etc.
    
    const isReady = true; // Simplified - add actual readiness checks here
    
    if (isReady) {
      res.json({
        success: true,
        message: 'Service is ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        success: false,
        message: 'Service is not ready',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Liveness check for container orchestration
   * GET /api/health/live
   */
  async livenessCheck(req, res) {
    // Check if the service is alive and should not be restarted
    // This should be a lightweight check
    
    const isAlive = true; // Simplified - add actual liveness checks here
    
    if (isAlive) {
      res.json({
        success: true,
        message: 'Service is alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    } else {
      res.status(503).json({
        success: false,
        message: 'Service is not alive',
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = new HealthController();