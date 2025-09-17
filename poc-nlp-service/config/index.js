module.exports = {
  // Server configuration
  server: {
    port: process.env.PORT || 3002,
    host: process.env.HOST || 'localhost',
    environment: process.env.NODE_ENV || 'development'
  },

  // Security configuration
  security: {
    jwtSecret: process.env.JWT_SECRET || 'fallback-secret-change-me',
    jwtExpiry: process.env.JWT_EXPIRY || '24h',
    corsOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']
  },

  // NLP configuration
  nlp: {
    maxTextLength: parseInt(process.env.MAX_TEXT_LENGTH) || 10000,
    sentimentThreshold: parseFloat(process.env.SENTIMENT_THRESHOLD) || 0.6,
    entityConfidenceThreshold: parseFloat(process.env.ENTITY_CONFIDENCE_THRESHOLD) || 0.8,
    languageDetectionThreshold: parseFloat(process.env.LANGUAGE_DETECTION_THRESHOLD) || 0.9
  },

  // External services configuration
  services: {
    apiGateway: {
      url: process.env.API_GATEWAY_URL || 'http://localhost:3001',
      timeout: parseInt(process.env.SERVICE_TIMEOUT) || 5000
    },
    banking: {
      url: process.env.BANKING_SERVICE_URL || 'http://localhost:3005',
      timeout: parseInt(process.env.SERVICE_TIMEOUT) || 5000
    },
    nlu: {
      url: process.env.NLU_SERVICE_URL || 'http://localhost:3003',
      timeout: parseInt(process.env.SERVICE_TIMEOUT) || 5000
    },
    mcp: {
      url: process.env.MCP_SERVICE_URL || 'http://localhost:3004',
      timeout: parseInt(process.env.SERVICE_TIMEOUT) || 5000
    },
    registry: {
      url: process.env.REGISTRY_URL || 'http://localhost:8500',
      serviceName: process.env.SERVICE_NAME || 'poc-nlp-service',
      serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
      healthCheckUrl: process.env.SERVICE_HEALTH_CHECK_URL || 'http://localhost:3002/health'
    },
    external: {
      openai: {
        apiUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY || '',
        enabled: !process.env.MOCK_EXTERNAL_NLP_SERVICES
      },
      huggingface: {
        apiUrl: process.env.HUGGINGFACE_API_URL || 'https://api-inference.huggingface.co',
        apiKey: process.env.HUGGINGFACE_API_KEY || '',
        enabled: !process.env.MOCK_EXTERNAL_NLP_SERVICES
      },
      googleNLP: {
        apiUrl: process.env.GOOGLE_NLP_API_URL || 'https://language.googleapis.com/v1',
        apiKey: process.env.GOOGLE_API_KEY || '',
        enabled: !process.env.MOCK_EXTERNAL_NLP_SERVICES
      }
    }
  },

  // Rate limiting configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 200,
    standardHeaders: true,
    legacyHeaders: false
  },

  // Caching configuration
  cache: {
    ttl: parseInt(process.env.CACHE_TTL) || 600,
    maxSize: parseInt(process.env.CACHE_MAX_SIZE) || 1000,
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379'
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE_PATH || 'logs/nlp-service.log',
    maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
    maxSize: process.env.LOG_MAX_SIZE || '10MB'
  },

  // Health check configuration
  health: {
    checkInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
    serviceTimeout: parseInt(process.env.SERVICE_TIMEOUT) || 5000
  },

  // Development configuration
  development: {
    debugNLPProcessing: process.env.DEBUG_NLP_PROCESSING === 'true',
    debugSentimentAnalysis: process.env.DEBUG_SENTIMENT_ANALYSIS === 'true',
    debugEntityExtraction: process.env.DEBUG_ENTITY_EXTRACTION === 'true',
    mockExternalServices: process.env.MOCK_EXTERNAL_NLP_SERVICES === 'true'
  }
};