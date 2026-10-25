jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../database/repositories', () => ({
  AccountRepository: { create: jest.fn(), update: jest.fn(), findById: jest.fn() },
  TransactionRepository: { findById: jest.fn() },
  DisputeRepository: { update: jest.fn(), findById: jest.fn(), withdraw: jest.fn(), resolveInFavor: jest.fn() }
}));

const { AccountRepository, TransactionRepository, DisputeRepository } = require('../../database/repositories');
const accounts = require('../accounts');
const disputes = require('../disputes');

const customer = { userId: 'customer-1', role: 'customer' };
const admin = { userId: 'admin-1', role: 'admin' };
const response = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

beforeEach(() => jest.clearAllMocks());

describe('account creation', () => {
  const body = { accountType: 'checking', accountName: 'Everyday', currency: 'USD', initialBalance: 0 };

  test('a customer cannot open an account with money that came from nowhere', async () => {
    const res = response();
    await accounts.createAccount({ user: customer, body: { ...body, initialBalance: 1000000 } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'ACCOUNT_FIELD_FORBIDDEN', fields: ['initialBalance'] });
    expect(AccountRepository.create).not.toHaveBeenCalled();
  });

  test('a customer cannot choose credit terms or raise their own limits', async () => {
    const res = response();
    await accounts.createAccount({ user: customer, body: { ...body, creditLimit: 50000, dailyTransactionLimit: 1000000 } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].fields).toEqual(['creditLimit', 'dailyTransactionLimit']);
    expect(AccountRepository.create).not.toHaveBeenCalled();
  });

  test('a customer can open a zero-balance account with default limits', async () => {
    AccountRepository.create.mockResolvedValue({ account_id: 'account-1' });
    const res = response();
    await accounts.createAccount({ user: customer, body }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(201);
    expect(AccountRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'customer-1', balance: 0, dailyTransactionLimit: 10000, monthlyTransactionLimit: 50000
    }));
  });

  test('bank staff can open a funded account', async () => {
    AccountRepository.create.mockResolvedValue({ account_id: 'account-2' });
    const res = response();
    await accounts.createAccount({ user: admin, body: { ...body, initialBalance: 2500, creditLimit: 1000 } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(201);
    expect(AccountRepository.create).toHaveBeenCalledWith(expect.objectContaining({ balance: 2500, creditLimit: 1000 }));
  });
});

describe('account update', () => {
  test.each(['active', 'frozen', 'closed'])('a customer cannot set status %s', async (status) => {
    const res = response();
    await accounts.updateAccount({ user: customer, params: { accountId: 'account-1' }, body: { status } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(AccountRepository.update).not.toHaveBeenCalled();
  });

  test('closing never bypasses the zero-balance close endpoint, even for staff', async () => {
    const res = response();
    await accounts.updateAccount({ user: admin, params: { accountId: 'account-1' }, body: { status: 'closed' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(AccountRepository.update).not.toHaveBeenCalled();
  });

  test('a customer nickname is stored as the account name', async () => {
    AccountRepository.update.mockResolvedValue({ account_id: 'account-1', account_name: 'Bills' });
    const res = response();
    await accounts.updateAccount({ user: customer, params: { accountId: 'account-1' }, body: { nickname: 'Bills' } }, res, jest.fn());
    expect(AccountRepository.update).toHaveBeenCalledWith('account-1', { accountName: 'Bills', status: undefined });
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('dispute updates', () => {
  const open = { dispute_id: 'dispute-1', status: 'under_review', transaction_id: 'txn-1' };

  test('a customer cannot resolve their own dispute', async () => {
    const res = response();
    await disputes.updateDispute({ user: customer, ownedDispute: open, params: { disputeId: 'dispute-1' },
      body: { status: 'resolved_in_favor', resolution: 'full_refund' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].fields).toEqual(['status', 'resolution']);
    expect(DisputeRepository.update).not.toHaveBeenCalled();
  });

  test('a customer cannot edit a decided dispute', async () => {
    const res = response();
    await disputes.updateDispute({ user: customer, ownedDispute: { ...open, status: 'resolved_against' },
      params: { disputeId: 'dispute-1' }, body: { description: 'More detail' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(DisputeRepository.update).not.toHaveBeenCalled();
  });

  test('a customer cannot dispute more than the transaction amount', async () => {
    TransactionRepository.findById.mockResolvedValue({ transaction_id: 'txn-1', amount: '-42.10' });
    const res = response();
    await disputes.updateDispute({ user: customer, ownedDispute: open, params: { disputeId: 'dispute-1' },
      body: { amountDisputed: 5000 } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(DisputeRepository.update).not.toHaveBeenCalled();
  });

  test('a customer can correct the details of an open dispute', async () => {
    TransactionRepository.findById.mockResolvedValue({ transaction_id: 'txn-1', amount: '-42.10' });
    DisputeRepository.update.mockResolvedValue({ ...open, amount_disputed: 42.1 });
    const res = response();
    await disputes.updateDispute({ user: customer, ownedDispute: open, params: { disputeId: 'dispute-1' },
      body: { reason: 'Charged twice', amountDisputed: 42.1 } }, res, jest.fn());
    expect(DisputeRepository.update).toHaveBeenCalledWith('dispute-1', { reason: 'Charged twice', amountDisputed: 42.1 });
    expect(res.status).not.toHaveBeenCalled();
  });

  test('a decided dispute cannot be withdrawn or resolved twice', async () => {
    const decided = { ...open, status: 'resolved_in_favor' };
    const withdrawRes = response();
    await disputes.withdrawDispute({ user: customer, ownedDispute: decided, params: { disputeId: 'dispute-1' }, body: {} }, withdrawRes, jest.fn());
    expect(withdrawRes.status).toHaveBeenCalledWith(409);

    DisputeRepository.findById.mockResolvedValue(decided);
    const resolveRes = response();
    await disputes.resolveDispute({ user: admin, params: { disputeId: 'dispute-1' }, body: { resolution: 'in_favor', refundAmount: 42.1 } }, resolveRes, jest.fn());
    expect(resolveRes.status).toHaveBeenCalledWith(409);
    expect(DisputeRepository.withdraw).not.toHaveBeenCalled();
    expect(DisputeRepository.resolveInFavor).not.toHaveBeenCalled();
  });
});
