/**
 * Response Helper Utilities
 * Standardized response formatting for API endpoints
 */

/**
 * Create a standardized success response
 * @param {any} data - The response data
 * @param {string} message - Success message
 * @param {object} meta - Additional metadata
 * @returns {object} Formatted response object
 */
function createResponse(data, message = 'Success', meta = {}) {
  const response = {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  };

  // Add metadata if provided
  if (meta && Object.keys(meta).length > 0) {
    response.meta = meta;
  }

  return response;
}

/**
 * Create a standardized error response
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {any} details - Additional error details
 * @param {string} requestId - Request ID for tracking
 * @returns {object} Formatted error response object
 */
function createErrorResponse(message, statusCode = 500, details = null, requestId = null) {
  const response = {
    success: false,
    error: {
      message,
      statusCode,
      timestamp: new Date().toISOString()
    }
  };

  // Add error details if provided
  if (details) {
    response.error.details = details;
  }

  // Add request ID if provided
  if (requestId) {
    response.error.requestId = requestId;
  }

  return response;
}

/**
 * Create a paginated response
 * @param {array} items - Array of items
 * @param {number} total - Total number of items
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {string} message - Success message
 * @returns {object} Formatted paginated response
 */
function createPaginatedResponse(items, total, page = 1, limit = 10, message = 'Data retrieved successfully') {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPreviousPage = page > 1;

  return createResponse(
    {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage,
        hasPreviousPage,
        nextPage: hasNextPage ? page + 1 : null,
        previousPage: hasPreviousPage ? page - 1 : null
      }
    },
    message,
    {
      itemCount: items.length,
      totalItems: total
    }
  );
}

/**
 * Create a validation error response
 * @param {array} validationErrors - Array of validation errors
 * @param {string} requestId - Request ID for tracking
 * @returns {object} Formatted validation error response
 */
function createValidationErrorResponse(validationErrors, requestId = null) {
  const formattedErrors = validationErrors.map(error => ({
    field: error.param || error.path,
    message: error.msg || error.message,
    value: error.value,
    location: error.location
  }));

  return createErrorResponse(
    'Validation failed',
    400,
    {
      validationErrors: formattedErrors,
      errorCount: formattedErrors.length
    },
    requestId
  );
}

/**
 * Create a not found error response
 * @param {string} resource - The resource that was not found
 * @param {string} identifier - The identifier used to search for the resource
 * @param {string} requestId - Request ID for tracking
 * @returns {object} Formatted not found error response
 */
function createNotFoundResponse(resource, identifier = null, requestId = null) {
  let message = `${resource} not found`;
  if (identifier) {
    message += ` with identifier: ${identifier}`;
  }

  return createErrorResponse(
    message,
    404,
    {
      resource,
      identifier,
      suggestion: `Please verify the ${resource.toLowerCase()} identifier and try again`
    },
    requestId
  );
}

/**
 * Create an unauthorized error response
 * @param {string} message - Custom error message
 * @param {string} requestId - Request ID for tracking
 * @returns {object} Formatted unauthorized error response
 */
function createUnauthorizedResponse(message = 'Unauthorized access', requestId = null) {
  return createErrorResponse(
    message,
    401,
    {
      suggestion: 'Please provide valid authentication credentials'
    },
    requestId
  );
}

/**
 * Create a forbidden error response
 * @param {string} message - Custom error message
 * @param {string} requestId - Request ID for tracking
 * @returns {object} Formatted forbidden error response
 */
function createForbiddenResponse(message = 'Forbidden: Insufficient permissions', requestId = null) {
  return createErrorResponse(
    message,
    403,
    {
      suggestion: 'Contact administrator for required permissions'
    },
    requestId
  );
}

/**
 * Create a rate limit error response
 * @param {string} retryAfter - Time to wait before retrying
 * @param {string} requestId - Request ID for tracking
 * @returns {object} Formatted rate limit error response
 */
function createRateLimitResponse(retryAfter = '60', requestId = null) {
  return createErrorResponse(
    'Rate limit exceeded',
    429,
    {
      retryAfter,
      suggestion: `Please wait ${retryAfter} seconds before making another request`
    },
    requestId
  );
}

/**
 * Create a server error response
 * @param {string} message - Custom error message
 * @param {string} requestId - Request ID for tracking
 * @param {boolean} includeStack - Whether to include stack trace in development
 * @returns {object} Formatted server error response
 */
function createServerErrorResponse(message = 'Internal server error', requestId = null, includeStack = false) {
  const details = {
    suggestion: 'Please try again later or contact support if the problem persists'
  };

  // Only include stack trace in development environment
  if (includeStack && process.env.NODE_ENV === 'development') {
    details.note = 'Stack trace available in server logs';
  }

  return createErrorResponse(
    message,
    500,
    details,
    requestId
  );
}

/**
 * Wrap async route handlers to catch errors
 * @param {function} fn - Async function to wrap
 * @returns {function} Wrapped function with error handling
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create response with performance metrics
 * @param {any} data - Response data
 * @param {string} message - Success message
 * @param {number} startTime - Request start time
 * @param {object} additionalMeta - Additional metadata
 * @returns {object} Response with performance metrics
 */
function createResponseWithMetrics(data, message = 'Success', startTime = Date.now(), additionalMeta = {}) {
  const processingTime = Date.now() - startTime;
  
  return createResponse(
    data,
    message,
    {
      ...additionalMeta,
      performance: {
        processingTimeMs: processingTime,
        timestamp: new Date().toISOString()
      }
    }
  );
}

module.exports = {
  createResponse,
  createErrorResponse,
  createPaginatedResponse,
  createValidationErrorResponse,
  createNotFoundResponse,
  createUnauthorizedResponse,
  createForbiddenResponse,
  createRateLimitResponse,
  createServerErrorResponse,
  asyncHandler,
  createResponseWithMetrics
};