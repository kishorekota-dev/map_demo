rconst express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
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
    store: new RedisStore({ client: redisClient }),
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
        
        // Connect to chat backend
        await chatClientService.connect();
        
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

startServer();config();
const express = require('express');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');

// Import services
const logger = require('./services/logger');
const AgentService = require('./services/agentService');
const QueueService = require('./services/queueService');
const ChatClientService = require('./services/chatClientService');
const SocketManager = require('./services/socketManager');

// Import routes
const healthRoutes = require('./routes/health');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const agentRoutes = require('./routes/agent');

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3007;

// Redis client for session store
let redisClient;
if (process.env.REDIS_URL) {
    try {
        redisClient = createClient({ url: process.env.REDIS_URL });
        redisClient.on('error', (err) => {
            logger.error('Redis Client Error', { error: err.message });
        });
        redisClient.connect();
    } catch (error) {
        logger.warn('Redis not available, using memory store', { error: error.message });
    }
}

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:", process.env.CHAT_WS_URL],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"]
        }
    }
}));

// CORS configuration
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
        'http://localhost:3007',
        'http://localhost:3006',
        'http://localhost:3001'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Agent-ID']
}));

// Compression and parsing middleware
app.use(compression());
app.use(express.json({ limit: '10MB' }));
app.use(express.urlencoded({ extended: true, limit: '10MB' }));

// Session configuration
const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me-in-production-2024',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: parseInt(process.env.AGENT_SESSION_TIMEOUT) || 28800000, // 8 hours
        sameSite: 'lax'
    }
};

if (redisClient) {
    sessionConfig.store = new RedisStore({
        client: redisClient,
        ttl: parseInt(process.env.REDIS_SESSION_TTL) || 28800 // 8 hours
    });
}

app.use(session(sessionConfig));

// Request logging
app.use((req, res, next) => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);

    res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.info('HTTP Request', {
            requestId,
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration,
            userAgent: req.headers['user-agent'],
            ip: req.ip
        });
    });

    next();
});

// Serve static files
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'dist')));

// API routes
app.use('/health', healthRoutes);
app.use('/api', apiRoutes);
app.use('/auth', authRoutes);
app.use('/agent', agentRoutes);

// Main dashboard route
app.get('/', (req, res) => {
    if (!req.session.agentId) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Login page
app.get('/login', (req, res) => {
    if (req.session.agentId) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Service info endpoint
app.get('/api', (req, res) => {
    res.json({
        service: 'POC Agent UI Frontend',
        version: process.env.SERVICE_VERSION || '1.0.0',
        description: 'Agent dashboard for handling escalated customer chat sessions',
        status: 'operational',
        endpoints: {
            dashboard: '/',
            login: '/login',
            api: '/api',
            agent: '/agent',
            health: '/health'
        },
        features: [
            'Real-time chat management',
            'Customer conversation handling',
            'Queue management',
            'Agent status tracking',
            'Chat escalation handling',
            'Performance metrics',
            'Multi-chat support'
        ],
        integrations: {
            chatBackend: process.env.CHAT_BACKEND_URL,
            apiGateway: process.env.API_GATEWAY_URL,
            bankingService: process.env.BANKING_SERVICE_URL
        },
        timestamp: new Date().toISOString()
    });
});

// Initialize services
let agentService, queueService, chatClientService, socketManager;

async function initializeServices() {
    try {
        logger.info('Initializing agent UI services...');

        // Initialize core services
        agentService = new AgentService();
        queueService = new QueueService();
        chatClientService = new ChatClientService();
        socketManager = new SocketManager(server, {
            agentService,
            queueService,
            chatClientService
        });

        // Store services in app locals for route access
        app.locals.services = {
            agentService,
            queueService,
            chatClientService,
            socketManager
        };

        logger.info('Agent UI services initialized successfully', {
            agentService: 'active',
            queueService: 'active',
            chatClientService: 'active',
            socketManager: 'active'
        });

    } catch (error) {
        logger.error('Failed to initialize services', { 
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

// Error handling middleware
app.use((error, req, res, next) => {
    logger.error('Express error handler', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        requestId: req.requestId
    });

    res.status(error.status || 500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
        timestamp: new Date().toISOString(),
        requestId: req.requestId
    });
});

// 404 handler
app.use('*', (req, res) => {
    logger.warn('Route not found', {
        path: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    // For API requests, return JSON
    if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({
            error: 'API endpoint not found',
            path: req.originalUrl,
            service: 'poc-agent-ui',
            timestamp: new Date().toISOString()
        });
    }

    // For regular requests, redirect to dashboard or login
    if (req.session.agentId) {
        res.redirect('/');
    } else {
        res.redirect('/login');
    }
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
    logger.info(`${signal} received, initiating graceful shutdown`);
    
    try {
        // Stop accepting new connections
        server.close(() => {
            logger.info('HTTP server closed');
        });

        // Cleanup services
        if (socketManager) {
            await socketManager.cleanup();
            logger.info('Socket manager cleaned up');
        }
        
        if (chatClientService) {
            await chatClientService.cleanup();
            logger.info('Chat client service cleaned up');
        }
        
        if (queueService) {
            await queueService.cleanup();
            logger.info('Queue service cleaned up');
        }
        
        if (agentService) {
            await agentService.cleanup();
            logger.info('Agent service cleaned up');
        }

        // Close Redis connection
        if (redisClient) {
            await redisClient.quit();
            logger.info('Redis connection closed');
        }

        logger.info('Graceful shutdown completed');
        process.exit(0);
        
    } catch (error) {
        logger.error('Error during graceful shutdown', { 
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    }
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack
    });
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection', {
        reason: reason.toString(),
        promise: promise.toString()
    });
    gracefulShutdown('UNHANDLED_REJECTION');
});

// Start server
async function startServer() {
    try {
        // Initialize services first
        await initializeServices();
        
        // Start HTTP server
        server.listen(PORT, () => {
            logger.info('🚀 POC Agent UI Frontend started successfully', {
                port: PORT,
                environment: process.env.NODE_ENV || 'development',
                nodeVersion: process.version,
                pid: process.pid
            });
            
            logger.info('📡 Service endpoints available:', {
                dashboard: `http://localhost:${PORT}/`,
                login: `http://localhost:${PORT}/login`,
                api: `http://localhost:${PORT}/api`,
                health: `http://localhost:${PORT}/health`
            });
            
            logger.info('🔗 External service connections:', {
                chatBackend: process.env.CHAT_BACKEND_URL,
                apiGateway: process.env.API_GATEWAY_URL,
                chatWebSocket: process.env.CHAT_WS_URL
            });
            
            logger.info('✅ Agent UI ready for agents');
        });

    } catch (error) {
        logger.error('Failed to start server', {
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    }
}

// Start the server
startServer();

module.exports = { app, server };