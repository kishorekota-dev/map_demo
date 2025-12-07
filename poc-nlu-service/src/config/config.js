/**
 * NLU Service Configuration
 */

module.exports = {
  port: process.env.NLU_SERVICE_PORT || 3003,
  env: process.env.NODE_ENV || 'development',
  
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000', 'http://localhost:3001']
  },

  nlu: {
    // Intent detection configuration
    confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.6,
    maxIntents: parseInt(process.env.MAX_INTENTS) || 5,
    
    // Entity extraction settings
    entities: {
      enableDates: true,
      enableNumbers: true,
      enableCurrencies: true,
      enablePersons: true,
      enableLocations: true
    },

    // Context management
    context: {
      maxAge: parseInt(process.env.CONTEXT_MAX_AGE) || 300000, // 5 minutes
      maxContexts: parseInt(process.env.MAX_CONTEXTS) || 10
    },

    // Banking domain specific
    banking: {
      enableAccountDetection: true,
      enableTransactionAnalysis: true,
      enableAmountExtraction: true,
      enableDateExtraction: true
    }
  },

  dialogflow: {
    enabled: process.env.DIALOGFLOW_ENABLED === 'true',
    projectId: process.env.DIALOGFLOW_PROJECT_ID,
    // Support both explicit key file and Google Application Default Credentials
    keyFilename: process.env.DIALOGFLOW_KEY_FILENAME || process.env.GOOGLE_APPLICATION_CREDENTIALS,
    sessionPath: process.env.DIALOGFLOW_SESSION_PATH,
    languageCode: process.env.DIALOGFLOW_LANGUAGE_CODE || 'en-US'
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
    banking: process.env.BANKING_SERVICE_URL || 'http://localhost:3001',
    mcp: process.env.MCP_SERVICE_URL || 'http://localhost:3004'
  }
};