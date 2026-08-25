const EventEmitter = require('events');
const { randomUUID } = require('crypto');
const jwt = require('jsonwebtoken');
const io = require('socket.io-client');
const logger = require('./logger');

const SERVICE_TOKEN_TTL_SECONDS = 5 * 60;

class ChatClientService extends EventEmitter {
    constructor() {
        super();
        this.chatBackendUrl = process.env.CHAT_BACKEND_URL || 'http://localhost:3006';
        this.socket = null;
        this.configuredAuthToken = process.env.CHAT_BACKEND_SERVICE_TOKEN?.trim() || null;
        this.jwtSecret = process.env.JWT_SECRET?.trim() || null;
        this.authToken = this.configuredAuthToken;
        this.authTokenSource = this.configuredAuthToken ? 'configured' : 'generated';
        this.shouldReconnect = true;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = parseInt(process.env.MAX_RECONNECT_ATTEMPTS) || 10;
        this.reconnectDelay = parseInt(process.env.RECONNECT_DELAY) || 5000;
        this.heartbeatInterval = parseInt(process.env.HEARTBEAT_INTERVAL) || 30000;
        this.responseTimeout = parseInt(process.env.RESPONSE_TIMEOUT) || 10000;
        
        this.activeChats = new Map();
        this.pendingRequests = new Map();
        this.messageQueue = [];
        this.connectionMetrics = {
            connectTime: null,
            lastHeartbeat: null,
            messagesSent: 0,
            messagesReceived: 0,
            reconnectCount: 0,
            errors: 0
        };
        
        logger.info('ChatClientService initialized', {
            chatBackendUrl: this.chatBackendUrl,
            maxReconnectAttempts: this.maxReconnectAttempts,
            reconnectDelay: this.reconnectDelay
        });
    }

    /**
     * Create a short-lived service-principal credential for the chat backend.
     * A unique JWT ID ensures a reconnect always receives a fresh token, even
     * when two attempts happen within the same second.
     */
    createServiceToken() {
        if (!this.jwtSecret) {
            throw new Error(
                'JWT_SECRET is required when CHAT_BACKEND_SERVICE_TOKEN is not configured'
            );
        }

        return jwt.sign({
            userId: 'agent-ui-service',
            role: 'service',
            service: 'agent-ui'
        }, this.jwtSecret, {
            expiresIn: SERVICE_TOKEN_TTL_SECONDS,
            jwtid: randomUUID()
        });
    }

    getAuthenticationToken(tokenOverride) {
        const explicitToken = typeof tokenOverride === 'string' ? tokenOverride.trim() : '';
        if (explicitToken) {
            this.authTokenSource = explicitToken === this.configuredAuthToken
                ? 'configured'
                : 'explicit';
            return explicitToken;
        }

        if (this.configuredAuthToken) {
            this.authTokenSource = 'configured';
            return this.configuredAuthToken;
        }

        this.authTokenSource = 'generated';
        return this.createServiceToken();
    }

    canReconnect() {
        return Boolean(
            this.configuredAuthToken
            || this.jwtSecret
            || (this.authTokenSource === 'explicit' && this.authToken)
        );
    }

