const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redis = require('redis');
const logger = require('../utils/logger');

// Create Redis client if Redis URL is provided
let redisClient;
if (process.env.REDIS_URL) {
  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL,
      legacyMode: false
    });
    
    redisClient.connect().catch((error) => {
      logger.error('Redis connection failed for rate limiting', { error: error.message });
      redisClient = null;
    });
    
    logger.info('Rate limiting using Redis store');
  } catch (error) {
    logger.error('Failed to create Redis client', { error: error.message });
    redisClient = null;
  }
} else {
  logger.info('Rate limiting using in-memory store');
}

/**
 * Standard rate limiter for API requests
 */
const standardLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests',
    message: 'You have exceeded the rate limit. Please try again later.',
    retryAfter: 'See Retry-After header'
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/health/live';
  },
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent')
    });
    
    res.status(429).json({
      error: 'Too many requests',
      message: 'You have exceeded the rate limit. Please try again later.',
      retryAfter: res.getHeader('Retry-After'),
      timestamp: new Date().toISOString()
    });
  },
  // Use Redis store if available
  ...(redisClient ? {
    store: new RedisStore({
      client: redisClient,
      prefix: 'rl:api:'
    })
  } : {})
});

/**
 * Strict rate limiter for authentication endpoints
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Only 5 attempts per window
  skipSuccessfulRequests: true, // Don't count successful requests
  message: {
    error: 'Too many authentication attempts',
    message: 'Too many failed login attempts. Please try again later.',
    retryAfter: 'See Retry-After header'
  },
  handler: (req, res) => {
    logger.security('Authentication rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent')
    });
    
    res.status(429).json({
      error: 'Too many authentication attempts',
      message: 'Your account has been temporarily locked due to too many failed login attempts.',
      retryAfter: res.getHeader('Retry-After'),
      timestamp: new Date().toISOString()
    });
  },
  ...(redisClient ? {
    store: new RedisStore({
      client: redisClient,
      prefix: 'rl:auth:'
    })
  } : {})
});

/**
 * Lenient rate limiter for public endpoints
 */
const publicLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: {
    error: 'Too many requests',
    message: 'Please slow down. You are making too many requests.',
    retryAfter: 'See Retry-After header'
  },
  standardHeaders: true,
  legacyHeaders: false,
  ...(redisClient ? {
    store: new RedisStore({
      client: redisClient,
      prefix: 'rl:public:'
    })
  } : {})
});

/**
 * Per-user rate limiter (requires authentication)
 */
const createUserLimiter = (windowMs = 60000, max = 100) => {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => {
      // Use user ID if available, otherwise fall back to IP
      return req.userId || req.user?.userId || req.ip;
    },
    message: {
      error: 'User rate limit exceeded',
      message: 'You have made too many requests. Please try again later.',
      retryAfter: 'See Retry-After header'
    },
    handler: (req, res) => {
      logger.warn('User rate limit exceeded', {
        userId: req.userId,
        ip: req.ip,
        path: req.path,
        method: req.method
      });
      
      res.status(429).json({
        error: 'User rate limit exceeded',
        message: 'You have made too many requests. Please try again later.',
        retryAfter: res.getHeader('Retry-After'),
        timestamp: new Date().toISOString()
      });
    },
    ...(redisClient ? {
      store: new RedisStore({
        client: redisClient,
        prefix: 'rl:user:'
      })
    } : {})
  });
};

/**
 * Cleanup function to close Redis connection
 */
const cleanup = async () => {
  if (redisClient) {
    await redisClient.quit();
    logger.info('Rate limiter Redis connection closed');
  }
};

module.exports = standardLimiter;
module.exports.authLimiter = authLimiter;
module.exports.publicLimiter = publicLimiter;
module.exports.createUserLimiter = createUserLimiter;
module.exports.cleanup = cleanup;
