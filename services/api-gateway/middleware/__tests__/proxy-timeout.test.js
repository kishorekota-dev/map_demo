jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: jest.fn(() => () => {}),
  fixRequestBody: jest.fn()
}));
jest.mock('../../services/serviceRegistry', () => ({ getInstance: () => ({}) }));
jest.mock('../../services/loadBalancer', () => ({ getInstance: () => ({}) }));
jest.mock('../../services/circuitBreaker', () => ({ getInstance: () => ({}) }));
jest.mock('../../utils/logger', () => ({}));
jest.mock('../../routes/metrics', () => ({ recordProxyMetrics: jest.fn() }));

const { createProxyMiddleware } = require('http-proxy-middleware');
const { createServiceProxy, getServicingRequestTimeoutMs } = require('../proxy');

describe('proxy request budgets', () => {
  const originalServicingTimeout = process.env.SERVICING_REQUEST_TIMEOUT_MS;
  const originalProxyTimeout = process.env.PROXY_TIMEOUT;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SERVICING_REQUEST_TIMEOUT_MS;
    delete process.env.PROXY_TIMEOUT;
  });
  afterAll(() => {
    if (originalServicingTimeout === undefined) delete process.env.SERVICING_REQUEST_TIMEOUT_MS;
    else process.env.SERVICING_REQUEST_TIMEOUT_MS = originalServicingTimeout;
    if (originalProxyTimeout === undefined) delete process.env.PROXY_TIMEOUT;
    else process.env.PROXY_TIMEOUT = originalProxyTimeout;
  });

  test.each([
    [undefined, 410000], ['', 410000], ['  ', 410000], ['invalid', 410000],
    ['12000ms', 410000], ['Infinity', 410000], ['123.5', 410000],
    ['-10', 1000], ['0', 1000], ['900000', 600000], ['480000', 480000]
  ])('normalizes servicing budget %p to %i milliseconds', (value, expected) => {
    expect(getServicingRequestTimeoutMs(value)).toBe(expected);
  });

  test('applies the servicing budget to both HTTP proxy timeout settings', () => {
    process.env.SERVICING_REQUEST_TIMEOUT_MS = '480000';
    createServiceProxy({ serviceName: 'ai-orchestrator', timeout: getServicingRequestTimeoutMs() });
    expect(createProxyMiddleware).toHaveBeenCalledWith(expect.objectContaining({ timeout: 480000, proxyTimeout: 480000 }));
  });

  test('ordinary proxies retain the short default or PROXY_TIMEOUT override', () => {
    process.env.SERVICING_REQUEST_TIMEOUT_MS = '480000';
    createServiceProxy({ serviceName: 'banking' });
    expect(createProxyMiddleware).toHaveBeenLastCalledWith(expect.objectContaining({ timeout: 30000, proxyTimeout: 30000 }));
    process.env.PROXY_TIMEOUT = '45000';
    createServiceProxy({ serviceName: 'nlu' });
    expect(createProxyMiddleware).toHaveBeenLastCalledWith(expect.objectContaining({ timeout: 45000, proxyTimeout: 45000 }));
  });

  test('timeouts and aborted requests are never eligible for a retry', () => {
    createServiceProxy({ serviceName: 'chat-backend', timeout: getServicingRequestTimeoutMs() });
    const { retry } = createProxyMiddleware.mock.calls[0][0];
    for (const code of ['ETIMEDOUT', 'ECONNABORTED', 'ERR_CANCELED', 'ECONNRESET']) {
      expect(retry.retryCondition({ code })).toBe(false);
    }
    expect(retry.retries).toBe(0);
    expect(retry.retryCondition({ code: 'ECONNREFUSED' })).toBe(false);
  });
});
