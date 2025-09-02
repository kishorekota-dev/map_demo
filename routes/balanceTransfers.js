const express = require('express');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const { validateRequest, validateQuery } = require('../middleware/validation');
const { auth } = require('../middleware/auth');
const { 
  formatCurrency,
  generateReferenceNumber,
  getPaginationParams,
  createPaginatedResponse 
} = require('../utils/helpers');
const { 
  mockData, 
  findAccountsByUserId,
  findBalanceTransfersByUserId 
} = require('../models/mockData');

const router = express.Router();

// Validation schemas
const createBalanceTransferSchema = Joi.object({
  fromAccountId: Joi.string().required(),
  toAccountId: Joi.string().required(),
  amount: Joi.number().positive().required(),
  transferType: Joi.string().valid('BALANCE_TRANSFER', 'CREDIT_TO_CREDIT', 'CREDIT_TO_CHECKING', 'INTERNAL_TRANSFER').required(),
  description: Joi.string().max(255).optional(),
  promotionalRate: Joi.number().min(0).max(100).optional(),
  promotionalPeriod: Joi.number().integer().min(1).max(36).optional(), // months
  fee: Joi.number().min(0).optional()
});

const querySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  status: Joi.string().valid('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED').optional(),
  transferType: Joi.string().valid('BALANCE_TRANSFER', 'CREDIT_TO_CREDIT', 'CREDIT_TO_CHECKING', 'INTERNAL_TRANSFER').optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional()
});

// GET /api/v1/balance-transfers
router.get('/', auth, validateQuery(querySchema), (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const { status, transferType, startDate, endDate } = req.query;

    let transfers = findBalanceTransfersByUserId(req.user.userId);

    // Apply filters
    if (status) {
      transfers = transfers.filter(transfer => transfer.status === status);
    }

    if (transferType) {
      transfers = transfers.filter(transfer => transfer.transferType === transferType);
    }

    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : new Date(0);
      const end = endDate ? new Date(endDate) : new Date();
      transfers = transfers.filter(transfer => {
        const transferDate = new Date(transfer.createdAt);
        return transferDate >= start && transferDate <= end;
      });
    }

    // Sort by creation date (newest first)
    transfers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Paginate
    const totalCount = transfers.length;
    const paginatedTransfers = transfers.slice(offset, offset + limit);

    // Format response
    const formattedTransfers = paginatedTransfers.map(transfer => ({
      ...transfer,
      formattedAmount: formatCurrency(transfer.amount),
      formattedFee: formatCurrency(transfer.fee),
      formattedTotalAmount: formatCurrency(transfer.amount + transfer.fee)
    }));

    const response = createPaginatedResponse(formattedTransfers, totalCount, page, limit);

    res.json({
      message: 'Balance transfers retrieved successfully',
      ...response
    });
  } catch (error) {
    console.error('Get balance transfers error:', error);
    res.status(500).json({
      error: 'Failed to retrieve balance transfers',
      message: 'An error occurred while retrieving balance transfers'
    });
  }
});

// GET /api/v1/balance-transfers/:id
router.get('/:id', auth, (req, res) => {
  try {
    const transfer = mockData.balanceTransfers.get(req.params.id);

    if (!transfer || transfer.userId !== req.user.userId) {
      return res.status(404).json({
        error: 'Balance transfer not found',
        message: 'Balance transfer not found or access denied'
      });
    }

    // Get account information
    const fromAccount = mockData.accounts.get(transfer.fromAccountId);
    const toAccount = mockData.accounts.get(transfer.toAccountId);

    // Format response
    const formattedTransfer = {
      ...transfer,
      formattedAmount: formatCurrency(transfer.amount),
      formattedFee: formatCurrency(transfer.fee),
      formattedTotalAmount: formatCurrency(transfer.amount + transfer.fee),
      fromAccount: fromAccount ? {
        id: fromAccount.id,
        accountNumber: fromAccount.accountNumber,
        accountType: fromAccount.accountType
      } : null,
      toAccount: toAccount ? {
        id: toAccount.id,
        accountNumber: toAccount.accountNumber,
        accountType: toAccount.accountType
      } : null
    };

    res.json({
      message: 'Balance transfer retrieved successfully',
      transfer: formattedTransfer
    });
  } catch (error) {
    console.error('Get balance transfer error:', error);
    res.status(500).json({
      error: 'Failed to retrieve balance transfer',
      message: 'An error occurred while retrieving balance transfer'
    });
  }
});

