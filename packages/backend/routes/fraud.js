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
  generateReferenceNumber,
  getPaginationParams,
  createPaginatedResponse 
} = require('../utils/helpers');
const { 
  mockData, 
  findAccountsByUserId,
  findFraudCasesByUserId 
} = require('../models/mockData');

const router = express.Router();

// Validation schemas
const createFraudCaseSchema = Joi.object({
  type: Joi.string().valid(
    'SUSPICIOUS_ACTIVITY',
    'UNAUTHORIZED_TRANSACTION',
    'ACCOUNT_TAKEOVER',
    'IDENTITY_THEFT',
    'CARD_SKIMMING',
    'PHISHING',
    'OTHER'
  ).required(),
  description: Joi.string().min(10).max(1000).required(),
  affectedTransactions: Joi.array().items(Joi.string()).optional(),
  suspiciousActivity: Joi.object({
    firstNoticed: Joi.date().iso().required(),
    lastActivity: Joi.date().iso().optional(),
    deviceInfo: Joi.object({
      deviceType: Joi.string().optional(),
      ipAddress: Joi.string().optional(),
      location: Joi.string().optional(),
      browser: Joi.string().optional()
    }).optional(),
    locations: Joi.array().items(Joi.object({
      city: Joi.string().required(),
      state: Joi.string().required(),
      country: Joi.string().required(),
      timestamp: Joi.date().iso().required()
    })).optional()
  }).optional(),
  reportedToPolice: Joi.boolean().default(false),
  policeReportNumber: Joi.string().when('reportedToPolice', {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  evidence: Joi.array().items(Joi.object({
    type: Joi.string().valid('EMAIL', 'SMS', 'PHOTO', 'DOCUMENT', 'SCREENSHOT', 'OTHER').required(),
    description: Joi.string().max(255).required(),
    url: Joi.string().uri().optional()
  })).optional()
});

const updateFraudSettingsSchema = Joi.object({
  blockIncomingTransactions: Joi.boolean().optional(),
  dailyTransactionLimit: Joi.number().min(0).optional(),
  internationalTransactionsBlocked: Joi.boolean().optional(),
  onlineTransactionsBlocked: Joi.boolean().optional(),
  contactlessTransactionsBlocked: Joi.boolean().optional(),
  atmTransactionsBlocked: Joi.boolean().optional(),
  notificationPreferences: Joi.object({
    email: Joi.boolean().optional(),
    sms: Joi.boolean().optional(),
    push: Joi.boolean().optional()
  }).optional(),
  suspiciousActivityAlerts: Joi.boolean().optional(),
  geoLocationTracking: Joi.boolean().optional(),
  velocityChecks: Joi.boolean().optional(),
  merchantCategoryBlocking: Joi.array().items(Joi.string()).optional(),
  trustedMerchants: Joi.array().items(Joi.string()).optional()
});

const querySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  status: Joi.string().valid(
    'SUBMITTED',
    'UNDER_INVESTIGATION',
    'ADDITIONAL_INFO_REQUIRED',
    'RESOLVED',
    'CLOSED',
    'ESCALATED'
  ).optional(),
  type: Joi.string().valid(
    'SUSPICIOUS_ACTIVITY',
    'UNAUTHORIZED_TRANSACTION',
    'ACCOUNT_TAKEOVER',
    'IDENTITY_THEFT',
    'CARD_SKIMMING',
    'PHISHING',
    'OTHER'
  ).optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional()
});

