module.exports = {
  // Server configuration
  server: {
    port: process.env.PORT || 3005,
    host: process.env.HOST || 'localhost',
    environment: process.env.NODE_ENV || 'development'
  },

  // Security configuration
  security: {
    jwtSecret: process.env.JWT_SECRET || 'fallback-secret-change-me',
    jwtExpiry: process.env.JWT_EXPIRY || '24h',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    corsOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']
  },

  // Banking business rules
  banking: {
    limits: {
      dailyTransfer: parseFloat(process.env.DAILY_TRANSFER_LIMIT) || 10000,
      monthlyTransfer: parseFloat(process.env.MONTHLY_TRANSFER_LIMIT) || 50000,
      cardDaily: parseFloat(process.env.CARD_DAILY_LIMIT) || 2000,
      fraudThreshold: parseFloat(process.env.FRAUD_THRESHOLD_AMOUNT) || 5000
    },
    fees: {
      wireTransfer: parseFloat(process.env.WIRE_TRANSFER_FEE) || 25.00,
      internationalTransfer: parseFloat(process.env.INTERNATIONAL_TRANSFER_FEE) || 45.00,
      atmWithdrawal: parseFloat(process.env.ATM_WITHDRAWAL_FEE) || 2.50,
      overdraft: parseFloat(process.env.OVERDRAFT_FEE) || 35.00,
      cardReplacement: parseFloat(process.env.CARD_REPLACEMENT_FEE) || 10.00
    },
    interestRates: {
      savings: 0.025,
      checking: 0.001,
      creditCard: 0.1899,
      loan: 0.0650
    }
  },

  // External services configuration
  services: {
    apiGateway: {
      url: process.env.API_GATEWAY_URL || 'http://localhost:3001',
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
    mcp: {
      url: process.env.MCP_SERVICE_URL || 'http://localhost:3004',
      timeout: parseInt(process.env.SERVICE_TIMEOUT) || 5000
    },
    registry: {
      url: process.env.REGISTRY_URL || 'http://localhost:8500',
      serviceName: process.env.SERVICE_NAME || 'poc-banking-service',
      serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
      healthCheckUrl: process.env.SERVICE_HEALTH_CHECK_URL || 'http://localhost:3005/health'
    },
    external: {
      paymentProcessor: process.env.PAYMENT_PROCESSOR_URL || 'http://localhost:9001',
      creditBureau: process.env.CREDIT_BUREAU_URL || 'http://localhost:9002',
      fraudDetection: process.env.FRAUD_DETECTION_URL || 'http://localhost:9003'
    }
  },

  // Rate limiting configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    standardHeaders: true,
    legacyHeaders: false
  },

  // Database configuration (for future implementation)
  database: {
    url: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/poc_banking',
    pool: {
      min: parseInt(process.env.DB_POOL_MIN) || 2,
      max: parseInt(process.env.DB_POOL_MAX) || 10,
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 100
    }
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE_PATH || 'logs/banking-service.log',
    maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
    maxSize: process.env.LOG_MAX_SIZE || '10MB'
  },

  // Health check configuration
  health: {
    checkInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
    serviceTimeout: parseInt(process.env.SERVICE_TIMEOUT) || 5000
  }
};