const { TransferRepository } = require('../database/repositories');
const logger = require('../utils/logger');

class TransferController {
  async getAllTransfers(req, res, next) {
    try {
      const userId = req.user.userId;
      const { page = 1, limit = 50, status, transferType } = req.query;
      const offset = (page - 1) * limit;

      const transfers = await TransferRepository.findByUserId(userId, { limit, offset, status, transferType });

      res.json({ success: true, data: transfers });
    } catch (error) {
      logger.error('Error fetching transfers:', error);
      next(error);
    }
  }

  async getTransferById(req, res, next) {
    try {
      const { transferId } = req.params;
      const transfer = await TransferRepository.findById(transferId);

      if (!transfer) {
        return res.status(404).json({ success: false, error: 'Transfer not found' });
      }

      res.json({ success: true, data: transfer });
    } catch (error) {
      logger.error('Error fetching transfer:', error);
      next(error);
    }
  }

  async createTransfer(req, res, next) {
    try {
      const fromUserId = req.user.userId;
      const transferData = { ...req.body, fromUserId };

      const transfer = await TransferRepository.create(transferData);

      logger.info(`Transfer created: ${transfer.transfer_id}`);

      res.status(201).json({ success: true, message: 'Transfer initiated', data: transfer });
    } catch (error) {
      logger.error('Error creating transfer:', error);
      next(error);
    }
  }

  async processTransfer(req, res, next) {
    try {
      const { transferId } = req.params;

      const transfer = await TransferRepository.process(transferId);

      logger.info(`Transfer processed: ${transferId}`);

      res.json({ success: true, message: 'Transfer completed', data: transfer });
    } catch (error) {
      logger.error('Error processing transfer:', error);
      next(error);
    }
  }

  async cancelTransfer(req, res, next) {
    try {
      const { transferId } = req.params;
      const transfer = await TransferRepository.cancel(transferId);

      if (!transfer) {
        return res.status(404).json({ success: false, error: 'Transfer not found or cannot be cancelled' });
      }

      logger.info(`Transfer cancelled: ${transferId}`);

      res.json({ success: true, message: 'Transfer cancelled', data: transfer });
    } catch (error) {
      logger.error('Error cancelling transfer:', error);
      next(error);
    }
  }
}

module.exports = new TransferController();
