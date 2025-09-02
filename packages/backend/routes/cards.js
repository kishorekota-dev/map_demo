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
  generateCardNumber,
  maskCardNumber,
  getPaginationParams,
  createPaginatedResponse 
} = require('../utils/helpers');
const { 
  mockData, 
  findAccountsByUserId,
  findCardsByUserId 
} = require('../models/mockData');

const router = express.Router();

// Validation schemas
const createCardSchema = Joi.object({
  accountId: Joi.string().required(),
  cardType: Joi.string().valid('VISA', 'MASTERCARD', 'AMEX', 'DISCOVER').default('VISA'),
  deliveryMethod: Joi.string().valid('STANDARD', 'EXPRESS', 'PICKUP').default('STANDARD'),
  deliveryAddress: Joi.object({
    street: Joi.string().max(100).required(),
    city: Joi.string().max(50).required(),
    state: Joi.string().max(50).required(),
    zipCode: Joi.string().max(20).required(),
    country: Joi.string().max(50).default('USA')
  }).required(),
  reason: Joi.string().valid(
    'NEW_ACCOUNT',
    'REPLACEMENT_LOST',
    'REPLACEMENT_STOLEN',
    'REPLACEMENT_DAMAGED',
    'ADDITIONAL_CARD',
    'UPGRADE'
  ).required()
});

const updateCardSchema = Joi.object({
  status: Joi.string().valid('ACTIVE', 'BLOCKED', 'CANCELLED', 'EXPIRED').optional(),
  dailyLimit: Joi.number().min(0).optional(),
  monthlyLimit: Joi.number().min(0).optional(),
  isBlocked: Joi.boolean().optional(),
  blockedTransactions: Joi.boolean().optional()
});

const blockCardSchema = Joi.object({
  reason: Joi.string().valid(
    'LOST',
    'STOLEN',
    'SUSPECTED_FRAUD',
    'DAMAGED',
    'COMPROMISED',
    'CUSTOMER_REQUEST',
    'OTHER'
  ).required(),
  details: Joi.string().max(255).optional(),
  requestReplacement: Joi.boolean().default(false)
});

const querySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  accountId: Joi.string().optional(),
  status: Joi.string().valid('ACTIVE', 'BLOCKED', 'CANCELLED', 'EXPIRED', 'PENDING').optional(),
  cardType: Joi.string().valid('VISA', 'MASTERCARD', 'AMEX', 'DISCOVER').optional()
});

// GET /api/v1/cards
router.get('/', 
  createResourceSecurityMiddleware('cards', 'read'),
  validateQuery(querySchema), 
  async (req, res) => {
    try {
      const { page, limit } = getPaginationParams(req.query);
      const { offset, actualLimit } = getPaginationParams(page, limit);
      const { accountId, status, cardType } = req.query;
      const userRole = req.user.role;
      const userId = req.user.userId;

      // Start with cards based on role access
      let cards = SecurityUtils.filterByUserAccess(mockData.cards, userRole, userId);

      // Apply filters
      if (accountId) {
        // Verify user owns the account or has admin access
        if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(userRole)) {
          const account = mockData.accounts.get(accountId);
          if (!account || account.userId !== userId) {
            return res.status(403).json({
              error: 'Access denied',
              message: 'You do not have access to this account'
            });
          }
        }
        cards = cards.filter(card => card.accountId === accountId);
      }

      if (status) {
        cards = cards.filter(card => card.status === status);
      }

      if (cardType) {
        cards = cards.filter(card => card.cardType === cardType);
      }

      // Sort by issued date (newest first)
      cards.sort((a, b) => new Date(b.issuedDate) - new Date(a.issuedDate));

      // Paginate
      const totalCount = cards.length;
      const paginatedCards = cards.slice(offset, offset + actualLimit);

      // Sanitize and format response based on user role
      const formattedCards = paginatedCards.map(card => {
        const account = mockData.accounts.get(card.accountId);
        let sanitizedCard = SecurityUtils.sanitizeDataByRole(card, userRole, ['cvv']);
        
        return {
          id: sanitizedCard.id,
          accountId: sanitizedCard.accountId,
          cardNumber: sanitizedCard.cardNumber,
          cardType: sanitizedCard.cardType,
          expiryDate: sanitizedCard.expiryDate,
          status: sanitizedCard.status,
          isBlocked: sanitizedCard.isBlocked,
          blockedTransactions: sanitizedCard.blockedTransactions,
          fraudProtectionEnabled: sanitizedCard.fraudProtectionEnabled,
          issuedDate: sanitizedCard.issuedDate,
          lastUsed: sanitizedCard.lastUsed,
          dailyLimit: sanitizedCard.dailyLimit,
          monthlyLimit: sanitizedCard.monthlyLimit,
          account: account ? {
            accountNumber: account.accountNumber,
            accountType: account.accountType
          } : null
        };
      });

      // Log access
      await SecurityUtils.logSecurityEvent(req, 'CARD_LIST_ACCESS', {
        totalCards: formattedCards.length,
        filters: { accountId, status, cardType }
      });

      const response = createPaginatedResponse(formattedCards, totalCount, page, limit);
      const secureResponse = createSecureResponse({
        message: 'Cards retrieved successfully',
        ...response
      }, userRole);

      res.json(secureResponse);
    } catch (error) {
      console.error('Get cards error:', error);
      res.status(500).json({
        error: 'Failed to retrieve cards',
        message: 'An error occurred while retrieving cards'
      });
    }
  }
);

