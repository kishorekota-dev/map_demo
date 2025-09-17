/**
 * Application Configuration
 * Centralized configuration management for the application
 */

const path = require('path');

// Environment configuration
const env = process.env.NODE_ENV || 'development';
const isDevelopment = env === 'development';
const isProduction = env === 'production';

// Server configuration
const server = {
  port: parseInt(process.env.PORT, 10) || 3001,
  host: process.env.HOST || 'localhost',
  bodyLimit: process.env.BODY_LIMIT || '10mb',
  timeout: parseInt(process.env.SERVER_TIMEOUT, 10) || 30000
};

// CORS configuration
const cors = {
  allowedOrigins: process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : isDevelopment 
      ? ['http://localhost:3002', 'http://localhost:3000']
      : [],
  credentials: true
};

// Rate limiting configuration
const rateLimit = {
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100 // limit each IP to 100 requests per windowMs
};

// Logging configuration
const logging = {
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  format: process.env.LOG_FORMAT || (isDevelopment ? 'dev' : 'combined'),
  file: {
    enabled: process.env.LOG_FILE_ENABLED === 'true',
    path: process.env.LOG_FILE_PATH || path.join(__dirname, '../logs'),
    maxSize: process.env.LOG_FILE_MAX_SIZE || '20m',
    maxFiles: parseInt(process.env.LOG_FILE_MAX_FILES, 10) || 14
  }
};

// Intent detection configuration
const intentDetection = {
  confidenceThreshold: parseFloat(process.env.INTENT_CONFIDENCE_THRESHOLD) || 0.7,
  maxEntities: parseInt(process.env.INTENT_MAX_ENTITIES, 10) || 10,
  cacheEnabled: process.env.INTENT_CACHE_ENABLED === 'true',
  cacheTtl: parseInt(process.env.INTENT_CACHE_TTL, 10) || 300 // 5 minutes
};

// Performance monitoring configuration
const performance = {
  enabled: process.env.PERFORMANCE_MONITORING_ENABLED !== 'false',
  slowRequestThreshold: parseInt(process.env.SLOW_REQUEST_THRESHOLD, 10) || 1000,
  memoryMonitoring: process.env.MEMORY_MONITORING_ENABLED !== 'false',
  gcMonitoring: process.env.GC_MONITORING_ENABLED === 'true'
};

// Security configuration
const security = {
  trustProxy: process.env.TRUST_PROXY === 'true',
  sessionSecret: process.env.SESSION_SECRET || 'fallback-secret-key-change-in-production',
  jwtSecret: process.env.JWT_SECRET || 'fallback-jwt-secret-change-in-production',
  passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH, 10) || 8
};

// Validation configuration
const validation = {
  strictMode: process.env.VALIDATION_STRICT_MODE !== 'false',
  maxMessageLength: parseInt(process.env.MAX_MESSAGE_LENGTH, 10) || 1000,
  maxContextSize: parseInt(process.env.MAX_CONTEXT_SIZE, 10) || 10000
};

// Health check configuration
const healthCheck = {
  enabled: true,
  interval: parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) || 30000, // 30 seconds
  timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT, 10) || 5000, // 5 seconds
  endpoints: {
    self: `/health`,
    detailed: `/api/health/detailed`
  }
};

module.exports = {
  env,
  isDevelopment,
  isProduction,
  server,
  cors,
  rateLimit,
  logging,
  intentDetection,
  performance,
  security,
  validation,
  healthCheck
};