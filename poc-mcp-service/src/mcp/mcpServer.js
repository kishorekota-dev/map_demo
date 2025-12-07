const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} = require('@modelcontextprotocol/sdk/types.js');
const logger = require('../utils/logger');
const bankingTools = require('./tools/bankingTools');

/**
 * True MCP Server Implementation
 * Uses official Model Context Protocol SDK with SSE transport
 */
class MCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'poc-banking-mcp-server',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}, // Provides tools
          resources: {}, // Provides resources
          prompts: {} // Provides prompts
        }
      }
    );

    this.activeConnections = new Map();
    this.setupHandlers();
    
    logger.info('MCP Server initialized with official SDK');
  }

  /**
   * Setup request handlers
   */
  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('Handling list_tools request');
      
      const tools = bankingTools.getAllTools();
      
      logger.info('Listed available tools', {
        count: tools.length,
        tools: tools.map(t => t.name)
      });
      
      return { tools };
    });

    // Execute tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      logger.info('Handling call_tool request', {
        tool: name,
        args: Object.keys(args || {})
      });

      try {
        const result = await bankingTools.executeTool(name, args);
        
        logger.info('Tool executed successfully', {
          tool: name,
          success: true
        });

        // Format response according to MCP protocol
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Tool execution failed', {
          tool: name,
          error: error.message
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error.message
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      logger.debug('Handling list_resources request');
      
      const resources = [
        {
          uri: 'banking://accounts',
          name: 'Account Data',
          description: 'Access to account information',
          mimeType: 'application/json'
        },
        {
          uri: 'banking://transactions',
          name: 'Transaction Data',
          description: 'Access to transaction history',
          mimeType: 'application/json'
        },
        {
          uri: 'banking://cards',
          name: 'Card Data',
          description: 'Access to card information',
          mimeType: 'application/json'
        }
      ];
      
      return { resources };
    });

    // Read resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      logger.info('Handling read_resource request', { uri });
      
      try {
        const data = await this.getResourceData(uri);
        
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(data, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Failed to read resource', {
          uri,
          error: error.message
        });
        throw error;
      }
    });

    // List available prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      logger.debug('Handling list_prompts request');
      
      const prompts = [
        {
          name: 'account_balance_prompt',
          description: 'Get account balance for a customer',
          arguments: [
            {
              name: 'accountId',
              description: 'The account ID to check',
              required: true
            }
          ]
        },
        {
          name: 'transaction_history_prompt',
          description: 'Get transaction history for an account',
          arguments: [
            {
              name: 'accountId',
              description: 'The account ID',
              required: true
            },
            {
              name: 'days',
              description: 'Number of days to look back',
              required: false
            }
          ]
        }
      ];
      
      return { prompts };
    });

    // Get prompt
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      logger.info('Handling get_prompt request', { name, args });
      
      const prompt = await this.generatePrompt(name, args);
      
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: prompt
            }
          }
        ]
      };
    });

    logger.info('All MCP request handlers configured');
  }

  /**
   * Get resource data
   */
  async getResourceData(uri) {
    const uriParts = uri.split('://');
    if (uriParts[0] !== 'banking') {
      throw new Error('Invalid resource URI scheme');
    }

    const resourceType = uriParts[1].split('/')[0];

    // Mock data for demonstration
    const resourceData = {
      accounts: {
        type: 'accounts',
        data: [
          { id: 'ACC001', balance: 5000, type: 'checking' },
          { id: 'ACC002', balance: 15000, type: 'savings' }
        ]
      },
      transactions: {
        type: 'transactions',
        data: [
          {
            id: 'TXN001',
            accountId: 'ACC001',
            amount: -50,
            date: '2024-01-15',
            description: 'Grocery Store'
          }
        ]
      },
      cards: {
        type: 'cards',
        data: [
          { id: 'CARD001', accountId: 'ACC001', status: 'active', lastFour: '1234' }
        ]
      }
    };

    return resourceData[resourceType] || { error: 'Resource not found' };
  }

  /**
   * Generate prompt
   */
  async generatePrompt(name, args) {
    const prompts = {
      account_balance_prompt: (args) =>
        `Please check the account balance for account ${args.accountId}. Provide a summary of the current balance and recent activity.`,
      
      transaction_history_prompt: (args) =>
        `Show me the transaction history for account ${args.accountId} for the last ${args.days || 30} days. Include transaction details and categorization.`
    };

    const generator = prompts[name];
    if (!generator) {
      throw new Error(`Prompt not found: ${name}`);
    }

    return generator(args || {});
  }

  /**
   * Create Express SSE endpoint handler
   */
  createSSEHandler() {
    return async (req, res) => {
      const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      logger.info('New SSE connection', {
        connectionId,
        ip: req.ip
      });

      try {
        // Create SSE transport
        const transport = new SSEServerTransport('/mcp/sse', res);
        
        // Store connection
        this.activeConnections.set(connectionId, {
          transport,
          connectedAt: new Date(),
          ip: req.ip
        });

        // Connect server to transport
        await this.server.connect(transport);
        
        logger.info('MCP Server connected via SSE', { connectionId });

        // Cleanup on close
        res.on('close', () => {
          this.activeConnections.delete(connectionId);
          logger.info('SSE connection closed', { connectionId });
        });

      } catch (error) {
        logger.error('Failed to establish MCP connection', {
          connectionId,
          error: error.message
        });
        
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Failed to establish MCP connection'
          });
        }
      }
    };
  }

  /**
   * Get server status
   */
  getStatus() {
    return {
      name: 'poc-banking-mcp-server',
      version: '1.0.0',
      protocol: 'mcp',
      transport: 'sse',
      activeConnections: this.activeConnections.size,
      capabilities: {
        tools: true,
        resources: true,
        prompts: true
      },
      connections: Array.from(this.activeConnections.entries()).map(([id, conn]) => ({
        id,
        connectedAt: conn.connectedAt,
        ip: conn.ip
      }))
    };
  }

  /**
   * Close all connections
   */
  async close() {
    logger.info('Closing MCP Server', {
      activeConnections: this.activeConnections.size
    });

    for (const [id, connection] of this.activeConnections.entries()) {
      try {
        await connection.transport.close();
        this.activeConnections.delete(id);
      } catch (error) {
        logger.error('Failed to close connection', {
          connectionId: id,
          error: error.message
        });
      }
    }

    logger.info('MCP Server closed');
  }
}

module.exports = MCPServer;
