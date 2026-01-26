const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
const config = require('../../config');
const logger = require('../utils/logger');

/**
 * True MCP Client using official Model Context Protocol SDK
 * Implements the official MCP protocol with SSE transport
 */
class TrueMCPClient {
  constructor() {
    this.serverUrl = config.mcp.serviceUrl.replace('/api/tools', '/mcp/sse');
    this.connected = false;
    this.client = null;
    this.transport = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectDelay = 2000;
    
    logger.info('True MCP Client initialized', { 
      serverUrl: this.serverUrl 
    });
  }

  /**
   * Connect to MCP server
   */
  async connect() {
    if (this.connected) {
      logger.debug('Already connected to MCP server');
      return;
    }

    try {
      logger.info('Connecting to MCP server', { url: this.serverUrl });

      // Initialize MCP client
      this.client = new Client(
        {
          name: 'ai-orchestrator',
          version: '1.0.0'
        },
        {
          capabilities: {
            tools: {},
            resources: {},
            prompts: {}
          }
        }
      );

      // Create SSE transport
      this.transport = new SSEClientTransport(
        new URL(this.serverUrl)
      );

      // Connect to server
      await this.client.connect(this.transport);
      
      this.connected = true;
      this.reconnectAttempts = 0;
      
      logger.info('Successfully connected to MCP server');

      // Setup reconnection on disconnect
      this.transport.onclose = () => {
        logger.warn('MCP connection closed, attempting reconnect');
        this.connected = false;
        this.scheduleReconnect();
      };

      this.transport.onerror = (error) => {
        logger.error('MCP transport error', { error: error.message });
        this.connected = false;
      };

    } catch (error) {
      logger.error('Failed to connect to MCP server', {
        error: error.message,
        stack: error.stack
      });
      
      this.connected = false;
      throw new Error(`MCP connection failed: ${error.message}`);
    }
  }

  /**
   * Schedule reconnection attempt
   */
  async scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached, giving up');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    
    logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logger.error('Reconnection failed', { error: error.message });
        this.scheduleReconnect();
      }
    }, delay);
  }

  /**
   * Ensure connection before operations
   */
  async ensureConnected() {
    if (!this.connected) {
      await this.connect();
    }
  }

  /**
   * List all available tools from MCP server
   */
  async listTools() {
    await this.ensureConnected();

    try {
      logger.debug('Listing tools from MCP server');
      
      const response = await this.client.listTools();
      
      logger.info('Tools listed successfully', {
        count: response.tools?.length || 0
      });

      return response.tools || [];
    } catch (error) {
      logger.error('Failed to list tools', {
        error: error.message
      });
      throw new Error(`Failed to list MCP tools: ${error.message}`);
    }
  }

  /**
   * Call a tool using MCP protocol
   */
  async callTool({ name, arguments: args }) {
    await this.ensureConnected();

    const requestId = `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('Calling MCP tool', {
      requestId,
      name,
      arguments: Object.keys(args || {})
    });

    try {
      const response = await this.client.callTool({
        name,
        arguments: args
      });

      logger.info('MCP tool called successfully', {
        requestId,
        name,
        hasContent: !!response.content
      });

      // Parse response content
      const result = this.parseToolResponse(response);
      
      return {
        success: !response.isError,
        data: result,
        meta: {
          requestId,
          toolName: name,
          protocol: 'mcp'
        }
      };
    } catch (error) {
      logger.error('MCP tool call failed', {
        requestId,
        name,
        error: error.message
      });
      
      throw new Error(`MCP tool call failed: ${error.message}`);
    }
  }

  /**
   * Parse tool response content
   */
  parseToolResponse(response) {
    if (!response.content || response.content.length === 0) {
      return null;
    }

    // MCP responses can have multiple content items
    const results = response.content.map(item => {
      if (item.type === 'text') {
        try {
          // Try to parse as JSON
          return JSON.parse(item.text);
        } catch {
          // Return as-is if not JSON
          return item.text;
        }
      } else if (item.type === 'image') {
        return {
          type: 'image',
          data: item.data,
          mimeType: item.mimeType
        };
      } else if (item.type === 'resource') {
        return {
          type: 'resource',
          uri: item.uri,
          mimeType: item.mimeType
        };
      }
      return item;
    });

    // Return single result if only one, otherwise return array
    return results.length === 1 ? results[0] : results;
  }

  /**
   * List available resources
   */
  async listResources() {
    await this.ensureConnected();

    try {
      logger.debug('Listing resources from MCP server');
      
      const response = await this.client.listResources();
      
      logger.info('Resources listed successfully', {
        count: response.resources?.length || 0
      });

      return response.resources || [];
    } catch (error) {
      logger.error('Failed to list resources', {
        error: error.message
      });
      throw new Error(`Failed to list MCP resources: ${error.message}`);
    }
  }

  /**
   * Read a resource
   */
  async readResource({ uri }) {
    await this.ensureConnected();

    try {
      logger.info('Reading resource from MCP server', { uri });
      
      const response = await this.client.readResource({ uri });
      
      logger.info('Resource read successfully', { uri });

      return response.contents || [];
    } catch (error) {
      logger.error('Failed to read resource', {
        uri,
        error: error.message
      });
      throw new Error(`Failed to read MCP resource: ${error.message}`);
    }
  }

  /**
   * List available prompts
   */
  async listPrompts() {
    await this.ensureConnected();

    try {
      logger.debug('Listing prompts from MCP server');
      
      const response = await this.client.listPrompts();
      
      logger.info('Prompts listed successfully', {
        count: response.prompts?.length || 0
      });

      return response.prompts || [];
    } catch (error) {
      logger.error('Failed to list prompts', {
        error: error.message
      });
      throw new Error(`Failed to list MCP prompts: ${error.message}`);
    }
  }

  /**
   * Get a prompt
   */
  async getPrompt({ name, arguments: args }) {
    await this.ensureConnected();

    try {
      logger.info('Getting prompt from MCP server', { name, arguments: args });
      
      const response = await this.client.getPrompt({ name, arguments: args });
      
      logger.info('Prompt retrieved successfully', { name });

      return response;
    } catch (error) {
      logger.error('Failed to get prompt', {
        name,
        error: error.message
      });
      throw new Error(`Failed to get MCP prompt: ${error.message}`);
    }
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect() {
    if (!this.connected) {
      return;
    }

    try {
      logger.info('Disconnecting from MCP server');
      
      if (this.client) {
        await this.client.close();
      }
      
      this.connected = false;
      this.client = null;
      this.transport = null;
      
      logger.info('Disconnected from MCP server');
    } catch (error) {
      logger.error('Error disconnecting from MCP server', {
        error: error.message
      });
    }
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Get server capabilities
   */
  async getServerCapabilities() {
    await this.ensureConnected();
    
    try {
      // Server capabilities are available after connection
      const capabilities = this.client.getServerCapabilities?.() || {};
      
      return {
        tools: !!capabilities.tools,
        resources: !!capabilities.resources,
        prompts: !!capabilities.prompts,
        sampling: !!capabilities.sampling
      };
    } catch (error) {
      logger.error('Failed to get server capabilities', {
        error: error.message
      });
      return {
        tools: false,
        resources: false,
        prompts: false,
        sampling: false
      };
    }
  }
}

module.exports = TrueMCPClient;
