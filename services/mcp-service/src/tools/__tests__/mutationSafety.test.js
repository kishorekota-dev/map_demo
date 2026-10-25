jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() }));
jest.mock('../../utils/logger', () => ({ info() {}, warn() {}, error() {}, debug() {} }));
const axios = require('axios');
const { randomBytes } = require('crypto');
const CompleteBankingTools = require('../completeBankingTools');
const { issueProof, verifyProof, toolArguments } = require('../mutationProof');
describe('legacy banking tools mutation safety', () => {
  const previous = process.env.SERVICING_SERVICE_TOKEN;
  let tools;
  beforeEach(() => { process.env.SERVICING_SERVICE_TOKEN = randomBytes(32).toString('hex'); jest.clearAllMocks(); tools = new CompleteBankingTools('http://banking.local'); });
  afterAll(() => { if (previous === undefined) delete process.env.SERVICING_SERVICE_TOKEN; else process.env.SERVICING_SERVICE_TOKEN = previous; });
  const signed = (overrides = {}) => {
    const params = { userId: 'customer', tenantId: 'enterprise', idempotencyKey: 'original-operation', authToken: randomBytes(24).toString('hex'), fromAccountId: 'account-a', toAccountId: 'account-b', amount: 7, ...overrides };
    return { ...params, confirmationProof: issueProof({ scope: 'banking_tool', principalId: params.userId, tenantId: params.tenantId, key: params.idempotencyKey, method: 'CALL', path: 'banking_create_transfer', body: toolArguments(params) }) };
  };
  test('missing confirmation or caller key cannot dispatch', async () => {
    const params = signed(); delete params.confirmationProof;
    await expect(tools.executeTool('banking_create_transfer', params)).rejects.toMatchObject({ status: 400, dispatched: false });
    delete params.idempotencyKey;
    await expect(tools.executeTool('banking_create_transfer', params)).rejects.toMatchObject({ status: 400, dispatched: false });
    expect(axios.post).not.toHaveBeenCalled();
  });
  test('changed business arguments or principal cannot reuse a confirmation proof', async () => {
    const params = signed();
    await expect(tools.executeTool('banking_create_transfer', { ...params, amount: 8 })).rejects.toMatchObject({ status: 403 });
    await expect(tools.executeTool('banking_create_transfer', { ...params, userId: 'other' })).rejects.toMatchObject({ status: 403 });
    expect(axios.post).not.toHaveBeenCalled();
  });
  test('forwards the caller key, verified customer token and proof bound to the exact backend body', async () => {
    const params = signed(); axios.post.mockResolvedValue({ data: { success: true, reference: 'fixture' } });
    expect(await tools.executeTool('banking_create_transfer', params)).toMatchObject({ success: true, data: { reference: 'fixture' } });
    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body, options] = axios.post.mock.calls[0];
    expect(url).toBe('http://banking.local/api/v1/transfers');
    expect(options).toMatchObject({ maxRedirects: 0, proxy: false, headers: { 'Idempotency-Key': params.idempotencyKey, Authorization: `Bearer ${params.authToken}` } });
    expect(verifyProof(options.headers['X-Servicing-Confirmation'], { scope: 'banking_http', principalId: params.userId, tenantId: params.tenantId, key: params.idempotencyKey, method: 'POST', path: '/api/v1/transfers', body })).toBe(true);
    expect(verifyProof(options.headers['X-Servicing-Confirmation'], { scope: 'banking_http', principalId: params.userId, tenantId: params.tenantId, key: params.idempotencyKey, method: 'POST', path: '/api/v1/transfers', body: { ...body, amount: 8 } })).toBe(false);
  });
  test.each([400,503])('definitive HTTP %s remains failed with no automatic retry', async status => {
    axios.post.mockRejectedValue({ response: { status, data: { private: 'suppressed' } } });
    await expect(tools.executeTool('banking_create_transfer', signed())).rejects.toMatchObject({ status, outcome: 'failed', message: 'Banking tool did not complete' }); expect(axios.post).toHaveBeenCalledTimes(1);
  });
  test('timeout after send remains uncertain and never retries or reports success', async () => {
    axios.post.mockRejectedValue(Object.assign(new Error('Fixture timeout'), { code: 'ECONNABORTED' }));
    await expect(tools.executeTool('banking_create_transfer', signed())).rejects.toMatchObject({ outcome: 'uncertain' }); expect(axios.post).toHaveBeenCalledTimes(1);
    axios.post.mockResolvedValue({ data: { success: false, outcome: 'uncertain', reconcilePath: '/api/v1/mutation-status/original-operation' } });
    expect(await tools.executeTool('banking_create_transfer', signed())).toMatchObject({ success: false, outcome: 'uncertain', status: 202, reconciliationReference: 'original-operation' });
  });
});