// GET /api/v1/fraud/cases
router.get('/cases', 
  createResourceSecurityMiddleware('fraud', 'read'),
  validateQuery(querySchema), 
  async (req, res) => {
    try {
      const { page, limit } = getPaginationParams(req.query);
      const { offset, actualLimit } = getPaginationParams(page, limit);
      const { status, type, startDate, endDate } = req.query;
      const userRole = req.user.role;
      const userId = req.user.userId;

      // Get fraud cases based on role access
      let fraudCases = SecurityUtils.filterByUserAccess(mockData.fraudCases, userRole, userId);

      // Apply filters
      if (status) {
        fraudCases = fraudCases.filter(fraudCase => fraudCase.status === status);
      }

      if (type) {
        fraudCases = fraudCases.filter(fraudCase => fraudCase.type === type);
      }

      if (startDate || endDate) {
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate) : new Date();
        fraudCases = fraudCases.filter(fraudCase => {
          const caseDate = new Date(fraudCase.createdAt);
          return caseDate >= start && caseDate <= end;
        });
      }

      // Sort by creation date (newest first)
      fraudCases.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Paginate
      const totalCount = fraudCases.length;
    const paginatedCases = fraudCases.slice(offset, offset + limit);

    const response = createPaginatedResponse(paginatedCases, totalCount, page, limit);

    res.json({
      message: 'Fraud cases retrieved successfully',
      ...response
    });
  } catch (error) {
    console.error('Get fraud cases error:', error);
    res.status(500).json({
      error: 'Failed to retrieve fraud cases',
      message: 'An error occurred while retrieving fraud cases'
    });
  }
});

// GET /api/v1/fraud/cases/:id
router.get('/cases/:id', auth, (req, res) => {
  try {
    const fraudCase = mockData.fraudCases.get(req.params.id);

    if (!fraudCase || fraudCase.userId !== req.user.userId) {
      return res.status(404).json({
        error: 'Fraud case not found',
        message: 'Fraud case not found or access denied'
      });
    }

    // Get affected transactions
    const affectedTransactions = fraudCase.affectedTransactions
      ? fraudCase.affectedTransactions.map(transactionId => {
          const transaction = mockData.transactions.get(transactionId);
          return transaction ? {
            id: transaction.id,
            amount: transaction.amount,
            formattedAmount: formatCurrency(transaction.amount),
            merchantName: transaction.merchantName,
            transactionDate: transaction.transactionDate,
            description: transaction.description
          } : null;
        }).filter(Boolean)
      : [];

    const formattedCase = {
      ...fraudCase,
      affectedTransactions
    };

    res.json({
      message: 'Fraud case retrieved successfully',
      fraudCase: formattedCase
    });
  } catch (error) {
    console.error('Get fraud case error:', error);
    res.status(500).json({
      error: 'Failed to retrieve fraud case',
      message: 'An error occurred while retrieving fraud case'
    });
  }
});

