const express = require('express');
const router = express.Router();
const logger = require('../services/logger');

/**
 * Queue management routes
 */

// Get queue status
router.get('/status', (req, res) => {
    try {
        const queueService = req.app.get('queueService');
        const status = queueService.getQueueStatus();

        res.json({
            success: true,
            queue: status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error getting queue status', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to get queue status'
        });
    }
});

// Add chat to queue
router.post('/', async (req, res) => {
    try {
        const { chatSession, priority = 'medium', requirements = {} } = req.body;

        if (!chatSession || !chatSession.sessionId || !chatSession.customerId) {
            return res.status(400).json({
                success: false,
                error: 'Invalid chat session data'
            });
        }

        const queueService = req.app.get('queueService');
        const queueResult = await queueService.addToQueue(chatSession, priority, requirements);

        logger.info('Chat added to queue via API', {
            sessionId: chatSession.sessionId,
            customerId: chatSession.customerId,
            priority,
            queueId: queueResult.queueId
        });

        res.status(201).json({
            success: true,
            queue: queueResult
        });
    } catch (error) {
        logger.error('Error adding chat to queue', {
            error: error.message,
            sessionId: req.body.chatSession?.sessionId
        });
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Remove chat from queue
router.delete('/:queueId', async (req, res) => {
    try {
        const { queueId } = req.params;
        const { reason = 'manual_removal' } = req.query;

        const queueService = req.app.get('queueService');
        const result = await queueService.removeFromQueue(queueId, reason);

        if (!result) {
            return res.status(404).json({
                success: false,
                error: 'Queue item not found'
            });
        }

        res.json({
            success: true,
            queueId,
            reason
        });
    } catch (error) {
        logger.error('Error removing chat from queue', {
            error: error.message,
            queueId: req.params.queueId
        });
        res.status(500).json({
            success: false,
            error: 'Failed to remove chat from queue'
        });
    }
});

// Process queue manually
router.post('/process', async (req, res) => {
    try {
        const queueService = req.app.get('queueService');
        await queueService.processQueue();

        logger.info('Queue processing triggered via API');

        res.json({
            success: true,
            message: 'Queue processing initiated',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error processing queue', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to process queue'
        });
    }
});

// Get queue metrics
router.get('/metrics', (req, res) => {
    try {
        const queueService = req.app.get('queueService');
        const metrics = queueService.queueMetrics;
        const status = queueService.getQueueStatus();

        const enhancedMetrics = {
            ...metrics,
            currentStats: {
                totalInQueue: status.totalInQueue,
                averageWaitTime: status.averageWaitTime,
                longestWaitTime: status.longestWaitTime,
                escalationCount: status.escalationCount
            },
            priorityBreakdown: status.statusByPriority,
            efficiency: {
                processedRate: metrics.totalProcessed > 0 ? 
                    (metrics.totalProcessed / (metrics.totalQueued || 1)) * 100 : 0,
                escalationRate: metrics.totalEscalated > 0 ? 
                    (metrics.totalEscalated / (metrics.totalQueued || 1)) * 100 : 0,
                averageProcessingTime: metrics.averageWaitTime
            }
        };

        res.json({
            success: true,
            metrics: enhancedMetrics,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error getting queue metrics', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to get queue metrics'
        });
    }
});

// Get escalation queue
router.get('/escalations', (req, res) => {
    try {
        const queueService = req.app.get('queueService');
        const escalations = Array.from(queueService.escalationQueue.values());

        const escalationList = escalations.map(escalation => ({
            escalationId: escalation.escalationId,
            queueId: escalation.queueId,
            sessionId: escalation.sessionId,
            customerId: escalation.customerId,
            originalPriority: escalation.originalPriority,
            escalatedPriority: escalation.escalatedPriority,
            escalationReason: escalation.escalationReason,
            escalatedAt: escalation.escalatedAt,
            totalWaitTime: escalation.totalWaitTime,
            attempts: escalation.attempts
        }));

        res.json({
            success: true,
            escalations: escalationList,
            total: escalationList.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error getting escalation queue', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to get escalation queue'
        });
    }
});

// Get queue item details
router.get('/items/:queueId', (req, res) => {
    try {
        const { queueId } = req.params;
        const queueService = req.app.get('queueService');
        const queueEntry = queueService.chatQueue.get(queueId);

        if (!queueEntry) {
            return res.status(404).json({
                success: false,
                error: 'Queue item not found'
            });
        }

        const itemDetails = {
            queueId: queueEntry.queueId,
            sessionId: queueEntry.sessionId,
            customerId: queueEntry.customerId,
            customerName: queueEntry.customerName,
            priority: queueEntry.priority,
            requirements: queueEntry.requirements,
            queuedAt: queueEntry.queuedAt,
            estimatedWaitTime: queueEntry.estimatedWaitTime,
            attempts: queueEntry.attempts,
            maxAttempts: queueEntry.maxAttempts,
            escalationReason: queueEntry.escalationReason,
            previousAgent: queueEntry.previousAgent,
            customerData: queueEntry.customerData,
            metadata: queueEntry.metadata,
            currentWaitTime: Date.now() - queueEntry.queuedAt.getTime(),
            position: queueService.getPriorityQueuePosition(queueId)
        };

        res.json({
            success: true,
            item: itemDetails
        });
    } catch (error) {
        logger.error('Error getting queue item', {
            error: error.message,
            queueId: req.params.queueId
        });
        res.status(500).json({
            success: false,
            error: 'Failed to get queue item'
        });
    }
});

// Update queue item priority
router.patch('/items/:queueId/priority', async (req, res) => {
    try {
        const { queueId } = req.params;
        const { priority, reason } = req.body;

        if (!priority) {
            return res.status(400).json({
                success: false,
                error: 'Priority is required'
            });
        }

        const queueService = req.app.get('queueService');
        const queueEntry = queueService.chatQueue.get(queueId);

        if (!queueEntry) {
            return res.status(404).json({
                success: false,
                error: 'Queue item not found'
            });
        }

        const oldPriority = queueEntry.priority;
        queueEntry.priority = queueService.normalizePriority(priority);

        logger.queue('priority_updated', queueId, {
            sessionId: queueEntry.sessionId,
            oldPriority,
            newPriority: queueEntry.priority,
            reason
        });

        res.json({
            success: true,
            queueId,
            oldPriority,
            newPriority: queueEntry.priority,
            reason
        });
    } catch (error) {
        logger.error('Error updating queue item priority', {
            error: error.message,
            queueId: req.params.queueId
        });
        res.status(500).json({
            success: false,
            error: 'Failed to update queue item priority'
        });
    }
});

// Escalate queue item manually
router.post('/items/:queueId/escalate', async (req, res) => {
    try {
        const { queueId } = req.params;
        const { reason = 'manual_escalation' } = req.body;

        const queueService = req.app.get('queueService');
        const queueEntry = queueService.chatQueue.get(queueId);

        if (!queueEntry) {
            return res.status(404).json({
                success: false,
                error: 'Queue item not found'
            });
        }

        const escalation = await queueService.escalateChat(queueEntry, reason);

        res.json({
            success: true,
            escalation: {
                escalationId: escalation.escalationId,
                queueId,
                sessionId: escalation.sessionId,
                escalationReason: reason,
                escalatedPriority: escalation.escalatedPriority,
                escalatedAt: escalation.escalatedAt
            }
        });
    } catch (error) {
        logger.error('Error escalating queue item', {
            error: error.message,
            queueId: req.params.queueId
        });
        res.status(500).json({
            success: false,
            error: 'Failed to escalate queue item'
        });
    }
});

// Get queue statistics by time period
router.get('/stats/:period', (req, res) => {
    try {
        const { period } = req.params; // hour, day, week, month
        const queueService = req.app.get('queueService');
        
        // For now, return current metrics
        // In a real implementation, you would query historical data
        const metrics = queueService.queueMetrics;
        const status = queueService.getQueueStatus();

        const stats = {
            period,
            totalQueued: metrics.totalQueued,
            totalProcessed: metrics.totalProcessed,
            totalEscalated: metrics.totalEscalated,
            averageWaitTime: metrics.averageWaitTime,
            currentQueueSize: status.totalInQueue,
            peakQueueSize: metrics.totalQueued, // This would be tracked separately
            efficiency: {
                processedRate: metrics.totalProcessed > 0 ? 
                    (metrics.totalProcessed / metrics.totalQueued) * 100 : 0,
                escalationRate: metrics.totalEscalated > 0 ? 
                    (metrics.totalEscalated / metrics.totalQueued) * 100 : 0
            },
            priorityStats: status.statusByPriority
        };

        res.json({
            success: true,
            period,
            stats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error getting queue statistics', {
            error: error.message,
            period: req.params.period
        });
        res.status(500).json({
            success: false,
            error: 'Failed to get queue statistics'
        });
    }
});

module.exports = router;