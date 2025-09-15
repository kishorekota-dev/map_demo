const config = {
  // Server configuration
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    apiVersion: process.env.API_VERSION || 'v1',
    apiBaseUrl: process.env.API_BASE_URL || '/api'
  },

  // Intent detection configuration
  intentDetection: {
    confidenceThreshold: parseFloat(process.env.DEFAULT_CONFIDENCE_THRESHOLD) || 0.7,
    maxIntentHistory: parseInt(process.env.MAX_INTENT_HISTORY) || 100,
    enableLearning: process.env.ENABLE_LEARNING === 'true' || false
  },

  // Response configuration
  responses: {
    defaultResponse: process.env.DEFAULT_RESPONSE || "I'm sorry, I didn't understand that. Could you please rephrase your question?",
    enableLogging: process.env.ENABLE_LOGGING === 'true' || true,
    maxResponseLength: parseInt(process.env.MAX_RESPONSE_LENGTH) || 500
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableConsole: process.env.ENABLE_CONSOLE_LOGGING !== 'false',
    enableFile: process.env.ENABLE_FILE_LOGGING === 'true' || false
  }
};

module.exports = config;