// POST /api/v1/fraud/cases
router.post('/cases', auth, validateRequest(createFraudCaseSchema), (req, res) => {
  try {
    const { 
      type, 
      description, 
      affectedTransactions, 
      suspiciousActivity, 
      reportedToPolice, 
      policeReportNumber, 
      evidence 
    } = req.body;

    // Verify affected transactions belong to user
    if (affectedTransactions && affectedTransactions.length > 0) {
      for (const transactionId of affectedTransactions) {
        const transaction = mockData.transactions.get(transactionId);
        if (!transaction) {
          return res.status(404).json({
            error: 'Transaction not found',
            message: `Transaction ${transactionId} not found`
          });
        }

        const account = mockData.accounts.get(transaction.accountId);
        if (!account || account.userId !== req.user.userId) {
          return res.status(403).json({
            error: 'Access denied',
            message: 'You do not have access to one or more specified transactions'
          });
        }
      }
    }

    // Create new fraud case
    const newFraudCase = {
      id: uuidv4(),
      userId: req.user.userId,
      type,
      description,
      status: 'SUBMITTED',
      priority: ['IDENTITY_THEFT', 'ACCOUNT_TAKEOVER', 'CARD_SKIMMING'].includes(type) ? 'HIGH' : 'MEDIUM',
      referenceNumber: generateReferenceNumber('FR'),
      affectedTransactions: affectedTransactions || [],
      suspiciousActivity: suspiciousActivity || null,
      reportedToPolice,
      policeReportNumber: policeReportNumber || null,
      evidence: evidence || [],
      timeline: [
        {
          date: new Date(),
          status: 'SUBMITTED',
          description: 'Fraud case submitted by customer',
          updatedBy: 'CUSTOMER'
        }
      ],
      investigator: null,
      estimatedResolutionDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days
      resolution: null,
      compensationAmount: 0,
      createdAt: new Date(),
      lastModified: new Date()
    };

    mockData.fraudCases.set(newFraudCase.id, newFraudCase);

    // Mark affected transactions as fraudulent
    if (affectedTransactions && affectedTransactions.length > 0) {
      affectedTransactions.forEach(transactionId => {
        const transaction = mockData.transactions.get(transactionId);
        if (transaction) {
          transaction.isFraudulent = true;
          transaction.fraudCaseId = newFraudCase.id;
          mockData.transactions.set(transaction.id, transaction);
        }
      });
    }

    // Auto-enable fraud protection measures for high-priority cases
    if (newFraudCase.priority === 'HIGH') {
      const userAccounts = findAccountsByUserId(req.user.userId);
      userAccounts.forEach(account => {
        // Get or create fraud settings for the account
        let fraudSettings = Array.from(mockData.fraudSettings.values())
          .find(fs => fs.accountId === account.id);
        
        if (!fraudSettings) {
          fraudSettings = {
            id: uuidv4(),
            accountId: account.id,
            userId: req.user.userId,
            blockIncomingTransactions: false,
            dailyTransactionLimit: 2000.00,
            internationalTransactionsBlocked: false,
            onlineTransactionsBlocked: false,
            contactlessTransactionsBlocked: false,
            atmTransactionsBlocked: false,
            notificationPreferences: { email: true, sms: true, push: true },
            suspiciousActivityAlerts: true,
            geoLocationTracking: true,
            velocityChecks: true,
            merchantCategoryBlocking: [],
            trustedMerchants: [],
            createdAt: new Date(),
            lastModified: new Date()
          };
        }

        // Enable enhanced security temporarily
        fraudSettings.blockIncomingTransactions = true;
        fraudSettings.dailyTransactionLimit = Math.min(fraudSettings.dailyTransactionLimit, 500);
        fraudSettings.suspiciousActivityAlerts = true;
        fraudSettings.lastModified = new Date();
        
        mockData.fraudSettings.set(fraudSettings.id, fraudSettings);
      });

      newFraudCase.timeline.push({
        date: new Date(),
        status: 'SECURITY_ENHANCED',
        description: 'Enhanced security measures automatically applied',
        updatedBy: 'SYSTEM'
      });
    }

    // Simulate automatic case assignment
    setTimeout(() => {
      newFraudCase.status = 'UNDER_INVESTIGATION';
      newFraudCase.investigator = 'John Smith, Fraud Specialist';
      newFraudCase.timeline.push({
        date: new Date(),
        status: 'UNDER_INVESTIGATION',
        description: 'Case assigned to fraud investigation team',
        updatedBy: 'SYSTEM'
      });
      newFraudCase.lastModified = new Date();
      mockData.fraudCases.set(newFraudCase.id, newFraudCase);
    }, 3000);

    res.status(201).json({
      message: 'Fraud case created successfully',
      fraudCase: newFraudCase
    });
  } catch (error) {
    console.error('Create fraud case error:', error);
    res.status(500).json({
      error: 'Failed to create fraud case',
      message: 'An error occurred while creating fraud case'
    });
  }
});

// GET /api/v1/fraud/settings
router.get('/settings', auth, (req, res) => {
  try {
    const { accountId } = req.query;

    let fraudSettingsArray = [];

    if (accountId) {
      // Verify user owns the account
      const account = mockData.accounts.get(accountId);
      if (!account || account.userId !== req.user.userId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this account'
        });
      }

      const settings = Array.from(mockData.fraudSettings.values())
        .find(fs => fs.accountId === accountId);
      
      if (settings) {
        fraudSettingsArray = [settings];
      }
    } else {
      // Get settings for all user's accounts
      const userAccounts = findAccountsByUserId(req.user.userId);
      fraudSettingsArray = Array.from(mockData.fraudSettings.values())
        .filter(fs => userAccounts.some(acc => acc.id === fs.accountId));
    }

    res.json({
      message: 'Fraud settings retrieved successfully',
      settings: fraudSettingsArray
    });
  } catch (error) {
    console.error('Get fraud settings error:', error);
    res.status(500).json({
      error: 'Failed to retrieve fraud settings',
      message: 'An error occurred while retrieving fraud settings'
    });
  }
});

