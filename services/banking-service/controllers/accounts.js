const { AccountRepository, TransactionRepository } = require('../database/repositories');
const logger = require('../utils/logger');

class AccountController {
  // Get all accounts for authenticated user
  async getAllAccounts(req, res, next) {
    try {
      const userId = req.user.userId;
      const { page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      const accounts = await AccountRepository.findByUserId(userId, { limit, offset });

      res.json({
        success: true,
        data: accounts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: accounts.length
        }
      });
    } catch (error) {
      logger.error('Error fetching accounts:', error);
      next(error);
    }
  }

  // Get specific account by ID
  async getAccountById(req, res, next) {
    try {
      const { accountId } = req.params;

      const account = await AccountRepository.findById(accountId);

      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Account not found'
        });
      }

      res.json({
        success: true,
        data: account
      });
    } catch (error) {
      logger.error('Error fetching account:', error);
      next(error);
    }
  }

  // Create new account
  async createAccount(req, res, next) {
    try {
      const userId = req.user.userId;
      const {
        accountType,
        accountName,
        currency,
        initialBalance,
        creditLimit,
        interestRate,
        dailyTransactionLimit,
        monthlyTransactionLimit
      } = req.body;

      const accountData = {
        userId,
        accountType,
        accountName,
        currency: currency || 'USD',
        balance: initialBalance || 0,
        creditLimit,
        interestRate,
        dailyTransactionLimit: dailyTransactionLimit || 10000,
        monthlyTransactionLimit: monthlyTransactionLimit || 50000
      };

      const account = await AccountRepository.create(accountData);

      logger.info(`Account created: ${account.account_id} for user: ${userId}`);

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        data: account
      });
    } catch (error) {
      logger.error('Error creating account:', error);
      next(error);
    }
  }

  // Update account
  async updateAccount(req, res, next) {
    try {
      const { accountId } = req.params;
      const updateData = req.body;

      const account = await AccountRepository.update(accountId, updateData);

      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Account not found'
        });
      }

      logger.info(`Account updated: ${accountId}`);

      res.json({
        success: true,
        message: 'Account updated successfully',
        data: account
      });
    } catch (error) {
      logger.error('Error updating account:', error);
      next(error);
    }
  }

  // Close account
  async closeAccount(req, res, next) {
    try {
      const { accountId } = req.params;

      // Check if account has zero balance
      const balance = await AccountRepository.getBalance(accountId);
      
      if (balance && Math.abs(parseFloat(balance.balance)) > 0.01) {
        return res.status(400).json({
          success: false,
          error: 'Cannot close account with non-zero balance',
          currentBalance: balance.balance
        });
      }

      const account = await AccountRepository.close(accountId);

      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Account not found'
        });
      }

      logger.info(`Account closed: ${accountId}`);

      res.json({
        success: true,
        message: 'Account closed successfully',
        data: account
      });
    } catch (error) {
      logger.error('Error closing account:', error);
      next(error);
    }
  }

  // Get account balance
  async getAccountBalance(req, res, next) {
    try {
      const { accountId } = req.params;

      const balance = await AccountRepository.getBalance(accountId);

      if (!balance) {
        return res.status(404).json({
          success: false,
          error: 'Account not found'
        });
      }

      res.json({
        success: true,
        data: balance
      });
    } catch (error) {
      logger.error('Error fetching account balance:', error);
      next(error);
    }
  }

  // Get account transactions
  async getAccountTransactions(req, res, next) {
    try {
      const { accountId } = req.params;
      const { page = 1, limit = 50, status, startDate, endDate } = req.query;
      const offset = (page - 1) * limit;

      const transactions = await TransactionRepository.findByAccountId(accountId, {
        limit,
        offset,
        status,
        startDate,
        endDate
      });

      res.json({
        success: true,
        data: transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: transactions.length
        }
      });
    } catch (error) {
      logger.error('Error fetching account transactions:', error);
      next(error);
    }
  }

  // Get account statements
  async getAccountStatements(req, res, next) {
    try {
      const { accountId } = req.params;
      const { startDate, endDate } = req.query;

      const account = await AccountRepository.findById(accountId);
      
      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Account not found'
        });
      }

      const transactions = await TransactionRepository.findByAccountId(accountId, {
        startDate,
        endDate,
        status: 'completed'
      });

      const statistics = await AccountRepository.getStatistics(accountId, startDate, endDate);

      res.json({
        success: true,
        data: {
          account: {
            accountId: account.account_id,
            accountNumber: account.account_number,
            accountName: account.account_name,
            accountType: account.account_type,
            currentBalance: account.balance
          },
          period: {
            startDate,
            endDate
          },
          transactions,
          statistics
        }
      });
    } catch (error) {
      logger.error('Error generating account statement:', error);
      next(error);
    }
  }

  // Freeze account (Admin only)
  async freezeAccount(req, res, next) {
    try {
      const { accountId } = req.params;
      const { reason } = req.body;

      const account = await AccountRepository.findById(accountId);
      
      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Account not found'
        });
      }

      if (account.status === 'frozen') {
        return res.status(400).json({
          success: false,
          error: 'Account is already frozen'
        });
      }

      const updatedAccount = await AccountRepository.update(accountId, {
        status: 'frozen'
      });

      logger.info(`Account frozen: ${accountId} by admin: ${req.user.userId} - Reason: ${reason || 'Not specified'}`);

      res.json({
        success: true,
        message: 'Account frozen successfully',
        data: updatedAccount
      });
    } catch (error) {
      logger.error('Error freezing account:', error);
      next(error);
    }
  }

  // Unfreeze account (Admin only)
  async unfreezeAccount(req, res, next) {
    try {
      const { accountId } = req.params;

      const account = await AccountRepository.findById(accountId);
      
      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Account not found'
        });
      }

      if (account.status !== 'frozen') {
        return res.status(400).json({
          success: false,
          error: 'Account is not frozen',
          currentStatus: account.status
        });
      }

      const updatedAccount = await AccountRepository.update(accountId, {
        status: 'active'
      });

      logger.info(`Account unfrozen: ${accountId} by admin: ${req.user.userId}`);

      res.json({
        success: true,
        message: 'Account unfrozen successfully',
        data: updatedAccount
      });
    } catch (error) {
      logger.error('Error unfreezing account:', error);
      next(error);
    }
  }

  // Get recent account activity
  async getAccountActivity(req, res, next) {
    try {
      const { accountId } = req.params;
      const { limit = 20, days = 30 } = req.query;

      const account = await AccountRepository.findById(accountId);
      
      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Account not found'
        });
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));
      const endDate = new Date();

      const transactions = await TransactionRepository.findByAccountId(accountId, {
        limit: parseInt(limit),
        offset: 0,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });

      const statistics = await AccountRepository.getStatistics(
        accountId, 
        startDate.toISOString(), 
        endDate.toISOString()
      );

      res.json({
        success: true,
        data: {
          accountId: account.account_id,
          accountName: account.account_name,
          currentBalance: account.balance,
          period: {
            days: parseInt(days),
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          },
          recentTransactions: transactions,
          statistics: {
            transactionCount: parseInt(statistics.transaction_count) || 0,
            totalDeposits: parseFloat(statistics.total_deposits) || 0,
            totalWithdrawals: parseFloat(statistics.total_withdrawals) || 0,
            averageTransaction: parseFloat(statistics.average_transaction) || 0
          }
        }
      });
    } catch (error) {
      logger.error('Error getting account activity:', error);
      next(error);
    }
  }
}

module.exports = new AccountController();
