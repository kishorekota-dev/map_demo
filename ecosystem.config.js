// PM2 Ecosystem Configuration
// Start all services: pm2 start ecosystem.config.js
// View status: pm2 status
// View logs: pm2 logs

module.exports = {
  apps: [
    // ========================================================================
    // Infrastructure Services
    // ========================================================================
    {
      name: 'api-gateway',
      cwd: './poc-api-gateway',
      script: 'server.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
        LOG_LEVEL: 'debug'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        LOG_LEVEL: 'info'
      },
      error_file: './logs/api-gateway-error.log',
      out_file: './logs/api-gateway-out.log',
      log_file: './logs/api-gateway-combined.log',
      time: true
    },

    // ========================================================================
    // Processing Services
    // ========================================================================
    {
      name: 'nlp-service',
      cwd: './poc-nlp-service/src',
      script: 'server.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'development',
        PORT: 3002,
        LOG_LEVEL: 'debug'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002,
        LOG_LEVEL: 'info'
      },
      error_file: './logs/nlp-service-error.log',
      out_file: './logs/nlp-service-out.log',
      log_file: './logs/nlp-service-combined.log',
      time: true
    },
    {
      name: 'nlu-service',
      cwd: './poc-nlu-service/src',
      script: 'server.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'development',
        PORT: 3003,
        LOG_LEVEL: 'debug'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3003,
        LOG_LEVEL: 'info'
      },
      error_file: './logs/nlu-service-error.log',
      out_file: './logs/nlu-service-out.log',
      log_file: './logs/nlu-service-combined.log',
      time: true
    },
    {
      name: 'mcp-service',
      cwd: './poc-mcp-service/src',
      script: 'server.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'development',
        PORT: 3004,
        LOG_LEVEL: 'debug'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3004,
        LOG_LEVEL: 'info'
      },
      error_file: './logs/mcp-service-error.log',
      out_file: './logs/mcp-service-out.log',
      log_file: './logs/mcp-service-combined.log',
      time: true
    },

    // ========================================================================
    // Domain Services
    // ========================================================================
    {
      name: 'banking-service',
      cwd: './poc-banking-service',
      script: 'server.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'development',
        PORT: 3005,
        LOG_LEVEL: 'debug'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3005,
        LOG_LEVEL: 'info'
      },
      error_file: './logs/banking-service-error.log',
      out_file: './logs/banking-service-out.log',
      log_file: './logs/banking-service-combined.log',
      time: true
    },
    {
      name: 'ai-orchestrator',
      cwd: './poc-ai-orchestrator',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 3007,
        LOG_LEVEL: 'debug',
        DB_HOST: 'localhost',
        DB_PORT: 5432,
        DB_NAME: 'ai_orchestrator_dev',
        DB_USERNAME: 'postgres',
        DB_PASSWORD: 'postgres',
        MCP_SERVICE_URL: 'http://localhost:3004/api/tools'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3007,
        LOG_LEVEL: 'info',
        DB_HOST: process.env.DB_HOST || 'localhost',
        DB_PORT: process.env.DB_PORT || 5432,
        DB_NAME: process.env.DB_NAME || 'ai_orchestrator',
        DB_USERNAME: process.env.DB_USERNAME || 'postgres',
        DB_PASSWORD: process.env.DB_PASSWORD || 'postgres',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        MCP_SERVICE_URL: process.env.MCP_SERVICE_URL || 'http://localhost:3004/api/tools'
      },
      error_file: './logs/ai-orchestrator-error.log',
      out_file: './logs/ai-orchestrator-out.log',
      log_file: './logs/ai-orchestrator-combined.log',
      time: true
    },
    {
      name: 'chat-backend',
      cwd: './poc-chat-backend',
      script: 'server.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'development',
        PORT: 3006,
        LOG_LEVEL: 'debug',
        JWT_SECRET: 'dev-jwt-secret-change-me-in-production-2024',
        AI_ORCHESTRATOR_URL: 'http://localhost:3007'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3006,
        LOG_LEVEL: 'info',
        JWT_SECRET: process.env.JWT_SECRET || 'change-me-in-production',
        AI_ORCHESTRATOR_URL: process.env.AI_ORCHESTRATOR_URL || 'http://localhost:3007'
      },
      error_file: './logs/chat-backend-error.log',
      out_file: './logs/chat-backend-out.log',
      log_file: './logs/chat-backend-combined.log',
      time: true
    },

    // ========================================================================
    // Frontend Services
    // ========================================================================
    {
      name: 'agent-ui',
      cwd: './poc-agent-ui',
      script: 'server.js',
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'development',
        PORT: 8081,
        LOG_LEVEL: 'debug'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8081,
        LOG_LEVEL: 'info'
      },
      error_file: './logs/agent-ui-error.log',
      out_file: './logs/agent-ui-out.log',
      log_file: './logs/agent-ui-combined.log',
      time: true
    }
  ],

  // Deploy configuration
  deploy: {
    production: {
      user: 'node',
      host: 'production-server',
      ref: 'origin/main',
      repo: 'git@github.com:kishorekota-dev/map_demo.git',
      path: '/var/www/chat-banking',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production'
    }
  }
};
