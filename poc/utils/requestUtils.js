/**
 * Request/Response Utility Module
 * 
 * Centralizes common request handling, response formatting, and middleware logic.
 * Provides reusable functions for request tracking, response standardization, and metadata extraction.
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

/**
 * Request tracking information
 * @typedef {Object} RequestTracking
 * @property {string} requestId - Unique request identifier
 * @property {string} sessionId - Session identifier
 * @property {string} clientIP - Client IP address
 * @property {number} startTime - Request start timestamp
 * @property {string} userAgent - User agent string
 * @property {Object} headers - Important request headers
 */

/**
 * Response metadata
 * @typedef {Object} ResponseMetadata
 * @property {string} requestId - Request identifier
 * @property {number} processingTime - Processing time in milliseconds
 * @property {number} statusCode - HTTP status code
 * @property {number} responseSize - Response size in bytes
 * @property {string} completedAt - Completion timestamp
 */

class RequestUtils {
  /**
   * Extracts and initializes request tracking information
   * @param {Object} req - Express request object
   * @returns {RequestTracking} Request tracking data
   */
  static initializeRequestTracking(req) {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] || uuidv4();
    const sessionId = req.headers['x-session-id'] || uuidv4();
    const clientIP = req.ip || req.connection.remoteAddress || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const tracking = {
      requestId,
      sessionId,
      clientIP,
      startTime,
      userAgent,
      headers: {
        contentType: req.headers['content-type'],
        contentLength: req.headers['content-length'],
        authorization: req.headers.authorization ? '[REDACTED]' : undefined,
        origin: req.headers.origin,
        referer: req.headers.referer
      }
    };

    // Attach tracking to request for middleware chain
    req.requestTracking = tracking;

