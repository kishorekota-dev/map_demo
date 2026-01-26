/**
 * BIAN-compliant error class
 * Standardizes error handling across all services
 */
class BIANError extends Error {
  constructor(message, code, statusCode = 500, details = {}) {
    super(message);
    this.name = 'BIANError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert to response object
   */
  toResponse() {
    return {
      status: 'error',
      error: {
        code: this.code,
        message: this.message,
        details: this.details
      },
      metadata: {
        timestamp: this.timestamp,
        version: 'v1'
      }
    };
  }

  // Predefined error types

  static validation(message, details = {}) {
    return new BIANError(message, 'VALIDATION_ERROR', 400, details);
  }

  static notFound(resource, id) {
    return new BIANError(
      `${resource} not found`,
      'NOT_FOUND',
      404,
      { resource, id }
    );
  }

  static unauthorized(message = 'Unauthorized') {
    return new BIANError(message, 'UNAUTHORIZED', 401);
  }

  static forbidden(message = 'Forbidden') {
    return new BIANError(message, 'FORBIDDEN', 403);
  }

  static conflict(message, details = {}) {
    return new BIANError(message, 'CONFLICT', 409, details);
  }

  static internal(message, details = {}) {
    return new BIANError(message, 'INTERNAL_ERROR', 500, details);
  }

  static serviceUnavailable(service) {
    return new BIANError(
      `Service ${service} is unavailable`,
      'SERVICE_UNAVAILABLE',
      503,
      { service }
    );
  }

  static businessLogic(message, details = {}) {
    return new BIANError(message, 'BUSINESS_LOGIC_ERROR', 422, details);
  }

  static insufficientFunds(accountId, required, available) {
    return new BIANError(
      'Insufficient funds',
      'INSUFFICIENT_FUNDS',
      422,
      { accountId, required, available }
    );
  }

  static fraudDetected(reason, riskScore) {
    return new BIANError(
      'Transaction blocked due to fraud detection',
      'FRAUD_DETECTED',
      403,
      { reason, riskScore }
    );
  }
}

module.exports = BIANError;
