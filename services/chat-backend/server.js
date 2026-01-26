require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const jwt = require('jsonwebtoken');

// Import services
const logger = require('./services/logger');
const ChatService = require('./services/chatService');
const AgentOrchestrator = require('./services/agentOrchestrator');
const SessionManager = require('./services/sessionManager');
const SocketHandler = require('./services/socketHandler');

// Import routes
const healthRoutes = require('./routes/health');
const apiRoutes = require('./routes/api');
const { router: authRoutes, verifyToken } = require('./routes/auth');

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Configure Socket.IO with enhanced options
const io = socketIo(server, {
    cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:3002',
            'http://localhost:8080',
            'http://localhost:8081'
        ],
        methods: ['GET', 'POST'],
        credentials: true
    },
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    pingTimeout: parseInt(process.env.WS_PING_TIMEOUT) || 5000,
    pingInterval: parseInt(process.env.WS_PING_INTERVAL) || 25000,
    maxHttpBufferSize: 1e6, // 1MB
    allowEIO3: true
});

const PORT = process.env.PORT || 3006;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// CORS configuration
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:8080',
        'http://localhost:8081'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    // allow common custom headers including X-Request-Id (case-insensitive)
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Agent-Type', 'X-Session-ID', 'X-Request-Id', 'X-Request-ID', 'x-request-id']
}));

// Compression and parsing middleware
app.use(compression());
app.use(express.json({ 
    limit: process.env.MAX_FILE_SIZE || '10MB'
}));
app.use(express.urlencoded({ 
    extended: true, 
    limit: process.env.MAX_FILE_SIZE || '10MB'
}));

// Request logging
app.use(logger.requestMiddleware);

// Health endpoints (no auth required)
app.use('/health', healthRoutes);
app.use('/api/health', healthRoutes);

// Authentication routes
app.use('/auth', authRoutes);

// Main API routes
app.use('/api', apiRoutes);

// Service info endpoint
app.get('/api', (req, res) => {
    res.json({
        service: 'POC Chat Backend',
        version: process.env.SERVICE_VERSION || '1.0.0',
        description: 'Real-time chat processing backend with agent orchestration',
        status: 'operational',
        endpoints: {
            health: '/health',
            auth: '/auth',
            api: '/api',
            websocket: '/socket.io'
        },
        features: [
            'Real-time messaging via WebSocket',
            'Multi-agent orchestration',
            'Banking service integration',
            'NLP/NLU processing',
            'Session management',
            'JWT authentication',
            'Rate limiting',
            'Conversation persistence'
        ],
        microservices: {
            apiGateway: process.env.API_GATEWAY_URL,
            bankingService: process.env.BANKING_SERVICE_URL,
            nlpService: process.env.NLP_SERVICE_URL,
            nluService: process.env.NLU_SERVICE_URL,
            mcpService: process.env.MCP_SERVICE_URL
        },
        timestamp: new Date().toISOString()
    });
});

// WebSocket authentication middleware
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token || 
                     socket.handshake.headers.authorization?.split(' ')[1] ||
                     socket.handshake.query.token;
        
        if (!token) {
            logger.security('websocket_connection_rejected', {
                reason: 'no_token',
                socketId: socket.id,
                remoteAddress: socket.handshake.address
            });
            return next(new Error('Authentication token required'));
        }

        // Verify JWT token
        const decoded = jwt.verify(
            token, 
            process.env.JWT_SECRET || 'dev-jwt-secret-change-me-in-production-2024'
        );
        
        // Add user info to socket
        socket.userId = decoded.userId;
        socket.tokenData = decoded;
        socket.authenticatedAt = new Date();
        
        logger.info('WebSocket client authenticated', {
            userId: decoded.userId,
            socketId: socket.id,
            userAgent: socket.handshake.headers['user-agent']
        });
        
        next();
    } catch (error) {
        logger.security('websocket_authentication_failed', {
            error: error.message,
            socketId: socket.id,
            remoteAddress: socket.handshake.address
        });
        next(new Error('Authentication failed'));
    }
});

// Initialize services
let chatService, agentOrchestrator, sessionManager, socketHandler;

async function initializeServices() {
    try {
        logger.info('Initializing chat backend services...');

        // Initialize core services
        sessionManager = new SessionManager();
        chatService = new ChatService();
        agentOrchestrator = new AgentOrchestrator();
        
        // Initialize socket handler with services
        socketHandler = new SocketHandler(io, chatService, agentOrchestrator, sessionManager);
        
        // Store services in app locals for route access
        app.locals.services = {
            chatService,
            agentOrchestrator,
            sessionManager,
            socketHandler
        };
        
        logger.info('Chat backend services initialized successfully', {
            chatService: 'active',
            agentOrchestrator: 'active',
            sessionManager: 'active',
            socketHandler: 'active'
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
        ip: req.ip
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

    res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method,
        service: 'poc-chat-backend',
        availableEndpoints: {
            health: '/health',
            auth: '/auth',
            api: '/api',
            websocket: '/socket.io'
        },
        timestamp: new Date().toISOString()
    });
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
    logger.info(`${signal} received, initiating graceful shutdown`);
    
    try {
        // Stop accepting new connections
        server.close(() => {
            logger.info('HTTP server closed');
        });

        // Close WebSocket connections
        io.close(() => {
            logger.info('WebSocket server closed');
        });

        // Cleanup services
        if (socketHandler) {
            logger.info('Cleaning up socket handler...');
        }
        
        if (sessionManager) {
            logger.info('Cleaning up session manager...');
        }
        
        if (chatService) {
            logger.info('Cleaning up chat service...');
        }
        
        if (agentOrchestrator) {
            logger.info('Cleaning up agent orchestrator...');
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
            logger.info('🚀 POC Chat Backend started successfully', {
                port: PORT,
                environment: process.env.NODE_ENV || 'development',
                nodeVersion: process.version,
                pid: process.pid
            });
            
            logger.info('📡 Service endpoints available:', {
                http: `http://localhost:${PORT}/api`,
                websocket: `ws://localhost:${PORT}/socket.io`,
                health: `http://localhost:${PORT}/health`,
                auth: `http://localhost:${PORT}/auth`
            });
            
            logger.info('🤖 Microservice connections configured:', {
                apiGateway: process.env.API_GATEWAY_URL,
                bankingService: process.env.BANKING_SERVICE_URL,
                nlpService: process.env.NLP_SERVICE_URL,
                nluService: process.env.NLU_SERVICE_URL,
                mcpService: process.env.MCP_SERVICE_URL
            });
            
            logger.info('✅ Chat backend ready for connections');
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

module.exports = { app, server, io };