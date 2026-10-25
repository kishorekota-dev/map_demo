const winston = require('winston');
const { operationalLog } = require('./operationalLog');
const messages = require('./logMessages');
const privacyFormat = winston.format(info => operationalLog(info, { service: 'poc-api-gateway', messages }));

const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  security: 2,
  info: 3,
  http: 4,
  debug: 5
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  security: 'magenta',
  info: 'green',
  http: 'cyan',
  debug: 'blue'
};

winston.addColors(colors);

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(info => {
    const { timestamp, level, message, ...meta } = info;
    let metaStr = '';
    
    if (Object.keys(meta).length > 0) {
      metaStr = `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports array
const transports = [
  // Console transport
  new winston.transports.Console({
    level: process.env.LOG_LEVEL || 'debug',
    format: consoleFormat
  }),
  
  // Combined log file
  new winston.transports.File({
    filename: path.join(logsDir, 'api-gateway.log'),
    level: 'info',
    format: fileFormat,
    maxsize: 10485760, // 10MB
    maxFiles: 5
  }),
  
  // Error log file
  new winston.transports.File({
    filename: path.join(logsDir, 'api-gateway-error.log'),
    level: 'error',
    format: fileFormat,
    maxsize: 10485760, // 10MB
    maxFiles: 5
  }),
  
  // Security log file
  new winston.transports.File({
    filename: path.join(logsDir, 'api-gateway-security.log'),
    level: 'security',
    format: fileFormat,
    maxsize: 10485760, // 10MB
    maxFiles: 10
  })
];

// Create logger instance
const logger = winston.createLogger({
  levels,
  format: winston.format.combine(winston.format.errors({ stack: true }), winston.format.splat(), privacyFormat()),
  transports,
  exitOnError: false
});

// Add custom security level method
logger.security = (message, meta = {}) => {
  logger.log('security', message, meta);
};

// Stream object for Morgan
logger.stream = {
  write: (message) => {
    logger.http('HTTP Request');
  }
};

/**
 * Request logger middleware
 */
logger.requestMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = { method: req.method, statusCode: res.statusCode, duration };
    if (res.statusCode >= 400) logger.warn('HTTP Request', logData);
    else logger.http('HTTP Request', logData);
  });
  
  next();
};

/**
 * Error logger
 */
logger.logError = (error, context = {}) => {
  logger.error('Operation failed', {
    error: error.name,
    stack: error.stack,
    ...context
  });
};

/**
 * Create child logger with additional context
 */
logger.child = (context) => {
  return {
    error: (message, meta = {}) => logger.error(message, { ...context, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { ...context, ...meta }),
    info: (message, meta = {}) => logger.info(message, { ...context, ...meta }),
    http: (message, meta = {}) => logger.http(message, { ...context, ...meta }),
    debug: (message, meta = {}) => logger.debug(message, { ...context, ...meta }),
    security: (message, meta = {}) => logger.security(message, { ...context, ...meta })
  };
};

// Log unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise
  });
});

// Log uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  
  // Give logger time to write before exit
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Startup log
logger.info('Logger initialized', {
  level: process.env.LOG_LEVEL || 'debug',
  environment: process.env.NODE_ENV || 'development'
});

module.exports = logger;
