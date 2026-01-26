const EventEmitter = require('events');
const axios = require('axios');
const logger = require('./logger');

class AgentService extends EventEmitter {
    constructor() {
        super();
        this.agents = new Map();
        this.agentSessions = new Map();
        this.agentCapabilities = new Map();
        this.statusUpdateInterval = parseInt(process.env.AGENT_STATUS_UPDATE_INTERVAL) || 30000;
        this.idleTimeout = parseInt(process.env.AGENT_IDLE_TIMEOUT) || 1800000; // 30 minutes
        this.maxConcurrentChats = parseInt(process.env.MAX_CONCURRENT_CHATS) || 10;
        
        this.setupStatusMonitoring();
        
        logger.info('AgentService initialized', {
            statusUpdateInterval: this.statusUpdateInterval,
            idleTimeout: this.idleTimeout,
            maxConcurrentChats: this.maxConcurrentChats
        });
    }

    /**
     * Register an agent
     */
    async registerAgent(agentData) {
        try {
            const agentId = agentData.agentId || this.generateAgentId();
            const now = new Date();

            const agent = {
                agentId,
                name: agentData.name,
                email: agentData.email,
                department: agentData.department || 'customer-service',
                role: agentData.role || 'agent',
                status: 'available',
                capabilities: agentData.capabilities || ['general-support'],
                skillLevel: agentData.skillLevel || 'intermediate',
                languages: agentData.languages || ['english'],
                registeredAt: now,
                lastActivity: now,
                lastStatusUpdate: now,
                isOnline: true,
                currentChats: new Set(),
                chatHistory: [],
                performance: {
                    totalChats: 0,
                    resolvedChats: 0,
                    averageResponseTime: 0,
                    customerRating: 0,
                    escalationsReceived: 0,
                    escalationsGiven: 0
                },
                preferences: {
                    maxConcurrentChats: this.maxConcurrentChats,
                    autoAcceptChats: agentData.autoAcceptChats || false,
                    notificationSound: agentData.notificationSound !== false,
                    priority: agentData.priority || 'medium'
                },
                metadata: {
                    userAgent: agentData.userAgent,
                    ipAddress: agentData.ipAddress,
                    deviceInfo: agentData.deviceInfo,
                    loginLocation: agentData.loginLocation
                }
            };

            this.agents.set(agentId, agent);
            this.agentCapabilities.set(agentId, new Set(agent.capabilities));

            logger.agent('agent_registered', agentId, {
                name: agent.name,
                department: agent.department,
                capabilities: agent.capabilities,
                skillLevel: agent.skillLevel
            });

            this.emit('agentRegistered', { agentId, agent });

            return agent;
        } catch (error) {
            logger.error('Error registering agent', {
                error: error.message,
                agentData: Object.keys(agentData)
            });
            throw error;
        }
    }

