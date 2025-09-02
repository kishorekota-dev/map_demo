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
const createAccountSchema = Joi.object({
  accountType: Joi.string().valid('CREDIT', 'DEBIT', 'SAVINGS', 'CHECKING').required(),
  creditLimit: Joi.number().min(0).when('accountType', {
    is: 'CREDIT',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  initialDeposit: Joi.number().min(0).when('accountType', {
    is: Joi.string().valid('SAVINGS', 'CHECKING'),
    then: Joi.required(),
    otherwise: Joi.optional()
  })
});

const updateAccountSchema = Joi.object({
  status: Joi.string().valid('ACTIVE', 'SUSPENDED', 'CLOSED').optional(),
  creditLimit: Joi.number().min(0).optional(),
  interestRate: Joi.number().min(0).max(100).optional()
});

const querySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  status: Joi.string().valid('ACTIVE', 'SUSPENDED', 'CLOSED').optional(),
  accountType: Joi.string().valid('CREDIT', 'DEBIT', 'SAVINGS', 'CHECKING').optional()
});

// GET /api/v1/accounts
router.get('/', auth, createResourceSecurityMiddleware('accounts', 'read'), validateQuery(querySchema), (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const { status, accountType } = req.query;
    const { user } = req;

    // Get all accounts
    let accounts = Array.from(mockData.accounts.values());
    
    // Apply security filtering
    accounts = SecurityUtils.filterDataByAccess(user, 'accounts', accounts);

    // Apply query filters
    if (status) {
      accounts = accounts.filter(account => account.status === status);
    }
    if (accountType) {
      accounts = accounts.filter(account => account.accountType === accountType);
    }

    // Sort by creation date (newest first)
    accounts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Paginate
    const totalCount = accounts.length;
    const paginatedAccounts = accounts.slice(offset, offset + limit);

    // Format response with currency formatting
    const formattedAccounts = paginatedAccounts.map(account => ({
      ...account,
      formattedCreditLimit: formatCurrency(account.creditLimit),
      formattedCurrentBalance: formatCurrency(account.currentBalance),
      formattedAvailableCredit: formatCurrency(account.availableCredit),
      formattedMinimumPayment: formatCurrency(account.minimumPayment)
    }));

    // Apply security sanitization
    const sanitizedAccounts = SecurityUtils.sanitizeDataForRole(user, 'accounts', formattedAccounts);

    const response = createPaginatedResponse(sanitizedAccounts, totalCount, page, limit);

    res.json({
      message: 'Accounts retrieved successfully',
      ...response,
      userContext: {
        role: user.role,
        accessibleAccountCount: totalCount
      }
    });
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({
      error: 'Failed to retrieve accounts',
      message: 'An error occurred while retrieving accounts'
    });
  }
});

// GET /api/v1/accounts/:id
router.get('/:id', auth, createResourceSecurityMiddleware('accounts', 'read', { requireItemAccess: true }), (req, res) => {
  try {
    const account = mockData.accounts.get(req.params.id);
    const { user } = req;

    if (!account) {
      return res.status(404).json({
        error: 'Account not found',
        message: 'Account not found'
      });
    }

    // Check if user can access this specific account
    if (!SecurityUtils.canAccessResourceItem(user, 'accounts', account)) {
      SecurityUtils.logSecurityEvent(
        user,
        'read',
        'accounts',
        req.params.id,
        false,
        { reason: 'item_access_denied', accountId: req.params.id }
      );
      
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only access your own accounts'
      });
    }

    // Get recent transactions
    const recentTransactions = findTransactionsByAccountId(account.id)
      .sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate))
      .slice(0, 5);

    // Format response with currency formatting
    const formattedAccount = {
      ...account,
      formattedCreditLimit: formatCurrency(account.creditLimit),
      formattedCurrentBalance: formatCurrency(account.currentBalance),
      formattedAvailableCredit: formatCurrency(account.availableCredit),
      formattedMinimumPayment: formatCurrency(account.minimumPayment),
      recentTransactions: recentTransactions.map(transaction => ({
        ...transaction,
        formattedAmount: formatCurrency(transaction.amount)
      }))
    };

    // Apply security sanitization
    const sanitizedAccount = SecurityUtils.sanitizeDataForRole(user, 'accounts', formattedAccount);

    res.json({
      message: 'Account retrieved successfully',
      account: sanitizedAccount,
      userContext: {
        role: user.role
      }
    });
  } catch (error) {
    console.error('Get account error:', error);
    res.status(500).json({
      error: 'Failed to retrieve account',
      message: 'An error occurred while retrieving account'
    });
  }
});

