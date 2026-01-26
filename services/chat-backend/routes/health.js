const express = require('express');
const router = express.Router();

/**
 * @route GET /api/health
 * @desc Get service health status
 * @access Public
 */
router.get('/health', async (req, res) => {
    try {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            service: 'poc-chat-backend',
            version: process.env.SERVICE_VERSION || '1.0.0',
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            port: process.env.PORT || 3006
        };

        // Check service dependencies health
        if (req.app.locals.services) {
            const { chatService, agentOrchestrator, sessionManager, socketHandler } = req.app.locals.services;
            
            health.services = {
                chatService: chatService ? chatService.getHealthStatus() : { status: 'unavailable' },
                agentOrchestrator: agentOrchestrator ? agentOrchestrator.getHealthStatus() : { status: 'unavailable' },
                sessionManager: sessionManager ? sessionManager.getHealthStatus() : { status: 'unavailable' },
                socketHandler: socketHandler ? socketHandler.getHealthStatus() : { status: 'unavailable' }
            };
        }

        res.status(200).json(health);
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @route GET /api/metrics
 * @desc Get service metrics
 * @access Private (should be protected in production)
 */
router.get('/metrics', async (req, res) => {
    try {
        const metrics = {
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            env: {
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch
            }
        };

        // Add service-specific metrics if available
        if (req.app.locals.services) {
            const { chatService, agentOrchestrator, sessionManager, socketHandler } = req.app.locals.services;
            
            metrics.services = {};
            
            if (chatService) {
                metrics.services.chat = chatService.getHealthStatus();
            }
            
            if (agentOrchestrator) {
                metrics.services.orchestrator = agentOrchestrator.getHealthStatus();
            }
            
            if (sessionManager) {
                metrics.services.sessions = sessionManager.getHealthStatus();
            }
            
            if (socketHandler) {
                metrics.services.websockets = socketHandler.getHealthStatus();
            }
        }

        res.status(200).json(metrics);
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @route GET /api/status
 * @desc Get detailed service status
 * @access Private
 */
router.get('/status', async (req, res) => {
    try {
        const status = {
            service: 'poc-chat-backend',
            version: process.env.SERVICE_VERSION || '1.0.0',
            status: 'running',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            configuration: {
                port: process.env.PORT || 3006,
                logLevel: process.env.LOG_LEVEL || 'info',
                sessionTTL: process.env.SESSION_TTL || 3600000,
                maxConcurrentAgents: process.env.MAX_CONCURRENT_AGENTS || 10,
                messageRateLimit: process.env.MESSAGE_RATE_LIMIT || 60
            }
        };

        // Add detailed service information
        if (req.app.locals.services) {
            const { chatService, agentOrchestrator, sessionManager, socketHandler } = req.app.locals.services;
            
            status.services = {
                chat: {
                    status: chatService ? 'running' : 'stopped',
                    details: chatService ? chatService.getHealthStatus() : null
                },
                orchestrator: {
                    status: agentOrchestrator ? 'running' : 'stopped',
                    details: agentOrchestrator ? agentOrchestrator.getHealthStatus() : null
                },
                sessions: {
                    status: sessionManager ? 'running' : 'stopped',
                    details: sessionManager ? sessionManager.getHealthStatus() : null
                },
                websockets: {
                    status: socketHandler ? 'running' : 'stopped',
                    details: socketHandler ? socketHandler.getHealthStatus() : null
                }
            };
        }

        res.status(200).json(status);
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;