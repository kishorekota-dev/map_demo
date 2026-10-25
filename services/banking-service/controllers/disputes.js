const { DisputeRepository, TransactionRepository, AccountRepository } = require('../database/repositories');
const logger = require('../utils/logger');

// Statuses after which a dispute is decided; only staff may change them further.
const TERMINAL_STATUSES = new Set(['resolved_in_favor', 'resolved_against', 'partially_resolved', 'withdrawn']);
const CUSTOMER_EDITABLE_FIELDS = new Set(['description', 'reason', 'amountDisputed']);

const exceedsTransaction = (transaction, amount) =>
  amount !== undefined && transaction && Number(amount) > Math.abs(Number(transaction.amount));

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
      const transaction = req.ownedTransaction ||
        await TransactionRepository.findById(req.body.transactionId);
      const account = transaction && (req.ownedAccount ||
        await AccountRepository.findById(transaction.account_id));

      if (!transaction || !account) {
        return res.status(404).json({ success: false, error: 'Transaction account not found' });
      }

      if (exceedsTransaction(transaction, req.body.amountDisputed)) {
        return res.status(400).json({ success: false, error: 'Disputed amount cannot exceed the transaction amount', code: 'DISPUTE_AMOUNT_EXCEEDS_TRANSACTION' });
      }

      const disputeData = {
        ...req.body,
        userId,
        accountId: account.account_id,
        transactionId: transaction.transaction_id,
        description: req.body.description || req.body.reason,
        customerNotes: req.body.reason,
        evidenceProvided: req.body.evidence
      };

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

      // Customers may correct the details of an open dispute. Status, resolution
      // and refunds are decided by staff through the resolve endpoint.
      if (req.user?.role !== 'admin') {
        const forbidden = Object.keys(updateData).filter(field => !CUSTOMER_EDITABLE_FIELDS.has(field));
        if (forbidden.length) {
          return res.status(403).json({ success: false, error: 'Dispute status and resolution are managed by the bank', code: 'DISPUTE_FIELD_FORBIDDEN', fields: forbidden });
        }
        if (TERMINAL_STATUSES.has(req.ownedDispute?.status)) {
          return res.status(409).json({ success: false, error: 'A decided dispute cannot be changed', code: 'DISPUTE_CLOSED' });
        }
        if (updateData.amountDisputed !== undefined && req.ownedDispute) {
          const transaction = await TransactionRepository.findById(req.ownedDispute.transaction_id);
          if (exceedsTransaction(transaction, updateData.amountDisputed)) {
            return res.status(400).json({ success: false, error: 'Disputed amount cannot exceed the transaction amount', code: 'DISPUTE_AMOUNT_EXCEEDS_TRANSACTION' });
          }
        }
      }

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

      const existing = await DisputeRepository.findById(disputeId);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Dispute not found' });
      }
      if (TERMINAL_STATUSES.has(existing.status)) {
        return res.status(409).json({ success: false, error: 'Dispute has already been decided', code: 'DISPUTE_CLOSED' });
      }

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

      if (TERMINAL_STATUSES.has(req.ownedDispute?.status)) {
        return res.status(409).json({ success: false, error: 'A decided dispute cannot be withdrawn', code: 'DISPUTE_CLOSED' });
      }

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
      const { evidenceType, evidenceData, description, fileUrl } = req.body;

      const dispute = await DisputeRepository.addEvidence(
        disputeId,
        evidenceType,
        evidenceData || { description, fileUrl }
      );

      logger.info(`Evidence added to dispute: ${disputeId}`);

      res.json({ success: true, message: 'Evidence added', data: dispute });
    } catch (error) {
      logger.error('Error adding evidence:', error);
      next(error);
    }
  }
}

module.exports = new DisputeController();
