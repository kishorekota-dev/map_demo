const winston = require('winston');
const { operationalLog } = require('./operationalLog');
const messages = require('./logMessages');
const privacyFormat = winston.format(info => operationalLog(info, { service: 'poc-mcp-service', messages }));

const path = require('path');
const fs = require('fs');

// Create logs directory
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.errors({ stack: true }),
  privacyFormat(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.json()
);

// Console format
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: consoleFormat
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'mcp-service.log'),
      level: 'info',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'mcp-service-error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    })
  ]
});

// Stream for Morgan
logger.stream = {
  write: () => logger.info('HTTP Request')
};


// HTTP metadata is enumerated; URLs, client addresses and headers are omitted.
logger.requestMiddleware = (req, res, next) => {
  const started = Date.now();
  res.on('finish', () => logger.info('HTTP Request', {
    method: req.method, statusCode: res.statusCode, duration: Date.now() - started
  }));
  next();
};

module.exports = logger;
