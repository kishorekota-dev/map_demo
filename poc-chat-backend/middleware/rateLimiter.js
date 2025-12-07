const rateLimit = require('express-rate-limit');
const logger = require('../services/logger');

/**
 * General API rate limiter
 * Limits requests per IP to prevent abuse
 */
const apiLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 300, // 300 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res) => {
        logger.warn('Rate limit exceeded', {
            ip: req.ip,
            path: req.path,
            userAgent: req.get('User-Agent')
        });
        res.status(429).json({
            error: 'Too many requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000) / 1000)
        });
    },
    skip: (req) => {
        // Skip rate limiting for health checks
        return req.path.includes('/health');
    }
});

/**
 * Strict rate limiter for authentication endpoints
 * More restrictive to prevent brute force attacks
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 login attempts per windowMs
    message: {
        error: 'Too many authentication attempts, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.security('auth_rate_limit_exceeded', {
            ip: req.ip,
            path: req.path,
            userAgent: req.get('User-Agent')
        });
        res.status(429).json({
            error: 'Too many authentication attempts',
            message: 'Account temporarily locked. Please try again later.',
            retryAfter: 900 // 15 minutes in seconds
        });
    }
});

/**
 * Message rate limiter
 * Limits chat messages per user to prevent spam
 */
const messageLimiter = rateLimit({
    windowMs: parseInt(process.env.MESSAGE_RATE_LIMIT_WINDOW) || 60000, // 1 minute
    max: parseInt(process.env.MESSAGE_RATE_LIMIT_MAX) || 60, // 60 messages per minute
    message: {
        error: 'Too many messages sent, please slow down.',
        retryAfter: '1 minute'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Rate limit by user ID if authenticated, otherwise by IP
        return req.userId || req.ip;
    },
    handler: (req, res) => {
        logger.warn('Message rate limit exceeded', {
            userId: req.userId,
            ip: req.ip,
            path: req.path
        });
        res.status(429).json({
            error: 'Too many messages',
            message: 'You are sending messages too quickly. Please slow down.',
            retryAfter: 60
        });
    }
});

module.exports = {
    apiLimiter,
    authLimiter,
    messageLimiter
};
