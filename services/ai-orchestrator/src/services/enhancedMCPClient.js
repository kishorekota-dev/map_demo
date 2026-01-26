const TrueMCPClient = require('./trueMCPClient');
const MCPClient = require('./mcpClient');
const logger = require('../utils/logger');
const config = require('../../config');

/**
 * Enhanced MCP Client with Hybrid Approach
 * - Tries True MCP Protocol (SDK) first for new features
 * - Falls back to HTTP-based MCP for backward compatibility
 * - Provides best of both worlds
 */
class EnhancedMCPClient {
  constructor() {
    // Initialize both clients
    this.trueMCPClient = new TrueMCPClient();
    this.httpMCPClient = new MCPClient();
    
    // Configuration
    this.preferMCPProtocol = config.mcp.preferProtocol !== false; // Default true
    this.enableFallback = config.mcp.enableFallback !== false;   // Default true
    
    // Stats
    this.stats = {
      mcpSuccess: 0,
      mcpFailure: 0,
      httpSuccess: 0,
      httpFailure: 0,
      fallbackUsed: 0
    };

    logger.info('Enhanced MCP Client initialized', {
      preferProtocol: this.preferMCPProtocol,
      fallbackEnabled: this.enableFallback
    });
  }

  /**
   * Initialize connections
   */
  async initialize() {
    try {
      if (this.preferMCPProtocol) {
        // Try to connect to MCP server
        await this.trueMCPClient.connect();
        logger.info('True MCP Protocol enabled and connected');
      }
    } catch (error) {
      logger.warn('True MCP Protocol connection failed, will use HTTP fallback', {
        error: error.message
      });
    }
  }

  /**
   * Execute tool with intelligent routing
   * Tries MCP protocol first, falls back to HTTP if needed
   */
  async executeTool(toolName, parameters, sessionId) {
    const startTime = Date.now();
    
    logger.debug('Executing tool with enhanced client', {
      toolName,
      sessionId,
      preferProtocol: this.preferMCPProtocol
    });

    // Try MCP Protocol first (if enabled and connected)
    if (this.preferMCPProtocol && this.trueMCPClient.isConnected()) {
      try {
        logger.debug('Attempting tool execution via MCP Protocol', { toolName });
        
        const result = await this.trueMCPClient.callTool({
          name: toolName,
          arguments: { ...parameters, sessionId }
        });
        
        this.stats.mcpSuccess++;
        
        logger.info('Tool executed successfully via MCP Protocol', {
          toolName,
          duration: Date.now() - startTime,
          protocol: 'mcp'
        });
        
        return result;
      } catch (error) {
        this.stats.mcpFailure++;
        
        logger.warn('MCP Protocol execution failed, attempting HTTP fallback', {
          toolName,
          error: error.message
        });
        
        // Fall through to HTTP fallback if enabled
        if (!this.enableFallback) {
          throw error;
        }
      }
    }

    // Use HTTP-based MCP (fallback or default)
    try {
      logger.debug('Executing tool via HTTP MCP', { toolName });
      
      const result = await this.httpMCPClient.executeToolWithRetry(
        toolName,
        parameters,
        sessionId
      );
      
      this.stats.httpSuccess++;
      if (this.preferMCPProtocol) {
        this.stats.fallbackUsed++;
      }
      
      logger.info('Tool executed successfully via HTTP MCP', {
        toolName,
        duration: Date.now() - startTime,
        protocol: 'http',
        wasFallback: this.preferMCPProtocol
      });
      
      return result;
    } catch (error) {
      this.stats.httpFailure++;
      
      logger.error('Both MCP Protocol and HTTP MCP failed', {
        toolName,
        error: error.message,
        duration: Date.now() - startTime
      });
      
      throw new Error(`Tool execution failed on all transports: ${error.message}`);
    }
  }

  /**
   * Execute tool with retry logic
   * Wrapper for backward compatibility
   */
  async executeToolWithRetry(toolName, parameters, sessionId) {
    return this.executeTool(toolName, parameters, sessionId);
  }

