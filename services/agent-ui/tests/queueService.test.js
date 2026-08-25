jest.mock('../services/redisClient', () => ({
    getRedisClient: jest.fn().mockResolvedValue(null)
}));
jest.mock('../services/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    queue: jest.fn()
}));

const QueueService = require('../services/queueService');

describe('QueueService assignment lifecycle', () => {
    test('keeps a notified chat queued until explicit acceptance', async () => {
        const service = new QueueService();
        await service.ready;
        service.persistQueue = jest.fn().mockResolvedValue();
        service.on('getAvailableAgents', ({ callback }) => callback([{
            agentId: 'agent-1',
            name: 'Agent One',
            department: 'customer-service',
            capabilities: ['general-support'],
            skillLevel: 'intermediate',
            priority: 100,
            currentChats: 0,
            performance: { totalChats: 0, resolvedChats: 0, customerRating: 0 }
        }]));
        service.on('assignmentRequest', jest.fn().mockResolvedValue(true));

        await service.addToQueue({
            sessionId: 'session-1',
            customerId: 'customer-1',
            customerName: 'Customer'
        });

        const entry = service.findBySession('session-1');
        expect(entry).not.toBeNull();
        expect(entry.pendingAssignment).toMatchObject({ agentId: 'agent-1' });
        expect(service.getQueueStatus().totalInQueue).toBe(1);

        await service.acceptAssignment('session-1', 'agent-1');
        expect(service.getQueueStatus().totalInQueue).toBe(0);
        await service.cleanup();
    });
});