// GET /api/v1/cards/:id
router.get('/:id', 
  createResourceSecurityMiddleware('cards', 'read'),
  async (req, res) => {
    try {
      const cardId = req.params.id;
      const card = mockData.cards.get(cardId);
      const userRole = req.user.role;
      const userId = req.user.userId;

      if (!card) {
        return res.status(404).json({
          error: 'Card not found',
          message: 'Card not found'
        });
      }

      // Check if user has access to this card
      if (!SecurityUtils.hasResourceAccess(card, userRole, userId)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this card'
        });
      }

      // Get account information
      const account = mockData.accounts.get(card.accountId);

      // Sanitize card data based on user role
      const sanitizedCard = SecurityUtils.sanitizeDataByRole(card, userRole, ['cvv']);

      // Format response
      const formattedCard = {
        id: sanitizedCard.id,
        accountId: sanitizedCard.accountId,
        cardNumber: sanitizedCard.cardNumber,
        cardType: sanitizedCard.cardType,
        expiryDate: sanitizedCard.expiryDate,
        status: sanitizedCard.status,
        isBlocked: sanitizedCard.isBlocked,
        blockedTransactions: sanitizedCard.blockedTransactions,
        fraudProtectionEnabled: sanitizedCard.fraudProtectionEnabled,
        issuedDate: sanitizedCard.issuedDate,
        lastUsed: sanitizedCard.lastUsed,
        dailyLimit: sanitizedCard.dailyLimit,
        monthlyLimit: sanitizedCard.monthlyLimit,
        blockHistory: sanitizedCard.blockHistory || [],
        account: account ? {
          id: account.id,
          accountNumber: account.accountNumber,
          accountType: account.accountType,
          status: account.status
        } : null
      };

      // Log access
      await SecurityUtils.logSecurityEvent(req, 'CARD_DETAIL_ACCESS', {
        cardId: cardId,
        cardType: card.cardType
      });

      const secureResponse = createSecureResponse({
        message: 'Card retrieved successfully',
        card: formattedCard
      }, userRole);

      res.json(secureResponse);
    } catch (error) {
      console.error('Get card error:', error);
      res.status(500).json({
        error: 'Failed to retrieve card',
        message: 'An error occurred while retrieving card'
      });
    }
  }
);

