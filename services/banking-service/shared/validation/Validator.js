const Joi = require('joi');
const BIANError = require('../models/BIANError');

/**
 * Validation utility using Joi
 */
class Validator {
  /**
   * Validate data against schema
   */
  static validate(data, schema, options = {}) {
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      ...options
    });

    if (error) {
      const details = error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message
      }));
      throw BIANError.validation('Validation failed', { errors: details });
    }

    return value;
  }

  // Common schemas

  static schemas = {
    uuid: Joi.string().uuid(),
    email: Joi.string().email(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/),
    currency: Joi.string().length(3).uppercase(),
    amount: Joi.number().positive().precision(2),
    date: Joi.date().iso(),
    accountNumber: Joi.string().pattern(/^[0-9]{10,16}$/),
    cardNumber: Joi.string().pattern(/^[0-9]{16}$/),
    cvv: Joi.string().pattern(/^[0-9]{3,4}$/),
    pagination: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(10)
    })
  };

  /**
   * Middleware for Express route validation
   */
  static middleware(schema, property = 'body') {
    return (req, res, next) => {
      try {
        req[property] = Validator.validate(req[property], schema);
        next();
      } catch (error) {
        next(error);
      }
    };
  }
}

module.exports = Validator;
