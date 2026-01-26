// POC Banking Chat - PM2 Ecosystem Configuration
// Usage: pm2 start ecosystem.config.js --env production

module.exports = {
  apps: [
    // API Gateway
    {
      name: 'api-gateway',
      cwd: './services/api-gateway',
      script: 'server.js',
      instances: 2,
      exec_mode: 'cluster',
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    },

    // NLU Service
    {
      name: 'nlu-service',
      cwd: './services/nlu-service/src',
      script: 'server.js',
      instances: 1,
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 3003
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3003
      }
    },

    // MCP Service
    {
      name: 'mcp-service',
      cwd: './services/mcp-service/src',
      script: 'server.js',
      instances: 1,
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 3004
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3004
      }
    },

    // Banking Service
    {
      name: 'banking-service',
      cwd: './services/banking-service',
      script: 'server.js',
      instances: 2,
      exec_mode: 'cluster',
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 3005
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3005
      }
    },

    // Chat Backend
    {
      name: 'chat-backend',
      cwd: './services/chat-backend',
      script: 'server.js',
      instances: 1, // Single instance for WebSocket
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 3006
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3006
      }
    },

    // AI Orchestrator
    {
      name: 'ai-orchestrator',
      cwd: './services/ai-orchestrator/src',
      script: 'server.js',
      instances: 1,
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 3007
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3007
      }
    },

    // Agent UI
    {
      name: 'agent-ui',
      cwd: './services/agent-ui',
      script: 'server.js',
      instances: 1,
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 8081
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8081
      }
    }
  ]
};
