const { randomBytes } = require('crypto');
const { errorHandler, notFoundHandler, ConflictError, ValidationError } = require('../error');
const logger = require('../../utils/logger');
jest.mock('../../utils/logger', () => ({ error: jest.fn(), warn: jest.fn() }));
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

test.each(['development', 'production'])('raw errors and validation details cannot expose private values in %s', environment => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = environment;
  const sensitive = randomBytes(32).toString('hex');
  const req = { method: 'POST', id: sensitive, path: sensitive, get: () => sensitive };
  try {
    for (const error of [Object.assign(new Error(sensitive), { stack: sensitive, details: { credential: sensitive } }), new ValidationError(sensitive, [sensitive]), new ConflictError(sensitive)]) {
      const res = response();
      errorHandler(error, req, res, jest.fn());
      expect(JSON.stringify(res.json.mock.calls).includes(sensitive)).toBe(false);
      expect(JSON.stringify(logger.error.mock.calls).includes(sensitive)).toBe(false);
      expect(res.json.mock.calls[0][0]).not.toHaveProperty('stack');
    }
  } finally { process.env.NODE_ENV = previous; }
});

test('known business errors retain safe status and code while unknown HTTP errors remain bounded', () => {
  for (const [error, expected] of [
    [new ConflictError('Private provider detail'), { status: 409, code: 'CONFLICT' }],
    [new ValidationError('Private invalid input'), { status: 400, code: 'VALIDATION_ERROR' }],
    [Object.assign(new Error('Private backend error'), { status: 502 }), { status: 502, code: 'HTTP_ERROR' }],
    [Object.assign(new Error('Private backend error'), { status: 'fail' }), { status: 500, code: 'INTERNAL_ERROR' }]
  ]) {
    const res = response(); errorHandler(error, { method: 'POST' }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(expected.status);
    expect(res.json.mock.calls[0][0].code).toBe(expected.code);
  }
});

test('missing route errors do not echo a caller supplied path', () => {
  const sensitive = randomBytes(32).toString('hex');
  const res = response(); notFoundHandler({ method: 'GET', path: sensitive, get: () => sensitive }, res);
  expect(res.status).toHaveBeenCalledWith(404);
  expect(JSON.stringify(res.json.mock.calls).includes(sensitive)).toBe(false);
});
