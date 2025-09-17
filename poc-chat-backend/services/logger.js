const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Custom format for logging
const customFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
        const logObj = {
            timestamp,
            level,
            service: service || 'poc-chat-backend',
            message,
            ...meta
        };
        return JSON.stringify(logObj);
    })
);

// Development format (more readable)
const devFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} [${service || 'poc-chat-backend'}] ${level}: ${message}${metaStr}`;
    })
);

// Create logger instance
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.NODE_ENV === 'production' ? customFormat : devFormat,
    defaultMeta: {
        service: 'poc-chat-backend',
        version: process.env.SERVICE_VERSION || '1.0.0'
    },
    transports: [
        // Console transport
        new winston.transports.Console({
            level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
            handleExceptions: true,
            handleRejections: true
        }),

        // File transport for all logs
        new winston.transports.File({
            filename: path.join(logDir, 'chat-backend.log'),
            level: 'info',
            maxsize: parseInt(process.env.LOG_MAX_SIZE) || 10485760, // 10MB
            maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
            handleExceptions: true,
            handleRejections: true
        }),

        // Separate file for errors
        new winston.transports.File({
            filename: path.join(logDir, 'chat-backend-error.log'),
            level: 'error',
            maxsize: parseInt(process.env.LOG_MAX_SIZE) || 10485760, // 10MB
            maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
            handleExceptions: true,
            handleRejections: true
        })
    ],
    exitOnError: false
});

// Add debug transport in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.File({
        filename: path.join(logDir, 'chat-backend-debug.log'),
        level: 'debug',
        maxsize: parseInt(process.env.LOG_MAX_SIZE) || 10485760, // 10MB
        maxFiles: 3
    }));
}

// Create specialized loggers for different components
const componentLoggers = {
    chat: logger.child({ component: 'ChatService' }),
    agent: logger.child({ component: 'AgentOrchestrator' }),
    session: logger.child({ component: 'SessionManager' }),
    socket: logger.child({ component: 'SocketHandler' }),
    server: logger.child({ component: 'Server' }),
    auth: logger.child({ component: 'Authentication' }),
    performance: logger.child({ component: 'Performance' }),
    security: logger.child({ component: 'Security' })
};

// Performance logging utility
logger.performance = (operation, startTime, metadata = {}) => {
    const duration = Date.now() - startTime;
    componentLoggers.performance.info(`Performance: ${operation}`, {
        operation,
        duration,
        ...metadata
    });
    return duration;
};

// Security logging utility
logger.security = (event, details = {}) => {
    componentLoggers.security.warn(`Security Event: ${event}`, {
        securityEvent: event,
        timestamp: new Date().toISOString(),
        ...details
    });
};

// Authentication logging utility
logger.auth = (event, userId, details = {}) => {
    componentLoggers.auth.info(`Auth Event: ${event}`, {
        authEvent: event,
        userId,
        timestamp: new Date().toISOString(),
        ...details
    });
};

// Error with context utility
logger.errorWithContext = (message, error, context = {}) => {
    logger.error(message, {
        error: error.message,
        stack: error.stack,
        ...context
    });
};

// Request logging middleware
logger.requestMiddleware = (req, res, next) => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add request ID to headers
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);

    // Log request
    logger.info('HTTP Request', {
        requestId,
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        headers: process.env.DEBUG_CHAT_PROCESSING === 'true' ? req.headers : undefined
    });

    // Log response when finished
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.info('HTTP Response', {
            requestId,
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration,
            contentLength: res.get('content-length')
        });
    });

    next();
};

// Stream for Morgan HTTP logging
logger.stream = {
    write: (message) => {
        logger.info(message.trim());
    }
};

// Health check logging
logger.healthCheck = (serviceName, status, details = {}) => {
    logger.info(`Health Check: ${serviceName}`, {
        service: serviceName,
        status,
        timestamp: new Date().toISOString(),
        ...details
    });
};

// Add component-specific methods
logger.chat = componentLoggers.chat;
logger.agent = componentLoggers.agent;
logger.session = componentLoggers.session;
logger.socket = componentLoggers.socket;
logger.server = componentLoggers.server;

// Graceful shutdown logging
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
});

// Unhandled promise rejection logging
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection', {
        reason: reason.toString(),
        stack: reason.stack,
        promise: promise.toString()
    });
});

// Uncaught exception logging
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack
    });
    // Don't exit immediately, let other handlers run
    setTimeout(() => process.exit(1), 1000);
});

module.exports = logger;