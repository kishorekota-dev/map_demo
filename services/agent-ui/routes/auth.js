const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../services/logger');

/**
 * Agent authentication routes.
 *
 * The browser must NOT mint its own tokens. Instead it POSTs agent
 * credentials here, and this server-side endpoint exchanges them for a
 * real, server-issued JWT by calling the upstream authentication service.
 *
 * The returned JWT is what the socket layer (socketManager.validateAgentAuth)
 * verifies against the shared JWT_SECRET.
 */

// Resolve the upstream auth endpoint. Prefer the explicit AGENT_AUTHENTICATION_URL,
// otherwise fall back to the gateway / chat-backend.
function getAuthUrl() {
    if (process.env.AGENT_AUTHENTICATION_URL) {
        return process.env.AGENT_AUTHENTICATION_URL;
    }
    const base =
        process.env.API_GATEWAY_URL ||
        process.env.CHAT_BACKEND_URL ||
        'http://localhost:3006';
    // TODO: confirm the exact upstream login path once the gateway/chat-backend
    // auth contract is finalized. Defaulting to /auth/token.
    return `${base.replace(/\/$/, '')}/auth/token`;
}

// POST /api/auth/login  { email, password } -> { token, agent }
router.post('/login', async (req, res) => {
    try {
        const { email, password, agentId } = req.body || {};

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'email and password are required'
            });
        }

        const authUrl = getAuthUrl();

        const response = await axios.post(
            authUrl,
            { email, password, agentId },
            { timeout: parseInt(process.env.SERVICE_TIMEOUT, 10) || 5000 }
        );

        // Upstream is expected to return a signed JWT (+ optional agent profile).
        const token = response.data.token || response.data.accessToken;
        if (!token) {
            logger.error('Auth upstream did not return a token', { authUrl });
            return res.status(502).json({
                success: false,
                error: 'Authentication service did not return a token'
            });
        }

        return res.json({
            success: true,
            token,
            agent: response.data.agent || response.data.user || null
        });
    } catch (error) {
        const status = error.response?.status || 502;
        logger.warn('Agent login failed', {
            error: error.message,
            status
        });
        return res.status(status === 401 ? 401 : 502).json({
            success: false,
            error:
                status === 401
                    ? 'Invalid credentials'
                    : 'Authentication service unavailable'
        });
    }
});

module.exports = router;
