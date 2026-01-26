const logger = require('../utils/logger');

class LoadBalancer {
  constructor(serviceRegistry) {
    this.serviceRegistry = serviceRegistry;
    this.strategy = process.env.LOAD_BALANCER_STRATEGY || 'round-robin';
    this.roundRobinCounters = new Map();
    this.leastConnectionCounts = new Map();
    
    logger.info('Load Balancer initialized', { strategy: this.strategy });
  }

  /**
   * Get next available service instance based on load balancing strategy
   */
  getNextInstance(serviceName) {
    const service = this.serviceRegistry.getHealthyService(serviceName);
    
    if (!service) {
      logger.warn('No healthy instances available', { service: serviceName });
      return null;
    }

    // For single instance, just return it
    return service;
  }

  /**
   * Get multiple instances of a service (for future multiple-instance support)
   */
  getAllInstances(serviceName) {
    const service = this.serviceRegistry.getHealthyService(serviceName);
    return service ? [service] : [];
  }

  /**
   * Round-robin strategy
   */
  roundRobin(instances) {
    if (instances.length === 0) return null;
    if (instances.length === 1) return instances[0];

    const serviceName = instances[0].name;
    const counter = this.roundRobinCounters.get(serviceName) || 0;
    const selected = instances[counter % instances.length];
    
    this.roundRobinCounters.set(serviceName, counter + 1);
    
    logger.debug('Round-robin selected instance', {
      service: serviceName,
      instance: selected.url,
      counter: counter + 1
    });
    
    return selected;
  }

  /**
   * Weighted round-robin strategy
   */
  weightedRoundRobin(instances) {
    if (instances.length === 0) return null;
    if (instances.length === 1) return instances[0];

    // Create weighted list
    const weighted = [];
    instances.forEach(instance => {
      for (let i = 0; i < instance.weight; i++) {
        weighted.push(instance);
      }
    });

    const serviceName = instances[0].name;
    const counter = this.roundRobinCounters.get(serviceName) || 0;
    const selected = weighted[counter % weighted.length];
    
    this.roundRobinCounters.set(serviceName, counter + 1);
    
    return selected;
  }

  /**
   * Least connections strategy
   */
  leastConnections(instances) {
    if (instances.length === 0) return null;
    if (instances.length === 1) return instances[0];

    // Find instance with least connections
    let minConnections = Infinity;
    let selected = instances[0];

    instances.forEach(instance => {
      const connections = this.leastConnectionCounts.get(instance.url) || 0;
      if (connections < minConnections) {
        minConnections = connections;
        selected = instance;
      }
    });

    logger.debug('Least connections selected instance', {
      instance: selected.url,
      connections: minConnections
    });

    return selected;
  }

  /**
   * Random strategy
   */
  random(instances) {
    if (instances.length === 0) return null;
    const index = Math.floor(Math.random() * instances.length);
    return instances[index];
  }

  /**
   * Response time based strategy (fastest instance)
   */
  fastestResponse(instances) {
    if (instances.length === 0) return null;
    if (instances.length === 1) return instances[0];

    // Sort by response time (ascending)
    const sorted = [...instances].sort((a, b) => a.responseTime - b.responseTime);
    return sorted[0];
  }

  /**
   * Priority-based strategy
   */
  priority(instances) {
    if (instances.length === 0) return null;
    if (instances.length === 1) return instances[0];

    // Sort by priority (lower number = higher priority)
    const sorted = [...instances].sort((a, b) => a.priority - b.priority);
    return sorted[0];
  }

  /**
   * Increment connection count
   */
  incrementConnections(serviceUrl) {
    const count = this.leastConnectionCounts.get(serviceUrl) || 0;
    this.leastConnectionCounts.set(serviceUrl, count + 1);
  }

  /**
   * Decrement connection count
   */
  decrementConnections(serviceUrl) {
    const count = this.leastConnectionCounts.get(serviceUrl) || 1;
    this.leastConnectionCounts.set(serviceUrl, Math.max(0, count - 1));
  }

  /**
   * Get connection count for a service
   */
  getConnectionCount(serviceUrl) {
    return this.leastConnectionCounts.get(serviceUrl) || 0;
  }

  /**
   * Get load balancer statistics
   */
  getStatistics() {
    const connections = {};
    this.leastConnectionCounts.forEach((count, url) => {
      connections[url] = count;
    });

    const counters = {};
    this.roundRobinCounters.forEach((count, service) => {
      counters[service] = count;
    });

    return {
      strategy: this.strategy,
      connections,
      roundRobinCounters: counters,
      totalConnections: Array.from(this.leastConnectionCounts.values()).reduce((a, b) => a + b, 0)
    };
  }

  /**
   * Reset statistics
   */
  resetStatistics() {
    this.roundRobinCounters.clear();
    this.leastConnectionCounts.clear();
    logger.info('Load balancer statistics reset');
  }
}

// Singleton instance
let instance = null;

module.exports = {
  getInstance: (serviceRegistry) => {
    if (!instance) {
      instance = new LoadBalancer(serviceRegistry);
    }
    return instance;
  },
  LoadBalancer
};
