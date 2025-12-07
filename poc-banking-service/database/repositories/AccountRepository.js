const db = require('../index');

class AccountRepository {
  // Get all accounts for a user
  async findByUserId(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;
    const query = `
      SELECT * FROM accounts 
      WHERE user_id = $1 
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await db.query(query, [userId, limit, offset]);
    return result.rows;
  }

  // Get account by ID
  async findById(accountId) {
    const query = 'SELECT * FROM accounts WHERE account_id = $1';
    const result = await db.query(query, [accountId]);
    return result.rows[0];
  }

  // Get account by account number
  async findByAccountNumber(accountNumber) {
    const query = 'SELECT * FROM accounts WHERE account_number = $1';
    const result = await db.query(query, [accountNumber]);
    return result.rows[0];
  }

  // Create new account
  async create(accountData) {
    const {
      userId, accountType, accountName, currency = 'USD',
      balance = 0, creditLimit, interestRate, dailyTransactionLimit,
      monthlyTransactionLimit
    } = accountData;

    const accountNumber = await this.generateAccountNumber();

    const query = `
      INSERT INTO accounts (
        user_id, account_number, account_type, account_name, currency,
        balance, available_balance, credit_limit, interest_rate,
        daily_transaction_limit, monthly_transaction_limit
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const values = [
      userId, accountNumber, accountType, accountName, currency,
      balance, balance, creditLimit, interestRate,
      dailyTransactionLimit, monthlyTransactionLimit
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  // Update account
  async update(accountId, updateData) {
    const {
      accountName, status, dailyTransactionLimit,
      monthlyTransactionLimit, overdraftProtection, overdraftLimit
    } = updateData;

    const query = `
      UPDATE accounts SET
        account_name = COALESCE($2, account_name),
        status = COALESCE($3, status),
        daily_transaction_limit = COALESCE($4, daily_transaction_limit),
        monthly_transaction_limit = COALESCE($5, monthly_transaction_limit),
        overdraft_protection = COALESCE($6, overdraft_protection),
        overdraft_limit = COALESCE($7, overdraft_limit),
        updated_at = CURRENT_TIMESTAMP
      WHERE account_id = $1
      RETURNING *
    `;

    const values = [
      accountId, accountName, status, dailyTransactionLimit,
      monthlyTransactionLimit, overdraftProtection, overdraftLimit
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  // Update account balance
  async updateBalance(accountId, amount, transactionType = 'adjustment') {
    return await db.transaction(async (client) => {
      // Lock the account row
      const lockQuery = 'SELECT * FROM accounts WHERE account_id = $1 FOR UPDATE';
      const accountResult = await client.query(lockQuery, [accountId]);
      const account = accountResult.rows[0];

      if (!account) {
        throw new Error('Account not found');
      }

      // Calculate new balances
      const newBalance = parseFloat(account.balance) + amount;
      const newAvailableBalance = parseFloat(account.available_balance) + amount;

      // Update balance
      const updateQuery = `
        UPDATE accounts SET
          balance = $2,
          available_balance = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE account_id = $1
        RETURNING *
      `;

      const result = await client.query(updateQuery, [accountId, newBalance, newAvailableBalance]);
      return result.rows[0];
    });
  }

  // Close account
  async close(accountId) {
    const query = `
      UPDATE accounts SET
        status = 'closed',
        closed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE account_id = $1
      RETURNING *
    `;
    const result = await db.query(query, [accountId]);
    return result.rows[0];
  }

  // Get account balance
  async getBalance(accountId) {
    const query = `
      SELECT balance, available_balance, pending_balance, currency
      FROM accounts WHERE account_id = $1
    `;
    const result = await db.query(query, [accountId]);
    return result.rows[0];
  }

  // Check sufficient funds
  async hasSufficientFunds(accountId, amount) {
    const query = 'SELECT available_balance, overdraft_limit FROM accounts WHERE account_id = $1';
    const result = await db.query(query, [accountId]);
    const account = result.rows[0];

    if (!account) return false;

    const maxAvailable = parseFloat(account.available_balance) + parseFloat(account.overdraft_limit || 0);
    return maxAvailable >= amount;
  }

  // Generate unique account number
  async generateAccountNumber() {
    const query = 'SELECT generate_account_number() as account_number';
    const result = await db.query(query);
    return result.rows[0].account_number;
  }

  // Get account statistics
  async getStatistics(accountId, startDate, endDate) {
    const query = `
      SELECT 
        COUNT(*) as transaction_count,
        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_deposits,
        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_withdrawals,
        AVG(amount) as average_transaction
      FROM transactions
      WHERE account_id = $1
        AND created_at BETWEEN $2 AND $3
        AND status = 'completed'
    `;
    const result = await db.query(query, [accountId, startDate, endDate]);
    return result.rows[0];
  }
}

module.exports = new AccountRepository();