  /**
   * List available tools (MCP Protocol feature)
   * Automatically discovers tools from server
   */
  async listTools() {
    // Try MCP Protocol first
    if (this.trueMCPClient.isConnected()) {
      try {
        logger.debug('Listing tools via MCP Protocol');
        const tools = await this.trueMCPClient.listTools();
        
        logger.info('Tools discovered via MCP Protocol', {
          count: tools.length,
          tools: tools.map(t => t.name)
        });
        
        return tools;
      } catch (error) {
        logger.warn('Failed to list tools via MCP Protocol', {
          error: error.message
        });
      }
    }

    // Fallback: Return statically configured tools for HTTP MCP
    logger.debug('Using static tool list (HTTP MCP fallback)');
    
    try {
      const httpTools = await this.httpMCPClient.getAvailableTools();
      return httpTools.map(tool => ({
        name: tool,
        description: `Banking tool: ${tool}`,
        inputSchema: { type: 'object' } // Minimal schema
      }));
    } catch (error) {
      logger.warn('Failed to get tools from HTTP MCP', {
        error: error.message
      });
      
      // Return hardcoded list as last resort
      return this.getDefaultTools();
    }
  }

  /**
   * Get default tool list (fallback)
   */
  getDefaultTools() {
    return [
      {
        name: 'get_account_balance',
        description: 'Get account balance',
        inputSchema: {
          type: 'object',
          properties: {
            accountId: { type: 'string' }
          },
          required: ['accountId']
        }
      },
      {
        name: 'get_transactions',
        description: 'Get transaction history',
        inputSchema: {
          type: 'object',
          properties: {
            accountId: { type: 'string' },
            startDate: { type: 'string' },
            endDate: { type: 'string' }
          },
          required: ['accountId']
        }
      },
      {
        name: 'transfer_funds',
        description: 'Transfer funds between accounts',
        inputSchema: {
          type: 'object',
          properties: {
            fromAccount: { type: 'string' },
            toAccount: { type: 'string' },
            amount: { type: 'number' }
          },
          required: ['fromAccount', 'toAccount', 'amount']
        }
      },
      {
        name: 'manage_card',
        description: 'Manage card services',
        inputSchema: {
          type: 'object',
          properties: {
            cardId: { type: 'string' },
            action: { type: 'string' }
          },
          required: ['cardId', 'action']
        }
      },
      {
        name: 'dispute_transaction',
        description: 'Dispute a transaction',
        inputSchema: {
          type: 'object',
          properties: {
            transactionId: { type: 'string' },
            reason: { type: 'string' }
          },
          required: ['transactionId', 'reason']
        }
      },
      {
        name: 'get_account_info',
        description: 'Get account information',
        inputSchema: {
          type: 'object',
          properties: {
            accountId: { type: 'string' }
          },
          required: ['accountId']
        }
      }
    ];
  }

  /**
   * List available resources (MCP Protocol feature)
   */
  async listResources() {
    if (this.trueMCPClient.isConnected()) {
      try {
        return await this.trueMCPClient.listResources();
      } catch (error) {
        logger.warn('Failed to list resources', { error: error.message });
      }
    }
    return [];
  }

  /**
   * Read a resource (MCP Protocol feature)
   */
  async readResource(uri) {
    if (this.trueMCPClient.isConnected()) {
      try {
        return await this.trueMCPClient.readResource({ uri });
      } catch (error) {
        logger.warn('Failed to read resource', { uri, error: error.message });
        throw error;
      }
    }
    throw new Error('Resource access not available in HTTP mode');
  }

  /**
   * List available prompts (MCP Protocol feature)
   */
  async listPrompts() {
    if (this.trueMCPClient.isConnected()) {
      try {
        return await this.trueMCPClient.listPrompts();
      } catch (error) {
        logger.warn('Failed to list prompts', { error: error.message });
      }
    }
    return [];
  }