    /**
     * Connect to chat backend
     */
    async connect(tokenOverride) {
        try {
            if (this.socket && this.isConnected) {
                return true;
            }

            const token = this.getAuthenticationToken(tokenOverride);

            this.authToken = token;
            this.shouldReconnect = true;
            this.socket?.disconnect();

            logger.chat('connecting_to_backend', null, {
                url: this.chatBackendUrl,
                attempt: this.reconnectAttempts + 1
            });

            this.socket = io(this.chatBackendUrl, {
                transports: ['websocket'],
                timeout: 20000,
                reconnection: false, // We handle reconnection manually
                auth: {
                    token,
                    service: 'agent-ui',
                    version: process.env.npm_package_version || '1.0.0',
                    nodeId: process.env.NODE_ID || 'agent-ui-node'
                }
            });

            await this.setupSocketHandlers();
            
            return await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, 20000);

                this.socket.once('connect', () => {
                    this.socket.emit('authenticate', { token, service: 'agent-ui' });
                });

                this.socket.once('authenticationSuccess', () => {
                    clearTimeout(timeout);
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.connectionMetrics.connectTime = new Date();
                    this.connectionMetrics.reconnectCount++;

                    logger.chat('connected_to_backend', null, {
                        url: this.chatBackendUrl,
                        socketId: this.socket.id
                    });

                    this.emit('connected');
                    this.startHeartbeat();
                    this.processMessageQueue();
                    resolve(true);
                });

                this.socket.once('authenticationError', (error) => {
                    clearTimeout(timeout);
                    reject(new Error(error?.error || 'Backend authentication failed'));
                });

                this.socket.once('connect_error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });
        } catch (error) {
            logger.error('Error connecting to chat backend', {
                error: error.message,
                url: this.chatBackendUrl,
                attempt: this.reconnectAttempts
            });
            
            this.connectionMetrics.errors++;
            await this.handleReconnection();
            throw error;
        }
    }

    /**
     * Setup socket event handlers
     */
    async setupSocketHandlers() {
        this.socket.on('disconnect', (reason) => {
            this.isConnected = false;
            this.connectionMetrics.lastHeartbeat = null;
            
            logger.chat('disconnected_from_backend', null, {
                reason,
                socketId: this.socket?.id
            });
            
            this.emit('disconnected', { reason });
            if (this.shouldReconnect) this.handleReconnection();
        });

        this.socket.on('error', (error) => {
            this.connectionMetrics.errors++;
            
            logger.error('Socket error from chat backend', {
                error: error.message,
                socketId: this.socket?.id
            });
            
            this.emit('error', { error });
        });

        // Chat session events
        this.socket.on('sessionCreated', (data) => {
            logger.chat('session_created', data.sessionId, data);
            this.emit('sessionCreated', data);
        });

        this.socket.on('sessionUpdated', (data) => {
            logger.chat('session_updated', data.sessionId, data);
            this.emit('sessionUpdated', data);
        });

        this.socket.on('sessionEnded', (data) => {
            logger.chat('session_ended', data.sessionId, data);
            this.activeChats.delete(data.sessionId);
            this.emit('sessionEnded', data);
        });

        // Message events
        const handleMessage = (data) => {
            const message = this.normalizeMessage(data);
            this.connectionMetrics.messagesReceived++;
            logger.chat('message_received', message.sessionId, {
                messageId: message.messageId,
                sender: message.sender,
                type: message.type
            });
            this.emit('messageReceived', message);
        };
        this.socket.on('messageReceived', handleMessage);
        this.socket.on('newMessage', handleMessage);

        this.socket.on('messageSent', (data) => {
            logger.chat('message_sent', data.sessionId, {
                messageId: data.messageId,
                status: data.status
            });
            this.emit('messageSent', data);
        });

        this.socket.on('messageError', (data) => {
            logger.error('Message error from chat backend', {
                sessionId: data.sessionId,
                messageId: data.messageId,
                error: data.error
            });
            this.emit('messageError', data);
        });

        // Agent events
        this.socket.on('agentAssigned', (data) => {
            logger.chat('agent_assigned', data.sessionId, {
                agentId: data.agentId,
                agentName: data.agentName
            });
            
            this.activeChats.set(data.sessionId, {
                sessionId: data.sessionId,
                agentId: data.agentId,
                customerId: data.customerId,
                startTime: new Date(data.assignedAt),
                status: 'active'
            });
            
            this.emit('agentAssigned', data);
        });

        this.socket.on('agentUnassigned', (data) => {
            logger.chat('agent_unassigned', data.sessionId, {
                agentId: data.agentId,
                reason: data.reason
            });
            
            this.activeChats.delete(data.sessionId);
            this.emit('agentUnassigned', data);
        });

        // Escalation events
        const handleEscalation = (data) => {
            logger.chat('escalation_request', data.sessionId, {
                reason: data.reason,
                priority: data.priority,
                fromAgent: data.fromAgent
            });
            this.emit('escalationRequest', data);
        };
        this.socket.on('escalationRequest', handleEscalation);
        this.socket.on('escalationRequested', handleEscalation);

        this.socket.on('escalationAccepted', (data) => {
            logger.chat('escalation_accepted', data.sessionId, {
                newAgentId: data.newAgentId,
                previousAgent: data.previousAgent
            });
            this.emit('escalationAccepted', data);
        });

        // System events
        this.socket.on('systemNotification', (data) => {
            logger.chat('system_notification', null, {
                type: data.type,
                message: data.message,
                severity: data.severity
            });
            this.emit('systemNotification', data);
        });

        // Response handlers for requests
        this.socket.on('response', (data) => {
            const requestId = data.requestId;
            if (this.pendingRequests.has(requestId)) {
                const { resolve, reject } = this.pendingRequests.get(requestId);
                this.pendingRequests.delete(requestId);
                
                if (data.success) {
                    resolve(data.result);
                } else {
                    reject(new Error(data.error || 'Request failed'));
                }
            }
        });

        // Heartbeat response
        this.socket.on('pong', () => {
            this.connectionMetrics.lastHeartbeat = new Date();
        });
    }