// PUT /api/v1/fraud/settings/:accountId
router.put('/settings/:accountId', auth, validateRequest(updateFraudSettingsSchema), (req, res) => {
  try {
    const { accountId } = req.params;

    // Verify user owns the account
    const account = mockData.accounts.get(accountId);
    if (!account || account.userId !== req.user.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this account'
      });
    }

    // Get or create fraud settings
    let fraudSettings = Array.from(mockData.fraudSettings.values())
      .find(fs => fs.accountId === accountId);

    if (!fraudSettings) {
      fraudSettings = {
        id: uuidv4(),
        accountId,
        userId: req.user.userId,
        blockIncomingTransactions: false,
        dailyTransactionLimit: 2000.00,
        internationalTransactionsBlocked: false,
        onlineTransactionsBlocked: false,
        contactlessTransactionsBlocked: false,
        atmTransactionsBlocked: false,
        notificationPreferences: { email: true, sms: true, push: true },
        suspiciousActivityAlerts: true,
        geoLocationTracking: true,
        velocityChecks: true,
        merchantCategoryBlocking: [],
        trustedMerchants: [],
        createdAt: new Date(),
        lastModified: new Date()
      };
    }

    // Update settings
    const updateData = req.body;
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        if (key === 'notificationPreferences' && fraudSettings.notificationPreferences) {
          fraudSettings.notificationPreferences = {
            ...fraudSettings.notificationPreferences,
            ...updateData[key]
          };
        } else {
          fraudSettings[key] = updateData[key];
        }
      }
    });

    fraudSettings.lastModified = new Date();
    mockData.fraudSettings.set(fraudSettings.id, fraudSettings);

    res.json({
      message: 'Fraud settings updated successfully',
      settings: fraudSettings
    });
  } catch (error) {
    console.error('Update fraud settings error:', error);
    res.status(500).json({
      error: 'Failed to update fraud settings',
      message: 'An error occurred while updating fraud settings'
    });
  }
});

// POST /api/v1/fraud/block-transactions/:accountId
router.post('/block-transactions/:accountId', auth, (req, res) => {
  try {
    const { accountId } = req.params;
    const { block = true, reason } = req.body;

    // Verify user owns the account
    const account = mockData.accounts.get(accountId);
    if (!account || account.userId !== req.user.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this account'
      });
    }

    // Get or create fraud settings
    let fraudSettings = Array.from(mockData.fraudSettings.values())
      .find(fs => fs.accountId === accountId);

    if (!fraudSettings) {
      fraudSettings = {
        id: uuidv4(),
        accountId,
        userId: req.user.userId,
        blockIncomingTransactions: false,
        dailyTransactionLimit: 2000.00,
        internationalTransactionsBlocked: false,
        onlineTransactionsBlocked: false,
        contactlessTransactionsBlocked: false,
        atmTransactionsBlocked: false,
        notificationPreferences: { email: true, sms: true, push: true },
        suspiciousActivityAlerts: true,
        geoLocationTracking: true,
        velocityChecks: true,
        merchantCategoryBlocking: [],
        trustedMerchants: [],
        createdAt: new Date(),
        lastModified: new Date()
      };
    }

    // Update block status
    fraudSettings.blockIncomingTransactions = block;
    fraudSettings.lastModified = new Date();
    
    if (reason) {
      fraudSettings.blockReason = reason;
      fraudSettings.blockTimestamp = new Date();
    }

    mockData.fraudSettings.set(fraudSettings.id, fraudSettings);

    // Also update cards associated with this account
    const accountCards = Array.from(mockData.cards.values())
      .filter(card => card.accountId === accountId);

    accountCards.forEach(card => {
      card.blockedTransactions = block;
      card.lastModified = new Date();
      mockData.cards.set(card.id, card);
    });

    res.json({
      message: `Transactions ${block ? 'blocked' : 'unblocked'} successfully`,
      settings: fraudSettings,
      affectedCards: accountCards.length
    });
  } catch (error) {
    console.error('Block transactions error:', error);
    res.status(500).json({
      error: 'Failed to update transaction blocking',
      message: 'An error occurred while updating transaction blocking'
    });
  }
});

