/**
 * POC Banking Routes
 * 
 * Defines API endpoints for banking operations and chat-based banking interactions.
 */

const express = require('express');
const PocBankingController = require('../controllers/poc-banking.controller');
const logger = require('../utils/logger');

const router = express.Router();
const bankingController = new PocBankingController();

// Middleware to log banking API requests
router.use((req, res, next) => {
  logger.info('Banking API request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

/**
 * Chat-based banking endpoint
 * POST /api/banking/chat
 * Process natural language banking requests
 */
router.post('/chat', async (req, res) => {
  await bankingController.processBankingMessage(req, res);
});

/**
 * Account balance endpoint
 * GET /api/banking/balance/:userId?
 * Get account balance for specific user
 */
router.get('/balance/:userId?', async (req, res) => {
  await bankingController.getAccountBalance(req, res);
});

/**
 * Transaction history endpoint
 * GET /api/banking/transactions/:userId?
 * Get transaction history with optional limit
 */
router.get('/transactions/:userId?', async (req, res) => {
  await bankingController.getTransactionHistory(req, res);
});

/**
 * Money transfer endpoint
 * POST /api/banking/transfer/:userId?
 * Process money transfer between accounts
 */
router.post('/transfer/:userId?', async (req, res) => {
  await bankingController.transferMoney(req, res);
});

/**
 * Account information endpoint
 * GET /api/banking/account/:userId?
 * Get detailed account information
 */
router.get('/account/:userId?', async (req, res) => {
  try {
    const userId = req.params.userId || req.user?.id || 'user123';
    const result = await bankingController.bankingService.getAccountInfo(userId);
    res.json(result);
  } catch (error) {
    logger.error('Error in account info endpoint', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Card information endpoint
 * GET /api/banking/cards/:userId?
 * Get user's card information
 */
router.get('/cards/:userId?', async (req, res) => {
  try {
    const userId = req.params.userId || req.user?.id || 'user123';
    const result = await bankingController.bankingService.getCardInfo(userId);
    res.json(result);
  } catch (error) {
    logger.error('Error in card info endpoint', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Card status update endpoint
 * PUT /api/banking/cards/:cardId/status
 * Block or unblock a card
 */
router.put('/cards/:cardId/status', async (req, res) => {
  try {
    const { cardId } = req.params;
    const { action, userId = 'user123' } = req.body;
    
    if (!action || !['block', 'unblock'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Valid action (block or unblock) is required'
      });
    }
    
    const result = await bankingController.bankingService.updateCardStatus(userId, cardId, action);
    res.json(result);
  } catch (error) {
    logger.error('Error in card status update endpoint', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Loan information endpoint
 * GET /api/banking/loans/:userId?
 * Get user's loan information
 */
router.get('/loans/:userId?', async (req, res) => {
  try {
    const userId = req.params.userId || req.user?.id || 'user123';
    const result = await bankingController.bankingService.getLoanInfo(userId);
    res.json(result);
  } catch (error) {
    logger.error('Error in loan info endpoint', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Bill payment endpoint
 * POST /api/banking/bills/pay
 * Process bill payment
 */
router.post('/bills/pay', async (req, res) => {
  try {
    const { userId = 'user123', ...billData } = req.body;
    
    const result = await bankingController.bankingService.payBill(userId, billData);
    res.json(result);
  } catch (error) {
    logger.error('Error in bill payment endpoint', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Banking help endpoint
 * GET /api/banking/help
 * Get available banking services and commands
 */
router.get('/help', async (req, res) => {
  await bankingController.getBankingHelp(req, res);
});

/**
 * Banking intent detection endpoint
 * POST /api/banking/intent
 * Detect banking intent from natural language message
 */
router.post('/intent', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }
    
    const intentResult = await bankingController.intentService.detectBankingIntent(message);
    
    res.json({
      success: true,
      data: {
        intent: intentResult,
        isBankingRelated: bankingController.intentService.isBankingRelated(message)
      }
    });
  } catch (error) {
    logger.error('Error in intent detection endpoint', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Banking service status endpoint
 * GET /api/banking/status
 * Check banking service health and availability
 */
router.get('/status', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        service: 'POC Banking Service',
        status: 'operational',
        version: '1.0.0',
        features: [
          'Account Balance Inquiry',
          'Transaction History',
          'Money Transfer',
          'Card Management',
          'Loan Information',
          'Bill Payment',
          'Natural Language Processing',
          'Intent Detection'
        ],
        endpoints: {
          chat: '/api/banking/chat',
          balance: '/api/banking/balance/:userId',
          transactions: '/api/banking/transactions/:userId',
          transfer: '/api/banking/transfer/:userId',
          cards: '/api/banking/cards/:userId',
          loans: '/api/banking/loans/:userId',
          billPay: '/api/banking/bills/pay',
          help: '/api/banking/help',
          intent: '/api/banking/intent'
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error in status endpoint', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;