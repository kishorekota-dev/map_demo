const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const redis = require('redis');

// Import services
const logger = require('./services/logger');
const AgentService = require('./services/agentService');
const QueueService = require('./services/queueService');
const ChatClientService = require('./services/chatClientService');
const SocketManager = require('./services/socketManager');

// Import routes
const agentsRoutes = require('./routes/agents');
const queueRoutes = require('./routes/queue');

// Load environment variables
require('dotenv').config({ path: '.env.development' });

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3007;

// Redis client for sessions
const redisClient = redis.createClient({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined
});

redisClient.on('error', (err) => {
    logger.error('Redis connection error', { error: err.message });
});

redisClient.on('connect', () => {
    logger.info('Connected to Redis for sessions');
});

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:"]
        }
    }
}));

app.use(compression());
app.use(cors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3007'],
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

// Session middleware
app.use(session({
    store: new RedisStore({ 
        client: redisClient,
        prefix: 'agent-ui:'
    }),
    secret: process.env.SESSION_SECRET || 'agent-ui-secret-key',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: parseInt(process.env.SESSION_MAX_AGE) || 86400000 // 24 hours
    }
}));

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

async function initializeServices() {
    try {
        logger.info('Initializing services...');
        
        // Initialize core services
        agentService = new AgentService();
        queueService = new QueueService();
        chatClientService = new ChatClientService();
        socketManager = new SocketManager(server);
        
        // Store services in app for route access
        app.set('agentService', agentService);
        app.set('queueService', queueService);
        app.set('chatClientService', chatClientService);
        app.set('socketManager', socketManager);
        
        // Setup service integrations
        await setupServiceIntegrations();
        
        // Connect to chat backend (non-blocking)
        chatClientService.connect().catch(error => {
            logger.warn('Chat backend not available, continuing without connection', {
                error: error.message,
                url: process.env.CHAT_BACKEND_URL || 'http://localhost:3006'
            });
        });
        
        logger.info('All services initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize services', { error: error.message });
        process.exit(1);
    }
}

async function setupServiceIntegrations() {
    // Connect AgentService to QueueService
    queueService.on('getAvailableAgents', ({ requirements, callback }) => {
        const agents = agentService.getAvailableAgents(requirements);
        callback(agents);
    });

    queueService.on('assignmentRequest', async ({ queueEntry, agentId, agent }) => {
        try {
            // Notify agent via socket
            await socketManager.sendChatAssignment(agentId, {
                sessionId: queueEntry.sessionId,
                customerId: queueEntry.customerId,
                customerName: queueEntry.customerName,
                priority: queueEntry.priority,
                escalationReason: queueEntry.escalationReason,
                customerData: queueEntry.customerData,
                estimatedWaitTime: queueEntry.estimatedWaitTime
            });

            logger.info('Chat assignment sent to agent', {
                queueId: queueEntry.queueId,
                agentId,
                sessionId: queueEntry.sessionId
            });
        } catch (error) {
            logger.error('Failed to send chat assignment', {
                error: error.message,
                queueId: queueEntry.queueId,
                agentId
            });
        }
    });

    // Connect SocketManager to AgentService
    socketManager.on('agentRegistered', ({ agent, socket }) => {
        logger.info('Agent registered via socket', {
            agentId: agent.agentId,
            socketId: socket.id
        });
    });

    socketManager.on('updateAgentStatus', async ({ agentId, statusData }) => {
        try {
            await agentService.updateAgentStatus(agentId, statusData.status, statusData.details);
            await chatClientService.updateAgentStatus(agentId, statusData.status, statusData.details);
        } catch (error) {
            logger.error('Failed to update agent status', {
                error: error.message,
                agentId,
                status: statusData.status
            });
        }
    });

    socketManager.on('acceptChat', async ({ agentId, chatData }) => {
        try {
            // Assign chat to agent
            const assignment = await agentService.assignChatToAgent(agentId, chatData);
            
            // Remove from queue
            await queueService.removeFromQueue(chatData.queueId || chatData.sessionId, 'assigned');
            
            // Notify chat backend
            await chatClientService.requestAgentAssignment(chatData.sessionId, agentId);
            
            logger.info('Chat accepted and assigned', {
                agentId,
                sessionId: chatData.sessionId,
                assignment
            });
        } catch (error) {
            logger.error('Failed to accept chat', {
                error: error.message,
                agentId,
                sessionId: chatData.sessionId
            });
        }
    });

    socketManager.on('rejectChat', async ({ agentId, chatData }) => {
        try {
            // Log rejection
            logger.info('Chat rejected by agent', {
                agentId,
                sessionId: chatData.sessionId,
                reason: chatData.reason
            });
            
            // Process queue again to find another agent
            await queueService.processQueue();
        } catch (error) {
            logger.error('Failed to handle chat rejection', {
                error: error.message,
                agentId,
                sessionId: chatData.sessionId
            });
        }
    });

    socketManager.on('endChat', async ({ agentId, chatData }) => {
        try {
            // Remove chat from agent
            await agentService.removeChatFromAgent(agentId, chatData.sessionId, chatData.reason);
            
            // End session in chat backend
            await chatClientService.endSession(chatData.sessionId, agentId, chatData.reason, chatData.summary);
            
            logger.info('Chat ended by agent', {
                agentId,
                sessionId: chatData.sessionId,
                reason: chatData.reason
            });
        } catch (error) {
            logger.error('Failed to end chat', {
                error: error.message,
                agentId,
                sessionId: chatData.sessionId
            });
        }
    });

    socketManager.on('chatMessage', async ({ agentId, messageData }) => {
        try {
            // Update agent activity
            agentService.updateAgentActivity(agentId, 'message');
            
            // Send message to chat backend
            await chatClientService.sendMessage(messageData.sessionId, messageData, 'agent');
            
            logger.info('Message sent from agent', {
                agentId,
                sessionId: messageData.sessionId,
                messageId: messageData.messageId
            });
        } catch (error) {
            logger.error('Failed to send message', {
                error: error.message,
                agentId,
                sessionId: messageData.sessionId
            });
        }
    });

    // Connect ChatClientService to SocketManager
    chatClientService.on('messageReceived', (message) => {
        socketManager.sendMessageToChatRoom(message.sessionId, message);
    });

    chatClientService.on('agentAssigned', (data) => {
        socketManager.broadcastToAgents('agentAssigned', data);
    });

    chatClientService.on('sessionEnded', (data) => {
        socketManager.broadcastToAgents('sessionEnded', data);
    });

    // Error handling
    agentService.on('chatNeedsReassignment', async ({ sessionId, reason, previousAgentId }) => {
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
app.use('/api/agents', agentsRoutes);
app.use('/api/queue', queueRoutes);

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
app.use((err, req, res, next) => {
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
async function shutdown() {
    logger.info('Starting graceful shutdown...');
    
    server.close(() => {
        logger.info('HTTP server closed');
        
        // Cleanup services
        Promise.all([
            agentService?.cleanup(),
            queueService?.cleanup(),
            chatClientService?.cleanup(),
            socketManager?.cleanup()
        ]).then(() => {
            redisClient.quit();
            logger.info('Graceful shutdown completed');
            process.exit(0);
        }).catch((error) => {
            logger.error('Error during shutdown', { error: error.message });
            redisClient.quit();
            process.exit(1);
        });
    });
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

startServer();