  /**
   * Get a prompt (MCP Protocol feature)
   */
  async getPrompt(name, args) {
    if (this.trueMCPClient.isConnected()) {
      try {
        return await this.trueMCPClient.getPrompt({ name, arguments: args });
      } catch (error) {
        logger.warn('Failed to get prompt', { name, error: error.message });
        throw error;
      }
    }
    throw new Error('Prompt access not available in HTTP mode');
  }

  /**
   * Execute batch of tools
   */
  async executeBatch(toolExecutions) {
    // For now, execute sequentially
    // Could be optimized with Promise.all for parallel execution
    const results = [];
    
    for (const execution of toolExecutions) {
      try {
        const result = await this.executeTool(
          execution.tool,
          execution.parameters,
          execution.sessionId
        );
        results.push({ ...execution, result, success: true });
      } catch (error) {
        results.push({ ...execution, error: error.message, success: false });
      }
    }
    
    return results;
  }

  /**
   * Execute banking operation (convenience method)
   */
  async executeBankingOperation(operation, params) {
    const toolMap = {
      'balance': 'get_account_balance',
      'transactions': 'get_transactions',
      'transfer': 'transfer_funds',
      'card': 'manage_card',
      'dispute': 'dispute_transaction',
      'account_info': 'get_account_info'
    };
    
    const toolName = toolMap[operation];
    if (!toolName) {
      throw new Error(`Unknown banking operation: ${operation}`);
    }
    
    return this.executeTool(toolName, params, params.sessionId);
  }

  /**
   * Health check for both transports
   */
  async healthCheck() {
    const health = {
      mcpProtocol: {
        enabled: this.preferMCPProtocol,
        connected: this.trueMCPClient.isConnected(),
        healthy: false
      },
      httpMcp: {
        enabled: true,
        healthy: false
      },
      fallbackEnabled: this.enableFallback,
      stats: { ...this.stats }
    };

    // Check MCP Protocol
    if (this.preferMCPProtocol) {
      try {
        await this.trueMCPClient.ensureConnected();
        await this.trueMCPClient.listTools();
        health.mcpProtocol.healthy = true;
      } catch (error) {
        logger.debug('MCP Protocol health check failed', { error: error.message });
      }
    }

    // Check HTTP MCP
    try {
      await this.httpMCPClient.healthCheck();
      health.httpMcp.healthy = true;
    } catch (error) {
      logger.debug('HTTP MCP health check failed', { error: error.message });
    }

    health.overall = health.mcpProtocol.healthy || health.httpMcp.healthy ? 'healthy' : 'unhealthy';

    return health;
  }

  /**
   * Get statistics
   */
  getStats() {
    const total = this.stats.mcpSuccess + this.stats.httpSuccess + 
                  this.stats.mcpFailure + this.stats.httpFailure;
    
    return {
      ...this.stats,
      total,
      mcpSuccessRate: total > 0 ? (this.stats.mcpSuccess / total * 100).toFixed(2) + '%' : '0%',
      httpSuccessRate: total > 0 ? (this.stats.httpSuccess / total * 100).toFixed(2) + '%' : '0%',
      fallbackRate: total > 0 ? (this.stats.fallbackUsed / total * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * Get server capabilities
   */
  async getServerCapabilities() {
    if (this.trueMCPClient.isConnected()) {
      try {
        return await this.trueMCPClient.getServerCapabilities();
      } catch (error) {
        logger.warn('Failed to get server capabilities', { error: error.message });
      }
    }
    
    return {
      tools: true, // HTTP MCP always supports tools
      resources: false,
      prompts: false,
      sampling: false
    };
  }

  /**
   * Close all connections
   */
  async close() {
    logger.info('Closing Enhanced MCP Client');
    
    await this.trueMCPClient.disconnect();
    
    logger.info('Enhanced MCP Client closed', {
      stats: this.getStats()
    });
  }
}

module.exports = EnhancedMCPClient;
