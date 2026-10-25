jest.mock('../../utils/logger', () => ({ error: jest.fn(), warn: jest.fn() }));
const { randomBytes } = require('crypto');
const { errorHandler, notFoundHandler, serviceErrorHandler } = require('../error');
const response = () => { const res = { status: jest.fn(), json: jest.fn() }; res.status.mockReturnValue(res); return res; };

test('public errors never disclose exception text, stack, validation payload or caller-selected paths', () => {
  const privateValue = randomBytes(32).toString('hex');
  const res = response();
  const error = Object.assign(new Error(privateValue), { status: 400, errors: [{ value: privateValue }] });
  errorHandler(error, { method: 'POST', path: privateValue, id: privateValue }, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json.mock.calls[0][0]).toMatchObject({ error: 'RequestRejected', message: 'The request is invalid.', outcome: 'failed' });
  expect(JSON.stringify(res.json.mock.calls).includes(privateValue)).toBe(false);
  const missing = response(); notFoundHandler({ method: 'GET', path: privateValue }, missing);
  expect(missing.status).toHaveBeenCalledWith(404);
  expect(JSON.stringify(missing.json.mock.calls).includes(privateValue)).toBe(false);
});

test('provider response failures are sanitized and unavailable mutation outcomes stay uncertain', () => {
  const privateValue = randomBytes(32).toString('hex');
  const error = Object.assign(new Error(privateValue), { response: { status: 503, data: { message: privateValue, credential: privateValue } } });
  const result = serviceErrorHandler(error, 'banking', { method: 'POST', path: privateValue });
  expect(result).toMatchObject({ statusCode: 503, service: 'banking', outcome: 'uncertain' });
  expect(JSON.stringify(result).includes(privateValue)).toBe(false);
  expect(serviceErrorHandler(error, privateValue, { method: 'GET' })).toMatchObject({ service: 'upstream', outcome: 'failed' });
  const res = response(); errorHandler({ status: -1 }, { method: 'POST' }, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json.mock.calls[0][0].outcome).toBe('uncertain');
});
