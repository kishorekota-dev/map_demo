const express = require('express');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const { validateRequest, validateQuery } = require('../middleware/validation');
const { auth } = require('../middleware/auth');
const { 
  SecurityUtils, 
  createResourceSecurityMiddleware, 
  createSecureResponse 
} = require('../middleware/security');
const { 
  formatCurrency,
  generateAuthCode,
  getPaginationParams,
  createPaginatedResponse 
} = require('../utils/helpers');
const { 
  mockData, 
  findAccountsByUserId,
  findTransactionsByAccountId 
} = require('../models/mockData');

const router = express.Router();

// Validation schemas
const createTransactionSchema = Joi.object({
  accountId: Joi.string().required(),
  cardId: Joi.string().optional(),
  amount: Joi.number().positive().required(),
  currency: Joi.string().length(3).default('USD'),
  type: Joi.string().valid('PURCHASE', 'REFUND', 'PAYMENT', 'WITHDRAWAL', 'DEPOSIT', 'TRANSFER').required(),
  merchantName: Joi.string().max(100).optional(),
  merchantCategory: Joi.string().max(50).optional(),
  description: Joi.string().max(255).required(),
  location: Joi.object({
    city: Joi.string().max(50).optional(),
    state: Joi.string().max(50).optional(),
    country: Joi.string().max(50).optional(),
    zipCode: Joi.string().max(20).optional()
  }).optional()
});

const querySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  accountId: Joi.string().optional(),
  type: Joi.string().valid('PURCHASE', 'REFUND', 'PAYMENT', 'WITHDRAWAL', 'DEPOSIT', 'TRANSFER').optional(),
  status: Joi.string().valid('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED').optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  minAmount: Joi.number().min(0).optional(),
  maxAmount: Joi.number().min(0).optional(),
  merchantName: Joi.string().optional(),
  isDisputed: Joi.boolean().optional(),
  isFraudulent: Joi.boolean().optional()
});

// GET /api/v1/transactions
router.get('/', auth, createResourceSecurityMiddleware('transactions', 'read'), validateQuery(querySchema), (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const { 
      accountId, 
      type, 
      status, 
      startDate, 
      endDate, 
      minAmount, 
      maxAmount, 
      merchantName,
      isDisputed,
      isFraudulent 
    } = req.query;
    const { user } = req;

    // Get all transactions
    let transactions = Array.from(mockData.transactions.values());

    // Apply security filtering
    transactions = SecurityUtils.filterDataByAccess(user, 'transactions', transactions);
    userAccountIds.forEach(accId => {
      const accountTransactions = findTransactionsByAccountId(accId);
      transactions.push(...accountTransactions);
    });

    // Apply filters
    if (accountId) {
      // Verify user owns the account
      if (!userAccountIds.includes(accountId)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this account'
        });
      }
      transactions = transactions.filter(t => t.accountId === accountId);
    }

    if (type) {
      transactions = transactions.filter(t => t.type === type);
    }

    if (status) {
      transactions = transactions.filter(t => t.status === status);
    }

    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : new Date(0);
      const end = endDate ? new Date(endDate) : new Date();
      transactions = transactions.filter(t => {
        const transactionDate = new Date(t.transactionDate);
        return transactionDate >= start && transactionDate <= end;
      });
    }

    if (minAmount !== undefined) {
      transactions = transactions.filter(t => t.amount >= minAmount);
    }

    if (maxAmount !== undefined) {
      transactions = transactions.filter(t => t.amount <= maxAmount);
    }

    if (merchantName) {
      transactions = transactions.filter(t => 
        t.merchantName && t.merchantName.toLowerCase().includes(merchantName.toLowerCase())
      );
    }

    if (isDisputed !== undefined) {
      transactions = transactions.filter(t => t.isDisputed === isDisputed);
    }

    if (isFraudulent !== undefined) {
      transactions = transactions.filter(t => t.isFraudulent === isFraudulent);
    }

    // Sort by transaction date (newest first)
    transactions.sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate));

    // Paginate
    const totalCount = transactions.length;
    const paginatedTransactions = transactions.slice(offset, offset + limit);

    // Format response
    const formattedTransactions = paginatedTransactions.map(transaction => ({
      ...transaction,
      formattedAmount: formatCurrency(transaction.amount, transaction.currency)
    }));

    const response = createPaginatedResponse(formattedTransactions, totalCount, page, limit);

    res.json({
      message: 'Transactions retrieved successfully',
      ...response
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      error: 'Failed to retrieve transactions',
      message: 'An error occurred while retrieving transactions'
    });
  }
});

