jest.mock('../../index', () => ({
  query: jest.fn(),
  transaction: jest.fn()
}));

const db = require('../../index');
const TransactionRepository = require('../TransactionRepository');

describe('TransactionRepository.createAndApplyBalance', () => {
  let client;

  beforeEach(() => {
    client = { query: jest.fn() };
    db.transaction.mockImplementation(async (callback) => callback(client));
    client.query.mockImplementation(async (sql) => {
      if (sql.startsWith('SELECT * FROM accounts')) {
        return { rows: [{ account_id: 'account-1', balance: '200', available_balance: '200' }] };
      }
      if (sql.startsWith('SELECT generate_reference_number')) {
        return { rows: [{ reference_number: 'REF-1' }] };
      }
      if (sql.includes('INSERT INTO transactions')) {
        return { rows: [{ transaction_id: 'txn-1' }] };
      }
      return { rows: [] };
    });
  });

  test('atomically stores debits as negative and reduces the balance', async () => {
    await TransactionRepository.createAndApplyBalance({
      accountId: 'account-1',
      transactionType: 'withdrawal',
      amount: 25
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    const updateCall = client.query.mock.calls.find(([sql]) => sql.includes('UPDATE accounts'));
    const insertCall = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO transactions'));
    expect(updateCall[1]).toEqual(['account-1', 175, 175]);
    expect(insertCall[1][2]).toBe(-25);
    expect(insertCall[1][4]).toBe(175);
  });

  test('rejects an overdraft before updating either table', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ account_id: 'account-1', balance: '10', available_balance: '10' }]
    });

    await expect(TransactionRepository.createAndApplyBalance({
      accountId: 'account-1',
      transactionType: 'payment',
      amount: 20
    })).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

    expect(client.query.mock.calls.some(([sql]) => sql.includes('UPDATE accounts'))).toBe(false);
    expect(client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO transactions'))).toBe(false);
  });
});