    return tracking;
  }

  /**
   * Logs incoming request with comprehensive metadata
   * @param {Object} req - Express request object
   * @param {string} endpoint - Endpoint description
   * @param {Object} additionalData - Additional logging data
   */
  static logIncomingRequest(req, endpoint = 'API', additionalData = {}) {
    const tracking = req.requestTracking || this.initializeRequestTracking(req);

    logger.info(`${endpoint} request received`, {
      requestId: tracking.requestId,
      sessionId: tracking.sessionId,
      method: req.method,
      url: req.url,
      path: req.path,
      clientIP: tracking.clientIP,
      userAgent: tracking.userAgent,
      contentType: tracking.headers.contentType,
      contentLength: tracking.headers.contentLength,
      timestamp: new Date().toISOString(),
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
      ...additionalData
    });
  }

  /**
   * Creates middleware for automatic request/response logging
   * @param {string} routeName - Name of the route for logging
   * @returns {Function} Express middleware function
   */
  static createLoggingMiddleware(routeName = 'API') {
    return (req, res, next) => {
      // Initialize request tracking
      const tracking = this.initializeRequestTracking(req);
      
      // Log incoming request
      this.logIncomingRequest(req, routeName);

      // Override res.send to capture response
      const originalSend = res.send;
      res.send = function(data) {
        const processingTime = Date.now() - tracking.startTime;
        
        // Log response
        logger.info(`${routeName} request completed`, {
          requestId: tracking.requestId,
          sessionId: tracking.sessionId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          clientIP: tracking.clientIP,
          processingTime: `${processingTime}ms`,
          responseSize: data ? Buffer.byteLength(data, 'utf8') : 0,
          completedAt: new Date().toISOString()
        });

        originalSend.call(this, data);
      };

      next();
    };
  }

  /**
   * Extracts request context for validation and processing
   * @param {Object} req - Express request object
   * @returns {Object} Request context for validation
   */
  static extractRequestContext(req) {
    const tracking = req.requestTracking || this.initializeRequestTracking(req);
    
    return {
      requestId: tracking.requestId,
      sessionId: tracking.sessionId,
      clientIP: tracking.clientIP,
      userAgent: tracking.userAgent,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      queryKeys: Object.keys(req.query),
      headers: tracking.headers,
      method: req.method,
      path: req.path,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Creates a standardized success response
   * @param {any} data - Response data
   * @param {Object} metadata - Additional response metadata
   * @param {number} statusCode - HTTP status code (default: 200)
   * @returns {Object} Standardized success response
   */
  static createSuccessResponse(data, metadata = {}, statusCode = 200) {
    return {
      success: true,
      data,
      statusCode,
      timestamp: new Date().toISOString(),
      metadata: {
        version: '1.0',
        ...metadata
      }
    };
  }

  /**
   * Creates a standardized error response
   * @param {string} error - Error message
   * @param {number} statusCode - HTTP status code (default: 400)
   * @param {Object} metadata - Additional error metadata
   * @returns {Object} Standardized error response
   */
  static createErrorResponse(error, statusCode = 400, metadata = {}) {
    return {
      success: false,
      error,
      statusCode,
      timestamp: new Date().toISOString(),
      metadata: {
        version: '1.0',
        ...metadata
      }
    };
  }

  /**
   * Sends a success response with logging
   * @param {Object} res - Express response object
   * @param {Object} req - Express request object
   * @param {any} data - Response data
   * @param {string} message - Success message for logging
   * @param {Object} metadata - Additional metadata
   * @param {number} statusCode - HTTP status code
   */
  static sendSuccessResponse(res, req, data, message = 'Request successful', metadata = {}, statusCode = 200) {
    const tracking = req.requestTracking;
    
    logger.info(message, {
      requestId: tracking?.requestId,
      sessionId: tracking?.sessionId,
      clientIP: tracking?.clientIP,
      statusCode,
      dataType: typeof data,
      hasData: !!data,
      ...metadata
    });

    const response = this.createSuccessResponse(data, metadata, statusCode);
    res.status(statusCode).json(response);
  }

  /**
   * Sends an error response with logging
   * @param {Object} res - Express response object
   * @param {Object} req - Express request object
   * @param {string} error - Error message
   * @param {number} statusCode - HTTP status code
   * @param {Object} metadata - Additional error metadata
   * @param {string} logLevel - Log level (error, warn, info)
   */
  static sendErrorResponse(res, req, error, statusCode = 400, metadata = {}, logLevel = 'warn') {
    const tracking = req.requestTracking;
    
    logger[logLevel](`Request failed: ${error}`, {
      requestId: tracking?.requestId,
      sessionId: tracking?.sessionId,
      clientIP: tracking?.clientIP,
      statusCode,
      error,
      ...metadata
    });

    const response = this.createErrorResponse(error, statusCode, metadata);
    res.status(statusCode).json(response);
  }

  /**
   * Handles validation errors and sends appropriate response
   * @param {Object} res - Express response object
   * @param {Object} req - Express request object
   * @param {Object} validationResult - Validation result from ValidationUtils
   */
  static handleValidationError(res, req, validationResult) {
    this.sendErrorResponse(
      res, 
      req, 
      validationResult.error, 
      400, 
      validationResult.metadata,
      'warn'
    );
  }

  /**
   * Wraps an async route handler with error handling
   * @param {Function} handler - Async route handler function
   * @returns {Function} Wrapped handler with error catching
   */
  static asyncHandler(handler) {
    return async (req, res, next) => {
      try {
        await handler(req, res, next);
      } catch (error) {
        const tracking = req.requestTracking;
        
        logger.error('Unhandled route error', {
          requestId: tracking?.requestId,
          sessionId: tracking?.sessionId,
          clientIP: tracking?.clientIP,
          error: error.message,
          stack: error.stack,
          method: req.method,
          path: req.path,
          body: req.body,
          query: req.query,
          headers: tracking?.headers
        });

        this.sendErrorResponse(
          res,
          req,
          'Internal server error occurred',
          500,
          {
            requestId: tracking?.requestId,
            errorType: error.constructor.name,
            timestamp: new Date().toISOString()
          },
          'error'
        );
      }
    };
  }

  /**
   * Extracts client information from request
   * @param {Object} req - Express request object
   * @returns {Object} Client information
   */
  static extractClientInfo(req) {
    const tracking = req.requestTracking;
    
    return {
      ip: tracking?.clientIP || 'unknown',
      userAgent: tracking?.userAgent || 'unknown',
      origin: req.headers.origin,
      referer: req.headers.referer,
      acceptLanguage: req.headers['accept-language'],
      acceptEncoding: req.headers['accept-encoding'],
      connectionType: req.headers.connection,
      xForwardedFor: req.headers['x-forwarded-for'],
      xRealIp: req.headers['x-real-ip']
    };
  }

  /**
   * Creates request metadata for processing logs
   * @param {Object} req - Express request object
   * @param {Object} additionalData - Additional metadata
   * @returns {Object} Request metadata
   */
  static createRequestMetadata(req, additionalData = {}) {
    const tracking = req.requestTracking;
    const clientInfo = this.extractClientInfo(req);
    
    return {
      requestId: tracking?.requestId,
      sessionId: tracking?.sessionId,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      url: req.url,
      client: clientInfo,
      hasBody: !!req.body && Object.keys(req.body).length > 0,
      hasQuery: Object.keys(req.query).length > 0,
      contentType: req.headers['content-type'],
      ...additionalData
    };
  }

  /**
   * Validates and extracts pagination parameters
   * @param {Object} query - Query parameters
   * @returns {Object} Pagination parameters with defaults
   */
  static extractPaginationParams(query) {
    const limit = Math.min(Math.max(parseInt(query.limit) || 50, 1), 100);
    const offset = Math.max(parseInt(query.offset) || 0, 0);
    
    return {
      limit,
      offset,
      page: Math.floor(offset / limit) + 1
    };
  }

  /**
   * Creates pagination metadata for responses
   * @param {number} total - Total number of items
   * @param {Object} params - Pagination parameters
   * @returns {Object} Pagination metadata
   */
  static createPaginationMetadata(total, params) {
    const { limit, offset } = params;
    const totalPages = Math.ceil(total / limit);
    const currentPage = Math.floor(offset / limit) + 1;
    
    return {
      pagination: {
        total,
        limit,
        offset,
        currentPage,
        totalPages,
        hasNext: currentPage < totalPages,
        hasPrevious: currentPage > 1,
        nextOffset: (currentPage < totalPages) ? offset + limit : null,
        previousOffset: (currentPage > 1) ? Math.max(0, offset - limit) : null
      }
    };
  }
}

module.exports = RequestUtils;