// POST /api/v1/balance-transfers
router.post('/', auth, validateRequest(createBalanceTransferSchema), (req, res) => {
  try {
    const { 
      fromAccountId, 
      toAccountId, 
      amount, 
      transferType, 
      description, 
      promotionalRate, 
      promotionalPeriod,
      fee
    } = req.body;

    // Verify user owns both accounts
    const fromAccount = mockData.accounts.get(fromAccountId);
    const toAccount = mockData.accounts.get(toAccountId);

    if (!fromAccount || fromAccount.userId !== req.user.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to the source account'
      });
    }

    if (!toAccount || toAccount.userId !== req.user.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to the destination account'
      });
    }

    // Validate accounts are active
    if (fromAccount.status !== 'ACTIVE' || toAccount.status !== 'ACTIVE') {
      return res.status(400).json({
        error: 'Account inactive',
        message: 'Both accounts must be active for balance transfer'
      });
    }

    // Calculate transfer fee (default 3% or $5, whichever is higher)
    const calculatedFee = fee !== undefined ? fee : Math.max(amount * 0.03, 5);

    // Check available balance/credit
    const totalAmount = amount + calculatedFee;
    
    if (fromAccount.accountType === 'CREDIT') {
      if (totalAmount > fromAccount.availableCredit) {
        return res.status(400).json({
          error: 'Insufficient credit',
          message: 'Transfer amount plus fee exceeds available credit'
        });
      }
    } else {
      if (totalAmount > fromAccount.currentBalance) {
        return res.status(400).json({
          error: 'Insufficient funds',
          message: 'Transfer amount plus fee exceeds available balance'
        });
      }
    }

    // Validate transfer type based on account types
    const validTransferTypes = {
      'BALANCE_TRANSFER': ['CREDIT', 'CREDIT'],
      'CREDIT_TO_CREDIT': ['CREDIT', 'CREDIT'],
      'CREDIT_TO_CHECKING': ['CREDIT', 'CHECKING'],
      'INTERNAL_TRANSFER': ['CHECKING', 'CHECKING']
    };

    const expectedTypes = validTransferTypes[transferType];
    if (expectedTypes && 
        (fromAccount.accountType !== expectedTypes[0] || toAccount.accountType !== expectedTypes[1])) {
      return res.status(400).json({
        error: 'Invalid transfer type',
        message: `${transferType} is not valid for the selected account types`
      });
    }

    // Create new balance transfer
    const newTransfer = {
      id: uuidv4(),
      userId: req.user.userId,
      fromAccountId,
      toAccountId,
      amount,
      fee: calculatedFee,
      totalAmount: totalAmount,
      transferType,
      status: 'PROCESSING',
      description: description || `${transferType.replace('_', ' ')} - ${formatCurrency(amount)}`,
      referenceNumber: generateReferenceNumber('BT'),
      promotionalRate: promotionalRate || null,
      promotionalPeriod: promotionalPeriod || null,
      estimatedCompletionDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
      createdAt: new Date(),
      processedAt: null,
      completedAt: null
    };

    mockData.balanceTransfers.set(newTransfer.id, newTransfer);

    // Process the transfer (in real system, this would be asynchronous)
    setTimeout(() => {
      // Update account balances
      if (fromAccount.accountType === 'CREDIT') {
        fromAccount.currentBalance += totalAmount;
        fromAccount.availableCredit -= totalAmount;
      } else {
        fromAccount.currentBalance -= totalAmount;
      }

      if (toAccount.accountType === 'CREDIT') {
        toAccount.currentBalance = Math.max(0, toAccount.currentBalance - amount);
        toAccount.availableCredit = toAccount.creditLimit - toAccount.currentBalance;
      } else {
        toAccount.currentBalance += amount;
      }

      fromAccount.lastModified = new Date();
      toAccount.lastModified = new Date();
      mockData.accounts.set(fromAccount.id, fromAccount);
      mockData.accounts.set(toAccount.id, toAccount);

      // Update transfer status
      newTransfer.status = 'COMPLETED';
      newTransfer.processedAt = new Date();
      newTransfer.completedAt = new Date();
      mockData.balanceTransfers.set(newTransfer.id, newTransfer);
    }, 1000); // Simulate processing delay

    // Format response
    const formattedTransfer = {
      ...newTransfer,
      formattedAmount: formatCurrency(newTransfer.amount),
      formattedFee: formatCurrency(newTransfer.fee),
      formattedTotalAmount: formatCurrency(newTransfer.totalAmount),
      fromAccount: {
        id: fromAccount.id,
        accountNumber: fromAccount.accountNumber,
        accountType: fromAccount.accountType
      },
      toAccount: {
        id: toAccount.id,
        accountNumber: toAccount.accountNumber,
        accountType: toAccount.accountType
      }
    };

    res.status(201).json({
      message: 'Balance transfer initiated successfully',
      transfer: formattedTransfer
    });
  } catch (error) {
    console.error('Create balance transfer error:', error);
    res.status(500).json({
      error: 'Failed to create balance transfer',
      message: 'An error occurred while creating balance transfer'
    });
  }
});

