/**
 * Logger utility for NLU Service
 */

const winston = require('winston');
const { operationalLog } = require('./operationalLog');
const messages = require('./logMessages');
const privacyFormat = winston.format(info => operationalLog(info, { service: 'poc-nlu-service', messages }));

const config = require('../config/config');

const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    privacyFormat(),
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'poc-nlu-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});


// HTTP metadata is enumerated; URLs, client addresses and headers are omitted.
logger.requestMiddleware = (req, res, next) => {
  const started = Date.now();
  res.on('finish', () => logger.info('HTTP Request', {
    method: req.method, statusCode: res.statusCode, duration: Date.now() - started
  }));
  next();
};

module.exports = logger;