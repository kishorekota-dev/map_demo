const { DisputeRepository } = require('../database/repositories');
const logger = require('../utils/logger');

class DisputeController {
  async getAllDisputes(req, res, next) {
    try {
      const userId = req.user.userId;
      const { page = 1, limit = 50, status, disputeType } = req.query;
      const offset = (page - 1) * limit;

      const disputes = await DisputeRepository.findByUserId(userId, { limit, offset, status, disputeType });

      res.json({ success: true, data: disputes });
    } catch (error) {
      logger.error('Error fetching disputes:', error);
      next(error);
    }
  }

  async getDisputeById(req, res, next) {
    try {
      const { disputeId } = req.params;
      const dispute = await DisputeRepository.findById(disputeId);

      if (!dispute) {
        return res.status(404).json({ success: false, error: 'Dispute not found' });
      }

      res.json({ success: true, data: dispute });
    } catch (error) {
      logger.error('Error fetching dispute:', error);
      next(error);
    }
  }

  async createDispute(req, res, next) {
    try {
      const userId = req.user.userId;
      const disputeData = { ...req.body, userId };

      const dispute = await DisputeRepository.create(disputeData);

      logger.info(`Dispute created: ${dispute.dispute_id}, case: ${dispute.case_number}`);

      res.status(201).json({ success: true, message: 'Dispute submitted successfully', data: dispute });
    } catch (error) {
      logger.error('Error creating dispute:', error);
      next(error);
    }
  }

  async updateDispute(req, res, next) {
    try {
      const { disputeId } = req.params;
      const updateData = req.body;

      const dispute = await DisputeRepository.update(disputeId, updateData);

      if (!dispute) {
        return res.status(404).json({ success: false, error: 'Dispute not found' });
      }

      logger.info(`Dispute updated: ${disputeId}`);

      res.json({ success: true, message: 'Dispute updated successfully', data: dispute });
    } catch (error) {
      logger.error('Error updating dispute:', error);
      next(error);
    }
  }

  async resolveDispute(req, res, next) {
    try {
      const { disputeId } = req.params;
      const { resolution, refundAmount, notes } = req.body;

      let dispute;
      if (resolution === 'in_favor') {
        dispute = await DisputeRepository.resolveInFavor(disputeId, refundAmount, notes);
      } else if (resolution === 'against') {
        dispute = await DisputeRepository.resolveAgainst(disputeId, notes);
      } else {
        return res.status(400).json({ success: false, error: 'Invalid resolution type' });
      }

      logger.info(`Dispute resolved: ${disputeId}, resolution: ${resolution}`);

      res.json({ success: true, message: 'Dispute resolved', data: dispute });
    } catch (error) {
      logger.error('Error resolving dispute:', error);
      next(error);
    }
  }

  async withdrawDispute(req, res, next) {
    try {
      const { disputeId } = req.params;
      const { reason } = req.body;

      const dispute = await DisputeRepository.withdraw(disputeId, reason);

      if (!dispute) {
        return res.status(404).json({ success: false, error: 'Dispute not found' });
      }

      logger.info(`Dispute withdrawn: ${disputeId}`);

      res.json({ success: true, message: 'Dispute withdrawn', data: dispute });
    } catch (error) {
      logger.error('Error withdrawing dispute:', error);
      next(error);
    }
  }

  async addEvidence(req, res, next) {
    try {
      const { disputeId } = req.params;
      const { evidenceType, evidenceData } = req.body;

      const dispute = await DisputeRepository.addEvidence(disputeId, evidenceType, evidenceData);

      logger.info(`Evidence added to dispute: ${disputeId}`);

      res.json({ success: true, message: 'Evidence added', data: dispute });
    } catch (error) {
      logger.error('Error adding evidence:', error);
      next(error);
    }
  }
}

module.exports = new DisputeController();
