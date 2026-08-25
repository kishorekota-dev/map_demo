jest.mock('axios');

const axios = require('axios');
const {
    issueAgentToken,
    validateAgentToken
} = require('../services/authClient');

describe('authClient', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.CHAT_BACKEND_URL = 'http://chat-backend:3006';
        delete process.env.AGENT_AUTHENTICATION_URL;
        delete process.env.AGENT_TOKEN_VALIDATION_URL;
    });

    test('uses the chat-backend token contract and canonical response identity', async () => {
        axios.post.mockResolvedValueOnce({
            data: { token: 'signed-token', userId: 'user-42' }
        });

        const result = await issueAgentToken({
            username: 'support.agent',
            password: 'secret'
        });

        expect(axios.post).toHaveBeenCalledWith(
            'http://chat-backend:3006/auth/token',
            expect.objectContaining({
                userId: 'support.agent',
                credentials: {
                    username: 'support.agent',
                    password: 'secret'
                }
            }),
            expect.objectContaining({ timeout: expect.any(Number) })
        );
        expect(result).toMatchObject({ token: 'signed-token', userId: 'user-42' });
    });

    test('fails closed when remote validation is unavailable', async () => {
        axios.post.mockRejectedValueOnce(new Error('offline'));
        await expect(validateAgentToken('token')).resolves.toEqual(
            expect.objectContaining({ valid: false, userId: null })
        );
    });
});