// POST /api/v1/cards/request
router.post('/request', 
  createResourceSecurityMiddleware('cards', 'create'),
  validateRequest(createCardSchema), 
  async (req, res) => {
    try {
      const { 
        accountId, 
        cardType, 
        deliveryMethod, 
        deliveryAddress, 
        reason 
      } = req.body;
      const userRole = req.user.role;
      const userId = req.user.userId;

      // Verify user owns the account or has admin access
      const account = mockData.accounts.get(accountId);
      if (!account) {
        return res.status(404).json({
          error: 'Account not found',
          message: 'The specified account does not exist'
        });
      }

      if (!SecurityUtils.hasResourceAccess(account, userRole, userId)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this account'
        });
      }

      // Check account status
      if (account.status !== 'ACTIVE') {
        return res.status(400).json({
          error: 'Account inactive',
          message: 'Cannot issue card for inactive account'
        });
      }

    // Check if this is a replacement and block the old card
    if (['REPLACEMENT_LOST', 'REPLACEMENT_STOLEN', 'REPLACEMENT_DAMAGED'].includes(reason)) {
      const existingCards = Array.from(mockData.cards.values())
        .filter(card => card.accountId === accountId && card.status === 'ACTIVE');
      
      existingCards.forEach(card => {
        card.status = 'CANCELLED';
        card.isBlocked = true;
        card.lastModified = new Date();
        if (!card.blockHistory) card.blockHistory = [];
        card.blockHistory.push({
          date: new Date(),
          reason: reason.replace('REPLACEMENT_', ''),
          blockedBy: req.user.email,
          details: 'Automatically blocked due to replacement request'
        });
        mockData.cards.set(card.id, card);
      });
    }

    // Generate new card details
    const fullCardNumber = generateCardNumber();
    const maskedCardNumber = maskCardNumber(fullCardNumber);
    const expiryYear = new Date().getFullYear() + 4;
    const expiryMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    const cvv = String(Math.floor(Math.random() * 900) + 100);

    // Create new card request
    const newCard = {
      id: uuidv4(),
      accountId,
      userId: req.user.userId,
      cardNumber: maskedCardNumber,
      fullCardNumber: fullCardNumber, // In real system, this would be encrypted
      cardType,
      expiryDate: `${expiryMonth}/${expiryYear.toString().slice(-2)}`,
      cvv: '***',
      fullCvv: cvv, // In real system, this would be encrypted
      status: 'PENDING',
      isBlocked: false,
      blockedTransactions: false,
      fraudProtectionEnabled: true,
      issuedDate: new Date(),
      lastUsed: null,
      dailyLimit: 2000.00,
      monthlyLimit: 10000.00,
      deliveryMethod,
      deliveryAddress,
      requestReason: reason,
      estimatedDelivery: new Date(Date.now() + (deliveryMethod === 'EXPRESS' ? 2 : 7) * 24 * 60 * 60 * 1000),
      trackingNumber: `TRK${Math.floor(Math.random() * 1000000000)}`,
      blockHistory: [],
      createdAt: new Date(),
      lastModified: new Date()
    };

    mockData.cards.set(newCard.id, newCard);

    // Simulate card production and shipping process
    setTimeout(() => {
      newCard.status = 'ACTIVE';
      newCard.lastModified = new Date();
      mockData.cards.set(newCard.id, newCard);
    }, 5000); // 5 seconds to simulate processing

    // Log card creation
    await SecurityUtils.logSecurityEvent(req, 'CARD_CREATION', {
      cardId: newCard.id,
      accountId: accountId,
      cardType: cardType,
      reason: reason
    });

    // Format response (sanitize sensitive data)
    const sanitizedCard = SecurityUtils.sanitizeDataByRole(newCard, userRole, ['fullCardNumber', 'fullCvv']);
    const formattedCard = {
      id: sanitizedCard.id,
      accountId: sanitizedCard.accountId,
      cardNumber: sanitizedCard.cardNumber,
      cardType: sanitizedCard.cardType,
      status: sanitizedCard.status,
      requestReason: sanitizedCard.requestReason,
      deliveryMethod: sanitizedCard.deliveryMethod,
      estimatedDelivery: sanitizedCard.estimatedDelivery,
      trackingNumber: sanitizedCard.trackingNumber,
      account: {
        id: account.id,
        accountNumber: account.accountNumber,
        accountType: account.accountType
      }
    };

    const secureResponse = createSecureResponse({
      message: 'Card request submitted successfully',
      card: formattedCard
    }, userRole);

    res.status(201).json(secureResponse);
  } catch (error) {
    console.error('Request card error:', error);
    res.status(500).json({
      error: 'Failed to request card',
      message: 'An error occurred while requesting card'
    });
  }
});

