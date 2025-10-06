const { CardRepository } = require('../database/repositories');
const logger = require('../utils/logger');

class CardController {
  async getAllCards(req, res, next) {
    try {
      const userId = req.user.userId;
      const { status, page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      const cards = await CardRepository.findByUserId(userId, { status, limit, offset });

      // Mask sensitive data before sending
      const maskedCards = cards.map(card => ({
        ...card,
        card_number_encrypted: undefined,
        cvv_encrypted: undefined,
        pin_hash: undefined
      }));

      res.json({ success: true, data: maskedCards });
    } catch (error) {
      logger.error('Error fetching cards:', error);
      next(error);
    }
  }

  async getCardById(req, res, next) {
    try {
      const { cardId } = req.params;
      const card = await CardRepository.findById(cardId);

      if (!card) {
        return res.status(404).json({ success: false, error: 'Card not found' });
      }

      // Mask sensitive data
      delete card.card_number_encrypted;
      delete card.cvv_encrypted;
      delete card.pin_hash;

      res.json({ success: true, data: card });
    } catch (error) {
      logger.error('Error fetching card:', error);
      next(error);
    }
  }

  async createCard(req, res, next) {
    try {
      const userId = req.user.userId;
      const cardData = { ...req.body, userId };

      const card = await CardRepository.create(cardData);

      logger.info(`Card created: ${card.card_id} for user: ${userId}`);

      delete card.card_number_encrypted;
      delete card.cvv_encrypted;
      delete card.pin_hash;

      res.status(201).json({ success: true, message: 'Card created successfully', data: card });
    } catch (error) {
      logger.error('Error creating card:', error);
      next(error);
    }
  }

  async updateCard(req, res, next) {
    try {
      const { cardId } = req.params;
      const card = await CardRepository.update(cardId, req.body);

      if (!card) {
        return res.status(404).json({ success: false, error: 'Card not found' });
      }

      res.json({ success: true, message: 'Card updated successfully', data: card });
    } catch (error) {
      logger.error('Error updating card:', error);
      next(error);
    }
  }

  async blockCard(req, res, next) {
    try {
      const { cardId } = req.params;
      const { reason } = req.body;

      const card = await CardRepository.block(cardId, reason);

      if (!card) {
        return res.status(404).json({ success: false, error: 'Card not found' });
      }

      logger.info(`Card blocked: ${cardId}, reason: ${reason}`);

      res.json({ success: true, message: 'Card blocked successfully', data: card });
    } catch (error) {
      logger.error('Error blocking card:', error);
      next(error);
    }
  }

  async activateCard(req, res, next) {
    try {
      const { cardId } = req.params;
      const card = await CardRepository.activate(cardId);

      if (!card) {
        return res.status(404).json({ success: false, error: 'Card not found' });
      }

      logger.info(`Card activated: ${cardId}`);

      res.json({ success: true, message: 'Card activated successfully', data: card });
    } catch (error) {
      logger.error('Error activating card:', error);
      next(error);
    }
  }

  async replaceCard(req, res, next) {
    try {
      const { cardId } = req.params;
      const newCardData = req.body;

      const newCard = await CardRepository.replace(cardId, newCardData);

      logger.info(`Card replaced: old=${cardId}, new=${newCard.card_id}`);

      res.json({ success: true, message: 'Card replaced successfully', data: newCard });
    } catch (error) {
      logger.error('Error replacing card:', error);
      next(error);
    }
  }
}

module.exports = new CardController();
