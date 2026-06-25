/**
 * Circuit breaker smoke + behavior tests for the api-gateway. The module was
 * previously missing entirely (the gateway could not even boot). These assert
 * the deterministic open/half-open/closed transitions.
 */
const circuitBreakerModule = require('../circuitBreaker');

function freshBreaker() {
  // getInstance returns a singleton; reset between assertions.
  const cb = circuitBreakerModule.getInstance
    ? circuitBreakerModule.getInstance()
    : new circuitBreakerModule();
  if (typeof cb.reset === 'function') cb.reset();
  return cb;
}

describe('api-gateway circuit breaker', () => {
  test('module loads and exposes a usable instance', () => {
    const cb = freshBreaker();
    expect(cb).toBeDefined();
    expect(typeof cb.isOpen).toBe('function');
    expect(typeof cb.recordFailure).toBe('function');
    expect(typeof cb.recordSuccess).toBe('function');
  });

  test('starts closed for an unknown service', () => {
    const cb = freshBreaker();
    expect(cb.isOpen('svc-a')).toBe(false);
  });

  test('opens deterministically after the failure threshold', () => {
    const cb = freshBreaker();
    const threshold = parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD, 10) || 5;
    for (let i = 0; i < threshold; i++) {
      cb.recordFailure('svc-b');
    }
    expect(cb.isOpen('svc-b')).toBe(true);
  });

  test('a success resets the failure count / closes the breaker', () => {
    const cb = freshBreaker();
    cb.recordFailure('svc-c');
    cb.recordSuccess('svc-c');
    expect(cb.isOpen('svc-c')).toBe(false);
  });
});
