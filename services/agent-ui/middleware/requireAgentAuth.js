const crypto = require('crypto');
const { validateAgentToken } = require('../services/authClient');

function safeEqual(left, right) {
    const leftBuffer = Buffer.from(String(left));
    const rightBuffer = Buffer.from(String(right));

    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function requireAgentAuth(req, res, next) {
    const configuredServiceKey = process.env.AGENT_UI_SERVICE_KEY;
    const suppliedServiceKey = req.get('X-Agent-Service-Key');

    if (
        configuredServiceKey &&
        suppliedServiceKey &&
        safeEqual(configuredServiceKey, suppliedServiceKey)
    ) {
        req.agentAuth = { type: 'service' };
        return next();
    }

    const authorization = req.get('Authorization') || '';
    const [scheme, token] = authorization.split(/\s+/, 2);

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
    }

    const validation = await validateAgentToken(token);
    if (!validation.valid || !validation.userId) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token'
        });
    }

    req.agentAuth = {
        type: 'agent',
        userId: validation.userId
    };
    return next();
}

module.exports = requireAgentAuth;