// PUT /api/v1/balance-transfers/:id/cancel
router.put('/:id/cancel', auth, (req, res) => {
  try {
    const transfer = mockData.balanceTransfers.get(req.params.id);

    if (!transfer || transfer.userId !== req.user.userId) {
      return res.status(404).json({
        error: 'Balance transfer not found',
        message: 'Balance transfer not found or access denied'
      });
    }

    // Can only cancel pending or processing transfers
    if (!['PENDING', 'PROCESSING'].includes(transfer.status)) {
      return res.status(400).json({
        error: 'Cannot cancel transfer',
        message: 'Only pending or processing transfers can be cancelled'
      });
    }

    // Update transfer status
    transfer.status = 'CANCELLED';
    transfer.cancelledAt = new Date();
    transfer.cancellationReason = 'User requested cancellation';
    mockData.balanceTransfers.set(transfer.id, transfer);

    // Format response
    const formattedTransfer = {
      ...transfer,
      formattedAmount: formatCurrency(transfer.amount),
      formattedFee: formatCurrency(transfer.fee),
      formattedTotalAmount: formatCurrency(transfer.totalAmount)
    };

    res.json({
      message: 'Balance transfer cancelled successfully',
      transfer: formattedTransfer
    });
  } catch (error) {
    console.error('Cancel balance transfer error:', error);
    res.status(500).json({
      error: 'Failed to cancel balance transfer',
      message: 'An error occurred while cancelling balance transfer'
    });
  }
});

