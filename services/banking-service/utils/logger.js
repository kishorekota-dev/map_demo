const winston = require('winston');
const { operationalLog } = require('./operationalLog');
const messages = require('./logMessages');
const privacyFormat = winston.format(info => operationalLog(info, { service: 'poc-banking-service', messages }));

const path = require('path');
const config = require('../config');

// Ensure logs directory exists
const fs = require('fs');
const logsDir = path.dirname(config.logging.file);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for banking service logs
const bankingFormat = winston.format.combine(
  winston.format.errors({ stack: true }),
  privacyFormat(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}] ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    return log;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: bankingFormat,
  defaultMeta: {
    service: 'poc-banking-service',
    version: '1.0.0'
  },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.colorize({ all: true })
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: config.logging.file,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: config.logging.maxFiles,
      tailable: true
    }),
    
    // Separate file for errors
    new winston.transports.File({
      filename: path.join(logsDir, 'banking-service-error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
      tailable: true
    })
  ],
  
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'banking-service-exceptions.log')
    })
  ],
  
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'banking-service-rejections.log')
    })
  ]
});

// Banking-specific logging methods
const bankingLogger = {
  ...logger,
  
  // Transaction logging
  transaction: (action, data, meta = {}) => {
    logger.info(`TRANSACTION: ${action}`, {
      ...data,
      ...meta,
      category: 'transaction'
    });
  },
  
  // Security logging
  security: (event, data, meta = {}) => {
    logger.warn(`SECURITY: ${event}`, {
      ...data,
      ...meta,
      category: 'security'
    });
  },
  
  // Authentication logging
  auth: (action, data, meta = {}) => {
    logger.info(`AUTH: ${action}`, {
      ...data,
      ...meta,
      category: 'authentication'
    });
  },
  
  // Fraud detection logging
  fraud: (action, data, meta = {}) => {
    logger.warn(`FRAUD: ${action}`, {
      ...data,
      ...meta,
      category: 'fraud'
    });
  },
  
  // Performance logging
  performance: (operation, duration, meta = {}) => {
    logger.info(`PERFORMANCE: ${operation}`, {
      operation,
      duration,
      ...meta,
      category: 'performance'
    });
  },
  
  // Audit logging for regulatory compliance
  audit: (action, data, meta = {}) => {
    logger.info(`AUDIT: ${action}`, {
      ...data,
      ...meta,
      category: 'audit',
      timestamp: new Date().toISOString()
    });
  },
  
  // API request logging
  request: (method, path, userId, meta = {}) => {
    logger.info('HTTP Request', {
      method,
      ...meta,
      category: 'api'
    });
  },
  
  // External service logging
  external: (service, action, meta = {}) => {
    logger.info(`EXTERNAL: ${service} - ${action}`, {
      service,
      action,
      ...meta,
      category: 'external'
    });
  },
  
  // Standard winston methods for compatibility
  error: (message, meta = {}) => {
    logger.error(message, meta);
  },
  
  warn: (message, meta = {}) => {
    logger.warn(message, meta);
  },
  
  info: (message, meta = {}) => {
    logger.info(message, meta);
  },
  
  debug: (message, meta = {}) => {
    logger.debug(message, meta);
  }
};


// HTTP metadata is enumerated; URLs, client addresses and headers are omitted.
bankingLogger.requestMiddleware = (req, res, next) => {
  const started = Date.now();
  res.on('finish', () => bankingLogger.info('HTTP Request', {
    method: req.method, statusCode: res.statusCode, duration: Date.now() - started
  }));
  next();
};

module.exports = bankingLogger;