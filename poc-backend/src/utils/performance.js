/**
 * Performance Monitoring Utilities
 * Tools for measuring and tracking performance metrics
 */

const logger = require('./logger');

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.activeOperations = new Map();
  }

  /**
   * Start measuring an operation
   * @param {string} operationName - Name of the operation
   * @param {object} context - Additional context for the operation
   * @returns {string} Operation ID for stopping measurement
   */
  start(operationName, context = {}) {
    const operationId = `${operationName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = process.hrtime.bigint();
    
    this.activeOperations.set(operationId, {
      name: operationName,
      startTime,
      startTimestamp: new Date().toISOString(),
      context
    });

    logger.debug('Performance measurement started', {
      operationId,
      operationName,
      context
    });

    return operationId;
  }

  /**
   * Stop measuring an operation
   * @param {string} operationId - Operation ID from start()
   * @param {object} additionalContext - Additional context to add
   * @returns {object} Performance metrics for the operation
   */
  stop(operationId, additionalContext = {}) {
    const operation = this.activeOperations.get(operationId);
    
    if (!operation) {
      logger.warn('Attempted to stop unknown operation', { operationId });
      return null;
    }

    const endTime = process.hrtime.bigint();
    const durationNs = endTime - operation.startTime;
    const durationMs = Number(durationNs) / 1000000; // Convert to milliseconds

    const metrics = {
      operationId,
      operationName: operation.name,
      durationMs: Math.round(durationMs * 100) / 100, // Round to 2 decimal places
      durationNs: Number(durationNs),
      startTime: operation.startTimestamp,
      endTime: new Date().toISOString(),
      context: { ...operation.context, ...additionalContext }
    };

    // Store metrics
    this._storeMetrics(operation.name, metrics);

    // Clean up active operation
    this.activeOperations.delete(operationId);

    logger.debug('Performance measurement completed', {
      operationName: operation.name,
      durationMs: metrics.durationMs,
      context: metrics.context
    });

    return metrics;
  }

  /**
   * Measure an async operation with automatic start/stop
   * @param {string} operationName - Name of the operation
   * @param {function} asyncFn - Async function to measure
   * @param {object} context - Additional context
   * @returns {object} Result with timing information
   */
  async measureAsync(operationName, asyncFn, context = {}) {
    const operationId = this.start(operationName, context);
    let result;
    let error;

    try {
      result = await asyncFn();
    } catch (err) {
      error = err;
      logger.error('Error during measured operation', {
        operationName,
        error: err.message,
        context
      });
    }

    const timing = this.stop(operationId, { hasError: !!error });

    if (error) {
      return {
        success: false,
        error,
        timing,
        result: null
      };
    }

    return {
      success: true,
      result,
      timing,
      error: null
    };
  }

  /**
   * Measure a synchronous operation
   * @param {string} operationName - Name of the operation
   * @param {function} syncFn - Synchronous function to measure
   * @param {object} context - Additional context
   * @returns {object} Result with timing information
   */
  measureSync(operationName, syncFn, context = {}) {
    const operationId = this.start(operationName, context);
    let result;
    let error;

    try {
      result = syncFn();
    } catch (err) {
      error = err;
      logger.error('Error during measured sync operation', {
        operationName,
        error: err.message,
        context
      });
    }

    const timing = this.stop(operationId, { hasError: !!error });

    if (error) {
      return {
        success: false,
        error,
        timing,
        result: null
      };
    }

    return {
      success: true,
      result,
      timing,
      error: null
    };
  }

  /**
   * Get performance statistics for an operation
   * @param {string} operationName - Name of the operation
   * @returns {object} Performance statistics
   */
  getStats(operationName) {
    const operationMetrics = this.metrics.get(operationName);
    
    if (!operationMetrics || operationMetrics.length === 0) {
      return {
        operationName,
        count: 0,
        avgDurationMs: 0,
        minDurationMs: 0,
        maxDurationMs: 0,
        totalDurationMs: 0,
        errorCount: 0,
        successRate: 0
      };
    }

    const durations = operationMetrics.map(m => m.durationMs);
    const errorCount = operationMetrics.filter(m => m.context.hasError).length;
    
    return {
      operationName,
      count: operationMetrics.length,
      avgDurationMs: Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 100) / 100,
      minDurationMs: Math.min(...durations),
      maxDurationMs: Math.max(...durations),
      totalDurationMs: Math.round(durations.reduce((a, b) => a + b, 0) * 100) / 100,
      errorCount,
      successRate: Math.round(((operationMetrics.length - errorCount) / operationMetrics.length) * 100)
    };
  }

  /**
   * Get all performance statistics
   * @returns {object} All performance statistics
   */
  getAllStats() {
    const stats = {};
    
    for (const operationName of this.metrics.keys()) {
      stats[operationName] = this.getStats(operationName);
    }

    return {
      operations: stats,
      summary: {
        totalOperations: Array.from(this.metrics.values()).reduce((sum, ops) => sum + ops.length, 0),
        uniqueOperationTypes: this.metrics.size,
        activeOperations: this.activeOperations.size,
        generatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Clear metrics for an operation or all operations
   * @param {string} operationName - Optional operation name to clear
   */
  clearMetrics(operationName = null) {
    if (operationName) {
      this.metrics.delete(operationName);
      logger.info('Cleared metrics for operation', { operationName });
    } else {
      this.metrics.clear();
      logger.info('Cleared all performance metrics');
    }
  }

  /**
   * Store metrics for an operation
   * @private
   */
  _storeMetrics(operationName, metrics) {
    if (!this.metrics.has(operationName)) {
      this.metrics.set(operationName, []);
    }

    const operationMetrics = this.metrics.get(operationName);
    operationMetrics.push(metrics);

    // Keep only the last 1000 entries per operation to prevent memory leaks
    if (operationMetrics.length > 1000) {
      operationMetrics.splice(0, operationMetrics.length - 1000);
    }
  }

  /**
   * Create a performance middleware for Express
   * @returns {function} Express middleware function
   */
  createMiddleware() {
    return (req, res, next) => {
      const operationId = this.start('http_request', {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        requestId: req.headers['x-request-id']
      });

      // Store operation ID in request for later use
      req.performanceOperationId = operationId;

      // Hook into response finish event
      const originalSend = res.send;
      res.send = function(data) {
        const timing = performance.stop(operationId, {
          statusCode: res.statusCode,
          responseSize: data ? data.length : 0
        });

        // Add performance header
        res.set('X-Response-Time', `${timing.durationMs}ms`);

        return originalSend.call(this, data);
      };

      next();
    };
  }

  /**
   * Get current memory usage statistics
   * @returns {object} Memory usage statistics
   */
  getMemoryUsage() {
    const usage = process.memoryUsage();
    
    return {
      rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100, // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100, // MB
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100, // MB
      external: Math.round(usage.external / 1024 / 1024 * 100) / 100, // MB
      arrayBuffers: Math.round(usage.arrayBuffers / 1024 / 1024 * 100) / 100, // MB
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get system performance information
   * @returns {object} System performance information
   */
  getSystemInfo() {
    const cpuUsage = process.cpuUsage();
    
    return {
      uptime: process.uptime(),
      cpuUsage: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      memory: this.getMemoryUsage(),
      platform: process.platform,
      nodeVersion: process.version,
      pid: process.pid,
      timestamp: new Date().toISOString()
    };
  }
}

// Create singleton instance
const performance = new PerformanceMonitor();

module.exports = {
  performance,
  PerformanceMonitor
};