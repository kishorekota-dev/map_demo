const { formatDeterministicResponse, unwrapData } = require('../deterministicResponseFormatter');

describe('deterministic response formatter', () => {
  test.each([
    [{ data: { success: true, data: [{ id: 1 }] } }],
    [{ data: { success: true, data: { success: true, data: [{ id: 1 }] } } }]
  ])('unwraps HTTP and protocol MCP banking response envelopes', (envelope) => {
    expect(unwrapData(envelope)).toEqual([{ id: 1 }]);
  });

  test('formats authenticated account balances without an LLM', () => {
    const response = formatDeterministicResponse({
      intent: 'balance_inquiry',
      toolResults: {
        banking_get_accounts: {
          success: true,
          data: {
            success: true,
            data: [{
              account_name: 'Primary Checking',
              account_number: '1234567890',
              balance: '1250.50',
              available_balance: '1200.25',
              currency: 'USD'
            }]
          }
        }
      }
    });

    expect(response).toContain('Primary Checking ending in 7890');
    expect(response).toContain('USD 1250.50');
    expect(response).toContain('available USD 1200.25');
  });

  test('formats the banking balance response envelope', () => {
    const response = formatDeterministicResponse({
      intent: 'balance_inquiry',
      toolResults: {
        banking_get_balance: {
          success: true,
          data: {
            success: true,
            data: {
              balance: '725.00',
              available_balance: '700.00',
              currency: 'USD'
            }
          }
        }
      }
    });

    expect(response).toBe('Your current balance is USD 725.00, with USD 700.00 available.');
  });

  test('returns a truthful empty-account message', () => {
    const response = formatDeterministicResponse({
      intent: 'balance_inquiry',
      toolResults: { banking_get_accounts: { data: [] } }
    });
    expect(response).toMatch(/could not find any banking accounts/i);
  });
});
