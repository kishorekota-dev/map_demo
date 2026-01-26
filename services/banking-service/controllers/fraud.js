const { FraudRepository } = require('../database/repositories');
const logger = require('../utils/logger');

class FraudController {
  async getAllAlerts(req, res, next) {
    try {
      const userId = req.user.userId;
      const { page = 1, limit = 50, status, severity } = req.query;
      const offset = (page - 1) * limit;

      const alerts = await FraudRepository.findByUserId(userId, { limit, offset, status, severity });

      res.json({ success: true, data: alerts });
    } catch (error) {
      logger.error('Error fetching fraud alerts:', error);
      next(error);
    }
  }

  async getAlertById(req, res, next) {
    try {
      const { alertId } = req.params;
      const alert = await FraudRepository.findById(alertId);

      if (!alert) {
        return res.status(404).json({ success: false, error: 'Fraud alert not found' });
      }

      res.json({ success: true, data: alert });
    } catch (error) {
      logger.error('Error fetching fraud alert:', error);
      next(error);
    }
  }

  async createAlert(req, res, next) {
    try {
      const alertData = req.body;

      const alert = await FraudRepository.create(alertData);

      logger.warn(`Fraud alert created: ${alert.alert_id}, type: ${alert.alert_type}, severity: ${alert.severity}`);

      res.status(201).json({ success: true, message: 'Fraud alert created', data: alert });
    } catch (error) {
      logger.error('Error creating fraud alert:', error);
      next(error);
    }
  }

  async updateAlert(req, res, next) {
    try {
      const { alertId } = req.params;
      const updateData = req.body;

      const alert = await FraudRepository.update(alertId, updateData);

      if (!alert) {
        return res.status(404).json({ success: false, error: 'Fraud alert not found' });
      }

      logger.info(`Fraud alert updated: ${alertId}`);

      res.json({ success: true, message: 'Fraud alert updated', data: alert });
    } catch (error) {
      logger.error('Error updating fraud alert:', error);
      next(error);
    }
  }

  async confirmFraud(req, res, next) {
    try {
      const { alertId } = req.params;
      const { actionTaken, notes } = req.body;
      const resolvedBy = req.user.userId;

      const alert = await FraudRepository.confirmFraud(alertId, resolvedBy, notes, actionTaken);

      logger.warn(`Fraud confirmed: ${alertId}`);

      res.json({ success: true, message: 'Fraud confirmed', data: alert });
    } catch (error) {
      logger.error('Error confirming fraud:', error);
      next(error);
    }
  }

  async markAsFalsePositive(req, res, next) {
    try {
      const { alertId } = req.params;
      const { notes } = req.body;
      const resolvedBy = req.user.userId;

      const alert = await FraudRepository.markAsFalsePositive(alertId, resolvedBy, notes);

      logger.info(`Fraud alert marked as false positive: ${alertId}`);

      res.json({ success: true, message: 'Marked as false positive', data: alert });
    } catch (error) {
      logger.error('Error marking as false positive:', error);
      next(error);
    }
  }
}

module.exports = new FraudController();
