require('dotenv').config({
    path: process.env.NODE_ENV === 'production' ? '.env' : '.env.development'
});

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Import services
const logger = require('./services/logger');
const AgentService = require('./services/agentService');
const QueueService = require('./services/queueService');
const ChatClientService = require('./services/chatClientService');
const SocketManager = require('./services/socketManager');
const { closeRedisClient } = require('./services/redisClient');
const requireAgentAuth = require('./middleware/requireAgentAuth');

// Import routes
const agentsRoutes = require('./routes/agents');
const queueRoutes = require('./routes/queue');
const authRoutes = require('./routes/auth');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 8081;

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:"]
        }
    }
}));

app.use(compression());
const configuredOrigins = process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS;
const allowedOrigins = configuredOrigins
    ? configuredOrigins.split(',').map(origin => origin.trim()).filter(Boolean)
    : ['http://localhost:3000', 'http://localhost:8081'];
app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP'
});
app.use('/api', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Request logging
app.use((req, res, next) => {
    logger.info('HTTP Request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    next();
});

// Initialize services
let agentService, queueService, chatClientService, socketManager;

function connectChatBackendAtStartup(client) {
    return client.connect().catch(error => {
        logger.warn('Chat backend not available, continuing without connection', {
            error: error.message,
            url: process.env.CHAT_BACKEND_URL || 'http://localhost:3006'
        });
        return false;
    });
}

async function initializeServices() {
    try {
        logger.info('Initializing services...');
        
        // Initialize core services
        agentService = new AgentService();
        queueService = new QueueService();
        chatClientService = new ChatClientService();
        socketManager = new SocketManager(server);

        await Promise.all([agentService.ready, queueService.ready]);
        
        // Store services in app for route access
        app.set('agentService', agentService);
        app.set('queueService', queueService);
        app.set('chatClientService', chatClientService);
        app.set('socketManager', socketManager);
        
        // Setup service integrations
        await setupServiceIntegrations();
        
        // Start the service-to-service connection immediately. ChatClientService
        // uses a configured token when present, otherwise it signs a short-lived
        // service-principal JWT from JWT_SECRET.
        connectChatBackendAtStartup(chatClientService);
        
        logger.info('All services initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize services', { error: error.message });
        process.exit(1);
    }
}

async function setupServiceIntegrations() {
    const ensureChatBackend = async () => {
        if (chatClientService.isConnected) return;
        await chatClientService.connect();
    };

    queueService.on('getAvailableAgents', ({ requirements, callback }) => {
        callback(agentService.getAvailableAgents(requirements));
    });

    queueService.on('assignmentRequest', async ({ queueEntry, agentId, agent }) => {
        await socketManager.sendChatAssignment(agentId, {
            ...queueEntry,
            selectedAgent: agent
        });
        logger.info('Chat assignment sent to agent', {
            queueId: queueEntry.queueId,
            agentId,
            sessionId: queueEntry.sessionId
        });
    });

    socketManager.on('agentRegistered', async ({ agent, socket }) => {
        await agentService.registerAgent(agent);
        await ensureChatBackend().catch(error => {
            logger.warn('Agent authenticated but chat backend connection is unavailable', {
                agentId: agent.agentId,
                error: error.message
            });
        });
        logger.info('Agent registered via socket', {
            agentId: agent.agentId,
            socketId: socket.id
        });
        await queueService.processQueue();
    });

    socketManager.on('agentDisconnected', async ({ agent }) => {
        if (isShuttingDown) return;
        const stored = agentService.getAgent(agent.agentId);
        if (stored) {
            await agentService.updateAgentStatus(agent.agentId, 'offline', {
                reason: 'socket_disconnected'
            });
        }
    });

    socketManager.on('updateAgentStatus', async ({ agentId, statusData }) => {
        const updated = await agentService.updateAgentStatus(
            agentId,
            statusData.status,
            statusData.details
        );
        if (chatClientService.isConnected) {
            await chatClientService.updateAgentStatus(agentId, statusData.status, statusData.details);
        }
        await queueService.processQueue();
        return { status: updated.status };
    });

    socketManager.on('acceptChat', async ({ agentId, chatData }) => {
        const queueEntry = queueService.findBySession(chatData.sessionId);
        if (!queueEntry || queueEntry.pendingAssignment?.agentId !== agentId) {
            throw new Error('This assignment is no longer available');
        }

        const assignment = await agentService.assignChatToAgent(agentId, queueEntry);
        try {
            await ensureChatBackend(agentId);
            await chatClientService.requestAgentAssignment(chatData.sessionId, agentId);
        } catch (error) {
            await agentService.removeChatFromAgent(agentId, chatData.sessionId, 'assignment_failed');
            throw error;
        }

        await queueService.acceptAssignment(chatData.sessionId, agentId);
        return { ...queueEntry, assignment };
    });

    socketManager.on('rejectChat', async ({ agentId, chatData }) => {
        await queueService.releaseAssignment(chatData.sessionId, agentId);
        logger.info('Chat rejected by agent', {
            agentId,
            sessionId: chatData.sessionId,
            reason: chatData.reason || 'unavailable'
        });
        await queueService.processQueue();
        return true;
    });

    socketManager.on('endChat', async ({ agentId, chatData }) => {
        await ensureChatBackend(agentId);
        await chatClientService.endSession(
            chatData.sessionId,
            agentId,
            chatData.reason,
            chatData.summary
        );
        await agentService.removeChatFromAgent(agentId, chatData.sessionId, chatData.reason);
        return true;
    });

    socketManager.on('chatMessage', async ({ agentId, messageData }) => {
        await ensureChatBackend(agentId);
        agentService.updateAgentActivity(agentId, 'message');
        return chatClientService.sendMessage(messageData.sessionId, {
            ...messageData,
            agentId
        }, 'agent');
    });

    socketManager.on('transferChat', async ({ agentId, transferData }) => {
        if (!transferData.toAgentId) throw new Error('A destination agent is required');
        await ensureChatBackend(agentId);
        await chatClientService.requestSessionTransfer(
            transferData.sessionId,
            agentId,
            transferData.toAgentId,
            transferData.reason
        );
        await agentService.removeChatFromAgent(agentId, transferData.sessionId, 'transferred');
        await agentService.assignChatToAgent(transferData.toAgentId, transferData);
        return true;
    });

    socketManager.on('escalateChat', async ({ agentId, chatData }) => {
        await agentService.removeChatFromAgent(agentId, chatData.sessionId, 'escalated');
        await queueService.addToQueue({
            ...chatData,
            escalationReason: chatData.reason || 'agent_request',
            previousAgent: agentId
        }, 'high', {
            ...(chatData.requirements || {}),
            excludeAgentIds: [agentId]
        });
        return true;
    });

    socketManager.on('getQueueStatus', () => queueService.getQueueStatus());
    socketManager.on('getAgentList', () => agentService.getAllAgents().map(agent => ({
        agentId: agent.agentId,
        name: agent.name,
        department: agent.department,
        status: agent.status,
        currentChats: agent.currentChats.size,
        maxChats: agent.preferences.maxConcurrentChats
    })));
    socketManager.on('getChatHistory', async ({ agentId, historyRequest }) => {
        if (historyRequest?.sessionId) {
            await ensureChatBackend(agentId);
            return chatClientService.getSessionHistory(historyRequest.sessionId, historyRequest);
        }
        return {
            messages: [],
            chats: agentService.getAgent(agentId)?.chatHistory || []
        };
    });
    socketManager.on('getCustomerInfo', ({ customerId }) => {
        const queueEntry = Array.from(queueService.chatQueue.values())
            .find(entry => entry.customerId === customerId);
        const recentChat = agentService.getAllAgents()
            .flatMap(agent => agent.chatHistory)
            .find(chat => chat.customerId === customerId);
        return {
            customerId,
            name: queueEntry?.customerName || recentChat?.customerName || 'Customer',
            accountType: queueEntry?.customerData?.accountType || 'standard'
        };
    });
    socketManager.on('updatePreferences', ({ agentId, preferences }) => (
        agentService.updateAgentPreferences(agentId, preferences)
    ));

    chatClientService.on('messageReceived', (message) => {
        socketManager.sendMessageToChatRoom(message.sessionId, message);
    });

    chatClientService.on('agentAssigned', (data) => {
        socketManager.broadcastToAgents('agentAssigned', data);
    });

    chatClientService.on('sessionEnded', (data) => {
        socketManager.broadcastToAgents('sessionEnded', data);
    });

    chatClientService.on('escalationRequest', async data => {
        const priority = data.priority || 'high';
        await queueService.addToQueue({
            ...data,
            customerId: data.customerId || data.userId,
            customerName: data.customerName || 'Customer',
            escalationReason: data.reason || 'agent_request',
            source: 'chat-backend'
        }, priority, data.requirements || {});
    });

    chatClientService.on('systemNotification', data => {
        socketManager.broadcastToAgents('systemNotification', data);
    });
    chatClientService.on('error', ({ error }) => {
        logger.error('Chat backend socket error', { error: error?.message || String(error) });
    });

    const broadcastQueue = () => {
        socketManager.broadcastToAgents('queueStatus', queueService.getQueueStatus());
    };
    queueService.on('chatQueued', broadcastQueue);
    queueService.on('chatDequeued', broadcastQueue);

    // Error handling
    agentService.on('chatNeedsReassignment', async ({ sessionId, reason, previousAgentId }) => {
        if (isShuttingDown) return;
        try {
            // Add back to queue for reassignment
            await queueService.addToQueue({
                sessionId,
                escalationReason: reason,
                previousAgent: previousAgentId
            }, 'high', { urgent: true });
            
            logger.info('Chat reassigned to queue', {
                sessionId,
                reason,
                previousAgentId
            });
        } catch (error) {
            logger.error('Failed to reassign chat', {
                error: error.message,
                sessionId,
                reason
            });
        }
    });
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
        services: {
            agentService: agentService?.getHealthStatus() || 'not initialized',
            queueService: queueService?.getHealthStatus() || 'not initialized',
            chatClientService: chatClientService?.getHealthStatus() || 'not initialized',
            socketManager: socketManager?.getHealthStatus() || 'not initialized'
        }
    };

    res.json(health);
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/agents', requireAgentAuth, agentsRoutes);
app.use('/api/queue', requireAgentAuth, queueRoutes);

// API status endpoint
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        service: 'Agent UI API',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
            agents: '/api/agents',
            queue: '/api/queue',
            health: '/health'
        }
    });
});

