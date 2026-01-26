module.exports = {
  // Server configuration
  server: {
    port: process.env.PORT || 3003,
    host: process.env.HOST || 'localhost',
    environment: process.env.NODE_ENV || 'development'
  },

  // Security configuration
  security: {
    jwtSecret: process.env.JWT_SECRET || 'fallback-secret-change-me',
    jwtExpiry: process.env.JWT_EXPIRY || '24h',
    corsOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']
  },

  // NLU configuration
  nlu: {
    intentConfidenceThreshold: parseFloat(process.env.INTENT_CONFIDENCE_THRESHOLD) || 0.7,
    entityConfidenceThreshold: parseFloat(process.env.ENTITY_CONFIDENCE_THRESHOLD) || 0.8,
    maxQueryLength: parseInt(process.env.MAX_QUERY_LENGTH) || 1000,
    defaultLanguage: process.env.DEFAULT_LANGUAGE || 'en',
    contextTimeout: parseInt(process.env.CONTEXT_TIMEOUT) || 300000
  },

  // DialogFlow configuration
  dialogflow: {
    projectId: process.env.GOOGLE_PROJECT_ID || 'poc-banking-chatbot-dev',
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || './config/dialogflow-service-account-dev.json',
    languageCode: process.env.DIALOGFLOW_LANGUAGE_CODE || 'en',
    sessionPathPrefix: process.env.DIALOGFLOW_SESSION_PATH_PREFIX || 'projects/poc-banking-chatbot-dev/agent/sessions',
    clientEmail: process.env.DIALOGFLOW_CLIENT_EMAIL || '',
    enabled: !process.env.MOCK_DIALOGFLOW
  },

  // Banking domain configuration
  banking: {
    intentModelsPath: process.env.BANKING_INTENT_MODELS_PATH || './models/banking',
    customEntityModelsPath: process.env.CUSTOM_ENTITY_MODELS_PATH || './models/entities'
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
    nlp: {
      url: process.env.NLP_SERVICE_URL || 'http://localhost:3002',
      timeout: parseInt(process.env.SERVICE_TIMEOUT) || 5000
    },
    mcp: {
      url: process.env.MCP_SERVICE_URL || 'http://localhost:3004',
      timeout: parseInt(process.env.SERVICE_TIMEOUT) || 5000
    },
    registry: {
      url: process.env.REGISTRY_URL || 'http://localhost:8500',
      serviceName: process.env.SERVICE_NAME || 'poc-nlu-service',
      serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
      healthCheckUrl: process.env.SERVICE_HEALTH_CHECK_URL || 'http://localhost:3003/health'
    },
    external: {
      openai: {
        apiUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY || '',
        enabled: !process.env.MOCK_EXTERNAL_AI_SERVICES
      },
      rasa: {
        serverUrl: process.env.RASA_SERVER_URL || 'http://localhost:5005',
        enabled: !process.env.MOCK_EXTERNAL_AI_SERVICES
      },
      spacy: {
        serverUrl: process.env.SPACY_SERVER_URL || 'http://localhost:8080',
        enabled: !process.env.MOCK_EXTERNAL_AI_SERVICES
      }
    }
  },

  // Rate limiting configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 300,
    standardHeaders: true,
    legacyHeaders: false
  },

  // Caching configuration
  cache: {
    ttl: parseInt(process.env.CACHE_TTL) || 300,
    maxSize: parseInt(process.env.CACHE_MAX_SIZE) || 2000,
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379'
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE_PATH || 'logs/nlu-service.log',
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
    debugIntentDetection: process.env.DEBUG_INTENT_DETECTION === 'true',
    debugEntityExtraction: process.env.DEBUG_ENTITY_EXTRACTION === 'true',
    debugDialogflowIntegration: process.env.DEBUG_DIALOGFLOW_INTEGRATION === 'true',
    debugBankingIntents: process.env.DEBUG_BANKING_INTENTS === 'true',
    mockDialogflow: process.env.MOCK_DIALOGFLOW === 'true',
    mockExternalServices: process.env.MOCK_EXTERNAL_AI_SERVICES === 'true'
  }
};