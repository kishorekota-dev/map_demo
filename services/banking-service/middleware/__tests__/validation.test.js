jest.mock('../../utils/logger', () => ({ warn: jest.fn(), error: jest.fn() }));

const { validators } = require('../validation');

const makeResponse = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('banking request validation contracts', () => {
  test('normalizes legacy transaction fields to controller fields', () => {
    const req = {
      path: '/transactions',
      method: 'POST',
      body: { fromAccountId: 'account-1', type: 'withdrawal', amount: 25 }
    };
    const res = makeResponse();
    const next = jest.fn();

    validators.validateCreateTransaction(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body).toMatchObject({
      accountId: 'account-1',
      transactionType: 'withdrawal',
      amount: 25
    });
    expect(req.body.fromAccountId).toBeUndefined();
    expect(req.body.type).toBeUndefined();
  });

  test('maps initialDeposit and retains the required account name', () => {
    const req = {
      path: '/accounts',
      method: 'POST',
      body: {
        accountType: 'checking',
        accountName: 'Household',
        initialDeposit: 100
      }
    };
    const res = makeResponse();
    const next = jest.fn();

    validators.validateCreateAccount(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body.initialBalance).toBe(100);
    expect(req.body.initialDeposit).toBeUndefined();
    expect(req.body.accountName).toBe('Household');
  });

  test('accepts named resource parameters instead of stripping them', () => {
    const req = { path: '/cards/card-1', method: 'GET', params: { cardId: 'card-1' } };
    const res = makeResponse();
    const next = jest.fn();

    validators.validateId(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.params).toEqual({ cardId: 'card-1' });
  });

  test('preserves query fields across composed pagination/date validators', () => {
    const req = {
      path: '/transactions',
      method: 'GET',
      query: { page: 2, limit: 10, startDate: '2026-01-01', endDate: '2026-01-31' }
    };
    const res = makeResponse();
    const next = jest.fn();

    validators.validatePagination(req, res, next);
    validators.validateDateRange(req, res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(req.query).toMatchObject({
      page: 2,
      limit: 10,
      startDate: expect.any(Date),
      endDate: expect.any(Date)
    });
  });
});
