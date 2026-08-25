const axios = require('axios');

const DEFAULT_CHAT_BACKEND_URL = 'http://localhost:3006';

function getChatBackendBaseUrl() {
    return (process.env.CHAT_BACKEND_URL || DEFAULT_CHAT_BACKEND_URL).replace(/\/$/, '');
}

function getTokenUrl() {
    return process.env.AGENT_AUTHENTICATION_URL || `${getChatBackendBaseUrl()}/auth/token`;
}

function getValidationUrl() {
    return process.env.AGENT_TOKEN_VALIDATION_URL || `${getChatBackendBaseUrl()}/auth/validate`;
}

function getTimeout() {
    return parseInt(process.env.SERVICE_TIMEOUT, 10) || 5000;
}

async function issueAgentToken({ username, password, agentId }) {
    const requestedUserId = agentId || username;
    const response = await axios.post(
        getTokenUrl(),
        {
            userId: requestedUserId,
            credentials: {
                username,
                password
            },
            sessionData: {
                source: 'agent-ui',
                requestedRole: 'agent'
            }
        },
        { timeout: getTimeout() }
    );

    const token = response.data?.token || response.data?.accessToken;
    const userId = response.data?.userId || response.data?.agent?.agentId || requestedUserId;

    if (!token || !userId) {
        const error = new Error('Authentication service returned an incomplete response');
        error.code = 'INVALID_AUTH_RESPONSE';
        throw error;
    }

    return {
        token,
        userId: String(userId),
        agent: response.data?.agent || response.data?.user || null
    };
}

async function validateAgentToken(token) {
    if (!token || typeof token !== 'string') {
        return { valid: false, userId: null };
    }

    try {
        const response = await axios.post(
            getValidationUrl(),
            { token },
            { timeout: getTimeout() }
        );

        return {
            valid: response.data?.valid === true,
            userId: response.data?.userId ? String(response.data.userId) : null,
            tokenData: response.data || null
        };
    } catch (error) {
        return {
            valid: false,
            userId: null,
            status: error.response?.status || 0
        };
    }
}

module.exports = {
    getChatBackendBaseUrl,
    getTokenUrl,
    getValidationUrl,
    issueAgentToken,
    validateAgentToken
};
