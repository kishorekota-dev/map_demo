require('dotenv').config();

module.exports = {
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT) || 3007,
    host: process.env.HOST || 'localhost',
    env: process.env.NODE_ENV || 'development'
  },

  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'ai_orchestrator',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX) || 20,
      min: parseInt(process.env.DB_POOL_MIN) || 5,
      idle: parseInt(process.env.DB_POOL_IDLE) || 10000
    }
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || null,
    db: parseInt(process.env.REDIS_DB) || 0,
    ttl: parseInt(process.env.REDIS_TTL) || 3600
  },

  // OpenAI Configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4',
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 2000
  },

  // Local/Custom SLM Configuration (OpenAI-compatible endpoint)
  slm: {
    enabled: process.env.SLM_ENABLED !== 'false',
    baseUrl: process.env.SLM_BASE_URL || null,
    apiKey: process.env.SLM_API_KEY || process.env.OPENAI_API_KEY || 'not-required',
    model: process.env.SLM_MODEL || process.env.OPENAI_MODEL || 'gpt-4',
    temperature: process.env.SLM_TEMPERATURE !== undefined
      ? parseFloat(process.env.SLM_TEMPERATURE)
      : (parseFloat(process.env.OPENAI_TEMPERATURE) || 0),
    maxTokens: process.env.SLM_MAX_TOKENS !== undefined
      ? parseInt(process.env.SLM_MAX_TOKENS)
      : (parseInt(process.env.OPENAI_MAX_TOKENS) || 2000),
    jsonMode: process.env.SLM_JSON_MODE === 'true'
  },

  // MCP Service Configuration
  mcp: {
    // HTTP-based MCP (legacy/fallback)
    serviceUrl: process.env.MCP_SERVICE_URL || 'http://localhost:3004',
    timeout: parseInt(process.env.MCP_SERVICE_TIMEOUT) || 30000,
    retryAttempts: parseInt(process.env.MCP_RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.MCP_RETRY_DELAY) || 1000,
    
    // True MCP Protocol (SSE-based)
    sseUrl: process.env.MCP_SSE_URL || 'http://localhost:3004/mcp/sse',
    preferProtocol: process.env.MCP_PREFER_PROTOCOL !== 'false', // Default true
    enableFallback: process.env.MCP_ENABLE_FALLBACK !== 'false', // Default true
    
    // Protocol settings
    protocol: {
      version: '1.0',
      capabilities: {
        tools: true,
        resources: true,
        prompts: true,
        streaming: false
      }
    }
  },

  // Microservices URLs
  services: {
    nlu: process.env.NLU_SERVICE_URL || 'http://localhost:3003',
    banking: process.env.BANKING_SERVICE_URL || 'http://localhost:3005',
    chatBackend: process.env.CHAT_BACKEND_URL || 'http://localhost:3006'
  },

  // Security Configuration
  security: {
    jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
    jwtExpiry: process.env.JWT_EXPIRY || '24h',
    apiKey: process.env.API_KEY || 'dev-api-key'
  },

  // CORS Configuration
  cors: {
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3006').split(','),
    credentials: true
  },

  // Workflow Configuration
  workflow: {
    maxSteps: parseInt(process.env.MAX_WORKFLOW_STEPS) || 50,
    timeout: parseInt(process.env.WORKFLOW_TIMEOUT) || 300000,
    humanFeedbackTimeout: parseInt(process.env.HUMAN_FEEDBACK_TIMEOUT) || 300000,
    maxRetries: parseInt(process.env.MAX_RETRIES) || 3
  },

  // Session Configuration
  session: {
    ttl: parseInt(process.env.SESSION_TTL) || 1800000, // 30 minutes
    cleanupInterval: parseInt(process.env.SESSION_CLEANUP_INTERVAL) || 300000, // 5 minutes
    maxSessionsPerUser: parseInt(process.env.MAX_SESSIONS_PER_USER) || 5
  },

  // LangGraph Configuration
  langgraph: {
    recursionLimit: parseInt(process.env.GRAPH_RECURSION_LIMIT) || 50,
    debugMode: process.env.GRAPH_DEBUG_MODE === 'true',
    checkpointEnabled: process.env.CHECKPOINT_ENABLED !== 'false'
  },

  // Prompt Configuration
  prompts: {
    defaultSystemPrompt: process.env.DEFAULT_SYSTEM_PROMPT || 'You are a helpful banking assistant.',
    maxPromptLength: parseInt(process.env.MAX_PROMPT_LENGTH) || 4000
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100
  },

  // Monitoring
  monitoring: {
    enabled: process.env.ENABLE_METRICS !== 'false',
    interval: parseInt(process.env.METRICS_INTERVAL) || 60000
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
};
