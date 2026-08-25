jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const MCPClient = require('../mcpClient');

describe('MCPClient endpoint and retry safety', () => {
  test.each([
    ['http://mcp:3004', 'http://mcp:3004'],
    ['http://mcp:3004/', 'http://mcp:3004'],
    ['http://mcp:3004/api/tools', 'http://mcp:3004'],
    ['http://mcp:3004/api/mcp', 'http://mcp:3004'],
    ['http://mcp:3004/api/mcp/execute', 'http://mcp:3004']
  ])('normalizes MCP base URL %s', (input, expected) => {
    expect(MCPClient.normalizeServiceUrl(input)).toBe(expected);
  });

  test('does not retry state-changing tools after an ambiguous failure', async () => {
    const client = new MCPClient();
    client.retryAttempts = 3;
    client.retryDelay = 0;
    client.executeTool = jest.fn().mockRejectedValue(new Error('timeout'));

    await expect(client.executeToolWithRetry('banking_create_transfer', {}, 'session-1'))
      .rejects.toThrow('timeout');
    expect(client.executeTool).toHaveBeenCalledTimes(1);
  });

  test('still retries read-only tools', async () => {
    const client = new MCPClient();
    client.retryAttempts = 3;
    client.retryDelay = 0;
    client.executeTool = jest.fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ success: true });

    await expect(client.executeToolWithRetry('banking_get_accounts', {}, 'session-1'))
      .resolves.toEqual({ success: true });
    expect(client.executeTool).toHaveBeenCalledTimes(2);
  });
});
