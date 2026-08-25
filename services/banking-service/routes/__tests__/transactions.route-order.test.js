jest.mock('../../controllers/transactions', () => new Proxy({}, {
  get: () => (req, res, next) => next()
}));
jest.mock('../../middleware/validation', () => ({
  validators: new Proxy({}, { get: () => (req, res, next) => next() }),
  businessValidators: new Proxy({}, { get: () => (req, res, next) => next() })
}));
jest.mock('../../middleware/auth', () => new Proxy({}, {
  get: () => (req, res, next) => next()
}));
jest.mock('../../middleware/security', () => ({ bankingRateLimit: (req, res, next) => next() }));

const router = require('../transactions');

describe('transaction route precedence', () => {
  test('declares every static GET route before /:transactionId', () => {
    const getPaths = router.stack
      .filter(layer => layer.route?.methods?.get)
      .map(layer => layer.route.path);
    const parameterIndex = getPaths.indexOf('/:transactionId');

    for (const path of ['/pending', '/search', '/summary', '/categories']) {
      expect(getPaths.indexOf(path)).toBeGreaterThanOrEqual(0);
      expect(getPaths.indexOf(path)).toBeLessThan(parameterIndex);
    }
  });
});