// PUT /api/v1/cards/:id
router.put('/:id', 
  createResourceSecurityMiddleware('cards', 'update'),
  validateRequest(updateCardSchema), 
  async (req, res) => {
    try {
      const cardId = req.params.id;
      const card = mockData.cards.get(cardId);
      const userRole = req.user.role;
      const userId = req.user.userId;

      if (!card) {
        return res.status(404).json({
          error: 'Card not found',
          message: 'Card not found'
        });
      }

      // Check if user has access to update this card
      if (!SecurityUtils.hasResourceAccess(card, userRole, userId)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to update this card'
        });
      }

      const { status, dailyLimit, monthlyLimit, isBlocked, blockedTransactions } = req.body;

      // Update card
      if (status) card.status = status;
      if (dailyLimit !== undefined) card.dailyLimit = dailyLimit;
    if (monthlyLimit !== undefined) card.monthlyLimit = monthlyLimit;
    if (isBlocked !== undefined) card.isBlocked = isBlocked;
    if (blockedTransactions !== undefined) card.blockedTransactions = blockedTransactions;

    card.lastModified = new Date();
    mockData.cards.set(card.id, card);

    // Log card update
    await SecurityUtils.logSecurityEvent(req, 'CARD_UPDATE', {
      cardId: cardId,
      updatedFields: Object.keys(req.body)
    });

    // Format response (sanitize sensitive data)
    const sanitizedCard = SecurityUtils.sanitizeDataByRole(card, userRole, ['fullCardNumber', 'fullCvv']);
    const formattedCard = {
      id: sanitizedCard.id,
      accountId: sanitizedCard.accountId,
      cardNumber: sanitizedCard.cardNumber,
      cardType: sanitizedCard.cardType,
      expiryDate: sanitizedCard.expiryDate,
      status: sanitizedCard.status,
      isBlocked: sanitizedCard.isBlocked,
      blockedTransactions: sanitizedCard.blockedTransactions,
      fraudProtectionEnabled: sanitizedCard.fraudProtectionEnabled,
      dailyLimit: sanitizedCard.dailyLimit,
      monthlyLimit: sanitizedCard.monthlyLimit,
      lastModified: sanitizedCard.lastModified
    };

    const secureResponse = createSecureResponse({
      message: 'Card updated successfully',
      card: formattedCard
    }, userRole);

    res.json(secureResponse);
  } catch (error) {
    console.error('Update card error:', error);
    res.status(500).json({
      error: 'Failed to update card',
      message: 'An error occurred while updating card'
    });
  }
});

// POST /api/v1/cards/:id/block
router.post('/:id/block', 
  createResourceSecurityMiddleware('cards', 'update'),
  validateRequest(blockCardSchema), 
  async (req, res) => {
    try {
      const { reason, details, requestReplacement } = req.body;
      const cardId = req.params.id;
      const card = mockData.cards.get(cardId);
      const userRole = req.user.role;
      const userId = req.user.userId;

      if (!card) {
        return res.status(404).json({
          error: 'Card not found',
          message: 'Card not found'
        });
      }

      // Check if user has access to block this card
      if (!SecurityUtils.hasResourceAccess(card, userRole, userId)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to block this card'
        });
      }

      if (card.isBlocked) {
        return res.status(400).json({
          error: 'Card already blocked',
          message: 'This card is already blocked'
        });
      }

      // Block the card
      card.isBlocked = true;
      card.status = 'BLOCKED';
      card.blockedTransactions = true;
      card.lastModified = new Date();

      // Add to block history
      if (!card.blockHistory) card.blockHistory = [];
      card.blockHistory.push({
        date: new Date(),
        reason,
        details: details || '',
        blockedBy: req.user.email,
        requestReplacement
      });

      mockData.cards.set(card.id, card);

    // If replacement requested, create a new card request
    let replacementCard = null;
    if (requestReplacement) {
      const account = mockData.accounts.get(card.accountId);
      if (account && account.status === 'ACTIVE') {
        const fullCardNumber = generateCardNumber();
        const maskedCardNumber = maskCardNumber(fullCardNumber);
        const expiryYear = new Date().getFullYear() + 4;
        const expiryMonth = String(new Date().getMonth() + 1).padStart(2, '0');
        const cvv = String(Math.floor(Math.random() * 900) + 100);

        replacementCard = {
          id: uuidv4(),
          accountId: card.accountId,
          userId: req.user.userId,
          cardNumber: maskedCardNumber,
          fullCardNumber: fullCardNumber,
          cardType: card.cardType,
          expiryDate: `${expiryMonth}/${expiryYear.toString().slice(-2)}`,
          cvv: '***',
          fullCvv: cvv,
          status: 'PENDING',
          isBlocked: false,
          blockedTransactions: false,
          fraudProtectionEnabled: true,
          issuedDate: new Date(),
          lastUsed: null,
          dailyLimit: card.dailyLimit,
          monthlyLimit: card.monthlyLimit,
          requestReason: `REPLACEMENT_${reason}`,
          estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          trackingNumber: `TRK${Math.floor(Math.random() * 1000000000)}`,
          blockHistory: [],
          createdAt: new Date(),
          lastModified: new Date()
        };

        mockData.cards.set(replacementCard.id, replacementCard);

        // Auto-activate replacement card
        setTimeout(() => {
          replacementCard.status = 'ACTIVE';
          replacementCard.lastModified = new Date();
          mockData.cards.set(replacementCard.id, replacementCard);
        }, 3000);
      }
    }

    // Log card blocking
    await SecurityUtils.logSecurityEvent(req, 'CARD_BLOCKED', {
      cardId: cardId,
      reason: reason,
      requestReplacement: requestReplacement
    });

    // Sanitize response data
    const sanitizedCard = SecurityUtils.sanitizeDataByRole(card, userRole, ['fullCardNumber', 'fullCvv']);
    const response = createSecureResponse({
      message: 'Card blocked successfully',
      card: {
        id: sanitizedCard.id,
        cardNumber: sanitizedCard.cardNumber,
        status: sanitizedCard.status,
        isBlocked: sanitizedCard.isBlocked,
        blockReason: reason,
        blockDate: new Date()
      }
    }, userRole);

    if (replacementCard) {
      const sanitizedReplacement = SecurityUtils.sanitizeDataByRole(replacementCard, userRole, ['fullCardNumber', 'fullCvv']);
      response.replacementCard = {
        id: sanitizedReplacement.id,
        cardNumber: sanitizedReplacement.cardNumber,
        status: sanitizedReplacement.status,
        estimatedDelivery: sanitizedReplacement.estimatedDelivery,
        trackingNumber: sanitizedReplacement.trackingNumber
      };
    }

    res.json(response);
  } catch (error) {
    console.error('Block card error:', error);
    res.status(500).json({
      error: 'Failed to block card',
      message: 'An error occurred while blocking card'
    });
  }
});