// GET /api/v1/transactions/:id
router.get('/:id', auth, (req, res) => {
  try {
    const transaction = mockData.transactions.get(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        error: 'Transaction not found',
        message: 'Transaction not found'
      });
    }

    // Verify user owns the account
    const account = mockData.accounts.get(transaction.accountId);
    if (!account || account.userId !== req.user.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this transaction'
      });
    }

    // Format response
    const formattedTransaction = {
      ...transaction,
      formattedAmount: formatCurrency(transaction.amount, transaction.currency)
    };

    res.json({
      message: 'Transaction retrieved successfully',
      transaction: formattedTransaction
    });
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({
      error: 'Failed to retrieve transaction',
      message: 'An error occurred while retrieving transaction'
    });
  }
});

// POST /api/v1/transactions
router.post('/', auth, validateRequest(createTransactionSchema), (req, res) => {
  try {
    const { 
      accountId, 
      cardId, 
      amount, 
      currency, 
      type, 
      merchantName, 
      merchantCategory, 
      description, 
      location 
    } = req.body;

    // Verify user owns the account
    const account = mockData.accounts.get(accountId);
    if (!account || account.userId !== req.user.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this account'
      });
    }

    // Verify card belongs to account if provided
    if (cardId) {
      const card = mockData.cards.get(cardId);
      if (!card || card.accountId !== accountId || card.userId !== req.user.userId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Card does not belong to this account'
        });
      }

      // Check if card is blocked
      if (card.isBlocked) {
        return res.status(400).json({
          error: 'Card blocked',
          message: 'This card is currently blocked'
        });
      }

      // Check if transactions are blocked on this card
      if (card.blockedTransactions && (type === 'PURCHASE' || type === 'WITHDRAWAL')) {
        return res.status(400).json({
          error: 'Transactions blocked',
          message: 'Transactions are currently blocked on this card'
        });
      }
    }

    // Check account status
    if (account.status !== 'ACTIVE') {
      return res.status(400).json({
        error: 'Account inactive',
        message: 'Account is not active'
      });
    }

    // Check available balance/credit for debiting transactions
    if (['PURCHASE', 'WITHDRAWAL', 'TRANSFER'].includes(type)) {
      if (account.accountType === 'CREDIT') {
        if (amount > account.availableCredit) {
          return res.status(400).json({
            error: 'Insufficient credit',
            message: 'Transaction amount exceeds available credit'
          });
        }
      } else {
        if (amount > account.currentBalance) {
          return res.status(400).json({
            error: 'Insufficient funds',
            message: 'Transaction amount exceeds available balance'
          });
        }
      }
    }

    // Create new transaction
    const newTransaction = {
      id: uuidv4(),
      accountId,
      cardId: cardId || null,
      userId: req.user.userId,
      amount,
      currency: currency || 'USD',
      type,
      status: 'COMPLETED', // In real system, this might be PENDING initially
      merchantName: merchantName || null,
      merchantCategory: merchantCategory || null,
      description,
      transactionDate: new Date(),
      authorizationCode: generateAuthCode(),
      location: location || null,
      isDisputed: false,
      isFraudulent: false,
      createdAt: new Date()
    };

    mockData.transactions.set(newTransaction.id, newTransaction);

    // Update account balance
    if (['PURCHASE', 'WITHDRAWAL', 'TRANSFER'].includes(type)) {
      if (account.accountType === 'CREDIT') {
        account.currentBalance += amount;
        account.availableCredit -= amount;
        // Update minimum payment (simplified calculation)
        account.minimumPayment = Math.max(account.minimumPayment || 0, account.currentBalance * 0.02);
      } else {
        account.currentBalance -= amount;
      }
    } else if (['REFUND', 'DEPOSIT', 'PAYMENT'].includes(type)) {
      if (account.accountType === 'CREDIT') {
        account.currentBalance = Math.max(0, account.currentBalance - amount);
        account.availableCredit = account.creditLimit - account.currentBalance;
        account.minimumPayment = Math.max(0, account.currentBalance * 0.02);
      } else {
        account.currentBalance += amount;
      }
    }

    // Add rewards points for credit card purchases
    if (type === 'PURCHASE' && account.accountType === 'CREDIT') {
      account.rewardsPoints = (account.rewardsPoints || 0) + Math.floor(amount);
    }

    account.lastModified = new Date();
    mockData.accounts.set(account.id, account);

    // Format response
    const formattedTransaction = {
      ...newTransaction,
      formattedAmount: formatCurrency(newTransaction.amount, newTransaction.currency)
    };

    res.status(201).json({
      message: 'Transaction created successfully',
      transaction: formattedTransaction
    });
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({
      error: 'Failed to create transaction',
      message: 'An error occurred while creating transaction'
    });
  }
});

