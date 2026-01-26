/**
 * True MCP Protocol Server
 * Implements Model Context Protocol for tool execution
 * Supports WebSocket and stdio transports
 */

const { EventEmitter } = require('events');
const WebSocket = require('ws');
const logger = require('../utils/logger');
const CompleteBankingTools = require('../tools/completeBankingTools');

class MCPProtocolServer extends EventEmitter {
  constructor() {
    super();
    this.connections = new Map();
    this.bankingTools = new CompleteBankingTools();
    this.protocolVersion = '2024-11-05';
    
    logger.info('MCP Protocol Server initialized');
  }

  /**
   * Handle WebSocket connection
   */
  handleConnection(ws, connectionId) {
    logger.info('New MCP WebSocket connection', { connectionId });

    const connection = {
      id: connectionId,
      ws,
      authenticated: false,
      userId: null,
      createdAt: new Date()
    };

    this.connections.set(connectionId, connection);

    ws.on('message', async (message) => {
      try {
        const request = JSON.parse(message.toString());
        await this.handleMessage(connection, request);
      } catch (error) {
        logger.error('Error handling MCP message', { connectionId, error: error.message });
        this.sendError(connection, null, -32700, 'Parse error', error.message);
      }
    });

    ws.on('close', () => {
      logger.info('MCP WebSocket connection closed', { connectionId });
      this.connections.delete(connectionId);
    });

    ws.on('error', (error) => {
      logger.error('MCP WebSocket error', { connectionId, error: error.message });
    });

    // Send initialization message
    this.sendMessage(connection, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {
        protocolVersion: this.protocolVersion,
        serverInfo: {
          name: 'POC Banking MCP Server',
          version: '1.0.0'
        },
        capabilities: {
          tools: {
            listChanged: false
          },
          resources: {
            subscribe: false,
            listChanged: false
          },
          prompts: {
            listChanged: false
          },
          logging: {}
        }
      }
    });
  }

  /**
   * Handle incoming MCP message
   */
  async handleMessage(connection, request) {
    const { jsonrpc, id, method, params } = request;

    if (jsonrpc !== '2.0') {
      return this.sendError(connection, id, -32600, 'Invalid Request', 'Invalid JSON-RPC version');
    }

    logger.debug('Received MCP request', { connectionId: connection.id, method, id });

    try {
      switch (method) {
        case 'initialize':
          await this.handleInitialize(connection, id, params);
          break;

        case 'tools/list':
          await this.handleToolsList(connection, id, params);
          break;

        case 'tools/call':
          await this.handleToolsCall(connection, id, params);
          break;

        case 'resources/list':
          await this.handleResourcesList(connection, id, params);
          break;

        case 'prompts/list':
          await this.handlePromptsList(connection, id, params);
          break;

        case 'logging/setLevel':
          await this.handleLoggingSetLevel(connection, id, params);
          break;

        case 'ping':
          this.sendResult(connection, id, { status: 'pong' });
          break;

        default:
          this.sendError(connection, id, -32601, 'Method not found', `Unknown method: ${method}`);
      }
    } catch (error) {
      logger.error('Error handling MCP method', { connectionId: connection.id, method, error: error.message });
      this.sendError(connection, id, -32603, 'Internal error', error.message);
    }
  }

  /**
   * Handle initialize request
   */
  async handleInitialize(connection, id, params) {
    logger.info('MCP initialize', { connectionId: connection.id, params });

    connection.clientInfo = params.clientInfo;
    connection.protocolVersion = params.protocolVersion;

    this.sendResult(connection, id, {
      protocolVersion: this.protocolVersion,
      serverInfo: {
        name: 'POC Banking MCP Server',
        version: '1.0.0',
        description: 'MCP server for POC Banking Service integration'
      },
      capabilities: {
        tools: {
          listChanged: false
        },
        resources: {
          subscribe: false,
          listChanged: false
        },
        prompts: {
          listChanged: false
        },
        logging: {}
      }
    });
  }

  /**
   * Handle tools/list request
   */
  async handleToolsList(connection, id, params) {
    logger.info('MCP tools/list', { connectionId: connection.id });

    const tools = this.bankingTools.getToolDefinitions();

    this.sendResult(connection, id, {
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }))
    });
  }

  /**
   * Handle tools/call request
   */
  async handleToolsCall(connection, id, params) {
    const { name, arguments: toolArgs } = params;

    logger.info('MCP tools/call', { connectionId: connection.id, toolName: name });

    try {
      const result = await this.bankingTools.executeTool(name, toolArgs || {});

      this.sendResult(connection, id, {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ],
        isError: false
      });
    } catch (error) {
      logger.error('Tool execution error', {
        connectionId: connection.id,
        toolName: name,
        error: error.message
      });

      this.sendResult(connection, id, {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      });
    }
  }

  /**
   * Handle resources/list request
   */
  async handleResourcesList(connection, id, params) {
    logger.info('MCP resources/list', { connectionId: connection.id });

    // No resources implemented yet
    this.sendResult(connection, id, {
      resources: []
    });
  }

  /**
   * Handle prompts/list request
   */
  async handlePromptsList(connection, id, params) {
    logger.info('MCP prompts/list', { connectionId: connection.id });

    // No prompts implemented yet
    this.sendResult(connection, id, {
      prompts: []
    });
  }

  /**
   * Handle logging/setLevel request
   */
  async handleLoggingSetLevel(connection, id, params) {
    logger.info('MCP logging/setLevel', { connectionId: connection.id, level: params.level });

    this.sendResult(connection, id, {});
  }

  /**
   * Send result message
   */
  sendResult(connection, id, result) {
    this.sendMessage(connection, {
      jsonrpc: '2.0',
      id,
      result
    });
  }

  /**
   * Send error message
   */
  sendError(connection, id, code, message, data) {
    this.sendMessage(connection, {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        data
      }
    });
  }

  /**
   * Send message to connection
   */
  sendMessage(connection, message) {
    if (connection.ws && connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(JSON.stringify(message));
      logger.debug('Sent MCP message', { connectionId: connection.id, method: message.method || 'response' });
    }
  }

  /**
   * Broadcast message to all connections
   */
  broadcast(message) {
    this.connections.forEach(connection => {
      this.sendMessage(connection, message);
    });
  }

  /**
   * Get connection count
   */
  getConnectionCount() {
    return this.connections.size;
  }

  /**
   * Close all connections
   */
  closeAllConnections() {
    this.connections.forEach((connection, id) => {
      if (connection.ws) {
        connection.ws.close();
      }
    });
    this.connections.clear();
    logger.info('All MCP connections closed');
  }
}

module.exports = MCPProtocolServer;
