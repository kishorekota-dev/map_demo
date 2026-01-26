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
const mcpApiRoutes = require('./routes/mcpApi.routes'); // New HTTP API routes
const MCPProtocolServer = require('./mcp/mcpProtocolServer'); // Updated true MCP protocol server
const { errorHandler, notFoundHandler } = require('./middleware/errorHandlers');
const config = require('./config/config');

class MCPService {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.port = config.port;
    
    this.mcpProtocolServer = new MCPProtocolServer(); // MCP protocol server
    
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
          activeConnections: this.mcpProtocolServer.getConnectionCount()
        }
      });
    });
  }

  setupRoutes() {
    // New HTTP API routes for tool execution
    this.app.use('/api/mcp', mcpApiRoutes);
    
    // Service info endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        service: 'POC MCP Service',
        version: require('../package.json').version,
        description: 'Model Context Protocol Host Microservice with Hybrid Protocol Support',
        protocols: [
          {
            name: 'MCP Protocol (WebSocket)',
            version: '2024-11-05',
            endpoint: 'ws://localhost:' + this.port + '/mcp',
            transport: 'WebSocket',
            features: ['Tool Discovery', 'Tool Execution', 'Resources', 'Prompts', 'Real-time']
          },
          {
            name: 'HTTP API',
            version: '1.0.0',
            endpoint: '/api/mcp',
            transport: 'REST',
            features: ['Tool Discovery', 'Tool Execution', 'Batch Execution', 'Validation']
          }
        ],
        endpoints: {
          health: '/health',
          info: '/api',
          tools: '/api/mcp/tools',
          execute: '/api/mcp/execute',
          executeBatch: '/api/mcp/execute-batch',
          validate: '/api/mcp/validate',
          categories: '/api/mcp/categories',
          websocket: 'ws://localhost:' + this.port
        },
        capabilities: [
          'MCP Protocol (WebSocket)',
          'HTTP REST API',
          'Banking Tool Integration',
          'Automatic Tool Discovery',
          'Batch Tool Execution',
          'Parameter Validation',
          'Real-time Communication',
          'Error Handling',
          'Security Validation',
          'Request Tracing'
        ]
      });
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      logger.info('MCP WebSocket connection established', {
        connectionId,
        clientIP: req.socket.remoteAddress,
        userAgent: req.headers['user-agent']
      });

      // Use the new MCP Protocol Server
      this.mcpProtocolServer.handleConnection(ws, connectionId);
      
      ws.on('close', () => {
        logger.info('MCP WebSocket connection closed', { connectionId });
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error', { error: error.message, connectionId });
      });
    });

    logger.info('MCP WebSocket server initialized on port ' + this.port);
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