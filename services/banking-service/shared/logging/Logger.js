const winston = require('winston');

/**
 * Centralized logging with correlation ID support
 */
class Logger {
  static loggers = {};

  static getLogger(serviceName) {
    if (this.loggers[serviceName]) {
      return this.loggers[serviceName];
    }

    const logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: serviceName },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    this.loggers[serviceName] = logger;
    return logger;
  }

  static withCorrelationId(logger, correlationId) {
    return {
      debug: (message, meta = {}) => logger.debug(message, { ...meta, correlationId }),
      info: (message, meta = {}) => logger.info(message, { ...meta, correlationId }),
      warn: (message, meta = {}) => logger.warn(message, { ...meta, correlationId }),
      error: (message, meta = {}) => logger.error(message, { ...meta, correlationId })
    };
  }
}

module.exports = Logger;
