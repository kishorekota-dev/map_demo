const EventEmitter = require('events');
const http = require('http');
const socketIo = require('socket.io');
const logger = require('./logger');

class SocketManager extends EventEmitter {
    constructor(server) {
        super();
        this.server = server;
        this.io = null;
        this.connectedAgents = new Map();
        this.agentSockets = new Map();
        this.roomManager = new Map();
        this.messageQueue = new Map();
        
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
        this.io = socketIo(this.server, {
            cors: {
                origin: process.env.CORS_ORIGIN || "*",
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
                const isValid = await this.validateAgentAuth(agentId, token);
                if (!isValid) {
                    socket.emit('authError', { message: 'Invalid authentication' });
                    socket.disconnect(true);
                    return;
                }

                // Register agent
                await this.registerAgent(socket, agentId, agentInfo);
                
                socket.emit('authenticated', {
                    agentId,
                    socketId: socket.id,
                    timestamp: new Date().toISOString()
                });

                logger.socket('agent_authenticated', socket.id, {
                    agentId,
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
                const agent = this.connectedAgents.get(socket.id);
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
                const agent = this.connectedAgents.get(socket.id);
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
                const agent = this.connectedAgents.get(socket.id);
                if (!agent) {
                    socket.emit('error', { message: 'Agent not authenticated' });
                    return;
                }

                await this.acceptChatAssignment(agent.agentId, chatData);
                
                // Join chat room
                socket.join(`chat_${chatData.sessionId}`);
                
                socket.emit('chatAccepted', {
                    sessionId: chatData.sessionId,
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
                const agent = this.connectedAgents.get(socket.id);
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
                const agent = this.connectedAgents.get(socket.id);
                if (!agent) {
                    socket.emit('error', { message: 'Agent not authenticated' });
                    return;
                }

                await this.endChatSession(agent.agentId, chatData);
                
                // Leave chat room
                socket.leave(`chat_${chatData.sessionId}`);
                
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
                const agent = this.connectedAgents.get(socket.id);
                if (!agent) {
                    socket.emit('error', { message: 'Agent not authenticated' });
                    return;
                }

                await this.transferChatSession(agent.agentId, transferData);
                
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

        // Queue management
        socket.on('getQueueStatus', async () => {
            try {
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
                const agent = this.connectedAgents.get(socket.id);
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
                const agent = this.connectedAgents.get(socket.id);
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
                const agent = this.connectedAgents.get(socket.id);
                if (!agent) {
                    socket.emit('error', { message: 'Agent not authenticated' });
                    return;
                }

                const customerInfo = await this.getCustomerInfo(customerRequest.customerId);
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

        // Typing indicators
        socket.on('typing', (typingData) => {
            const agent = this.connectedAgents.get(socket.id);
            if (agent && typingData.sessionId) {
                this.broadcastToChatRoom(`chat_${typingData.sessionId}`, 'agentTyping', {
                    agentId: agent.agentId,
                    agentName: agent.name,
                    isTyping: typingData.isTyping
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

    /**
     * Register agent
     */
    async registerAgent(socket, agentId, agentInfo) {
        const agent = {
            agentId,
            socketId: socket.id,
            name: agentInfo.name,
            email: agentInfo.email,
            department: agentInfo.department,
            role: agentInfo.role,
            status: 'available',
            connectedAt: new Date(),
            lastActivity: new Date(),
            activeChats: new Set(),
            capabilities: agentInfo.capabilities || []
        };

        this.connectedAgents.set(socket.id, agent);
        this.agentSockets.set(agentId, socket.id);

        // Join agent rooms
        socket.join('agents');
        socket.join(`agent_${agentId}`);
        socket.join(`department_${agent.department}`);

        // Emit agent registration events
        this.emit('agentRegistered', { agent, socket });
        
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
            this.connectedAgents.delete(socket.id);
            this.agentSockets.delete(agent.agentId);

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
                sessionId: chatSession.sessionId,
                customerId: chatSession.customerId,
                customerName: chatSession.customerName,
                priority: chatSession.priority,
                escalationReason: chatSession.escalationReason,
                customerData: chatSession.customerData,
                estimatedWaitTime: chatSession.estimatedWaitTime,
                assignedAt: new Date().toISOString(),
                autoAccept: false // Require manual acceptance
            };

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
            
            this.io.to(roomName).emit('messageReceived', {
                sessionId,
                messageId: message.messageId,
                content: message.content,
                sender: message.sender,
                senderName: message.senderName,
                timestamp: message.timestamp,
                type: message.type,
                metadata: message.metadata
            });

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
            if (excludeSocketId) {
                this.io.to('agents').except(excludeSocketId).emit(event, data);
            } else {
                this.io.to('agents').emit(event, data);
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
            if (excludeSocketId) {
                this.io.to(roomName).except(excludeSocketId).emit(event, data);
            } else {
                this.io.to(roomName).emit(event, data);
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
        // This would integrate with authentication service
        this.emit('validateAuth', { agentId, token });
        return true; // Placeholder
    }

    async updateAgentStatus(agentId, statusData) {
        this.emit('updateAgentStatus', { agentId, statusData });
    }

    async handleChatMessage(agentId, messageData) {
        this.emit('chatMessage', { agentId, messageData });
    }

    async acceptChatAssignment(agentId, chatData) {
        this.emit('acceptChat', { agentId, chatData });
    }

    async rejectChatAssignment(agentId, chatData) {
        this.emit('rejectChat', { agentId, chatData });
    }

    async endChatSession(agentId, chatData) {
        this.emit('endChat', { agentId, chatData });
    }

    async transferChatSession(agentId, transferData) {
        this.emit('transferChat', { agentId, transferData });
    }

    async getQueueStatus() {
        return new Promise((resolve) => {
            this.emit('getQueueStatus', { callback: resolve });
        });
    }

    async getAgentList() {
        return new Promise((resolve) => {
            this.emit('getAgentList', { callback: resolve });
        });
    }

    async getChatHistory(agentId, historyRequest) {
        return new Promise((resolve) => {
            this.emit('getChatHistory', { agentId, historyRequest, callback: resolve });
        });
    }

    async getCustomerInfo(customerId) {
        return new Promise((resolve) => {
            this.emit('getCustomerInfo', { customerId, callback: resolve });
        });
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
            for (const [socketId, agent] of this.connectedAgents) {
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
            this.messageQueue.clear();

            logger.info('SocketManager cleanup completed');
        } catch (error) {
            logger.error('Error during SocketManager cleanup', { error: error.message });
        }
    }
}

module.exports = SocketManager;