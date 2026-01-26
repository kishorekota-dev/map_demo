const { TransactionRepository, AccountRepository } = require('../database/repositories');
const logger = require('../utils/logger');

class TransactionController {
  async getAllTransactions(req, res, next) {
    try {
      const userId = req.user.userId;
      const { page = 1, limit = 50, startDate, endDate } = req.query;
      const offset = (page - 1) * limit;

      const transactions = await TransactionRepository.search({
        userId,
        startDate,
        endDate,
        limit,
        offset
      });

      res.json({
        success: true,
        data: transactions,
        pagination: { page: parseInt(page), limit: parseInt(limit), total: transactions.length }
      });
    } catch (error) {
      logger.error('Error fetching transactions:', error);
      next(error);
    }
  }

  async getTransactionById(req, res, next) {
    try {
      const { transactionId } = req.params;
      const transaction = await TransactionRepository.findById(transactionId);

      if (!transaction) {
        return res.status(404).json({ success: false, error: 'Transaction not found' });
      }

      res.json({ success: true, data: transaction });
    } catch (error) {
      logger.error('Error fetching transaction:', error);
      next(error);
    }
  }

  async createTransaction(req, res, next) {
    try {
      const { accountId, transactionType, amount, description, category, merchantName } = req.body;

      const transaction = await TransactionRepository.create({
        accountId,
        transactionType,
        amount,
        description,
        category,
        merchantName
      });

      // Update account balance
      await AccountRepository.updateBalance(accountId, amount, transactionType);

      logger.info(`Transaction created: ${transaction.transaction_id}`);

      res.status(201).json({ success: true, message: 'Transaction created', data: transaction });
    } catch (error) {
      logger.error('Error creating transaction:', error);
      next(error);
    }
  }

  async cancelTransaction(req, res, next) {
    try {
      const { transactionId } = req.params;
      const transaction = await TransactionRepository.cancel(transactionId);

      if (!transaction) {
        return res.status(404).json({ success: false, error: 'Transaction not found or cannot be cancelled' });
      }

      res.json({ success: true, message: 'Transaction cancelled', data: transaction });
    } catch (error) {
      logger.error('Error cancelling transaction:', error);
      next(error);
    }
  }

  async getPendingTransactions(req, res, next) {
    try {
      const userId = req.user.userId;
      const transactions = await TransactionRepository.findPending();

      res.json({ success: true, data: transactions });
    } catch (error) {
      logger.error('Error fetching pending transactions:', error);
      next(error);
    }
  }

  async searchTransactions(req, res, next) {
    try {
      const criteria = { ...req.query, userId: req.user.userId };
      const transactions = await TransactionRepository.search(criteria);

      res.json({ success: true, data: transactions });
    } catch (error) {
      logger.error('Error searching transactions:', error);
      next(error);
    }
  }

  async getTransactionSummary(req, res, next) {
    try {
      const { accountId } = req.query;
      const { startDate, endDate } = req.query;
      
      const summary = await TransactionRepository.getSummary(accountId, startDate, endDate);

      res.json({ success: true, data: summary });
    } catch (error) {
      logger.error('Error generating transaction summary:', error);
      next(error);
    }
  }

  async generateReceipt(req, res, next) {
    try {
      const { transactionId } = req.params;
      const transaction = await TransactionRepository.findById(transactionId);

      if (!transaction) {
        return res.status(404).json({ success: false, error: 'Transaction not found' });
      }

      const account = await AccountRepository.findById(transaction.account_id);

      res.json({
        success: true,
        data: {
          receipt: {
            transactionId: transaction.transaction_id,
            reference: transaction.reference_number,
            date: transaction.created_at,
            type: transaction.transaction_type,
            amount: transaction.amount,
            currency: transaction.currency,
            description: transaction.description,
            account: {
              accountNumber: account.account_number,
              accountName: account.account_name
            },
            balanceAfter: transaction.balance_after
          }
        }
      });
    } catch (error) {
      logger.error('Error generating receipt:', error);
      next(error);
    }
  }

  async getCategories(req, res, next) {
    try {
      const categories = await TransactionRepository.getCategories();
      res.json({ success: true, data: categories });
    } catch (error) {
      logger.error('Error fetching categories:', error);
      next(error);
    }
  }
}

module.exports = new TransactionController();