    /**
     * Send message to chat backend
     */
    async sendMessage(sessionId, message, sender = 'agent') {
        try {
            if (!this.isConnected) {
                throw new Error('Not connected to chat backend');
            }

            const content = typeof message === 'string'
                ? message
                : message?.content || message?.message;
            if (!content || !String(content).trim()) {
                throw new Error('Message content is required');
            }

            const messageData = {
                sessionId,
                messageId: message?.messageId || this.generateMessageId(),
                content: String(content),
                type: message?.type || 'text',
                sender,
                timestamp: new Date().toISOString(),
                metadata: {
                    agentId: message?.agentId,
                    source: 'agent-ui'
                }
            };

            await this.sendRequest('sendMessage', messageData);
            this.connectionMetrics.messagesSent++;

            logger.chat('message_sent_to_backend', sessionId, {
                messageId: messageData.messageId,
                sender,
                messageLength: messageData.content.length
            });

            return messageData;
        } catch (error) {
            logger.error('Error sending message to chat backend', {
                error: error.message,
                sessionId,
                sender
            });
            throw error;
        }
    }

    /**
     * Request agent assignment
     */
    async requestAgentAssignment(sessionId, agentId, requirements = {}) {
        try {
            const requestData = {
                sessionId,
                agentId,
                requirements,
                requestedAt: new Date().toISOString(),
                source: 'agent-ui'
            };

            const result = await this.sendRequest('assignAgent', requestData);
            try {
                await this.joinSession(sessionId);
            } catch (error) {
                // Older chat-backend builds only allow the customer identity to
                // join a session. Assignment still succeeds through the generic
                // request protocol; keep the dashboard usable and surface the
                // integration limitation in logs.
                logger.warn('Assigned agent could not join backend session room', {
                    sessionId,
                    agentId,
                    error: error.message
                });
            }

            logger.chat('agent_assignment_requested', sessionId, {
                agentId,
                requirements,
                result
            });

            return result;
        } catch (error) {
            logger.error('Error requesting agent assignment', {
                error: error.message,
                sessionId,
                agentId
            });
            throw error;
        }
    }

    /**
     * Request session transfer
     */
    async requestSessionTransfer(sessionId, fromAgentId, toAgentId, reason = 'transfer') {
        try {
            const transferData = {
                sessionId,
                fromAgentId,
                toAgentId,
                reason,
                transferredAt: new Date().toISOString(),
                source: 'agent-ui'
            };

            const result = await this.sendRequest('transferSession', transferData);

            logger.chat('session_transfer_requested', sessionId, {
                fromAgentId,
                toAgentId,
                reason,
                result
            });

            return result;
        } catch (error) {
            logger.error('Error requesting session transfer', {
                error: error.message,
                sessionId,
                fromAgentId,
                toAgentId
            });
            throw error;
        }
    }

