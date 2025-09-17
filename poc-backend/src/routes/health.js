/**
 * Health Check Routes
 * Provides health check endpoints for monitoring
 */

const express = require('express');
const HealthController = require('../controllers/healthController');
const { asyncHandler } = require('../middleware/errorHandlers');

const router = express.Router();

/**
 * GET /api/health
 * Basic health check
 */
router.get('/',
  asyncHandler(HealthController.basicHealthCheck)
);

/**
 * GET /api/health/detailed
 * Detailed health check with system information
 */
router.get('/detailed',
  asyncHandler(HealthController.detailedHealthCheck)
);

/**
 * GET /api/health/ready
 * Readiness probe for Kubernetes/Docker
 */
router.get('/ready',
  asyncHandler(HealthController.readinessCheck)
);

/**
 * GET /api/health/live
 * Liveness probe for Kubernetes/Docker
 */
router.get('/live',
  asyncHandler(HealthController.livenessCheck)
);

module.exports = router;