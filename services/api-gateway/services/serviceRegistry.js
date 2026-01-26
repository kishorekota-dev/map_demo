const axios = require('axios');
const logger = require('../utils/logger');

class ServiceRegistry {
  constructor() {
    this.services = new Map();
    this.healthCheckInterval = parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000;
    this.healthCheckTimeout = parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000;
    this.registryType = process.env.SERVICE_REGISTRY_TYPE || 'local';
    
    this.initializeServices();
    this.startHealthChecks();
    
    logger.info('Service Registry initialized', {
      type: this.registryType,
      healthCheckInterval: this.healthCheckInterval
    });
  }

  /**
   * Initialize services from environment variables
   */
  initializeServices() {
    const serviceDefinitions = [
      {
        name: 'chat-backend',
        url: process.env.CHAT_BACKEND_URL || 'http://localhost:3006',
        healthPath: '/health',
        weight: 10,
        priority: 1
      },
      {
        name: 'banking',
        url: process.env.BANKING_SERVICE_URL || 'http://localhost:3005',
        healthPath: '/health',
        weight: 10,
        priority: 1
      },
      {
        name: 'nlp',
        url: process.env.NLP_SERVICE_URL || 'http://localhost:3002',
        healthPath: '/health',
        weight: 5,
        priority: 2
      },
      {
        name: 'nlu',
        url: process.env.NLU_SERVICE_URL || 'http://localhost:3003',
        healthPath: '/health',
        weight: 10,
        priority: 1
      },
      {
        name: 'mcp',
        url: process.env.MCP_SERVICE_URL || 'http://localhost:3004',
        healthPath: '/health',
        weight: 5,
        priority: 2
      }
    ];

    serviceDefinitions.forEach(def => {
      this.register(def.name, def.url, def);
    });
  }

  /**
   * Register a service
   */
  register(name, url, options = {}) {
    const service = {
      name,
      url,
      healthPath: options.healthPath || '/health',
      weight: options.weight || 10,
      priority: options.priority || 1,
      healthy: true,
      lastCheck: null,
      failureCount: 0,
      responseTime: 0,
      registeredAt: new Date(),
      metadata: options.metadata || {}
    };

    this.services.set(name, service);
    
    logger.info('Service registered', {
      name,
      url,
      weight: service.weight,
      priority: service.priority
    });

    return service;
  }

  /**
   * Deregister a service
   */
  deregister(name) {
    const service = this.services.get(name);
    if (service) {
      this.services.delete(name);
      logger.info('Service deregistered', { name, url: service.url });
      return true;
    }
    return false;
  }

  /**
   * Get a service by name
   */
  getService(name) {
    return this.services.get(name);
  }

  /**
   * Get all services
   */
  getAllServices() {
    return Array.from(this.services.values());
  }

  /**
   * Get healthy services only
   */
  getHealthyServices() {
    return this.getAllServices().filter(service => service.healthy);
  }

  /**
   * Get service by name (only if healthy)
   */
  getHealthyService(name) {
    const service = this.services.get(name);
    return service && service.healthy ? service : null;
  }

  /**
   * Check health of a single service
   */
  async checkServiceHealth(service) {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(`${service.url}${service.healthPath}`, {
        timeout: this.healthCheckTimeout,
        validateStatus: (status) => status < 500
      });

      const responseTime = Date.now() - startTime;
      
      if (response.status === 200) {
        service.healthy = true;
        service.failureCount = 0;
        service.responseTime = responseTime;
        service.lastCheck = new Date();
        
        logger.debug('Service health check passed', {
          name: service.name,
          url: service.url,
          responseTime
        });
        
        return true;
      } else {
        throw new Error(`Unexpected status code: ${response.status}`);
      }
    } catch (error) {
      service.failureCount++;
      service.lastCheck = new Date();
      
      // Mark as unhealthy after 3 consecutive failures
      if (service.failureCount >= 3) {
        service.healthy = false;
        logger.error('Service marked as unhealthy', {
          name: service.name,
          url: service.url,
          failureCount: service.failureCount,
          error: error.message
        });
      } else {
        logger.warn('Service health check failed', {
          name: service.name,
          url: service.url,
          failureCount: service.failureCount,
          error: error.message
        });
      }
      
      return false;
    }
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    // Initial health check
    this.performHealthChecks();

    // Periodic health checks
    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.healthCheckInterval);

    logger.info('Health checks started', {
      interval: this.healthCheckInterval
    });
  }

  /**
   * Perform health checks on all services
   */
  async performHealthChecks() {
    const services = this.getAllServices();
    const checks = services.map(service => this.checkServiceHealth(service));
    
    try {
      await Promise.all(checks);
      
      const healthy = services.filter(s => s.healthy).length;
      const unhealthy = services.length - healthy;
      
      logger.debug('Health checks completed', {
        total: services.length,
        healthy,
        unhealthy
      });
    } catch (error) {
      logger.error('Error during health checks', { error: error.message });
    }
  }

  /**
   * Stop health checks
   */
  stopHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
      logger.info('Health checks stopped');
    }
  }

  /**
   * Get service statistics
   */
  getStatistics() {
    const services = this.getAllServices();
    
    return {
      total: services.length,
      healthy: services.filter(s => s.healthy).length,
      unhealthy: services.filter(s => !s.healthy).length,
      services: services.map(s => ({
        name: s.name,
        url: s.url,
        healthy: s.healthy,
        failureCount: s.failureCount,
        responseTime: s.responseTime,
        lastCheck: s.lastCheck,
        uptime: s.lastCheck ? Date.now() - s.registeredAt.getTime() : 0
      }))
    };
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.stopHealthChecks();
    this.services.clear();
    logger.info('Service Registry cleaned up');
  }
}

// Singleton instance
let instance = null;

module.exports = {
  getInstance: () => {
    if (!instance) {
      instance = new ServiceRegistry();
    }
    return instance;
  },
  ServiceRegistry
};
