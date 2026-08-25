const intentMapper = require('../intentMapper');

describe('intentMapper banking contract validation', () => {
  test('accepts false for the required verification decision', () => {
    expect(intentMapper.validateData('verify_transaction', {
      alertId: 'alert-1',
      isLegitimate: false
    })).toEqual(expect.objectContaining({
      valid: true,
      missing: [],
      invalid: []
    }));
  });

  test('rejects fraud values that the MCP alert schema does not accept', () => {
    const result = intentMapper.validateData('report_fraud', {
      fraudType: 'phishing',
      description: 'A detailed report of suspicious account activity'
    });

    expect(result.valid).toBe(false);
    expect(result.invalid).toEqual([
      expect.objectContaining({ field: 'fraudType' })
    ]);
  });

  test('uses the MCP alert id in transaction verification confirmations', () => {
    expect(intentMapper.getConfirmationMessage('verify_transaction', {
      alertId: 'alert-123',
      isLegitimate: false
    })).toContain('alert-123');
  });
});