// POST /api/v1/accounts
router.post('/', auth, validateRequest(createAccountSchema), (req, res) => {
  try {
    const { accountType, creditLimit, initialDeposit } = req.body;

    // Generate account number
    const accountNumber = `4532${String(Date.now()).slice(-4)}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

    // Create new account
    const newAccount = {
      id: uuidv4(),
      userId: req.user.userId,
      accountNumber,
      accountType,
      status: 'ACTIVE',
      creditLimit: creditLimit || 0,
      currentBalance: accountType === 'CREDIT' ? 0 : (initialDeposit || 0),
      availableCredit: accountType === 'CREDIT' ? creditLimit : null,
      paymentDueDate: accountType === 'CREDIT' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
      minimumPayment: accountType === 'CREDIT' ? 0 : null,
      interestRate: accountType === 'CREDIT' ? 18.99 : (accountType === 'SAVINGS' ? 2.5 : 0.1),
      rewardsPoints: accountType === 'CREDIT' ? 0 : null,
      createdAt: new Date(),
      lastModified: new Date()
    };

    mockData.accounts.set(newAccount.id, newAccount);

    // Format response
    const formattedAccount = {
      ...newAccount,
      formattedCreditLimit: formatCurrency(newAccount.creditLimit),
      formattedCurrentBalance: formatCurrency(newAccount.currentBalance),
      formattedAvailableCredit: newAccount.availableCredit ? formatCurrency(newAccount.availableCredit) : null,
      formattedMinimumPayment: newAccount.minimumPayment ? formatCurrency(newAccount.minimumPayment) : null
    };

    res.status(201).json({
      message: 'Account created successfully',
      account: formattedAccount
    });
  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json({
      error: 'Failed to create account',
      message: 'An error occurred while creating account'
    });
  }
});

// PUT /api/v1/accounts/:id
router.put('/:id', auth, validateRequest(updateAccountSchema), (req, res) => {
  try {
    const account = mockData.accounts.get(req.params.id);

    if (!account || account.userId !== req.user.userId) {
      return res.status(404).json({
        error: 'Account not found',
        message: 'Account not found or access denied'
      });
    }

    const { status, creditLimit, interestRate } = req.body;

    // Update account
    if (status) account.status = status;
    if (creditLimit !== undefined) {
      account.creditLimit = creditLimit;
      if (account.accountType === 'CREDIT') {
        account.availableCredit = creditLimit - account.currentBalance;
      }
    }
    if (interestRate !== undefined) account.interestRate = interestRate;

    account.lastModified = new Date();
    mockData.accounts.set(account.id, account);

    // Format response
    const formattedAccount = {
      ...account,
      formattedCreditLimit: formatCurrency(account.creditLimit),
      formattedCurrentBalance: formatCurrency(account.currentBalance),
      formattedAvailableCredit: account.availableCredit ? formatCurrency(account.availableCredit) : null,
      formattedMinimumPayment: account.minimumPayment ? formatCurrency(account.minimumPayment) : null
    };

    res.json({
      message: 'Account updated successfully',
      account: formattedAccount
    });
  } catch (error) {
    console.error('Update account error:', error);
    res.status(500).json({
      error: 'Failed to update account',
      message: 'An error occurred while updating account'
    });
  }
});

// GET /api/v1/accounts/:id/balance
router.get('/:id/balance', auth, (req, res) => {
  try {
    const account = mockData.accounts.get(req.params.id);

    if (!account || account.userId !== req.user.userId) {
      return res.status(404).json({
        error: 'Account not found',
        message: 'Account not found or access denied'
      });
    }

    const balanceInfo = {
      accountId: account.id,
      accountNumber: account.accountNumber,
      accountType: account.accountType,
      currentBalance: account.currentBalance,
      formattedCurrentBalance: formatCurrency(account.currentBalance),
      availableCredit: account.availableCredit,
      formattedAvailableCredit: account.availableCredit ? formatCurrency(account.availableCredit) : null,
      creditLimit: account.creditLimit,
      formattedCreditLimit: formatCurrency(account.creditLimit),
      minimumPayment: account.minimumPayment,
      formattedMinimumPayment: account.minimumPayment ? formatCurrency(account.minimumPayment) : null,
      paymentDueDate: account.paymentDueDate,
      rewardsPoints: account.rewardsPoints,
      interestRate: account.interestRate,
      lastUpdated: account.lastModified
    };

    res.json({
      message: 'Balance information retrieved successfully',
      balance: balanceInfo
    });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({
      error: 'Failed to retrieve balance',
      message: 'An error occurred while retrieving balance'
    });
  }
});

// GET /api/v1/accounts/:id/statement
router.get('/:id/statement', auth, (req, res) => {
  try {
    const account = mockData.accounts.get(req.params.id);

    if (!account || account.userId !== req.user.userId) {
      return res.status(404).json({
        error: 'Account not found',
        message: 'Account not found or access denied'
      });
    }

    const { startDate, endDate } = req.query;
    
    let transactions = findTransactionsByAccountId(account.id);

    // Filter by date range if provided
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : new Date(0);
      const end = endDate ? new Date(endDate) : new Date();

      transactions = transactions.filter(transaction => {
        const transactionDate = new Date(transaction.transactionDate);
        return transactionDate >= start && transactionDate <= end;
      });
    }

    // Sort by date (newest first)
    transactions.sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate));

    // Calculate statement summary
    const summary = {
      totalTransactions: transactions.length,
      totalPurchases: transactions.filter(t => t.type === 'PURCHASE').length,
      totalRefunds: transactions.filter(t => t.type === 'REFUND').length,
      totalAmount: transactions.reduce((sum, t) => sum + (t.type === 'PURCHASE' ? t.amount : -t.amount), 0),
      averageTransaction: transactions.length > 0 ? transactions.reduce((sum, t) => sum + t.amount, 0) / transactions.length : 0
    };

    const statement = {
      accountId: account.id,
      accountNumber: account.accountNumber,
      statementDate: new Date(),
      periodStart: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      periodEnd: endDate || new Date(),
      currentBalance: account.currentBalance,
      formattedCurrentBalance: formatCurrency(account.currentBalance),
      creditLimit: account.creditLimit,
      formattedCreditLimit: formatCurrency(account.creditLimit),
      availableCredit: account.availableCredit,
      formattedAvailableCredit: account.availableCredit ? formatCurrency(account.availableCredit) : null,
      minimumPayment: account.minimumPayment,
      formattedMinimumPayment: account.minimumPayment ? formatCurrency(account.minimumPayment) : null,
      paymentDueDate: account.paymentDueDate,
      summary: {
        ...summary,
        formattedTotalAmount: formatCurrency(summary.totalAmount),
        formattedAverageTransaction: formatCurrency(summary.averageTransaction)
      },
      transactions: transactions.map(transaction => ({
        ...transaction,
        formattedAmount: formatCurrency(transaction.amount)
      }))
    };

    res.json({
      message: 'Account statement retrieved successfully',
      statement
    });
  } catch (error) {
    console.error('Get statement error:', error);
    res.status(500).json({
      error: 'Failed to retrieve statement',
      message: 'An error occurred while retrieving statement'
    });
  }
});

module.exports = router;
