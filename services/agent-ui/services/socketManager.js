const EventEmitter = require('events');
const socketIo = require('socket.io');
const logger = require('./logger');
const { validateAgentToken } = require('./authClient');
const { intent } = require('./queuePrivacy');

class SocketManager extends EventEmitter {
    constructor(server) {
        super();
        this.server = server;
        this.io = null;
        this.connectedAgents = new Map();
        this.agentSockets = new Map();
        this.roomManager = new Map();
        this.messageQueue = new Map();
        this.sessionAssignments = new Map();
        
        this.setupSocketServer();
        
        logger.info('SocketManager initialized', {
            serverType: typeof server,
            hasServer: !!server
        });
    }

    /**
     * Setup Socket.IO server
     */
    setupSocketServer() {
        const configuredOrigins = process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS;
        const allowedOrigins = configuredOrigins
            ? configuredOrigins.split(',').map(origin => origin.trim()).filter(Boolean)
            : ['http://localhost:3000', 'http://localhost:8081'];
        this.io = socketIo(this.server, {
            cors: {
                origin: allowedOrigins,
                methods: ["GET", "POST"],
                credentials: true
            },
            transports: ['websocket', 'polling'],
            pingTimeout: 60000,
            pingInterval: 25000
        });

        this.io.on('connection', (socket) => {
            logger.socket('agent_connected', socket.id, {
                remoteAddress: socket.request.connection.remoteAddress,
                userAgent: socket.request.headers['user-agent']
            });

            this.handleAgentConnection(socket);
        });

        logger.info('Socket.IO server setup completed');
    }