// GET /api/v1/balance-transfers/offers
router.get('/offers', auth, (req, res) => {
  try {
    // Get user's credit accounts
    const userAccounts = findAccountsByUserId(req.user.userId);
    const creditAccounts = userAccounts.filter(acc => acc.accountType === 'CREDIT' && acc.status === 'ACTIVE');

    // Generate balance transfer offers
    const offers = creditAccounts.map(account => {
      const availableCredit = account.availableCredit;
      const maxTransferAmount = Math.min(availableCredit * 0.8, 10000); // Max 80% of available credit or $10k

      return {
        accountId: account.id,
        accountNumber: account.accountNumber,
        maxTransferAmount,
        formattedMaxTransferAmount: formatCurrency(maxTransferAmount),
        offers: [
          {
            id: uuidv4(),
            type: 'PROMOTIONAL',
            rate: 0.99,
            period: 12, // months
            fee: Math.max(maxTransferAmount * 0.03, 5),
            formattedFee: formatCurrency(Math.max(maxTransferAmount * 0.03, 5)),
            description: '0.99% APR for 12 months',
            terms: 'Promotional rate applies to balance transfers completed within 60 days of account opening'
          },
          {
            id: uuidv4(),
            type: 'STANDARD',
            rate: 14.99,
            period: null,
            fee: Math.max(maxTransferAmount * 0.05, 10),
            formattedFee: formatCurrency(Math.max(maxTransferAmount * 0.05, 10)),
            description: '14.99% APR (standard rate)',
            terms: 'Standard balance transfer rate and fees apply'
          }
        ]
      };
    });

    res.json({
      message: 'Balance transfer offers retrieved successfully',
      offers
    });
  } catch (error) {
    console.error('Get balance transfer offers error:', error);
    res.status(500).json({
      error: 'Failed to retrieve offers',
      message: 'An error occurred while retrieving balance transfer offers'
    });
  }
});

// GET /api/v1/balance-transfers/calculator
router.get('/calculator', auth, (req, res) => {
  try {
    const { amount, fromRate, toRate, months } = req.query;

    if (!amount || !fromRate || !toRate || !months) {
      return res.status(400).json({
        error: 'Missing parameters',
        message: 'Amount, fromRate, toRate, and months are required'
      });
    }

    const transferAmount = parseFloat(amount);
    const currentRate = parseFloat(fromRate) / 100 / 12; // Monthly rate
    const newRate = parseFloat(toRate) / 100 / 12; // Monthly rate
    const term = parseInt(months);

    // Calculate savings
    const currentMonthlyPayment = transferAmount * (currentRate * Math.pow(1 + currentRate, term)) / (Math.pow(1 + currentRate, term) - 1);
    const newMonthlyPayment = transferAmount * (newRate * Math.pow(1 + newRate, term)) / (Math.pow(1 + newRate, term) - 1);
    
    const currentTotalInterest = (currentMonthlyPayment * term) - transferAmount;
    const newTotalInterest = (newMonthlyPayment * term) - transferAmount;
    const interestSavings = currentTotalInterest - newTotalInterest;

    const calculation = {
      transferAmount,
      formattedTransferAmount: formatCurrency(transferAmount),
      currentRate: fromRate + '%',
      newRate: toRate + '%',
      term: term + ' months',
      currentMonthlyPayment,
      formattedCurrentMonthlyPayment: formatCurrency(currentMonthlyPayment),
      newMonthlyPayment,
      formattedNewMonthlyPayment: formatCurrency(newMonthlyPayment),
      monthlyPaymentSavings: currentMonthlyPayment - newMonthlyPayment,
      formattedMonthlyPaymentSavings: formatCurrency(currentMonthlyPayment - newMonthlyPayment),
      currentTotalInterest,
      formattedCurrentTotalInterest: formatCurrency(currentTotalInterest),
      newTotalInterest,
      formattedNewTotalInterest: formatCurrency(newTotalInterest),
      interestSavings,
      formattedInterestSavings: formatCurrency(interestSavings),
      estimatedFee: Math.max(transferAmount * 0.03, 5),
      formattedEstimatedFee: formatCurrency(Math.max(transferAmount * 0.03, 5))
    };

    res.json({
      message: 'Balance transfer calculation completed',
      calculation
    });
  } catch (error) {
    console.error('Balance transfer calculator error:', error);
    res.status(500).json({
      error: 'Calculation failed',
      message: 'An error occurred during calculation'
    });
  }
});

module.exports = router;
