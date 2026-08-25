jest.mock('../../../config', () => ({
  mcp: {
    transport: 'http',
    preferProtocol: false,
    enableFallback: false
  }
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../trueMCPClient');
jest.mock('../mcpClient');

const TrueMCPClient = require('../trueMCPClient');
const MCPClient = require('../mcpClient');
const EnhancedMCPClient = require('../enhancedMCPClient');

describe('EnhancedMCPClient health contract', () => {
  let httpHealthCheck;

  beforeEach(() => {
    jest.clearAllMocks();
    httpHealthCheck = jest.fn();

    TrueMCPClient.mockImplementation(() => ({
      isConnected: jest.fn().mockReturnValue(false)
    }));
    MCPClient.mockImplementation(() => ({
      baseUrl: 'http://mcp-service:3004',
      healthCheck: httpHealthCheck
    }));
  });

  test('exposes the wrapped HTTP MCP base URL', () => {
    const client = new EnhancedMCPClient();

    expect(client.baseUrl).toBe('http://mcp-service:3004');
  });

  test('normalizes the MCP service status response into the enhanced shape', async () => {
    httpHealthCheck.mockResolvedValue({ status: 'healthy' });
    const client = new EnhancedMCPClient();

    await expect(client.healthCheck()).resolves.toMatchObject({
      overall: 'healthy',
      httpMcp: { enabled: true, healthy: true }
    });
  });

  test('does not report HTTP MCP healthy when the wrapped client reports failure', async () => {
    httpHealthCheck.mockResolvedValue({ healthy: false, error: 'connection refused' });
    const client = new EnhancedMCPClient();

    await expect(client.healthCheck()).resolves.toMatchObject({
      overall: 'unhealthy',
      httpMcp: { enabled: true, healthy: false }
    });
  });
});