// PUT /api/v1/transactions/:id/status
router.put('/:id/status', auth, (req, res) => {
  try {
    const { status } = req.body;

    if (!['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status',
        message: 'Status must be PENDING, COMPLETED, FAILED, or CANCELLED'
      });
    }

    const transaction = mockData.transactions.get(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        error: 'Transaction not found',
        message: 'Transaction not found'
      });
    }

    // Verify user owns the account
    const account = mockData.accounts.get(transaction.accountId);
    if (!account || account.userId !== req.user.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this transaction'
      });
    }

    // Update transaction status
    transaction.status = status;
    transaction.lastModified = new Date();
    mockData.transactions.set(transaction.id, transaction);

    // Format response
    const formattedTransaction = {
      ...transaction,
      formattedAmount: formatCurrency(transaction.amount, transaction.currency)
    };

    res.json({
      message: 'Transaction status updated successfully',
      transaction: formattedTransaction
    });
  } catch (error) {
    console.error('Update transaction status error:', error);
    res.status(500).json({
      error: 'Failed to update transaction status',
      message: 'An error occurred while updating transaction status'
    });
  }
});

// GET /api/v1/transactions/search
router.get('/search', auth, (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        error: 'Invalid search query',
        message: 'Search query must be at least 2 characters long'
      });
    }

    // Get user's accounts
    const userAccounts = findAccountsByUserId(req.user.userId);
    const userAccountIds = userAccounts.map(acc => acc.id);

    // Get all transactions for user's accounts
    let transactions = [];
    userAccountIds.forEach(accId => {
      const accountTransactions = findTransactionsByAccountId(accId);
      transactions.push(...accountTransactions);
    });

    // Search in description, merchant name, and authorization code
    const searchTerm = q.toLowerCase();
    const searchResults = transactions.filter(transaction => 
      (transaction.description && transaction.description.toLowerCase().includes(searchTerm)) ||
      (transaction.merchantName && transaction.merchantName.toLowerCase().includes(searchTerm)) ||
      (transaction.authorizationCode && transaction.authorizationCode.toLowerCase().includes(searchTerm))
    );

    // Sort by relevance (exact matches first, then by date)
    searchResults.sort((a, b) => {
      const aExact = a.description?.toLowerCase() === searchTerm || 
                    a.merchantName?.toLowerCase() === searchTerm;
      const bExact = b.description?.toLowerCase() === searchTerm || 
                    b.merchantName?.toLowerCase() === searchTerm;
      
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      return new Date(b.transactionDate) - new Date(a.transactionDate);
    });

    // Limit results
    const limitedResults = searchResults.slice(0, parseInt(limit));

    // Format response
    const formattedResults = limitedResults.map(transaction => ({
      ...transaction,
      formattedAmount: formatCurrency(transaction.amount, transaction.currency)
    }));

    res.json({
      message: 'Search completed successfully',
      query: q,
      totalResults: searchResults.length,
      results: formattedResults
    });
  } catch (error) {
    console.error('Search transactions error:', error);
    res.status(500).json({
      error: 'Failed to search transactions',
      message: 'An error occurred while searching transactions'
    });
  }
});

module.exports = router;
