/**
 * POC MCP Service Server
 * Model Context Protocol Host Microservice
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./utils/logger');
const mcpRoutes = require('./routes/mcp.routes');
const MCPServer = require('./services/mcp-server.service');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandlers');
const config = require('./config/config');

class MCPService {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.port = config.port;
    
    this.mcpServer = new MCPServer();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors({
      origin: config.cors.origin,
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 500, // Higher limit for tool calling
      message: {
        error: 'Too many requests from this IP, please try again later.'
      }
    });
    this.app.use('/api', limiter);

    // Request parsing
    this.app.use(express.json({ limit: '50mb' })); // Larger limit for tool data
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Logging
    this.app.use(morgan('combined', {
      stream: { write: (message) => logger.info(message.trim()) }
    }));

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        service: 'poc-mcp-service',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: require('../package.json').version,
        mcp: {
          protocolVersion: '2024-11-05',
          connectedClients: this.wss.clients.size,
          availableTools: this.mcpServer.getAvailableTools().length
        }
      });
    });
  }

  setupRoutes() {
    this.app.use('/api/mcp', mcpRoutes);
    
    // Service info endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        service: 'POC MCP Service',
        version: require('../package.json').version,
        description: 'Model Context Protocol Host Microservice',
        protocol: {
          version: '2024-11-05',
          features: [
            'Tool Discovery',
            'Tool Execution',
            'Resource Management',
            'Prompt Templates',
            'Logging',
            'Progress Tracking'
          ]
        },
        endpoints: {
          health: '/health',
          mcp: '/api/mcp',
          tools: '/api/mcp/tools',
          execute: '/api/mcp/tools/execute',
          resources: '/api/mcp/resources',
          prompts: '/api/mcp/prompts',
          websocket: 'ws://localhost:3004/mcp'
        },
        capabilities: [
          'Banking Tool Integration',
          'NLP Tool Calls',
          'NLU Tool Calls',
          'Real-time Communication',
          'Tool Result Caching',
          'Error Handling',
          'Security Validation'
        ]
      });
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      logger.info('MCP WebSocket connection established', {
        clientIP: req.socket.remoteAddress,
        userAgent: req.headers['user-agent']
      });

      // Initialize MCP session
      const sessionId = this.mcpServer.createSession(ws);
      
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          const response = await this.mcpServer.handleMessage(sessionId, message);
          ws.send(JSON.stringify(response));
        } catch (error) {
          logger.error('WebSocket message error', { error: error.message });
          ws.send(JSON.stringify({
            error: {
              code: -32603,
              message: 'Internal error',
              data: error.message
            }
          }));
        }
      });

      ws.on('close', () => {
        logger.info('MCP WebSocket connection closed', { sessionId });
        this.mcpServer.removeSession(sessionId);
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error', { error: error.message, sessionId });
        this.mcpServer.removeSession(sessionId);
      });

      // Send initialization message
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
            logging: {}
          },
          serverInfo: {
            name: 'poc-mcp-service',
            version: require('../package.json').version
          }
        }
      }));
    });

    logger.info('MCP WebSocket server initialized');
  }

  setupErrorHandling() {
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  start() {
    this.server.listen(this.port, () => {
      logger.info(`POC MCP Service started on port ${this.port}`);
      logger.info(`Health check: http://localhost:${this.port}/health`);
      logger.info(`API docs: http://localhost:${this.port}/api`);
      logger.info(`WebSocket: ws://localhost:${this.port}/mcp`);
    });
  }
}

// Start the service
const mcpService = new MCPService();
mcpService.start();

module.exports = mcpService;