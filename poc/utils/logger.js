const config = require('../config/config');

class Logger {
  constructor() {
    this.config = config.logging;
    this.logLevels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
    this.currentLevel = this.logLevels[this.config.level] || this.logLevels.info;
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const pid = process.pid;
    const metaString = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta, null, 0)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [PID:${pid}] ${message}${metaString}`;
  }

  shouldLog(level) {
    return this.logLevels[level] <= this.currentLevel;
  }

  log(level, message, meta = {}) {
    if (!this.config.enableConsole || !this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message, meta);
    
    // Add color coding for better visibility
    switch (level) {
      case 'error':
        console.error('\x1b[31m%s\x1b[0m', formattedMessage); // Red
        break;
      case 'warn':
        console.warn('\x1b[33m%s\x1b[0m', formattedMessage); // Yellow
        break;
      case 'info':
        console.info('\x1b[36m%s\x1b[0m', formattedMessage); // Cyan
        break;
      case 'debug':
        console.debug('\x1b[35m%s\x1b[0m', formattedMessage); // Magenta
        break;
      default:
        console.log(formattedMessage);
    }

    // Write to file if configured (placeholder for future file logging)
    if (this.config.enableFile) {
      // TODO: Implement file logging
      this.writeToFile(level, message, meta);
    }
  }

  writeToFile(level, message, meta = {}) {
    // Placeholder for file logging implementation
    // This would write to a log file with proper rotation
  }

  error(message, meta = {}) {
    this.log('error', message, meta);
  }

  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }

  // Performance logging helper
  performance(operation, duration, meta = {}) {
    const performanceMeta = {
      operation,
      duration: `${duration}ms`,
      ...meta
    };
    
    if (duration > 1000) {
      this.warn('Slow operation detected', performanceMeta);
    } else if (duration > 500) {
      this.info('Operation completed', performanceMeta);
    } else {
      this.debug('Operation completed', performanceMeta);
    }
  }

  // Request logging helper
  request(method, path, statusCode, duration, meta = {}) {
    const requestMeta = {
      method,
      path,
      statusCode,
      duration: `${duration}ms`,
      ...meta
    };

    if (statusCode >= 500) {
      this.error('Server error response', requestMeta);
    } else if (statusCode >= 400) {
      this.warn('Client error response', requestMeta);
    } else {
      this.info('Request completed', requestMeta);
    }
  }
}

module.exports = new Logger();