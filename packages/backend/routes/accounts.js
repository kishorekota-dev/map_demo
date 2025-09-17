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
const AccountModel = require('../models/Account');
const {
  createRouteDebugLogger,
  logBusinessOperation,
  logAuthEvent,
  logError,
  withPerformanceLogging
} = require('../middleware/apiDebugLogger');

const router = express.Router();

// Create route-specific debug logger
const debugLogger = createRouteDebugLogger('accounts');

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
router.get('/', auth, createResourceSecurityMiddleware('accounts', 'read'), validateQuery(querySchema), async (req, res) => {
  try {
    const startTime = Date.now();
    const { page, limit, offset } = getPaginationParams(req);
    const { status, accountType } = req.query;
    const { user } = req;

    debugLogger.info('Fetching accounts list', {
      requestId: req.requestId,
      userId: user.userId,
      role: user.role,
      filters: { status, accountType },
      pagination: { page, limit, offset }
    });

    // Build database filters
    const dbFilters = {};
    if (status) {
      dbFilters.status = status;
    }
    if (accountType) {
      dbFilters.account_type = accountType;
    }

    // For customers, only show their own accounts
    if (user.role === 'CUSTOMER') {
      dbFilters.user_id = user.userId;
    }

    debugLogger.debug('Database filters applied', {
      requestId: req.requestId,
      filters: dbFilters,
      userRole: user.role,
      userId: user.userId
    });

    // Get accounts from database
    const accountsResult = await AccountModel.findAll(dbFilters, page, limit, 'created_at', 'DESC');
    
    debugLogger.debug('Retrieved accounts from database', {
      requestId: req.requestId,
      totalAccounts: accountsResult.total,
      returnedAccounts: accountsResult.accounts.length,
      page: accountsResult.page,
      totalPages: accountsResult.totalPages
    });

    const { accounts, total: totalCount } = accountsResult;

    debugLogger.debug('Applied pagination', {
      requestId: req.requestId,
      totalCount,
      returnedCount: paginatedAccounts.length,
      page,
      limit,
      offset
    });

    // Format response with currency formatting and field mapping
    const formattedAccounts = accounts.map(account => ({
      id: account.id,
      userId: account.user_id,
      accountNumber: account.account_number,
      accountType: account.account_type,
      status: account.status,
      creditLimit: parseFloat(account.credit_limit),
      currentBalance: parseFloat(account.current_balance),
      availableCredit: parseFloat(account.available_credit),
      minimumPayment: parseFloat(account.minimum_payment),
      paymentDueDate: account.payment_due_date,
      interestRate: parseFloat(account.interest_rate),
      createdAt: account.created_at,
      updatedAt: account.updated_at,
      // User info from join
      customerName: `${account.first_name} ${account.last_name}`,
      customerEmail: account.email,
      // Formatted currency fields
      formattedCreditLimit: formatCurrency(account.credit_limit),
      formattedCurrentBalance: formatCurrency(account.current_balance),
      formattedAvailableCredit: formatCurrency(account.available_credit),
      formattedMinimumPayment: formatCurrency(account.minimum_payment)
    }));

    // Apply security sanitization
    const sanitizedAccounts = SecurityUtils.sanitizeDataForRole(user, 'accounts', formattedAccounts);

    const response = createPaginatedResponse(sanitizedAccounts, totalCount, page, limit);

    const duration = Date.now() - startTime;
    debugLogger.performance('Accounts list retrieved', duration, {
      requestId: req.requestId,
      accountsReturned: sanitizedAccounts.length,
      totalAccounts: totalCount
    });

    logBusinessOperation('Accounts list accessed', {
      userId: user.userId,
      role: user.role,
      accountsReturned: sanitizedAccounts.length,
      requestId: req.requestId
    });

    res.json({
      message: 'Accounts retrieved successfully',
      ...response,
      userContext: {
        role: user.role,
        accessibleAccountCount: totalCount
      }
    });
  } catch (error) {
    logError(error, {
      requestId: req.requestId,
      operation: 'GET /accounts',
      userId: req.user?.userId
    });
    
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
    const startTime = Date.now();
    const account = mockData.accounts.get(req.params.id);
    const { user } = req;

    debugLogger.info('Fetching specific account', {
      requestId: req.requestId,
      accountId: req.params.id,
      userId: user.userId,
      role: user.role
    });

    if (!account) {
      debugLogger.warn('Account not found', {
        requestId: req.requestId,
        accountId: req.params.id,
        userId: user.userId
      });
      
      return res.status(404).json({
        error: 'Account not found',
        message: 'Account not found'
      });
    }

    debugLogger.debug('Account found in data source', {
      requestId: req.requestId,
      accountId: account.id,
      accountType: account.accountType,
      accountStatus: account.status
    });

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
      
      debugLogger.security('Account access denied', {
        requestId: req.requestId,
        accountId: req.params.id,
        userId: user.userId,
        reason: 'item_access_denied'
      });
      
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only access your own accounts'
      });
    }

    debugLogger.debug('Account access authorized', {
      requestId: req.requestId,
      accountId: account.id,
      userId: user.userId
    });

    // Get recent transactions
    const recentTransactions = findTransactionsByAccountId(account.id)
      .sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate))
      .slice(0, 5);

    debugLogger.debug('Retrieved recent transactions', {
      requestId: req.requestId,
      accountId: account.id,
      transactionCount: recentTransactions.length
    });

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

    const duration = Date.now() - startTime;
    debugLogger.performance('Account details retrieved', duration, {
      requestId: req.requestId,
      accountId: account.id,
      includesTransactions: recentTransactions.length > 0
    });

    logBusinessOperation('Account details accessed', {
      userId: user.userId,
      accountId: account.id,
      accountType: account.accountType,
      requestId: req.requestId
    });

    res.json({
      message: 'Account retrieved successfully',
      account: sanitizedAccount,
      userContext: {
        role: user.role
      }
    });
  } catch (error) {
    logError(error, {
      requestId: req.requestId,
      operation: 'GET /accounts/:id',
      accountId: req.params.id,
      userId: req.user?.userId
    });
    
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
