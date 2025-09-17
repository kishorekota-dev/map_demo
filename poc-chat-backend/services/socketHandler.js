const logger = require('./logger');

class SocketHandler {
    constructor(io, chatService, agentOrchestrator, sessionManager) {
        this.io = io;
        this.chatService = chatService;
        this.agentOrchestrator = agentOrchestrator;
        this.sessionManager = sessionManager;
        this.connectedClients = new Map();
        this.activeTyping = new Map();
        this.messageRateLimit = new Map();
        
        this.setupSocketHandlers();
        this.setupEventListeners();
        
        logger.info('SocketHandler initialized');
    }

    /**
     * Setup main socket event handlers
     */
    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            logger.info('Client connected', { 
                socketId: socket.id,
                userAgent: socket.handshake.headers['user-agent'],
                ipAddress: socket.handshake.address
            });

            // Store client info
            this.connectedClients.set(socket.id, {
                socket,
                sessionId: null,
                userId: null,
                connectedAt: new Date(),
                lastActivity: new Date(),
                isAuthenticated: false,
                metadata: {
                    userAgent: socket.handshake.headers['user-agent'],
                    ipAddress: socket.handshake.address
                }
            });

            // Setup individual socket handlers
            this.setupIndividualSocketHandlers(socket);

            // Handle disconnection
            socket.on('disconnect', (reason) => {
                this.handleDisconnect(socket, reason);
            });

