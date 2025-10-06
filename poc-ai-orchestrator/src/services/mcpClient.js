const axios = require('axios');
const config = require('../../config');
const logger = require('../utils/logger');

/**
 * MCP Client Service
 * Communicates with MCP Service for tool execution
 */
class MCPClient {
  constructor() {
    this.baseUrl = config.mcp.serviceUrl;
    this.timeout = config.mcp.timeout;
    this.retryAttempts = config.mcp.retryAttempts;
    this.retryDelay = config.mcp.retryDelay;
    
    // Initialize axios instance
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    logger.info('MCP Client initialized', { baseUrl: this.baseUrl });
  }

  /**
   * Execute a tool via MCP service
   */
  async executeTool(toolName, parameters, sessionId) {
    const requestId = `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('Executing MCP tool', {
      requestId,
      toolName,
      sessionId,
      parameters: Object.keys(parameters)
    });

    try {
      const response = await this.client.post('/api/mcp/execute', {
        tool: toolName,
        parameters,
        sessionId,
        requestId
      });

      logger.info('MCP tool executed successfully', {
        requestId,
        toolName,
        success: response.data.success
      });

      return response.data;
    } catch (error) {
      logger.error('MCP tool execution failed', {
        requestId,
        toolName,
        error: error.message,
        response: error.response?.data
      });
      throw new Error(`MCP tool execution failed: ${error.message}`);
    }
  }

  /**
   * Execute a tool with retry logic
   */
  async executeToolWithRetry(toolName, parameters, sessionId, attempt = 1) {
    try {
      return await this.executeTool(toolName, parameters, sessionId);
    } catch (error) {
      if (attempt < this.retryAttempts) {
        logger.warn(`Retrying MCP tool execution (attempt ${attempt + 1})`, {
          toolName,
          sessionId
        });
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        
        return this.executeToolWithRetry(toolName, parameters, sessionId, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Get list of available tools
   */
  async getAvailableTools() {
    try {
      const response = await this.client.get('/api/mcp/tools');
      return response.data.tools || [];
    } catch (error) {
      logger.error('Failed to get available tools', { error: error.message });
      throw new Error(`Failed to get MCP tools: ${error.message}`);
    }
  }

  /**
   * Execute multiple tools in batch
   */
  async executeBatch(toolExecutions, sessionId) {
    logger.info('Executing batch MCP tools', {
      sessionId,
      count: toolExecutions.length
    });

    try {
      const response = await this.client.post('/api/mcp/batch', {
        executions: toolExecutions,
        sessionId
      });

      return response.data;
    } catch (error) {
      logger.error('Batch MCP execution failed', {
        sessionId,
        error: error.message
      });
      throw new Error(`Batch MCP execution failed: ${error.message}`);
    }
  }

  /**
   * Check MCP service health
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      logger.error('MCP health check failed', { error: error.message });
      return { healthy: false, error: error.message };
    }
  }

  /**
   * Execute banking-specific operations
   */
  async executeBankingOperation(operation, parameters, sessionId) {
    const toolMap = {
      'get_balance': 'banking_get_balance',
      'get_transactions': 'banking_get_transactions',
      'transfer_funds': 'banking_transfer',
      'get_account_info': 'banking_account_info',
      'block_card': 'banking_block_card',
      'dispute_transaction': 'banking_dispute'
    };

    const toolName = toolMap[operation];
    if (!toolName) {
      throw new Error(`Unknown banking operation: ${operation}`);
    }

    return this.executeToolWithRetry(toolName, parameters, sessionId);
  }
}

module.exports = MCPClient;