    /**
     * Handle agent connection
     */
    handleAgentConnection(socket) {
        // Agent authentication handler
        socket.on('authenticate', async (authData) => {
            try {
                const { agentId, token, agentInfo } = authData;
                
                // Validate agent authentication
                const validation = await this.validateAgentAuth(agentId, token);
                if (!validation.valid) {
                    socket.emit('authError', { message: 'Invalid authentication' });
                    socket.disconnect(true);
                    return;
                }

                // Register agent
                const canonicalAgentId = validation.userId || agentId;
                await this.registerAgent(socket, canonicalAgentId, agentInfo || {}, validation);
                
                socket.emit('authenticated', {
                    agentId: canonicalAgentId,
                    socketId: socket.id,
                    timestamp: new Date().toISOString()
                });

                logger.socket('agent_authenticated', socket.id, {
                    agentId: canonicalAgentId,
                    agentName: agentInfo?.name
                });

            } catch (error) {
                logger.error('Error authenticating agent', {
                    error: error.message,
                    socketId: socket.id
                });
                socket.emit('authError', { message: 'Authentication failed' });
                socket.disconnect(true);
            }
        });

        // Agent status updates
        socket.on('updateStatus', async (statusData) => {
            try {
                const agent = this.getAuthenticatedAgent(socket);
                if (!agent) {
                    socket.emit('error', { message: 'Agent not authenticated' });
                    return;
                }

                await this.updateAgentStatus(agent.agentId, statusData);
                
                socket.emit('statusUpdated', {
                    status: statusData.status,
                    timestamp: new Date().toISOString()
                });

                // Broadcast status to admin clients
                this.broadcastToAdmins('agentStatusChanged', {
                    agentId: agent.agentId,
                    status: statusData.status,
                    details: statusData.details
                });

            } catch (error) {
                logger.error('Error updating agent status', {
                    error: error.message,
                    socketId: socket.id
                });
                socket.emit('error', { message: 'Failed to update status' });
            }
        });

        // Chat message handling
        socket.on('sendMessage', async (messageData) => {
            try {
                const agent = this.getAuthenticatedAgent(socket);
                if (!agent) {
                    socket.emit('error', { message: 'Agent not authenticated' });
                    return;
                }

                await this.handleChatMessage(agent.agentId, messageData);
                
                socket.emit('messageSent', {
                    messageId: messageData.messageId,
                    sessionId: messageData.sessionId,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                logger.error('Error sending message', {
                    error: error.message,
                    socketId: socket.id,
                    sessionId: messageData?.sessionId
                });
                socket.emit('messageError', {
                    messageId: messageData?.messageId,
                    error: error.message
                });
            }
        });

        // Chat session management
        socket.on('acceptChat', async (chatData) => {
            try {
                const agent = this.getAuthenticatedAgent(socket);
                if (!agent) {
                    socket.emit('error', { message: 'Agent not authenticated' });
                    return;
                }

                const accepted = await this.acceptChatAssignment(agent.agentId, chatData);
                if (!this.getAuthenticatedAgent(socket)) throw new Error('Agent authentication expired');
                
                // Join chat room
                socket.join(`chat_${chatData.sessionId}`);
                
                this.updateSessionAssignment(chatData.sessionId, agent.agentId);
                agent.activeChats.add(chatData.sessionId);

                socket.emit('chatAccepted', {
                    sessionId: accepted.sessionId, customerId: accepted.customerId, customerName: accepted.customerName,
                    customerData: accepted.customerData, intent: accepted.intent || null,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                logger.error('Error accepting chat', {
                    error: error.message,
                    socketId: socket.id,
                    sessionId: chatData?.sessionId
                });
                socket.emit('chatError', {
                    sessionId: chatData?.sessionId,
                    error: error.message
                });
            }
        });

        socket.on('rejectChat', async (chatData) => {
            try {
                const agent = this.getAuthenticatedAgent(socket);
                if (!agent) {
                    socket.emit('error', { message: 'Agent not authenticated' });
                    return;
                }

                await this.rejectChatAssignment(agent.agentId, chatData);
                
                socket.emit('chatRejected', {
                    sessionId: chatData.sessionId,
                    reason: chatData.reason,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                logger.error('Error rejecting chat', {
                    error: error.message,
                    socketId: socket.id,
                    sessionId: chatData?.sessionId
                });
                socket.emit('chatError', {
                    sessionId: chatData?.sessionId,
                    error: error.message
                });
            }
        });

        socket.on('endChat', async (chatData) => {
            try {
                const agent = this.getAuthenticatedAgent(socket);
                if (!agent) {
                    socket.emit('error', { message: 'Agent not authenticated' });
                    return;
                }

                await this.endChatSession(agent.agentId, chatData);
                
                // Leave chat room
                socket.leave(`chat_${chatData.sessionId}`);
                this.updateSessionAssignment(chatData.sessionId, null);
                
                socket.emit('chatEnded', {
                    sessionId: chatData.sessionId,
                    reason: chatData.reason,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                logger.error('Error ending chat', {
                    error: error.message,
                    socketId: socket.id,
                    sessionId: chatData?.sessionId
                });
                socket.emit('chatError', {
                    sessionId: chatData?.sessionId,
                    error: error.message
                });
            }
        });

        socket.on('transferChat', async (transferData) => {
            try {
                const agent = this.getAuthenticatedAgent(socket);
                if (!agent) {
                    socket.emit('error', { message: 'Agent not authenticated' });
                    return;
                }

                await this.transferChatSession(agent.agentId, transferData);
                this.updateSessionAssignment(transferData.sessionId, transferData.toAgentId);
                
                socket.emit('chatTransferred', {
                    sessionId: transferData.sessionId,
                    toAgentId: transferData.toAgentId,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                logger.error('Error transferring chat', {
                    error: error.message,
                    socketId: socket.id,
                    sessionId: transferData?.sessionId
                });
                socket.emit('transferError', {
                    sessionId: transferData?.sessionId,
                    error: error.message
                });
            }
        });

        socket.on('escalateChat', async (chatData) => {
            try {
                const agent = this.getAuthenticatedAgent(socket);
                if (!agent) {
                    socket.emit('error', { message: 'Agent not authenticated' });
                    return;
                }
                this.assertAssignedAgent(agent.agentId, chatData?.sessionId);
                await this.runIntegration('escalateChat', { agentId: agent.agentId, chatData });
                this.updateSessionAssignment(chatData.sessionId, null);
                socket.leave(`chat_${chatData.sessionId}`);
                socket.emit('chatEnded', {
                    sessionId: chatData.sessionId,
                    reason: 'escalated',
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                socket.emit('chatError', { sessionId: chatData?.sessionId, error: error.message });
            }
        });

        // Queue management
        socket.on('getQueueStatus', async () => {
            try {
                if (!this.getAuthenticatedAgent(socket)) {
                    socket.emit('error', { message: 'Agent not authenticated' });
                    return;
                }
                const queueStatus = await this.getQueueStatus();
                socket.emit('queueStatus', queueStatus);

            } catch (error) {
                logger.error('Error getting queue status', {
                    error: error.message,
                    socketId: socket.id
                });
                socket.emit('error', { message: 'Failed to get queue status' });
            }
        });

        // Agent management
        socket.on('getAgentList', async () => {
            try {
                const agent = this.getAuthenticatedAgent(socket);
                if (!agent) {
                    socket.emit('error', { message: 'Agent not authenticated' });
                    return;
                }

                const agentList = await this.getAgentList();
                socket.emit('agentList', agentList);

            } catch (error) {
                logger.error('Error getting agent list', {
                    error: error.message,
                    socketId: socket.id
                });
                socket.emit('error', { message: 'Failed to get agent list' });
            }
        });

        // Chat history requests
        socket.on('getChatHistory', async (historyRequest) => {
            try {
                const agent = this.getAuthenticatedAgent(socket);
                if (!agent) {
                    socket.emit('error', { message: 'Agent not authenticated' });
                    return;
                }

                const chatHistory = await this.getChatHistory(agent.agentId, historyRequest);
                socket.emit('chatHistory', chatHistory);

            } catch (error) {
                logger.error('Error getting chat history', {
                    error: error.message,
                    socketId: socket.id,
                    sessionId: historyRequest?.sessionId
                });
                socket.emit('error', { message: 'Failed to get chat history' });
            }
        });

        // Customer info requests
        socket.on('getCustomerInfo', async (customerRequest) => {
            try {
                const agent = this.getAuthenticatedAgent(socket);
                if (!agent) {
                    socket.emit('error', { message: 'Agent not authenticated' });
                    return;
                }

                if (!this.isAssigned(agent, customerRequest?.sessionId)) throw new Error('Assigned session required');
                const customerInfo = await this.getCustomerInfo(agent.agentId, customerRequest);
                socket.emit('customerInfo', {
                    customerId: customerRequest.customerId,
                    info: customerInfo
                });

            } catch (error) {
                logger.error('Error getting customer info', {
                    error: error.message,
                    socketId: socket.id,
                    customerId: customerRequest?.customerId
                });
                socket.emit('error', { message: 'Failed to get customer info' });
            }
        });

        socket.on('updatePreferences', async (preferences) => {
            try {
                const agent = this.getAuthenticatedAgent(socket);
                if (!agent) {
                    socket.emit('error', { message: 'Agent not authenticated' });
                    return;
                }

                const updated = await this.runIntegration('updatePreferences', {
                    agentId: agent.agentId,
                    preferences
                });
                socket.emit('preferencesUpdated', updated);
            } catch (error) {
                socket.emit('preferencesError', { message: error.message });
            }
        });

        // Typing indicators
        socket.on('typing', (typingData) => {
            const agent = this.getAuthenticatedAgent(socket);
            if (agent && this.isAssigned(agent, typingData?.sessionId)) {
                this.broadcastToChatRoom(`chat_${typingData.sessionId}`, 'agentTyping', {
                    agentId: agent.agentId,
                    isTyping: typingData.isTyping === true
                }, socket.id);
            }
        });

        // Disconnect handler
        socket.on('disconnect', (reason) => {
            this.handleAgentDisconnection(socket, reason);
        });

        // Error handler
        socket.on('error', (error) => {
            logger.error('Socket error', {
                error: error.message,
                socketId: socket.id
            });
        });
    }

    getAuthenticatedAgent(socket) {
        const agent = this.connectedAgents.get(socket.id);
        if (!agent) return null;
        if (!Number.isFinite(agent.expiresAt) || agent.expiresAt <= Date.now()) {
            this.handleAgentDisconnection(socket, 'token_expired');
            socket.disconnect?.(true);
            return null;
        }
        return agent;
    }

    isAssigned(agent, sessionId) {
        return typeof sessionId === 'string' && agent.activeChats.has(sessionId)
            && this.sessionAssignments.get(sessionId) === agent.agentId;
    }

    assertAssignedAgent(agentId, sessionId) {
        const agent = this.authenticatedAgent(agentId);
        if (!this.isAssigned(agent, sessionId)) throw new Error('Assigned session required');
        return agent;
    }

    authenticatedAgent(agentId) {
        const socketId = this.agentSockets.get(agentId);
        const socket = socketId && this.io.sockets.sockets.get(socketId);
        const agent = socket && this.getAuthenticatedAgent(socket);
        if (!agent) throw new Error('Agent authentication required');
        return agent;
    }

    updateSessionAssignment(sessionId, agentId) {
        if (typeof sessionId !== 'string' || !sessionId) return;
        if (typeof agentId === 'string' && agentId) this.sessionAssignments.set(sessionId, agentId);
        else this.sessionAssignments.delete(sessionId);
        for (const agent of this.connectedAgents.values()) {
            if (agent.agentId === agentId && Number.isFinite(agent.expiresAt) && agent.expiresAt > Date.now()) {
                agent.activeChats.add(sessionId);
                this.io.sockets.sockets.get(agent.socketId)?.join(`chat_${sessionId}`);
            }
            if (agent.agentId !== agentId && agent.activeChats.has(sessionId)) {
                agent.activeChats.delete(sessionId);
                this.io.sockets.sockets.get(agent.socketId)?.leave(`chat_${sessionId}`);
            }
        }
    }

    /**
     * Register agent
     */
    async registerAgent(socket, agentId, agentInfo, validation) {
        const previousSocketId = this.agentSockets.get(agentId);
        if (previousSocketId && previousSocketId !== socket.id) {
            const previous = this.io.sockets.sockets.get(previousSocketId);
            if (previous) { this.handleAgentDisconnection(previous, 'identity_replaced'); previous.disconnect(true); }
        }
        if (this.connectedAgents.has(socket.id)) this.handleAgentDisconnection(socket, 'reauthenticated');
        const agent = {
            agentId,
            socketId: socket.id,
            name: agentInfo.name || agentId,
            email: agentInfo.email || '',
            department: agentInfo.department || 'customer-service',
            role: 'agent',
            roles: validation.roles,
            expiresAt: validation.expiresAt,
            status: 'available',
            connectedAt: new Date(),
            lastActivity: new Date(),
            activeChats: new Set(),
            capabilities: agentInfo.capabilities || []
        };

        this.connectedAgents.set(socket.id, agent);
        this.agentSockets.set(agentId, socket.id);
        agent.expiryTimer = setTimeout(() => { this.handleAgentDisconnection(socket, 'token_expired'); socket.emit('authError', { message: 'Agent access token expired' }); socket.disconnect(true); }, Math.max(1, Math.min(2147483647, agent.expiresAt - Date.now())));
        agent.expiryTimer.unref?.();

        // Join agent rooms
        socket.join('agents');
        socket.join(`agent_${agentId}`);
        socket.join(`department_${agent.department}`);

        // Emit agent registration events
        await this.runIntegration('agentRegistered', { agent, socket });
        
        // Broadcast to other agents/admins
        this.broadcastToAgents('agentOnline', {
            agentId,
            name: agent.name,
            department: agent.department,
            connectedAt: agent.connectedAt
        }, socket.id);

        logger.socket('agent_registered', socket.id, {
            agentId,
            name: agent.name,
            department: agent.department
        });
    }

    /**
     * Handle agent disconnection
     */
    handleAgentDisconnection(socket, reason) {
        const agent = this.connectedAgents.get(socket.id);
        
        if (agent) {
            logger.socket('agent_disconnected', socket.id, {
                agentId: agent.agentId,
                name: agent.name,
                reason,
                connectionDuration: Date.now() - agent.connectedAt.getTime()
            });

            // Clean up agent data
            clearTimeout(agent.expiryTimer);
            for (const sessionId of agent.activeChats) socket.leave(`chat_${sessionId}`);
            socket.leave('agents');
            this.connectedAgents.delete(socket.id);
            if (this.agentSockets.get(agent.agentId) === socket.id) this.agentSockets.delete(agent.agentId);

            // Handle active chats
            if (agent.activeChats.size > 0) {
                this.handleAgentChatsOnDisconnect(agent);
            }

            // Emit disconnection events
            this.emit('agentDisconnected', { agent, reason });
            
            // Broadcast to other agents/admins
            this.broadcastToAgents('agentOffline', {
                agentId: agent.agentId,
                name: agent.name,
                reason,
                disconnectedAt: new Date()
            }, socket.id);
        }
    }

    /**
     * Send chat assignment to agent
     */
    async sendChatAssignment(agentId, chatSession) {
        try {
            const socketId = this.agentSockets.get(agentId);
            if (!socketId) {
                throw new Error('Agent not connected');
            }

            const socket = this.io.sockets.sockets.get(socketId);
            if (!socket) {
                throw new Error('Agent socket not found');
            }

            const assignment = {
                queueId: chatSession.queueId,
                sessionId: chatSession.sessionId,
                intent: intent(chatSession.intent),
                priority: chatSession.priority,

                estimatedWaitTime: chatSession.estimatedWaitTime,

                assignedAt: new Date().toISOString(),
                autoAccept: false // Require manual acceptance
            };

            if (!this.getAuthenticatedAgent(socket)) throw new Error('Agent authentication required');
            socket.emit('chatAssignment', assignment);

            logger.socket('chat_assignment_sent', socketId, {
                agentId,
                sessionId: chatSession.sessionId,
                customerId: chatSession.customerId,
                priority: chatSession.priority
            });

            return true;
        } catch (error) {
            logger.error('Error sending chat assignment', {
                error: error.message,
                agentId,
                sessionId: chatSession?.sessionId
            });
            throw error;
        }
    }

    /**
     * Send message to chat room
     */
    async sendMessageToChatRoom(sessionId, message) {
        try {
            const roomName = `chat_${sessionId}`;
            
            for (const [socketId, candidate] of this.connectedAgents) {
                const socket = this.io.sockets.sockets.get(socketId);
                const agent = socket && this.getAuthenticatedAgent(socket);
                if (!agent || !this.isAssigned(agent, sessionId)) {
                    if (candidate.activeChats.has(sessionId)) { candidate.activeChats.delete(sessionId); socket?.leave(roomName); }
                    continue;
                }
                socket.emit('messageReceived', {
                    sessionId, messageId: message.messageId || message.id, content: message.content,
                    sender: message.sender, timestamp: message.timestamp, type: message.type
                });
            }

            logger.socket('message_sent_to_room', roomName, {
                sessionId,
                messageId: message.messageId,
                sender: message.sender,
                type: message.type
            });

            return true;
        } catch (error) {
            logger.error('Error sending message to chat room', {
                error: error.message,
                sessionId,
                messageId: message?.messageId
            });
            throw error;
        }
    }

    /**
     * Notify agent of queue updates
     */
    async notifyQueueUpdate(agentId, queueUpdate) {
        try {
            const socketId = this.agentSockets.get(agentId);
            if (socketId) {
                const socket = this.io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.emit('queueUpdate', queueUpdate);
                }
            }
        } catch (error) {
            logger.error('Error notifying queue update', {
                error: error.message,
                agentId
            });
        }
    }

    /**
     * Broadcast to all agents
     */
    broadcastToAgents(event, data, excludeSocketId = null) {
        try {
            if (event !== 'queueStatus') {
                data = { sessionId: data?.sessionId, intent: intent(data?.intent), agentId: data?.agentId,
                    status: ['available', 'busy', 'away', 'offline'].includes(data?.status) ? data.status : undefined };
            }
            for (const socketId of this.connectedAgents.keys()) {
                const socket = this.io.sockets.sockets.get(socketId);
                if (socket && socketId !== excludeSocketId && this.getAuthenticatedAgent(socket)) socket.emit(event, data);
            }

            logger.debug('Broadcast to agents', {
                event,
                excludeSocketId,
                agentCount: this.connectedAgents.size
            });
        } catch (error) {
            logger.error('Error broadcasting to agents', {
                error: error.message,
                event
            });
        }
    }

    /**
     * Broadcast to chat room
     */
    broadcastToChatRoom(roomName, event, data, excludeSocketId = null) {
        try {
            const sessionId = typeof roomName === 'string' && roomName.startsWith('chat_') ? roomName.slice(5) : null;
            for (const socketId of this.connectedAgents.keys()) {
                const socket = this.io.sockets.sockets.get(socketId);
                const agent = socket && this.getAuthenticatedAgent(socket);
                if (agent && socketId !== excludeSocketId && this.isAssigned(agent, sessionId)) socket.emit(event, data);
            }
        } catch (error) {
            logger.error('Error broadcasting to chat room', {
                error: error.message,
                roomName,
                event
            });
        }
    }

    /**
     * Broadcast to admin clients
     */
    broadcastToAdmins(event, data) {
        try {
            this.io.to('admins').emit(event, data);
        } catch (error) {
            logger.error('Error broadcasting to admins', {
                error: error.message,
                event
            });
        }
    }

    /**
     * Get connected agents
     */
    getConnectedAgents() {
        return Array.from(this.connectedAgents.values()).map(agent => ({
            agentId: agent.agentId,
            name: agent.name,
            department: agent.department,
            status: agent.status,
            connectedAt: agent.connectedAt,
            activeChats: agent.activeChats.size,
            lastActivity: agent.lastActivity
        }));
    }

    /**
     * Update agent activity
     */
    updateAgentActivity(socketId) {
        const agent = this.connectedAgents.get(socketId);
        if (agent) {
            agent.lastActivity = new Date();
        }
    }

    /**
     * Service integration methods (to be connected with other services)
     */
    async validateAgentAuth(agentId, token) {
        const validation = await validateAgentToken(token);
        if (!validation.valid) {
            logger.warn('Agent auth rejected: invalid token', { agentId });
            return validation;
        }

        if (agentId && String(validation.userId) !== String(agentId)) {
            logger.warn('Agent auth rejected: token/agentId mismatch', {
                agentId,
                tokenAgentId: validation.userId
            });
            return { valid: false };
        }

        return validation;
    }

    async updateAgentStatus(agentId, statusData) {
        return this.runIntegration('updateAgentStatus', { agentId, statusData });
    }

    async handleChatMessage(agentId, messageData) {
        this.assertAssignedAgent(agentId, messageData?.sessionId);
        return this.runIntegration('chatMessage', { agentId, messageData });
    }

    async acceptChatAssignment(agentId, chatData) {
        return this.runIntegration('acceptChat', { agentId, chatData });
    }

    async rejectChatAssignment(agentId, chatData) {
        return this.runIntegration('rejectChat', { agentId, chatData });
    }

    async endChatSession(agentId, chatData) {
        this.assertAssignedAgent(agentId, chatData?.sessionId);
        return this.runIntegration('endChat', { agentId, chatData });
    }

    async transferChatSession(agentId, transferData) {
        this.assertAssignedAgent(agentId, transferData?.sessionId);
        return this.runIntegration('transferChat', { agentId, transferData });
    }

    async getQueueStatus() {
        return this.runIntegration('getQueueStatus', {});
    }

    async getAgentList() {
        return this.runIntegration('getAgentList', {});
    }

    async getChatHistory(agentId, historyRequest) {
        this.authenticatedAgent(agentId);
        const result = await this.runIntegration('getChatHistory', { agentId, historyRequest: { ...historyRequest, agentId } });
        this.authenticatedAgent(agentId);
        if (!historyRequest?.sessionId) return { messages: [], chats: (Array.isArray(result?.chats) ? result.chats : []).map(chat => ({ sessionId: chat.sessionId, intent: intent(chat.intent), status: ['active', 'completed', 'resolved', 'transferred', 'ended'].includes(chat.status) ? chat.status : 'unknown', startTime: chat.startTime })) };
        // The owning chat backend verifies the persisted assignee under its
        // session lock, including ended sessions that have not been reassigned.
        return result;
    }

    async getCustomerInfo(agentId, customerRequest) {
        this.assertAssignedAgent(agentId, customerRequest?.sessionId);
        const result = await this.runIntegration('getCustomerInfo', { ...customerRequest, agentId });
        this.assertAssignedAgent(agentId, customerRequest?.sessionId);
        return result;
    }

    async runIntegration(event, payload) {
        const handlers = this.listeners(event);
        if (handlers.length === 0) {
            throw new Error(`No integration registered for ${event}`);
        }

        const results = await Promise.all(handlers.map(handler => handler(payload)));
        return results[0];
    }

    async handleAgentChatsOnDisconnect(agent) {
        // Handle reassignment of active chats when agent disconnects
        for (const sessionId of agent.activeChats) {
            this.emit('agentDisconnectedWithChats', {
                agentId: agent.agentId,
                sessionId,
                reason: 'agent_disconnected'
            });
        }
    }

    /**
     * Get service health status
     */
    getHealthStatus() {
        return {
            status: 'healthy',
            connectedAgents: this.connectedAgents.size,
            totalConnections: this.io?.engine?.clientsCount || 0,
            rooms: Object.keys(this.io?.sockets?.adapter?.rooms || {}).length,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage()
        };
    }

    /**
     * Cleanup service
     */
    async cleanup() {
        try {
            // Disconnect all agents
            for (const socketId of this.connectedAgents.keys()) {
                const socket = this.io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.emit('serverShutdown', { message: 'Server is shutting down' });
                    socket.disconnect(true);
                }
            }

            // Close socket server
            if (this.io) {
                this.io.close();
            }

            this.connectedAgents.clear();
            this.agentSockets.clear();
            this.roomManager.clear();
            this.sessionAssignments.clear();
            this.messageQueue.clear();

            logger.info('SocketManager cleanup completed');
        } catch (error) {
            logger.error('Error during SocketManager cleanup', { error: error.message });
        }
    }
}

module.exports = SocketManager;