// POST /api/v1/cards/:id/unblock
router.post('/:id/unblock', 
  createResourceSecurityMiddleware('cards', 'update'),
  async (req, res) => {
    try {
      const cardId = req.params.id;
      const card = mockData.cards.get(cardId);
      const userRole = req.user.role;
      const userId = req.user.userId;

      if (!card) {
        return res.status(404).json({
          error: 'Card not found',
          message: 'Card not found'
        });
      }

      // Check if user has access to unblock this card
      if (!SecurityUtils.hasResourceAccess(card, userRole, userId)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to unblock this card'
        });
      }

      if (!card.isBlocked) {
        return res.status(400).json({
          error: 'Card not blocked',
          message: 'This card is not currently blocked'
        });
      }

    // Check if card can be unblocked (not if lost/stolen)
    const lastBlock = card.blockHistory ? card.blockHistory[card.blockHistory.length - 1] : null;
    if (lastBlock && ['LOST', 'STOLEN'].includes(lastBlock.reason)) {
      return res.status(400).json({
        error: 'Cannot unblock card',
        message: 'Cards blocked due to loss or theft cannot be unblocked. Please request a replacement.'
      });
    }

    // Unblock the card
    card.isBlocked = false;
    card.status = 'ACTIVE';
    card.blockedTransactions = false;
    card.lastModified = new Date();

    // Add to block history
    if (!card.blockHistory) card.blockHistory = [];
    card.blockHistory.push({
      date: new Date(),
      reason: 'UNBLOCKED',
      details: 'Card unblocked by customer request',
      blockedBy: req.user.email
    });

    mockData.cards.set(card.id, card);

    // Log card unblocking
    await SecurityUtils.logSecurityEvent(req, 'CARD_UNBLOCKED', {
      cardId: cardId
    });

    // Sanitize response
    const sanitizedCard = SecurityUtils.sanitizeDataByRole(card, userRole, ['fullCardNumber', 'fullCvv']);
    const secureResponse = createSecureResponse({
      message: 'Card unblocked successfully',
      card: {
        id: sanitizedCard.id,
        cardNumber: sanitizedCard.cardNumber,
        status: sanitizedCard.status,
        isBlocked: sanitizedCard.isBlocked,
        unblockDate: new Date()
      }
    }, userRole);

    res.json(secureResponse);
  } catch (error) {
    console.error('Unblock card error:', error);
    res.status(500).json({
      error: 'Failed to unblock card',
      message: 'An error occurred while unblocking card'
    });
  }
});

