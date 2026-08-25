const express = require('express');
const logger = require('../services/logger');
const { issueAgentToken, validateAgentToken } = require('../services/authClient');

const router = express.Router();

router.post('/login', async (req, res) => {
    try {
        const { username, email, password, agentId } = req.body || {};
        const loginName = username || email;

        if (!loginName || !password) {
            return res.status(400).json({
                success: false,
                error: 'Username and password are required'
            });
        }

        const result = await issueAgentToken({
            username: loginName,
            password,
            agentId
        });

        return res.json({
            success: true,
            token: result.token,
            userId: result.userId,
            agent: result.agent
        });
    } catch (error) {
        const upstreamStatus = error.response?.status;
        logger.warn('Agent login failed', {
            error: error.message,
            upstreamStatus
        });

        return res.status(upstreamStatus === 401 ? 401 : 502).json({
            success: false,
            error: upstreamStatus === 401
                ? 'Invalid username or password'
                : 'Authentication service unavailable'
        });
    }
});

router.post('/validate', async (req, res) => {
    const validation = await validateAgentToken(req.body?.token);
    res.status(validation.valid ? 200 : 401).json(validation);
});

module.exports = router;
