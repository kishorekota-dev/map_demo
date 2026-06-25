/**
 * MCP banking-tool contract + argument-validation tests.
 * Would have caught the 8 missing tool handlers and the banking_transfer rename.
 */
const path = require('path');

// Stub axios + logger so the tool module loads without network/winston.
jest.mock('axios', () => jest.fn(() => Promise.resolve({ data: {} })), { virtual: true });
jest.mock('../../utils/logger', () => ({ info() {}, warn() {}, error() {}, debug() {} }), { virtual: true });

const CompleteBankingTools = require('../completeBankingTools');

describe('MCP banking tool contract', () => {
  const tools = new CompleteBankingTools('http://banking.local/api/v1');

  test('every tool definition has a matching _execute handler', () => {
    const result = tools.assertToolContract();
    expect(result.problems).toEqual([]);
    expect(result.valid).toBe(true);
  });

  test('every orchestrator canonical tool is implemented here', () => {
    const orchestrator = require(path.join(
      __dirname, '..', '..', '..', '..', 'ai-orchestrator', 'config', 'intentConfig'
    ));
    const defined = new Set(tools.getToolDefinitions().map(t => t.name));
    const missing = orchestrator.CANONICAL_BANKING_TOOLS.filter(n => !defined.has(n));
    expect(missing).toEqual([]);
  });
});

describe('MCP argument validation', () => {
  const tools = new CompleteBankingTools('http://banking.local/api/v1');
  const tool = tools.getToolDefinitions().find(t => t.name === 'banking_create_transfer');

  test('rejects missing required fields', () => {
    const r = tools.validateParameters(tool, { authToken: 't' });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/fromAccountId/);
  });

  test('rejects amount below minimum', () => {
    const r = tools.validateParameters(tool, {
      authToken: 't', fromAccountId: 'a', toAccountId: 'b', amount: 0
    });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/amount/);
  });

  test('accepts a valid payload', () => {
    const r = tools.validateParameters(tool, {
      authToken: 't', fromAccountId: 'a', toAccountId: 'b', amount: 100
    });
    expect(r).toEqual({ valid: true, errors: [] });
  });

  test('executeTool throws on invalid arguments before dispatch', async () => {
    await expect(tools.executeTool('banking_create_transfer', { authToken: 't' }))
      .rejects.toThrow(/Invalid arguments/);
  });
});