    /**
     * Update agent status
     */
    async updateAgentStatus(agentId, status, details = {}) {
        try {
            const agent = this.agents.get(agentId);
            if (!agent) {
                throw new Error('Agent not found');
            }

            const previousStatus = agent.status;
            agent.status = status;
            agent.lastStatusUpdate = new Date();
            agent.lastActivity = new Date();

            // Handle status-specific logic
            switch (status) {
                case 'available':
                    agent.isOnline = true;
                    break;
                case 'busy':
                    agent.isOnline = true;
                    break;
                case 'away':
                    agent.isOnline = true;
                    break;
                case 'offline':
                    agent.isOnline = false;
                    // End all active chats if going offline
                    await this.endAllAgentChats(agentId, 'agent_offline');
                    break;
                case 'break':
                    agent.isOnline = false;
                    break;
            }

            // Update status reason if provided
            if (details.reason) {
                agent.statusReason = details.reason;
            }

            logger.agent('status_updated', agentId, {
                previousStatus,
                newStatus: status,
                reason: details.reason,
                isOnline: agent.isOnline
            });

            this.emit('agentStatusUpdated', { agentId, agent, previousStatus, newStatus: status });

            return agent;
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
     * Assign chat to agent
     */
    async assignChatToAgent(agentId, chatSession) {
        try {
            const agent = this.agents.get(agentId);
            if (!agent) {
                throw new Error('Agent not found');
            }

            // Check if agent is available
            if (!agent.isOnline || agent.status === 'offline') {
                throw new Error('Agent is not available');
            }

            // Check chat capacity
            if (agent.currentChats.size >= agent.preferences.maxConcurrentChats) {
                throw new Error('Agent has reached maximum chat capacity');
            }

            // Assign chat
            agent.currentChats.add(chatSession.sessionId);
            agent.lastActivity = new Date();
            
            // Update performance metrics
            agent.performance.totalChats++;
            agent.performance.escalationsReceived++;

            // Add to chat history
            agent.chatHistory.unshift({
                sessionId: chatSession.sessionId,
                customerId: chatSession.customerId,
                customerName: chatSession.customerName,
                priority: chatSession.priority,
                startTime: new Date(),
                status: 'active',
                escalationReason: chatSession.escalationReason
            });

            // Update agent status to busy if at capacity
            if (agent.currentChats.size >= agent.preferences.maxConcurrentChats) {
                await this.updateAgentStatus(agentId, 'busy', { reason: 'max_capacity_reached' });
            }

            logger.agent('chat_assigned', agentId, {
                sessionId: chatSession.sessionId,
                customerId: chatSession.customerId,
                priority: chatSession.priority,
                currentChatCount: agent.currentChats.size,
                escalationReason: chatSession.escalationReason
            });

            this.emit('chatAssigned', { agentId, agent, chatSession });

            return {
                agentId,
                agent: {
                    agentId: agent.agentId,
                    name: agent.name,
                    department: agent.department,
                    skillLevel: agent.skillLevel
                },
                assignedAt: new Date(),
                chatCount: agent.currentChats.size
            };
        } catch (error) {
            logger.error('Error assigning chat to agent', {
                error: error.message,
                agentId,
                sessionId: chatSession?.sessionId
            });
            throw error;
        }
    }

    /**
     * Remove chat from agent
     */
    async removeChatFromAgent(agentId, sessionId, resolution = 'completed') {
        try {
            const agent = this.agents.get(agentId);
            if (!agent) {
                throw new Error('Agent not found');
            }

            if (!agent.currentChats.has(sessionId)) {
                throw new Error('Chat not assigned to agent');
            }

            // Remove from current chats
            agent.currentChats.delete(sessionId);
            agent.lastActivity = new Date();

            // Update chat history
            const chatHistoryIndex = agent.chatHistory.findIndex(chat => chat.sessionId === sessionId);
            if (chatHistoryIndex !== -1) {
                agent.chatHistory[chatHistoryIndex].endTime = new Date();
                agent.chatHistory[chatHistoryIndex].status = resolution;
                agent.chatHistory[chatHistoryIndex].duration = 
                    agent.chatHistory[chatHistoryIndex].endTime - agent.chatHistory[chatHistoryIndex].startTime;
            }

            // Update performance metrics
            if (resolution === 'resolved' || resolution === 'completed') {
                agent.performance.resolvedChats++;
            }

            // Update agent status if now available
            if (agent.currentChats.size === 0 && agent.status === 'busy') {
                await this.updateAgentStatus(agentId, 'available', { reason: 'chat_completed' });
            }

            logger.agent('chat_removed', agentId, {
                sessionId,
                resolution,
                remainingChatCount: agent.currentChats.size,
                totalResolved: agent.performance.resolvedChats
            });

            this.emit('chatRemoved', { agentId, agent, sessionId, resolution });

            return agent;
        } catch (error) {
            logger.error('Error removing chat from agent', {
                error: error.message,
                agentId,
                sessionId,
                resolution
            });
            throw error;
        }
    }

    /**
     * Get available agents for chat assignment
     */
    getAvailableAgents(requirements = {}) {
        try {
            const availableAgents = [];

            for (const [agentId, agent] of this.agents) {
                // Check basic availability
                if (!agent.isOnline || agent.status === 'offline' || agent.status === 'break') {
                    continue;
                }

                // Check capacity
                if (agent.currentChats.size >= agent.preferences.maxConcurrentChats) {
                    continue;
                }

                // Check capabilities if specified
                if (requirements.capabilities && requirements.capabilities.length > 0) {
                    const agentCapabilities = this.agentCapabilities.get(agentId);
                    const hasRequiredCapabilities = requirements.capabilities.some(cap => 
                        agentCapabilities.has(cap)
                    );
                    if (!hasRequiredCapabilities) {
                        continue;
                    }
                }

                // Check department if specified
                if (requirements.department && agent.department !== requirements.department) {
                    continue;
                }

                // Check skill level if specified
                if (requirements.minSkillLevel) {
                    const skillLevels = { 'basic': 1, 'intermediate': 2, 'advanced': 3, 'expert': 4 };
                    const agentLevel = skillLevels[agent.skillLevel] || 1;
                    const requiredLevel = skillLevels[requirements.minSkillLevel] || 1;
                    if (agentLevel < requiredLevel) {
                        continue;
                    }
                }

                // Check language if specified
                if (requirements.language && !agent.languages.includes(requirements.language)) {
                    continue;
                }

                availableAgents.push({
                    agentId,
                    name: agent.name,
                    department: agent.department,
                    status: agent.status,
                    currentChats: agent.currentChats.size,
                    maxChats: agent.preferences.maxConcurrentChats,
                    skillLevel: agent.skillLevel,
                    capabilities: agent.capabilities,
                    languages: agent.languages,
                    performance: {
                        totalChats: agent.performance.totalChats,
                        resolvedChats: agent.performance.resolvedChats,
                        customerRating: agent.performance.customerRating
                    },
                    priority: this.calculateAgentPriority(agent)
                });
            }

            // Sort by priority (higher is better)
            availableAgents.sort((a, b) => b.priority - a.priority);

            return availableAgents;
        } catch (error) {
            logger.error('Error getting available agents', {
                error: error.message,
                requirements
            });
            return [];
        }
    }

    /**
     * Calculate agent priority for assignment
     */
    calculateAgentPriority(agent) {
        let priority = 100; // Base priority

        // Availability bonus
        if (agent.status === 'available') priority += 50;
        else if (agent.status === 'busy') priority += 20;

        // Workload penalty
        const workloadRatio = agent.currentChats.size / agent.preferences.maxConcurrentChats;
        priority -= (workloadRatio * 30);

        // Performance bonus
        if (agent.performance.totalChats > 0) {
            const resolutionRate = agent.performance.resolvedChats / agent.performance.totalChats;
            priority += (resolutionRate * 20);
            
            if (agent.performance.customerRating > 0) {
                priority += (agent.performance.customerRating * 5);
            }
        }

        // Skill level bonus
        const skillBonus = { 'basic': 0, 'intermediate': 5, 'advanced': 10, 'expert': 15 };
        priority += (skillBonus[agent.skillLevel] || 0);

        // Recent activity bonus
        const timeSinceActivity = Date.now() - agent.lastActivity.getTime();
        if (timeSinceActivity < 300000) { // 5 minutes
            priority += 10;
        }

        return Math.max(0, Math.round(priority));
    }

    /**
     * Get agent by ID
     */
    getAgent(agentId) {
        return this.agents.get(agentId) || null;
    }

    /**
     * Get all agents
     */
    getAllAgents() {
        return Array.from(this.agents.values());
    }

    /**
     * Update agent activity
     */
    updateAgentActivity(agentId, activity = 'general') {
        try {
            const agent = this.agents.get(agentId);
            if (agent) {
                agent.lastActivity = new Date();
                
                logger.debug('Agent activity updated', {
                    agentId,
                    activity,
                    timestamp: agent.lastActivity
                });
            }
        } catch (error) {
            logger.error('Error updating agent activity', {
                error: error.message,
                agentId,
                activity
            });
        }
    }

    /**
     * End all chats for an agent
     */
    async endAllAgentChats(agentId, reason = 'agent_unavailable') {
        try {
            const agent = this.agents.get(agentId);
            if (!agent) {
                return;
            }

            const chatSessions = Array.from(agent.currentChats);
            for (const sessionId of chatSessions) {
                await this.removeChatFromAgent(agentId, sessionId, reason);
                
                // Notify that chat needs to be reassigned
                this.emit('chatNeedsReassignment', { sessionId, reason, previousAgentId: agentId });
            }

            logger.agent('all_chats_ended', agentId, {
                reason,
                chatCount: chatSessions.length,
                sessionIds: chatSessions
            });
        } catch (error) {
            logger.error('Error ending all agent chats', {
                error: error.message,
                agentId,
                reason
            });
        }
    }

    /**
     * Setup status monitoring
     */
    setupStatusMonitoring() {
        setInterval(() => {
            try {
                const now = Date.now();
                
                for (const [agentId, agent] of this.agents) {
                    // Check for idle agents
                    const timeSinceActivity = now - agent.lastActivity.getTime();
                    
                    if (agent.isOnline && timeSinceActivity > this.idleTimeout) {
                        logger.agent('agent_idle_timeout', agentId, {
                            timeSinceActivity,
                            previousStatus: agent.status
                        });
                        
                        this.updateAgentStatus(agentId, 'away', { reason: 'idle_timeout' });
                    }
                }
            } catch (error) {
                logger.error('Error in status monitoring', { error: error.message });
            }
        }, this.statusUpdateInterval);
    }

    /**
     * Generate unique agent ID
     */
    generateAgentId() {
        return `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Cleanup service
     */
    async cleanup() {
        try {
            // Mark all agents as offline
            for (const [agentId, agent] of this.agents) {
                if (agent.isOnline) {
                    await this.updateAgentStatus(agentId, 'offline', { reason: 'service_shutdown' });
                }
            }
            
            logger.info('AgentService cleanup completed');
        } catch (error) {
            logger.error('Error during AgentService cleanup', { error: error.message });
        }
    }

    /**
     * Get service health status
     */
    getHealthStatus() {
        const agents = Array.from(this.agents.values());
        const onlineAgents = agents.filter(a => a.isOnline);
        const availableAgents = agents.filter(a => a.isOnline && a.status === 'available');
        const busyAgents = agents.filter(a => a.isOnline && a.status === 'busy');

        return {
            status: 'healthy',
            totalAgents: agents.length,
            onlineAgents: onlineAgents.length,
            availableAgents: availableAgents.length,
            busyAgents: busyAgents.length,
            totalActiveChats: agents.reduce((sum, agent) => sum + agent.currentChats.size, 0),
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage()
        };
    }
}

module.exports = AgentService;