    /**
     * End chat session
     */
    async endSession(sessionId, agentId, reason = 'completed', summary = null) {
        try {
            const endData = {
                sessionId,
                agentId,
                reason,
                summary,
                endedAt: new Date().toISOString(),
                source: 'agent-ui'
            };

            const result = await this.sendRequest('endSession', endData);
            this.activeChats.delete(sessionId);

            logger.chat('session_end_requested', sessionId, {
                agentId,
                reason,
                summary: summary ? 'provided' : 'none',
                result
            });

            return result;
        } catch (error) {
            logger.error('Error ending session', {
                error: error.message,
                sessionId,
                agentId,
                reason
            });
            throw error;
        }
    }

    /**
     * Get session history
     */
    async getSessionHistory(sessionId, options = {}) {
        try {
            const historyRequest = {
                sessionId,
                options: {
                    limit: options.limit || 50,
                    offset: options.offset || 0,
                    includeSystem: options.includeSystem !== false,
                    messageTypes: options.messageTypes || ['user', 'agent', 'system']
                }
            };

            const result = await this.sendRequest('getSessionHistory', historyRequest);

            logger.chat('session_history_requested', sessionId, {
                limit: historyRequest.options.limit,
                offset: historyRequest.options.offset,
                messageCount: result?.messages?.length || 0
            });

            return {
                sessionId,
                messages: (result?.messages || []).map(message => this.normalizeMessage({
                    ...message,
                    sessionId: message.sessionId || sessionId
                }))
            };
        } catch (error) {
            logger.error('Error getting session history', {
                error: error.message,
                sessionId,
                options
            });
            throw error;
        }
    }

    /**
     * Update agent status in chat backend
     */
    async updateAgentStatus(agentId, status, details = {}) {
        try {
            const statusData = {
                agentId,
                status,
                details,
                updatedAt: new Date().toISOString(),
                source: 'agent-ui'
            };

            const result = await this.sendRequest('updateAgentStatus', statusData);

            logger.chat('agent_status_updated', null, {
                agentId,
                status,
                details,
                result
            });

            return result;
        } catch (error) {
            logger.error('Error updating agent status', {
                error: error.message,
                agentId,
                status,
                details
            });
            throw error;
        }
    }

