const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const logger = require('../services/logger');

/**
 * @route POST /auth/token
 * @desc Generate authentication token for WebSocket connection
 * @access Public (but should validate credentials)
 */
router.post('/token', async (req, res) => {
    try {
        const { userId, credentials, sessionData } = req.body;

        // Basic validation
        if (!userId) {
            return res.status(400).json({
                error: 'User ID required',
                timestamp: new Date().toISOString()
            });
        }

        // TODO: Implement actual credential validation
        // For demo purposes, accept any user ID
        let isValidUser = true;
        
        if (credentials) {
            // Here you would validate against your user database
            // isValidUser = await validateUserCredentials(credentials);
            logger.auth('credential_validation_attempted', userId, { 
                credentialType: typeof credentials
            });
        }

        if (!isValidUser) {
            logger.auth('authentication_failed', userId, { reason: 'invalid_credentials' });
            return res.status(401).json({
                error: 'Invalid credentials',
                timestamp: new Date().toISOString()
            });
        }

        // Generate JWT token for WebSocket authentication
        const tokenPayload = {
            userId,
            type: 'websocket_auth',
            issued: new Date().toISOString(),
            sessionData: sessionData || {}
        };

        const token = jwt.sign(
            tokenPayload,
            process.env.JWT_SECRET || 'dev-jwt-secret-change-me-in-production-2024',
            {
                expiresIn: process.env.JWT_EXPIRY || '24h',
                issuer: 'poc-chat-backend',
                audience: 'poc-chat-client'
            }
        );

        logger.auth('token_generated', userId, {
            tokenType: 'websocket_auth',
            expiresIn: process.env.JWT_EXPIRY || '24h'
        });

        res.status(200).json({
            success: true,
            token,
            userId,
            expiresIn: process.env.JWT_EXPIRY || '24h',
            tokenType: 'Bearer',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Token generation error', {
            error: error.message,
            userId: req.body?.userId
        });

        res.status(500).json({
            error: 'Failed to generate token',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @route POST /auth/refresh
 * @desc Refresh authentication token
 * @access Private
 */
router.post('/refresh', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                error: 'Token required',
                timestamp: new Date().toISOString()
            });
        }

        // Verify existing token
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'dev-jwt-secret-change-me-in-production-2024',
            { ignoreExpiration: true } // We'll check expiration manually
        );

        // Check if token is not too old (allow refresh within 7 days of expiration)
        const now = Math.floor(Date.now() / 1000);
        const maxRefreshTime = decoded.exp + (7 * 24 * 60 * 60); // 7 days after expiration

        if (now > maxRefreshTime) {
            logger.auth('refresh_rejected', decoded.userId, { reason: 'token_too_old' });
            return res.status(401).json({
                error: 'Token too old for refresh',
                timestamp: new Date().toISOString()
            });
        }

        // Generate new token
        const newTokenPayload = {
            userId: decoded.userId,
            type: 'websocket_auth',
            issued: new Date().toISOString(),
            sessionData: decoded.sessionData || {}
        };

        const newToken = jwt.sign(
            newTokenPayload,
            process.env.JWT_SECRET || 'dev-jwt-secret-change-me-in-production-2024',
            {
                expiresIn: process.env.JWT_EXPIRY || '24h',
                issuer: 'poc-chat-backend',
                audience: 'poc-chat-client'
            }
        );

        logger.auth('token_refreshed', decoded.userId);

        res.status(200).json({
            success: true,
            token: newToken,
            userId: decoded.userId,
            expiresIn: process.env.JWT_EXPIRY || '24h',
            tokenType: 'Bearer',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            logger.auth('refresh_failed', 'unknown', { reason: 'invalid_token' });
            return res.status(401).json({
                error: 'Invalid token',
                timestamp: new Date().toISOString()
            });
        }

        logger.error('Token refresh error', {
            error: error.message,
            tokenProvided: !!req.body?.token
        });

        res.status(500).json({
            error: 'Failed to refresh token',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @route POST /auth/validate
 * @desc Validate authentication token
 * @access Private
 */
router.post('/validate', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                error: 'Token required',
                timestamp: new Date().toISOString()
            });
        }

        // Verify token
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'dev-jwt-secret-change-me-in-production-2024'
        );

        // Check token type
        if (decoded.type !== 'websocket_auth') {
            return res.status(401).json({
                error: 'Invalid token type',
                timestamp: new Date().toISOString()
            });
        }

        logger.auth('token_validated', decoded.userId);

        res.status(200).json({
            valid: true,
            userId: decoded.userId,
            issued: decoded.issued,
            expires: new Date(decoded.exp * 1000).toISOString(),
            sessionData: decoded.sessionData,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            logger.auth('validation_failed', 'unknown', { reason: 'invalid_token' });
            return res.status(401).json({
                valid: false,
                error: 'Invalid token',
                timestamp: new Date().toISOString()
            });
        }

        if (error.name === 'TokenExpiredError') {
            logger.auth('validation_failed', 'unknown', { reason: 'token_expired' });
            return res.status(401).json({
                valid: false,
                error: 'Token expired',
                timestamp: new Date().toISOString()
            });
        }

        logger.error('Token validation error', {
            error: error.message,
            tokenProvided: !!req.body?.token
        });

        res.status(500).json({
            error: 'Failed to validate token',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @route POST /auth/logout
 * @desc Logout user (invalidate token)
 * @access Private
 */
router.post('/logout', async (req, res) => {
    try {
        const { token, userId } = req.body;

        // In a production system, you would:
        // 1. Add token to a blacklist/revocation list
        // 2. Clear any server-side sessions
        // 3. Notify other services of logout

        if (token) {
            try {
                const decoded = jwt.verify(
                    token,
                    process.env.JWT_SECRET || 'dev-jwt-secret-change-me-in-production-2024'
                );
                
                logger.auth('user_logout', decoded.userId);
            } catch (error) {
                // Token might be invalid, but we still process logout
                logger.auth('logout_with_invalid_token', userId || 'unknown');
            }
        }

        res.status(200).json({
            success: true,
            message: 'Logged out successfully',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Logout error', {
            error: error.message,
            userId: req.body?.userId
        });

        res.status(500).json({
            error: 'Failed to logout',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @route GET /auth/status
 * @desc Get authentication service status
 * @access Public
 */
router.get('/status', (req, res) => {
    try {
        res.status(200).json({
            service: 'authentication',
            status: 'operational',
            features: {
                tokenGeneration: true,
                tokenRefresh: true,
                tokenValidation: true,
                logout: true
            },
            configuration: {
                jwtExpiry: process.env.JWT_EXPIRY || '24h',
                issuer: 'poc-chat-backend',
                audience: 'poc-chat-client'
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Auth status error', { error: error.message });
        
        res.status(500).json({
            error: 'Failed to get auth status',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Middleware to verify JWT token
 */
const verifyToken = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'No token provided',
                timestamp: new Date().toISOString()
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'dev-jwt-secret-change-me-in-production-2024'
        );

        req.user = {
            userId: decoded.userId,
            sessionData: decoded.sessionData
        };

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                error: 'Invalid token',
                timestamp: new Date().toISOString()
            });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expired',
                timestamp: new Date().toISOString()
            });
        }

        logger.error('Token verification error', { error: error.message });
        
        return res.status(500).json({
            error: 'Token verification failed',
            timestamp: new Date().toISOString()
        });
    }
};

// Export both the router and middleware
module.exports = { router, verifyToken };