            // Send welcome message
            socket.emit('connected', {
                message: 'Connected to banking chat service',
                timestamp: new Date().toISOString(),
                socketId: socket.id
            });
        });
    }

    /**
     * Setup handlers for individual socket
     */
    setupIndividualSocketHandlers(socket) {
        // Authentication
        socket.on('authenticate', async (data) => {
            await this.handleAuthentication(socket, data);
        });

        // Session management
        socket.on('createSession', async (data) => {
            await this.handleCreateSession(socket, data);
        });

        socket.on('joinSession', async (data) => {
            await this.handleJoinSession(socket, data);
        });

        // Messaging
        socket.on('sendMessage', async (data) => {
            await this.handleSendMessage(socket, data);
        });

        socket.on('typing', (data) => {
            this.handleTyping(socket, data);
        });

        socket.on('stopTyping', (data) => {
            this.handleStopTyping(socket, data);
        });

        // File uploads
        socket.on('uploadFile', async (data) => {
            await this.handleFileUpload(socket, data);
        });

        // Session actions
        socket.on('endSession', async (data) => {
            await this.handleEndSession(socket, data);
        });

        // Health check
        socket.on('ping', (data) => {
            this.handlePing(socket, data);
        });

        // Error handling
        socket.on('error', (error) => {
            this.handleSocketError(socket, error);
        });
    }

    /**
     * Setup service event listeners
     */
    setupEventListeners() {
        // Chat service events
        this.chatService.on('responseReady', (response) => {
            this.deliverMessage(response);
        });

        this.chatService.on('sessionCreated', (data) => {
            this.broadcastToSession(data.sessionId, 'sessionCreated', data);
        });

        this.chatService.on('sessionEnded', (data) => {
            this.broadcastToSession(data.sessionId, 'sessionEnded', data);
        });

        // Agent orchestrator events
        this.agentOrchestrator.on('agentAssigned', (data) => {
            this.broadcastToSession(data.sessionId, 'agentAssigned', data);
        });

        this.agentOrchestrator.on('processingStarted', (data) => {
            this.broadcastToSession(data.sessionId, 'processingStarted', data);
        });

        this.agentOrchestrator.on('processingCompleted', (data) => {
            this.broadcastToSession(data.sessionId, 'processingCompleted', data);
        });

        // Session manager events
        this.sessionManager.on('sessionExpired', (data) => {
            this.broadcastToSession(data.sessionId, 'sessionExpired', data);
        });
    }

    /**
     * Handle client authentication
     */
    async handleAuthentication(socket, data) {
        try {
            const clientInfo = this.connectedClients.get(socket.id);
            if (!clientInfo) {
                socket.emit('authenticationError', { error: 'Client not found' });
                return;
            }

            // Validate authentication data
            if (!data.token && !data.credentials) {
                socket.emit('authenticationError', { error: 'Authentication data required' });
                return;
            }

            // TODO: Implement actual authentication logic
            // For now, accept any valid-looking token or credentials
            let authResult = { authenticated: false, userId: null };

            if (data.token) {
                // JWT token validation would go here
                authResult = { authenticated: true, userId: data.userId || 'anonymous' };
            } else if (data.credentials) {
                // Credential validation would go here
                authResult = { authenticated: true, userId: data.credentials.userId };
            }

            if (authResult.authenticated) {
                clientInfo.isAuthenticated = true;
                clientInfo.userId = authResult.userId;
                clientInfo.authenticationTime = new Date();

                logger.info('Client authenticated', {
                    socketId: socket.id,
                    userId: authResult.userId
                });

                socket.emit('authenticationSuccess', {
                    userId: authResult.userId,
                    authenticated: true,
                    timestamp: new Date().toISOString()
                });
            } else {
                socket.emit('authenticationError', {
                    error: 'Authentication failed',
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            logger.error('Authentication error', {
                error: error.message,
                socketId: socket.id,
                data: Object.keys(data)
            });
            socket.emit('authenticationError', { error: 'Authentication error' });
        }
    }

    /**
     * Handle session creation
     */
    async handleCreateSession(socket, data) {
        try {
            const clientInfo = this.connectedClients.get(socket.id);
            if (!clientInfo || !clientInfo.isAuthenticated) {
                socket.emit('sessionError', { error: 'Authentication required' });
                return;
            }

            const sessionMetadata = {
                ...clientInfo.metadata,
                ...data.metadata,
                socketId: socket.id
            };

            // Create chat session
            const chatSession = await this.chatService.createChatSession(
                clientInfo.userId,
                null, // Let service generate sessionId
                data.userData || {}
            );

            // Create session manager session
            const session = await this.sessionManager.createSession(
                clientInfo.userId,
                sessionMetadata
            );

            // Update client info
            clientInfo.sessionId = chatSession.sessionId;

            // Join socket room for this session
            socket.join(`session:${chatSession.sessionId}`);

            logger.info('Session created and joined', {
                socketId: socket.id,
                userId: clientInfo.userId,
                sessionId: chatSession.sessionId
            });

            socket.emit('sessionCreated', {
                sessionId: chatSession.sessionId,
                session: {
                    ...chatSession,
                    ...session
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logger.error('Session creation error', {
                error: error.message,
                socketId: socket.id,
                userId: clientInfo?.userId
            });
            socket.emit('sessionError', { error: 'Failed to create session' });
        }
    }

    /**
     * Handle joining existing session
     */
    async handleJoinSession(socket, data) {
        try {
            const clientInfo = this.connectedClients.get(socket.id);
            if (!clientInfo || !clientInfo.isAuthenticated) {
                socket.emit('sessionError', { error: 'Authentication required' });
                return;
            }

            if (!data.sessionId) {
                socket.emit('sessionError', { error: 'Session ID required' });
                return;
            }

            // Get session info
            const session = await this.sessionManager.getSession(data.sessionId);
            if (!session) {
                socket.emit('sessionError', { error: 'Session not found' });
                return;
            }

            // Verify user owns this session
            if (session.userId !== clientInfo.userId) {
                socket.emit('sessionError', { error: 'Access denied' });
                return;
            }

            // Update client info
            clientInfo.sessionId = data.sessionId;

            // Join socket room
            socket.join(`session:${data.sessionId}`);

            // Get conversation history
            const history = this.chatService.getConversationHistory(data.sessionId);

            logger.info('Session joined', {
                socketId: socket.id,
                userId: clientInfo.userId,
                sessionId: data.sessionId
            });

            socket.emit('sessionJoined', {
                sessionId: data.sessionId,
                session,
                conversationHistory: history,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logger.error('Session join error', {
                error: error.message,
                socketId: socket.id,
                sessionId: data.sessionId
            });
            socket.emit('sessionError', { error: 'Failed to join session' });
        }
    }

    /**
     * Handle incoming message
     */
    async handleSendMessage(socket, data) {
        try {
            const clientInfo = this.connectedClients.get(socket.id);
            if (!clientInfo || !clientInfo.sessionId) {
                socket.emit('messageError', { error: 'No active session' });
                return;
            }

            // Rate limiting
            if (!this.checkMessageRateLimit(socket.id)) {
                socket.emit('messageError', { error: 'Rate limit exceeded' });
                return;
            }

            // Validate message
            if (!data.content || data.content.trim().length === 0) {
                socket.emit('messageError', { error: 'Message content required' });
                return;
            }

            if (data.content.length > (parseInt(process.env.MAX_MESSAGE_LENGTH) || 2000)) {
                socket.emit('messageError', { error: 'Message too long' });
                return;
            }

            // Update client activity
            clientInfo.lastActivity = new Date();

            // Process message through chat service
            const message = await this.chatService.processMessage(
                clientInfo.sessionId,
                {
                    content: data.content,
                    type: data.type || 'text',
                    attachments: data.attachments || [],
                    clientInfo: {
                        socketId: socket.id,
                        userAgent: clientInfo.metadata.userAgent,
                        ipAddress: clientInfo.metadata.ipAddress
                    }
                },
                data.metadata || {}
            );

            // Update session statistics
            await this.sessionManager.updateSessionStatistics(clientInfo.sessionId, {
                messageCount: 1
            });

            // Acknowledge message received
            socket.emit('messageReceived', {
                messageId: message.id,
                timestamp: message.timestamp,
                status: 'processing'
            });

            // Get conversation context
            const session = await this.sessionManager.getSession(clientInfo.sessionId);
            const conversationContext = session ? session.state : {};

            // Process through agent orchestrator
            const agentResult = await this.agentOrchestrator.processMessage(
                clientInfo.sessionId,
                message,
                conversationContext
            );

            // Send response through chat service
            await this.chatService.sendResponse(
                clientInfo.sessionId,
                agentResult.finalResponse,
                {
                    agentId: 'orchestrator',
                    agentType: 'ai',
                    processingTime: agentResult.processingTime
                }
            );

            // Update conversation context
            if (agentResult.conversationContextUpdates) {
                await this.sessionManager.updateSessionState(
                    clientInfo.sessionId,
                    agentResult.conversationContextUpdates
                );
            }

            logger.info('Message processed', {
                socketId: socket.id,
                sessionId: clientInfo.sessionId,
                messageId: message.id,
                processingTime: agentResult.processingTime
            });

        } catch (error) {
            logger.error('Message processing error', {
                error: error.message,
                socketId: socket.id,
                sessionId: clientInfo?.sessionId,
                messageContent: data?.content?.substring(0, 100)
            });
            socket.emit('messageError', { error: 'Failed to process message' });
        }
    }

    /**
     * Handle typing indicators
     */
    handleTyping(socket, data) {
        try {
            const clientInfo = this.connectedClients.get(socket.id);
            if (!clientInfo || !clientInfo.sessionId) {
                return;
            }

            const typingKey = `${clientInfo.sessionId}:${clientInfo.userId}`;
            this.activeTyping.set(typingKey, {
                socketId: socket.id,
                userId: clientInfo.userId,
                startedAt: new Date()
            });

            // Broadcast to other users in session
            socket.to(`session:${clientInfo.sessionId}`).emit('userTyping', {
                userId: clientInfo.userId,
                timestamp: new Date().toISOString()
            });

            // Auto-stop typing after timeout
            setTimeout(() => {
                if (this.activeTyping.has(typingKey)) {
                    this.handleStopTyping(socket, data);
                }
            }, 10000); // 10 seconds

        } catch (error) {
            logger.error('Typing indicator error', {
                error: error.message,
                socketId: socket.id
            });
        }
    }

    /**
     * Handle stop typing
     */
    handleStopTyping(socket, data) {
        try {
            const clientInfo = this.connectedClients.get(socket.id);
            if (!clientInfo || !clientInfo.sessionId) {
                return;
            }

            const typingKey = `${clientInfo.sessionId}:${clientInfo.userId}`;
            if (this.activeTyping.has(typingKey)) {
                this.activeTyping.delete(typingKey);

                // Broadcast to other users in session
                socket.to(`session:${clientInfo.sessionId}`).emit('userStoppedTyping', {
                    userId: clientInfo.userId,
                    timestamp: new Date().toISOString()
                });
            }

        } catch (error) {
            logger.error('Stop typing error', {
                error: error.message,
                socketId: socket.id
            });
        }
    }

    /**
     * Handle file upload
     */
    async handleFileUpload(socket, data) {
        try {
            const clientInfo = this.connectedClients.get(socket.id);
            if (!clientInfo || !clientInfo.sessionId) {
                socket.emit('fileUploadError', { error: 'No active session' });
                return;
            }

            // File upload logic would go here
            // For now, just acknowledge
            socket.emit('fileUploadSuccess', {
                fileId: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                filename: data.filename,
                size: data.size,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logger.error('File upload error', {
                error: error.message,
                socketId: socket.id,
                filename: data?.filename
            });
            socket.emit('fileUploadError', { error: 'File upload failed' });
        }
    }

    /**
     * Handle session end
     */
    async handleEndSession(socket, data) {
        try {
            const clientInfo = this.connectedClients.get(socket.id);
            if (!clientInfo || !clientInfo.sessionId) {
                socket.emit('sessionError', { error: 'No active session' });
                return;
            }

            // End chat session
            await this.chatService.endSession(clientInfo.sessionId, 'user_initiated');

            // End session manager session
            await this.sessionManager.endSession(clientInfo.sessionId, 'user_initiated');

            // Leave socket room
            socket.leave(`session:${clientInfo.sessionId}`);

            // Clear client session
            clientInfo.sessionId = null;

            logger.info('Session ended', {
                socketId: socket.id,
                userId: clientInfo.userId,
                sessionId: clientInfo.sessionId
            });

            socket.emit('sessionEnded', {
                reason: 'user_initiated',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logger.error('Session end error', {
                error: error.message,
                socketId: socket.id,
                sessionId: clientInfo?.sessionId
            });
            socket.emit('sessionError', { error: 'Failed to end session' });
        }
    }

    /**
     * Handle ping for keepalive
     */
    handlePing(socket, data) {
        try {
            const clientInfo = this.connectedClients.get(socket.id);
            if (clientInfo) {
                clientInfo.lastActivity = new Date();
            }

            socket.emit('pong', {
                timestamp: new Date().toISOString(),
                ...data
            });

        } catch (error) {
            logger.error('Ping error', {
                error: error.message,
                socketId: socket.id
            });
        }
    }

    /**
     * Handle socket errors
     */
    handleSocketError(socket, error) {
        logger.error('Socket error', {
            error: error.message,
            socketId: socket.id,
            stack: error.stack
        });

        socket.emit('error', {
            message: 'Socket error occurred',
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Handle client disconnect
     */
    async handleDisconnect(socket, reason) {
        try {
            const clientInfo = this.connectedClients.get(socket.id);
            
            if (clientInfo) {
                logger.info('Client disconnected', {
                    socketId: socket.id,
                    userId: clientInfo.userId,
                    sessionId: clientInfo.sessionId,
                    reason,
                    connectedDuration: new Date() - clientInfo.connectedAt
                });

                // Clean up typing indicators
                if (clientInfo.sessionId && clientInfo.userId) {
                    const typingKey = `${clientInfo.sessionId}:${clientInfo.userId}`;
                    this.activeTyping.delete(typingKey);
                }

                // Optionally end session on disconnect
                if (clientInfo.sessionId) {
                    // Don't end session immediately - user might reconnect
                    // Session will be cleaned up by timeout
                }
            }

            // Clean up client info
            this.connectedClients.delete(socket.id);

        } catch (error) {
            logger.error('Disconnect handling error', {
                error: error.message,
                socketId: socket.id,
                reason
            });
        }
    }

    /**
     * Deliver message to specific session
     */
    deliverMessage(message) {
        try {
            if (message.sessionId) {
                this.io.to(`session:${message.sessionId}`).emit('newMessage', message);
                
                logger.debug('Message delivered', {
                    sessionId: message.sessionId,
                    messageId: message.id,
                    direction: message.direction
                });
            }
        } catch (error) {
            logger.error('Message delivery error', {
                error: error.message,
                sessionId: message.sessionId,
                messageId: message.id
            });
        }
    }

    /**
     * Broadcast event to session
     */
    broadcastToSession(sessionId, event, data) {
        try {
            this.io.to(`session:${sessionId}`).emit(event, {
                ...data,
                timestamp: new Date().toISOString()
            });

            logger.debug('Event broadcasted to session', {
                sessionId,
                event,
                dataKeys: Object.keys(data)
            });

        } catch (error) {
            logger.error('Broadcast error', {
                error: error.message,
                sessionId,
                event
            });
        }
    }

    /**
     * Check message rate limiting
     */
    checkMessageRateLimit(socketId) {
        const now = Date.now();
        const windowMs = parseInt(process.env.MESSAGE_RATE_LIMIT_WINDOW) || 60000; // 1 minute
        const maxMessages = parseInt(process.env.MESSAGE_RATE_LIMIT_MAX) || 60;

        if (!this.messageRateLimit.has(socketId)) {
            this.messageRateLimit.set(socketId, {
                count: 1,
                resetTime: now + windowMs
            });
            return true;
        }

        const rateInfo = this.messageRateLimit.get(socketId);

        if (now > rateInfo.resetTime) {
            // Reset window
            rateInfo.count = 1;
            rateInfo.resetTime = now + windowMs;
            return true;
        }

        if (rateInfo.count >= maxMessages) {
            return false;
        }

        rateInfo.count++;
        return true;
    }

    /**
     * Get handler health status
     */
    getHealthStatus() {
        const connectedClientsCount = this.connectedClients.size;
        const authenticatedClients = Array.from(this.connectedClients.values())
            .filter(client => client.isAuthenticated).length;
        const activeTypingCount = this.activeTyping.size;

        return {
            status: 'healthy',
            connectedClients: connectedClientsCount,
            authenticatedClients,
            activeTyping: activeTypingCount,
            rateLimitedClients: this.messageRateLimit.size,
            uptime: process.uptime()
        };
    }
}

module.exports = SocketHandler;