// Error handling
app.use((err, req, res, _next) => {
    logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method
    });

    res.status(500).json({
        error: 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    logger.warn('404 Not Found', {
        url: req.url,
        method: req.method,
        ip: req.ip
    });

    res.status(404).json({
        error: 'Not found',
        path: req.url,
        timestamp: new Date().toISOString()
    });
});

// Graceful shutdown
let isShuttingDown = false;
async function shutdown() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info('Starting graceful shutdown...');

    try {
        // Close Socket.IO clients before waiting for the HTTP server. Otherwise
        // open WebSocket connections prevent server.close() from completing.
        await socketManager?.cleanup();
        await agentService?.cleanup();
        await queueService?.cleanup();
        await chatClientService?.cleanup();
        await closeRedisClient();

        await new Promise(resolve => {
            if (!server.listening) return resolve();
            server.close(resolve);
        });
        logger.info('HTTP server closed');
        logger.info('Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown', { error: error.message });
        try {
            await closeRedisClient();
        } finally {
            process.exit(1);
        }
    }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
async function startServer() {
    try {
        await initializeServices();
        
        server.listen(PORT, () => {
            logger.info(`Agent UI server started`, {
                port: PORT,
                environment: process.env.NODE_ENV || 'development',
                nodeVersion: process.version,
                services: {
                    agentService: 'initialized',
                    queueService: 'initialized',
                    chatClientService: 'initialized',
                    socketManager: 'initialized'
                }
            });
        });
    } catch (error) {
        logger.error('Failed to start server', { error: error.message });
        process.exit(1);
    }
}

if (require.main === module) {
    startServer();
}

module.exports = {
    app,
    server,
    startServer,
    initializeServices,
    connectChatBackendAtStartup
};