// GET /api/v1/cards/:id/pin
router.get('/:id/pin', 
  createResourceSecurityMiddleware('cards', 'read'),
  async (req, res) => {
    try {
      const cardId = req.params.id;
      const card = mockData.cards.get(cardId);
      const userRole = req.user.role;
      const userId = req.user.userId;

      if (!card) {
        return res.status(404).json({
          error: 'Card not found',
          message: 'Card not found'
        });
      }

      // Check if user has access to this card's PIN
      if (!SecurityUtils.hasResourceAccess(card, userRole, userId)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this card\'s PIN'
        });
      }

      // Log PIN access attempt
      await SecurityUtils.logSecurityEvent(req, 'CARD_PIN_ACCESS', {
        cardId: cardId,
        cardType: card.cardType
      });

      // In a real system, PIN would be retrieved securely with additional verification
      const secureResponse = createSecureResponse({
        message: 'PIN retrieval initiated',
        notice: 'Your PIN will be sent to your registered phone number via SMS',
        maskedPhone: req.user.phone ? req.user.phone.replace(/(\d{3})\d{3}(\d{4})/, '$1***$2') : null,
        cardNumber: card.cardNumber
      }, userRole);

      res.json(secureResponse);
    } catch (error) {
      console.error('Get PIN error:', error);
      res.status(500).json({
        error: 'Failed to retrieve PIN',
        message: 'An error occurred while retrieving PIN'
      });
    }
  }
);

// POST /api/v1/cards/:id/pin/change
router.post('/:id/pin/change', 
  createResourceSecurityMiddleware('cards', 'update'),
  async (req, res) => {
    try {
      const { currentPin, newPin } = req.body;
      const cardId = req.params.id;
      const card = mockData.cards.get(cardId);
      const userRole = req.user.role;
      const userId = req.user.userId;

      if (!card) {
        return res.status(404).json({
          error: 'Card not found',
          message: 'Card not found'
        });
      }

      // Check if user has access to change this card's PIN
      if (!SecurityUtils.hasResourceAccess(card, userRole, userId)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to change this card\'s PIN'
        });
      }

      if (!currentPin || !newPin) {
        return res.status(400).json({
          error: 'Invalid input',
          message: 'Current PIN and new PIN are required'
        });
      }

      if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
        return res.status(400).json({
          error: 'Invalid PIN format',
          message: 'PIN must be exactly 4 digits'
        });
      }

      // In a real system, PIN would be verified and updated securely
      card.lastModified = new Date();
      mockData.cards.set(card.id, card);

      // Log PIN change
      await SecurityUtils.logSecurityEvent(req, 'CARD_PIN_CHANGE', {
        cardId: cardId,
        cardType: card.cardType
      });

      const secureResponse = createSecureResponse({
        message: 'PIN changed successfully',
        cardNumber: card.cardNumber,
        changeDate: new Date()
      }, userRole);

      res.json(secureResponse);
    } catch (error) {
      console.error('Change PIN error:', error);
      res.status(500).json({
        error: 'Failed to change PIN',
        message: 'An error occurred while changing PIN'
      });
    }
  }
);

// GET /api/v1/cards/:id/limits
router.get('/:id/limits', 
  createResourceSecurityMiddleware('cards', 'read'),
  async (req, res) => {
    try {
      const cardId = req.params.id;
      const card = mockData.cards.get(cardId);
      const userRole = req.user.role;
      const userId = req.user.userId;

      if (!card) {
        return res.status(404).json({
          error: 'Card not found',
          message: 'Card not found'
        });
      }

      // Check if user has access to this card's limits
      if (!SecurityUtils.hasResourceAccess(card, userRole, userId)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this card\'s limits'
        });
      }

      const limits = {
        cardId: card.id,
        cardNumber: card.cardNumber,
        dailyLimit: card.dailyLimit,
        monthlyLimit: card.monthlyLimit,
        atmDailyLimit: card.dailyLimit * 0.5, // 50% of daily limit for ATM
        currentDailyUsage: 0, // Would be calculated from today's transactions
        currentMonthlyUsage: 0, // Would be calculated from this month's transactions
        lastUpdated: card.lastModified
      };

      // Log limits access
      await SecurityUtils.logSecurityEvent(req, 'CARD_LIMITS_ACCESS', {
        cardId: cardId,
        cardType: card.cardType
      });

      const secureResponse = createSecureResponse({
        message: 'Card limits retrieved successfully',
        limits
      }, userRole);

      res.json(secureResponse);
    } catch (error) {
      console.error('Get card limits error:', error);
      res.status(500).json({
        error: 'Failed to retrieve card limits',
        message: 'An error occurred while retrieving card limits'
      });
    }
  }
);

module.exports = router;
