const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const logger = require('../services/logger');
const { isQualityDelegation, developmentTokensAllowed } = require('../services/accessTokenPolicy');

const BANKING_SERVICE_URL = process.env.BANKING_SERVICE_URL || 'http://localhost:3005';
const BANKING_AUTH_URL = `${BANKING_SERVICE_URL}/api/v1/auth/login`;

const validateUserCredentials = async (credentials) => {
    if (!credentials?.username || !credentials?.password) {
        return { valid: false, reason: 'missing_credentials' };
    }

    try {
        const response = await axios.post(
            BANKING_AUTH_URL,
            {
                username: credentials.username,
                password: credentials.password
            },
            {
                timeout: 10000,
                headers: { 'Content-Type': 'application/json' }
            }
        );

        const user = response.data?.data?.user;

        return {
            valid: true,
            userId: user?.userId || user?.id,
            user,
            authToken: response.data?.data?.tokens?.accessToken
        };
    } catch (error) {
        return {
            valid: false,
            reason: 'invalid_credentials',
            error: error.response?.data || error.message
        };
    }
};

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

        if (!process.env.JWT_SECRET) return res.status(503).json({ error: 'Authentication is not configured' });
        let isValidUser = false;
        let resolvedUserId = userId;
        let bankToken;

        if (credentials) {
            logger.auth('credential_validation_attempted', userId || 'unknown', {
                credentialType: typeof credentials
            });

            const validation = await validateUserCredentials(credentials);
            if (validation.valid && validation.authToken) {
                try {
                    const verified = jwt.verify(validation.authToken, process.env.JWT_SECRET, { algorithms: ['HS256'] });
                    const subject = verified.userId || verified.sub;
                    const tenant = process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise';
                    if (typeof subject !== 'string' || !subject || verified.type !== 'access' || isQualityDelegation(verified) || verified.tenantId !== tenant) throw new Error('Invalid banking identity');
                    isValidUser = true; resolvedUserId = subject; bankToken = validation.authToken;
                } catch { isValidUser = false; }
            }
        } else if (userId && developmentTokensAllowed()) {
            isValidUser = true;
        }

        if (!isValidUser) {
            logger.auth('authentication_failed', userId, { reason: 'invalid_credentials' });
            return res.status(401).json({
                error: 'Invalid credentials',
                timestamp: new Date().toISOString()
            });
        }

        if (!resolvedUserId) {
            return res.status(400).json({
                error: 'User ID required',
                timestamp: new Date().toISOString()
            });
        }

        if (bankToken) return res.status(200).json({ success: true, token: bankToken, userId: resolvedUserId, tokenType: 'Bearer' });

        // Development-only customer token helper; it never invents operator roles.
        const tokenPayload = {
            userId: resolvedUserId,
            type: 'websocket_auth',
            issued: new Date().toISOString(),
            sessionData: sessionData || {}
        };

        const token = jwt.sign(
            tokenPayload,
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_EXPIRY || '24h',
                issuer: 'poc-chat-backend',
                audience: 'poc-chat-client'
            }
        );

        logger.auth('token_generated', resolvedUserId, {
            tokenType: 'websocket_auth',
            expiresIn: process.env.JWT_EXPIRY || '24h'
        });

        res.status(200).json({
            success: true,
            token,
            userId: resolvedUserId,
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
        if (!developmentTokensAllowed()) return res.status(403).json({ error: 'Development token refresh is available only in development; use the identity provider' });
        if (!process.env.JWT_SECRET) return res.status(503).json({ error: 'Authentication is not configured' });
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
            process.env.JWT_SECRET,
            { ignoreExpiration: true } // We'll check expiration manually
        );

        if (isQualityDelegation(decoded) || decoded.type !== 'websocket_auth') return res.status(401).json({ error: 'Invalid development token' });

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
            process.env.JWT_SECRET,
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
        if (!process.env.JWT_SECRET) return res.status(503).json({ error: 'Authentication is not configured' });
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
            process.env.JWT_SECRET,
            { algorithms: ['HS256'] }
        );

        // Both bank access tokens and development customer tokens are supported.
        const tenant = process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise';
        if (isQualityDelegation(decoded) || !Number.isFinite(decoded.exp) || !['access', 'websocket_auth'].includes(decoded.type)
            || (decoded.tenantId !== undefined && decoded.tenantId !== tenant) || typeof decoded.userId !== 'string' || !decoded.userId) {
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
            roles: [...new Set([decoded.role, ...(Array.isArray(decoded.roles) ? decoded.roles : [])].filter(role => typeof role === 'string').map(role => role.toLowerCase()))],
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

        // This bridge acknowledges client sign-out only. Revocation belongs to
        // the actual identity service; no token blacklist exists in this route.

        if (token) {
            try {
                const decoded = jwt.verify(
                    token,
                    process.env.JWT_SECRET
                );
                
                logger.auth('user_logout', decoded.userId);
            } catch (error) {
                // Token might be invalid, but we still process logout
                logger.auth('logout_with_invalid_token', userId || 'unknown');
            }
        }

        res.status(200).json({
            success: true,
            message: 'Client sign-out acknowledged; use the identity service for token revocation',
            tokenRevoked: false,
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
        if (!process.env.JWT_SECRET) return res.status(503).json({ error: 'Authentication is not configured' });
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
            process.env.JWT_SECRET,
            { algorithms: ['HS256'] }
        );

        const userId = decoded.userId || decoded.sub || decoded.id;
        const tenantId = decoded.tenantId || decoded.tenant_id || process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise';
        if (!userId || decoded.type === 'refresh' || isQualityDelegation(decoded)) {
            return res.status(401).json({ error: 'Invalid access token' });
        }
        if (tenantId !== (process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise')) {
            return res.status(403).json({ error: 'Tenant access denied' });
        }

        req.user = {
            userId: String(userId),
            tenantId,
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