// GET /api/v1/fraud/alerts
router.get('/alerts', auth, (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    // Get user's transactions and identify suspicious patterns
    const userAccounts = findAccountsByUserId(req.user.userId);
    let allTransactions = [];
    
    userAccounts.forEach(account => {
      const accountTransactions = Array.from(mockData.transactions.values())
        .filter(t => t.accountId === account.id);
      allTransactions.push(...accountTransactions);
    });

    // Generate fraud alerts based on transaction patterns
    const alerts = [];
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Check for unusual spending patterns
    const recentTransactions = allTransactions.filter(t => 
      new Date(t.transactionDate) >= last24Hours && t.type === 'PURCHASE'
    );

    if (recentTransactions.length > 10) {
      alerts.push({
        id: uuidv4(),
        type: 'HIGH_VELOCITY',
        severity: 'MEDIUM',
        title: 'Unusual Transaction Velocity',
        description: `${recentTransactions.length} transactions detected in the last 24 hours`,
        timestamp: new Date(),
        affectedTransactions: recentTransactions.slice(0, 5).map(t => t.id),
        recommendations: [
          'Review recent transactions for accuracy',
          'Consider enabling transaction notifications',
          'Contact us if you notice unauthorized activity'
        ]
      });
    }

    // Check for large transactions
    const largeTransactions = allTransactions.filter(t => 
      new Date(t.transactionDate) >= last7Days && t.amount > 1000
    );

    if (largeTransactions.length > 0) {
      alerts.push({
        id: uuidv4(),
        type: 'LARGE_TRANSACTION',
        severity: 'LOW',
        title: 'Large Transaction Alert',
        description: `${largeTransactions.length} large transaction(s) detected in the last 7 days`,
        timestamp: new Date(),
        affectedTransactions: largeTransactions.map(t => t.id),
        recommendations: [
          'Verify large transactions are legitimate',
          'Keep receipts for large purchases',
          'Monitor account statements regularly'
        ]
      });
    }

    // Check for international transactions (simulated)
    const internationalTransactions = allTransactions.filter(t => 
      new Date(t.transactionDate) >= last7Days && 
      Math.random() > 0.9 // Simulate some international transactions
    );

    if (internationalTransactions.length > 0) {
      alerts.push({
        id: uuidv4(),
        type: 'INTERNATIONAL_ACTIVITY',
        severity: 'MEDIUM',
        title: 'International Transaction Alert',
        description: `${internationalTransactions.length} international transaction(s) detected`,
        timestamp: new Date(),
        affectedTransactions: internationalTransactions.map(t => t.id),
        recommendations: [
          'Confirm international travel or purchases',
          'Enable travel notifications for future trips',
          'Report unauthorized international activity immediately'
        ]
      });
    }

    // Sort by severity and timestamp
    alerts.sort((a, b) => {
      const severityOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    // Paginate
    const totalCount = alerts.length;
    const paginatedAlerts = alerts.slice(offset, offset + limit);

    const response = createPaginatedResponse(paginatedAlerts, totalCount, page, limit);

    res.json({
      message: 'Fraud alerts retrieved successfully',
      ...response
    });
  } catch (error) {
    console.error('Get fraud alerts error:', error);
    res.status(500).json({
      error: 'Failed to retrieve fraud alerts',
      message: 'An error occurred while retrieving fraud alerts'
    });
  }
});

module.exports = router;
