/**
 * BIAN-compliant response wrapper
 * Standardizes API responses across all services
 */
class BIANResponse {
  /**
   * Create successful BIAN response
   */
  static success(data, metadata = {}) {
    return {
      status: 'success',
      data: data,
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
        ...metadata
      }
    };
  }

  /**
   * Create control record response for BIAN initiate
   */
  static initiate(controlRecordId, controlRecordType, data, metadata = {}) {
    return {
      status: 'success',
      controlRecordId: controlRecordId,
      controlRecordType: controlRecordType,
      data: data,
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
        action: 'initiate',
        ...metadata
      }
    };
  }

  /**
   * Create control record response for BIAN retrieve
   */
  static retrieve(controlRecordId, controlRecordType, data, metadata = {}) {
    return {
      status: 'success',
      controlRecordId: controlRecordId,
      controlRecordType: controlRecordType,
      data: data,
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
        action: 'retrieve',
        ...metadata
      }
    };
  }

  /**
   * Create control record response for BIAN update
   */
  static update(controlRecordId, controlRecordType, data, metadata = {}) {
    return {
      status: 'success',
      controlRecordId: controlRecordId,
      controlRecordType: controlRecordType,
      data: data,
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
        action: 'update',
        ...metadata
      }
    };
  }

  /**
   * Create control record response for BIAN control
   */
  static control(controlRecordId, controlRecordType, action, data, metadata = {}) {
    return {
      status: 'success',
      controlRecordId: controlRecordId,
      controlRecordType: controlRecordType,
      data: data,
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1',
        action: action,
        ...metadata
      }
    };
  }

  /**
   * Create paginated response
   */
  static paginated(data, pagination = {}) {
    return {
      status: 'success',
      data: data,
      pagination: {
        page: pagination.page || 1,
        limit: pagination.limit || 10,
        total: pagination.total || data.length,
        totalPages: Math.ceil((pagination.total || data.length) / (pagination.limit || 10))
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1'
      }
    };
  }

  /**
   * Create error response
   */
  static error(message, code, details = {}) {
    return {
      status: 'error',
      error: {
        code: code,
        message: message,
        details: details
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v1'
      }
    };
  }
}

module.exports = BIANResponse;
