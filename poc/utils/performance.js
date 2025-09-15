/**
 * Performance Monitoring Utility Module
 * 
 * Centralizes performance tracking, timing, and monitoring logic.
 * Provides reusable functions for measuring processing times and system metrics.
 */

const logger = require('./logger');

/**
 * Performance timer for tracking operation durations
 * @typedef {Object} PerformanceTimer
 * @property {string} id - Timer identifier
 * @property {number} startTime - Start timestamp
 * @property {Object} metadata - Timer metadata
 * @property {Function} stop - Function to stop timer and return duration
 */

/**
 * Performance metrics
 * @typedef {Object} PerformanceMetrics
 * @property {number} processingTime - Total processing time in milliseconds
 * @property {number} memoryUsage - Memory usage in bytes
 * @property {Object} timings - Individual operation timings
 * @property {string} timestamp - Measurement timestamp
 */

class PerformanceUtils {
  constructor() {
    this.activeTimers = new Map();
    this.performanceHistory = [];
    this.maxHistorySize = 1000;
  }

  /**
   * Starts a performance timer
   * @param {string} timerId - Unique timer identifier
   * @param {Object} metadata - Additional timer metadata
   * @returns {PerformanceTimer} Timer object
   */
  startTimer(timerId, metadata = {}) {
    const startTime = Date.now();
    const timer = {
      id: timerId,
      startTime,
      metadata: {
        ...metadata,
        startedAt: new Date().toISOString()
      },
      stop: () => this.stopTimer(timerId)
    };

    this.activeTimers.set(timerId, timer);

    logger.debug('Performance timer started', {
      timerId,
      startTime,
      metadata: timer.metadata
    });

    return timer;
  }

  /**
   * Stops a performance timer and returns duration
   * @param {string} timerId - Timer identifier
   * @returns {Object} Timer result with duration
   */
  stopTimer(timerId) {
    const timer = this.activeTimers.get(timerId);
    
    if (!timer) {
      logger.warn('Attempted to stop non-existent timer', { timerId });
      return null;
    }

    const endTime = Date.now();
    const duration = endTime - timer.startTime;
    
    const result = {
      id: timerId,
      duration,
      durationMs: `${duration}ms`,
      startTime: timer.startTime,
      endTime,
      metadata: timer.metadata
    };

    this.activeTimers.delete(timerId);

    logger.debug('Performance timer stopped', {
      timerId,
      duration: result.durationMs,
      metadata: timer.metadata
    });

    // Add to history
    this.addToHistory(result);

    return result;
  }

