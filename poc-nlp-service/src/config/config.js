/**
 * NLP Service Configuration
 */

module.exports = {
  port: process.env.NLP_SERVICE_PORT || 3002,
  env: process.env.NODE_ENV || 'development',
  
  cors: {
    origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:3001']
  },

  nlp: {
    // Language processing configuration
    defaultLanguage: 'en',
    maxTextLength: 10000,
    
    // Sentiment analysis thresholds
    sentiment: {
      positive: 0.1,
      negative: -0.1
    },

    // Entity recognition settings
    entities: {
      enablePersons: true,
      enableOrganizations: true,
      enableLocations: true,
      enableDates: true,
      enableNumbers: true
    },

    // Processing timeouts
    timeouts: {
      analysis: 5000,
      processing: 10000
    }
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'json'
  },

  // Service discovery
  services: {
    nlu: process.env.NLU_SERVICE_URL || 'http://localhost:3003',
    banking: process.env.BANKING_SERVICE_URL || 'http://localhost:3001',
    mcp: process.env.MCP_SERVICE_URL || 'http://localhost:3004'
  }
};