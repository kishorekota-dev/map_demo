/**
 * MCP HTTP API Routes
 * Provides REST API for MCP tool execution
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const CompleteBankingTools = require('../tools/completeBankingTools');

// Initialize banking tools
const bankingTools = new CompleteBankingTools();

/**
 * @route GET /api/mcp/health
 * @desc Health check
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'MCP Service',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

/**
 * @route GET /api/mcp/tools
 * @desc Get list of available tools
 */
router.get('/tools', (req, res) => {
  try {
    const tools = bankingTools.getToolDefinitions();
    
    res.json({
      success: true,
      count: tools.length,
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }))
    });
  } catch (error) {
    logger.error('Error getting tools list', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get tools list',
      message: error.message
    });
  }
});

/**
 * @route GET /api/mcp/tools/:toolName
 * @desc Get specific tool definition
 */
router.get('/tools/:toolName', (req, res) => {
  try {
    const { toolName } = req.params;
    const tools = bankingTools.getToolDefinitions();
    const tool = tools.find(t => t.name === toolName);

    if (!tool) {
      return res.status(404).json({
        success: false,
        error: 'Tool not found',
        toolName
      });
    }

    res.json({
      success: true,
      tool: {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }
    });
  } catch (error) {
    logger.error('Error getting tool definition', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get tool definition',
      message: error.message
    });
  }
});

/**
 * @route POST /api/mcp/execute
 * @desc Execute a tool
 * @body { tool: string, parameters: object, sessionId?: string }
 */
router.post('/execute', async (req, res) => {
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}`;
  
  try {
    const { tool, parameters, sessionId, requestId: clientRequestId } = req.body;

    if (!tool) {
      return res.status(400).json({
        success: false,
        error: 'Tool name is required',
        requestId
      });
    }

    if (!parameters || typeof parameters !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Parameters must be an object',
        requestId
      });
    }

    logger.info('Executing MCP tool via HTTP', {
      requestId,
      clientRequestId,
      tool,
      sessionId,
      parameters: Object.keys(parameters)
    });

    const result = await bankingTools.executeTool(tool, parameters);

    logger.info('Tool executed successfully', {
      requestId,
      tool,
      sessionId
    });

    res.json({
      success: true,
      requestId,
      sessionId,
      tool,
      data: result.data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Tool execution failed', {
      requestId,
      error: error.message,
      stack: error.stack,
      response: error.response?.data
    });

    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.message || error.message;

    res.status(statusCode).json({
      success: false,
      requestId,
      error: 'Tool execution failed',
      message: errorMessage,
      details: error.response?.data || {},
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route POST /api/mcp/execute-batch
 * @desc Execute multiple tools in sequence
 * @body { tools: Array<{tool: string, parameters: object}>, sessionId?: string }
 */
router.post('/execute-batch', async (req, res) => {
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}`;
  
  try {
    const { tools, sessionId } = req.body;

    if (!Array.isArray(tools) || tools.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Tools must be a non-empty array',
        requestId
      });
    }

    logger.info('Executing batch MCP tools', {
      requestId,
      sessionId,
      toolCount: tools.length
    });

    const results = [];
    const errors = [];

    for (let i = 0; i < tools.length; i++) {
      const { tool, parameters } = tools[i];

      try {
        const result = await bankingTools.executeTool(tool, parameters);
        results.push({
          index: i,
          tool,
          success: true,
          data: result.data
        });
      } catch (error) {
        errors.push({
          index: i,
          tool,
          success: false,
          error: error.message
        });
      }
    }

    logger.info('Batch execution completed', {
      requestId,
      totalTools: tools.length,
      successful: results.length,
      failed: errors.length
    });

    res.json({
      success: errors.length === 0,
      requestId,
      sessionId,
      results,
      errors,
      summary: {
        total: tools.length,
        successful: results.length,
        failed: errors.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Batch execution failed', {
      requestId,
      error: error.message
    });

    res.status(500).json({
      success: false,
      requestId,
      error: 'Batch execution failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route GET /api/mcp/categories
 * @desc Get tools grouped by category
 */
router.get('/categories', (req, res) => {
  try {
    const tools = bankingTools.getToolDefinitions();
    
    const categories = {
      authentication: [],
      accounts: [],
      transactions: [],
      transfers: [],
      cards: [],
      fraud: [],
      disputes: []
    };

    tools.forEach(tool => {
      if (tool.name.includes('authenticate') || tool.name.includes('refresh')) {
        categories.authentication.push(tool.name);
      } else if (tool.name.includes('account')) {
        categories.accounts.push(tool.name);
      } else if (tool.name.includes('transaction')) {
        categories.transactions.push(tool.name);
      } else if (tool.name.includes('transfer')) {
        categories.transfers.push(tool.name);
      } else if (tool.name.includes('card')) {
        categories.cards.push(tool.name);
      } else if (tool.name.includes('fraud')) {
        categories.fraud.push(tool.name);
      } else if (tool.name.includes('dispute')) {
        categories.disputes.push(tool.name);
      }
    });

    res.json({
      success: true,
      categories,
      totalTools: tools.length
    });
  } catch (error) {
    logger.error('Error getting categories', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get categories',
      message: error.message
    });
  }
});

/**
 * @route POST /api/mcp/validate
 * @desc Validate tool parameters without executing
 */
router.post('/validate', (req, res) => {
  try {
    const { tool, parameters } = req.body;

    if (!tool) {
      return res.status(400).json({
        success: false,
        error: 'Tool name is required'
      });
    }

    const tools = bankingTools.getToolDefinitions();
    const toolDef = tools.find(t => t.name === tool);

    if (!toolDef) {
      return res.status(404).json({
        success: false,
        error: 'Tool not found',
        tool
      });
    }

    // Simple validation - check required fields
    const required = toolDef.inputSchema.required || [];
    const missing = required.filter(field => !(field in parameters));

    if (missing.length > 0) {
      return res.json({
        success: false,
        valid: false,
        error: 'Missing required parameters',
        missing
      });
    }

    res.json({
      success: true,
      valid: true,
      tool,
      message: 'Parameters are valid'
    });

  } catch (error) {
    logger.error('Error validating parameters', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Validation failed',
      message: error.message
    });
  }
});

module.exports = router;
