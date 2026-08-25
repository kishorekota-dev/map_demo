jest.mock('../../models', () => ({
  sequelize: {
    authenticate: jest.fn()
  }
}));

const express = require('express');
const request = require('supertest');
const { sequelize } = require('../../models');
const healthRouter = require('../health');

function createApp(mcpClient) {
  const app = express();
  app.locals.mcpClient = mcpClient;
  app.use('/health', healthRouter);
  return app;
}

describe('AI orchestrator health route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sequelize.authenticate.mockResolvedValue(undefined);
  });

  test('recognizes the EnhancedMCPClient health shape and reports its URL', async () => {
    const mcpClient = {
      baseUrl: 'http://mcp-service:3004',
      healthCheck: jest.fn().mockResolvedValue({
        overall: 'healthy',
        httpMcp: { enabled: true, healthy: true }
      })
    };

    const response = await request(createApp(mcpClient)).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'healthy',
      checks: {
        database: { status: 'up' },
        mcpService: {
          status: 'up',
          url: 'http://mcp-service:3004'
        }
      }
    });
  });

  test('returns 503 when the enhanced MCP health is unhealthy', async () => {
    const mcpClient = {
      baseUrl: 'http://mcp-service:3004',
      healthCheck: jest.fn().mockResolvedValue({
        overall: 'unhealthy',
        httpMcp: { enabled: true, healthy: false }
      })
    };

    const response = await request(createApp(mcpClient)).get('/health');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: 'unhealthy',
      checks: {
        mcpService: {
          status: 'down',
          url: 'http://mcp-service:3004'
        }
      }
    });
  });

  test('continues to accept the legacy MCP health shape', async () => {
    const mcpClient = {
      baseUrl: 'http://legacy-mcp:3004',
      healthCheck: jest.fn().mockResolvedValue({ healthy: true })
    };

    const response = await request(createApp(mcpClient)).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.checks.mcpService.status).toBe('up');
  });
});