    /**
     * Send request to chat backend with timeout
     */
    async sendRequest(type, data) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                this.messageQueue.push({ type, data, resolve, reject });
                return;
            }

            const requestId = this.generateRequestId();
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error('Request timeout'));
            }, this.responseTimeout);

            this.pendingRequests.set(requestId, {
                resolve: (result) => {
                    clearTimeout(timeout);
                    resolve(result);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    reject(error);
                }
            });

            this.socket.emit('request', {
                requestId,
                type,
                data,
                timestamp: new Date().toISOString()
            });
        });
    }

    async joinSession(sessionId) {
        if (!this.isConnected || !this.socket) {
            throw new Error('Not connected to chat backend');
        }

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Join session timeout')), this.responseTimeout);
            const onJoined = data => {
                if (data?.sessionId !== sessionId) return;
                cleanup();
                resolve(data);
            };
            const onError = error => {
                cleanup();
                reject(new Error(error?.error || 'Failed to join session'));
            };
            const cleanup = () => {
                clearTimeout(timer);
                this.socket.off('sessionJoined', onJoined);
                this.socket.off('sessionError', onError);
            };

            this.socket.on('sessionJoined', onJoined);
            this.socket.once('sessionError', onError);
            this.socket.emit('joinSession', { sessionId });
        });
    }

    normalizeMessage(message = {}) {
        const sender = message.sender
            || (message.direction === 'incoming' ? 'customer' : 'agent');
        return {
            messageId: message.messageId || message.id || this.generateMessageId(),
            sessionId: message.sessionId,
            content: message.content || message.message || '',
            sender,
            senderName: message.senderName || message.agentInfo?.name || (sender === 'customer' ? 'Customer' : 'Agent'),
            timestamp: message.timestamp || message.createdAt || new Date().toISOString(),
            type: message.type || 'text',
            metadata: message.metadata || {},
            status: message.status || 'delivered'
        };
    }

    /**
     * Process queued messages
     */
    async processMessageQueue() {
        while (this.messageQueue.length > 0 && this.isConnected) {
            const { type, data, resolve, reject } = this.messageQueue.shift();
            try {
                const result = await this.sendRequest(type, data);
                resolve(result);
            } catch (error) {
                reject(error);
            }
        }
    }

    /**
     * Start heartbeat monitoring
     */
    startHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }

        this.heartbeatTimer = setInterval(() => {
            if (this.isConnected && this.socket) {
                this.socket.emit('ping');
            }
        }, this.heartbeatInterval);
    }

    /**
     * Handle reconnection
     */
    async handleReconnection() {
        if (!this.shouldReconnect || !this.canReconnect()) return;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('Max reconnection attempts reached', {
                attempts: this.reconnectAttempts,
                maxAttempts: this.maxReconnectAttempts
            });
            this.emit('maxReconnectAttemptsReached');
            return;
        }

        this.reconnectAttempts++;
        
        logger.chat('attempting_reconnection', null, {
            attempt: this.reconnectAttempts,
            maxAttempts: this.maxReconnectAttempts,
            delay: this.reconnectDelay
        });

        this.reconnectTimer = setTimeout(async () => {
            try {
                // Configured/explicit credentials remain stable. Generated
                // service credentials are intentionally reissued for every
                // reconnect attempt so an expired JWT is never reused.
                const reconnectToken = this.authTokenSource === 'generated'
                    ? undefined
                    : this.authToken;
                await this.connect(reconnectToken);
            } catch (error) {
                logger.error('Reconnection attempt failed', {
                    error: error.message,
                    attempt: this.reconnectAttempts
                });
            }
        }, this.reconnectDelay);
    }

    /**
     * Get active chats
     */
    getActiveChats() {
        return Array.from(this.activeChats.values());
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            socketId: this.socket?.id || null,
            url: this.chatBackendUrl,
            reconnectAttempts: this.reconnectAttempts,
            activeChats: this.activeChats.size,
            queuedMessages: this.messageQueue.length,
            pendingRequests: this.pendingRequests.size,
            metrics: this.connectionMetrics
        };
    }

    /**
     * Disconnect from chat backend
     */
    async disconnect() {
        try {
            this.shouldReconnect = false;
            if (this.heartbeatTimer) {
                clearInterval(this.heartbeatTimer);
                this.heartbeatTimer = null;
            }

            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }

            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }

            this.isConnected = false;
            this.activeChats.clear();
            this.pendingRequests.clear();
            this.messageQueue.length = 0;

            logger.chat('disconnected_from_backend', null, {
                reason: 'manual_disconnect'
            });

            this.emit('disconnected', { reason: 'manual' });
        } catch (error) {
            logger.error('Error disconnecting from chat backend', {
                error: error.message
            });
        }
    }

    /**
     * Generate unique IDs
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Cleanup service
     */
    async cleanup() {
        try {
            await this.disconnect();
            logger.info('ChatClientService cleanup completed');
        } catch (error) {
            logger.error('Error during ChatClientService cleanup', { error: error.message });
        }
    }

    /**
     * Get service health status
     */
    getHealthStatus() {
        return {
            status: this.isConnected ? 'healthy' : 'unhealthy',
            isConnected: this.isConnected,
            socketId: this.socket?.id || null,
            url: this.chatBackendUrl,
            activeChats: this.activeChats.size,
            queuedMessages: this.messageQueue.length,
            pendingRequests: this.pendingRequests.size,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts,
            metrics: this.connectionMetrics,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage()
        };
    }
}

module.exports = ChatClientService;