  /**
   * Measures the execution time of an async function
   * @param {string} operationName - Name of the operation
   * @param {Function} operation - Async function to measure
   * @param {Object} metadata - Additional metadata
   * @returns {Object} Operation result with timing
   */
  async measureAsync(operationName, operation, metadata = {}) {
    const timerId = `${operationName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.startTimer(timerId, {
      operation: operationName,
      type: 'async',
      ...metadata
    });

    try {
      const result = await operation();
      const timing = this.stopTimer(timerId);
      
      logger.info(`Async operation completed: ${operationName}`, {
        operation: operationName,
        duration: timing.durationMs,
        success: true,
        metadata
      });

      return {
        result,
        timing,
        success: true
      };
    } catch (error) {
      const timing = this.stopTimer(timerId);
      
      logger.error(`Async operation failed: ${operationName}`, {
        operation: operationName,
        duration: timing.durationMs,
        error: error.message,
        success: false,
        metadata
      });

      return {
        result: null,
        timing,
        success: false,
        error
      };
    }
  }

  /**
   * Measures the execution time of a synchronous function
   * @param {string} operationName - Name of the operation
   * @param {Function} operation - Sync function to measure
   * @param {Object} metadata - Additional metadata
   * @returns {Object} Operation result with timing
   */
  measureSync(operationName, operation, metadata = {}) {
    const startTime = Date.now();
    
    try {
      const result = operation();
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      const timing = {
        operation: operationName,
        duration,
        durationMs: `${duration}ms`,
        startTime,
        endTime,
        type: 'sync',
        metadata
      };

      logger.debug(`Sync operation completed: ${operationName}`, {
        operation: operationName,
        duration: timing.durationMs,
        success: true,
        metadata
      });

      this.addToHistory(timing);

      return {
        result,
        timing,
        success: true
      };
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      const timing = {
        operation: operationName,
        duration,
        durationMs: `${duration}ms`,
        startTime,
        endTime,
        type: 'sync',
        error: error.message,
        metadata
      };

      logger.error(`Sync operation failed: ${operationName}`, {
        operation: operationName,
        duration: timing.durationMs,
        error: error.message,
        success: false,
        metadata
      });

      this.addToHistory(timing);

      return {
        result: null,
        timing,
        success: false,
        error
      };
    }
  }

  /**
   * Gets current system performance metrics
   * @returns {PerformanceMetrics} Current performance metrics
   */
  getSystemMetrics() {
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    return {
      timestamp: new Date().toISOString(),
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers,
        formatted: {
          rss: this.formatBytes(memoryUsage.rss),
          heapTotal: this.formatBytes(memoryUsage.heapTotal),
          heapUsed: this.formatBytes(memoryUsage.heapUsed),
          external: this.formatBytes(memoryUsage.external),
          arrayBuffers: this.formatBytes(memoryUsage.arrayBuffers)
        }
      },
      process: {
        uptime: uptime,
        uptimeFormatted: this.formatUptime(uptime),
        pid: process.pid,
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version
      },
      performance: {
        activeTimers: this.activeTimers.size,
        historySize: this.performanceHistory.length,
        averageResponseTime: this.calculateAverageResponseTime()
      }
    };
  }

  /**
   * Creates a middleware for automatic request performance tracking
   * @param {Object} options - Configuration options
   * @returns {Function} Express middleware function
   */
  createPerformanceMiddleware(options = {}) {
    const {
      logSlowRequests = true,
      slowRequestThreshold = 500,
      trackMemory = true,
      logSystemMetrics = false
    } = options;

    return (req, res, next) => {
      const requestId = req.requestTracking?.requestId || 'unknown';
      const timerId = `request_${requestId}`;
      
      // Start request timer
      this.startTimer(timerId, {
        method: req.method,
        path: req.path,
        requestId
      });

      // Track memory if enabled
      const initialMemory = trackMemory ? process.memoryUsage() : null;

      // Override res.send to capture completion
      const originalSend = res.send;
      res.send = function(data) {
        const timing = performance.stopTimer(timerId);
        const finalMemory = trackMemory ? process.memoryUsage() : null;
        
        const performanceData = {
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration: timing ? timing.durationMs : 'unknown',
          responseSize: data ? Buffer.byteLength(data, 'utf8') : 0
        };

        // Add memory tracking if enabled
        if (trackMemory && initialMemory && finalMemory) {
          performanceData.memory = {
            initial: performance.formatBytes(initialMemory.heapUsed),
            final: performance.formatBytes(finalMemory.heapUsed),
            delta: performance.formatBytes(finalMemory.heapUsed - initialMemory.heapUsed)
          };
        }

        // Log slow requests
        if (logSlowRequests && timing && timing.duration > slowRequestThreshold) {
          logger.warn('Slow request detected', {
            ...performanceData,
            threshold: `${slowRequestThreshold}ms`,
            isSlowRequest: true
          });
        }

        // Log system metrics if enabled
        if (logSystemMetrics) {
          const systemMetrics = performance.getSystemMetrics();
          logger.info('Request performance metrics', {
            ...performanceData,
            systemMetrics
          });
        } else {
          logger.debug('Request performance', performanceData);
        }

        originalSend.call(this, data);
      };

      next();
    };
  }

  /**
   * Adds timing result to performance history
   * @param {Object} timingResult - Timing result to add
   */
  addToHistory(timingResult) {
    this.performanceHistory.push({
      ...timingResult,
      recordedAt: new Date().toISOString()
    });

    // Maintain history size limit
    if (this.performanceHistory.length > this.maxHistorySize) {
      this.performanceHistory = this.performanceHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Calculates average response time from history
   * @param {number} lastN - Number of recent records to consider
   * @returns {number} Average response time in milliseconds
   */
  calculateAverageResponseTime(lastN = 100) {
    if (this.performanceHistory.length === 0) return 0;
    
    const recentHistory = this.performanceHistory.slice(-lastN);
    const total = recentHistory.reduce((sum, record) => sum + (record.duration || 0), 0);
    
    return Math.round(total / recentHistory.length);
  }

  /**
   * Gets performance statistics
   * @returns {Object} Performance statistics
   */
  getPerformanceStats() {
    const history = this.performanceHistory;
    
    if (history.length === 0) {
      return {
        totalOperations: 0,
        averageTime: 0,
        minTime: 0,
        maxTime: 0,
        slowOperations: 0
      };
    }

    const durations = history.map(h => h.duration || 0);
    const slowThreshold = 500; // 500ms

    return {
      totalOperations: history.length,
      averageTime: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      minTime: Math.min(...durations),
      maxTime: Math.max(...durations),
      slowOperations: durations.filter(d => d > slowThreshold).length,
      operationTypes: this.getOperationTypeCounts(),
      recentAverage: this.calculateAverageResponseTime(50)
    };
  }

  /**
   * Gets count of operations by type
   * @returns {Object} Operation type counts
   */
  getOperationTypeCounts() {
    const counts = {};
    
    for (const record of this.performanceHistory) {
      const operation = record.operation || record.id || 'unknown';
      counts[operation] = (counts[operation] || 0) + 1;
    }
    
    return counts;
  }

  /**
   * Formats bytes to human readable format
   * @param {number} bytes - Bytes to format
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Formats uptime to human readable format
   * @param {number} seconds - Uptime in seconds
   * @returns {string} Formatted uptime
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m ${secs}s`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  /**
   * Resets performance history
   */
  resetHistory() {
    this.performanceHistory = [];
    logger.info('Performance history reset');
  }

  /**
   * Clears all active timers
   */
  clearActiveTimers() {
    const count = this.activeTimers.size;
    this.activeTimers.clear();
    logger.info('Cleared active timers', { count });
  }
}

// Create singleton instance
const performance = new PerformanceUtils();

module.exports = performance;