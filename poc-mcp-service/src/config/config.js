/**
 * MCP Service Configuration
 */

module.exports = {
  port: process.env.MCP_SERVICE_PORT || 3004,
  env: process.env.NODE_ENV || 'development',
  
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000', 'http://localhost:3001']
  },

  mcp: {
    // Protocol configuration
    protocolVersion: '2024-11-05',
    maxRequestSize: '50mb',
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
    
    // Tool execution settings
    tools: {
      maxExecutionTime: parseInt(process.env.TOOL_MAX_EXECUTION_TIME) || 60000,
      maxConcurrentExecutions: parseInt(process.env.MAX_CONCURRENT_EXECUTIONS) || 10,
      enableCaching: process.env.TOOL_CACHING_ENABLED !== 'false',
      cacheTTL: parseInt(process.env.TOOL_CACHE_TTL) || 300 // 5 minutes
    },

    // Resource management
    resources: {
      maxResourceSize: '10mb',
      enableCompression: true
    },

    // Logging configuration
    logging: {
      enableToolLogs: process.env.TOOL_LOGGING_ENABLED !== 'false',
      logLevel: process.env.TOOL_LOG_LEVEL || 'info',
      maxLogSize: parseInt(process.env.MAX_LOG_SIZE) || 1000000 // 1MB
    },

    // Security settings
    security: {
      enableToolValidation: process.env.TOOL_VALIDATION_ENABLED !== 'false',
      allowedTools: process.env.ALLOWED_TOOLS ? process.env.ALLOWED_TOOLS.split(',') : [],
      maxToolNameLength: 100
    }
  },

  cache: {
    ttl: parseInt(process.env.CACHE_TTL) || 300, // 5 minutes
    checkPeriod: parseInt(process.env.CACHE_CHECK_PERIOD) || 60 // 1 minute
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'json'
  },

  // Service discovery
  services: {
    nlp: process.env.NLP_SERVICE_URL || 'http://localhost:3002',
    nlu: process.env.NLU_SERVICE_URL || 'http://localhost:3003',
    banking: process.env.BANKING_SERVICE_URL || 'http://localhost:3001'
  }
};