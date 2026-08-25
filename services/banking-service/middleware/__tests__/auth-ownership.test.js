jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../database/repositories', () => ({
  AccountRepository: { findById: jest.fn() },
  TransactionRepository: { findById: jest.fn() },
  CardRepository: { findById: jest.fn() },
  TransferRepository: { findById: jest.fn() },
  FraudRepository: { findById: jest.fn() },
  DisputeRepository: { findById: jest.fn() }
}));

const repositories = require('../../database/repositories');
const { verifyCardOwnership, verifyTransactionOwnership } = require('../auth');

const makeResponse = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('resource ownership middleware', () => {
  test('blocks access to another user card', async () => {
    repositories.CardRepository.findById.mockResolvedValue({ card_id: 'card-1', user_id: 'user-b' });
    const req = { params: { cardId: 'card-1' }, user: { userId: 'user-a', role: 'customer' } };
    const res = makeResponse();
    const next = jest.fn();

    await verifyCardOwnership(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('allows a transaction owner and attaches the resolved transaction', async () => {
    const transaction = { transaction_id: 'txn-1', account_id: 'account-1' };
    repositories.TransactionRepository.findById.mockResolvedValue(transaction);
    repositories.AccountRepository.findById.mockResolvedValue({ account_id: 'account-1', user_id: 'user-a' });
    const req = { params: { transactionId: 'txn-1' }, user: { userId: 'user-a', role: 'customer' } };
    const res = makeResponse();
    const next = jest.fn();

    await verifyTransactionOwnership(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.ownedTransaction).toBe(transaction);
  });
});
