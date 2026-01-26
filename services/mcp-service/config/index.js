module.exports = {
  // Server configuration
  server: {
    port: process.env.PORT || 3004,
    host: process.env.HOST || 'localhost',
    environment: process.env.NODE_ENV || 'development'
  },

  // WebSocket configuration
  websocket: {
    port: process.env.WS_PORT || 3004,
    path: process.env.WS_PATH || '/ws',
    heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL) || 30000,
    maxConnections: parseInt(process.env.WS_MAX_CONNECTIONS) || 100,
    authRequired: process.env.WS_AUTH_REQUIRED === 'true',
    rateLimitMaxMessages: parseInt(process.env.WS_RATE_LIMIT_MAX_MESSAGES) || 1000
  },

  // Security configuration
  security: {
    jwtSecret: process.env.JWT_SECRET || 'fallback-secret-change-me',
    jwtExpiry: process.env.JWT_EXPIRY || '24h',
    corsOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']
  },

  // MCP Protocol configuration
  mcp: {
    protocolVersion: process.env.MCP_PROTOCOL_VERSION || '1.0.0',
    maxTools: parseInt(process.env.MCP_MAX_TOOLS) || 50,
    toolTimeout: parseInt(process.env.MCP_TOOL_TIMEOUT) || 30000,
    maxContextSize: parseInt(process.env.MCP_MAX_CONTEXT_SIZE) || 100000
  },

  // Tool execution configuration
  tools: {
    executionTimeout: parseInt(process.env.TOOL_EXECUTION_TIMEOUT) || 30000,
    maxConcurrentTools: parseInt(process.env.MAX_CONCURRENT_TOOLS) || 10,
    retryAttempts: parseInt(process.env.TOOL_RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.TOOL_RETRY_DELAY) || 1000,
    registryPath: process.env.TOOL_REGISTRY_PATH || './tools',
    customToolsPath: process.env.CUSTOM_TOOLS_PATH || './custom-tools',
    validationEnabled: process.env.TOOL_VALIDATION_ENABLED === 'true'
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
    nlu: {
      url: process.env.NLU_SERVICE_URL || 'http://localhost:3003',
      timeout: parseInt(process.env.SERVICE_TIMEOUT) || 5000
    },
    registry: {
      url: process.env.REGISTRY_URL || 'http://localhost:8500',
      serviceName: process.env.SERVICE_NAME || 'poc-mcp-service',
      serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
      healthCheckUrl: process.env.SERVICE_HEALTH_CHECK_URL || 'http://localhost:3004/health'
    },
    external: {
      openai: {
        apiUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY || '',
        enabled: !process.env.MOCK_AI_SERVICES
      },
      anthropic: {
        apiUrl: process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1',
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        enabled: !process.env.MOCK_AI_SERVICES
      },
      azureOpenai: {
        endpoint: process.env.AZURE_OPENAI_ENDPOINT || '',
        apiKey: process.env.AZURE_OPENAI_API_KEY || '',
        enabled: !process.env.MOCK_AI_SERVICES
      },
      googleAI: {
        endpoint: process.env.GOOGLE_AI_ENDPOINT || 'https://generativelanguage.googleapis.com',
        apiKey: process.env.GOOGLE_AI_API_KEY || '',
        enabled: !process.env.MOCK_AI_SERVICES
      }
    }
  },

  // Rate limiting configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 500,
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
    file: process.env.LOG_FILE_PATH || 'logs/mcp-service.log',
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
    debugMCPProtocol: process.env.DEBUG_MCP_PROTOCOL === 'true',
    debugToolExecution: process.env.DEBUG_TOOL_EXECUTION === 'true',
    debugWebSocketCommunication: process.env.DEBUG_WEBSOCKET_COMMUNICATION === 'true',
    debugAIModelCalls: process.env.DEBUG_AI_MODEL_CALLS === 'true',
    mockAIServices: process.env.MOCK_AI_SERVICES === 'true',
    enableToolDebugging: process.env.ENABLE_TOOL_DEBUGGING === 'true'
  }
};