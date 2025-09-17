const EventEmitter = require('events');
const logger = require('./logger');

class QueueService extends EventEmitter {
    constructor() {
        super();
        this.chatQueue = new Map();
        this.priorityQueue = [];
        this.escalationQueue = new Map();
        this.routingRules = new Map();
        this.queueMetrics = {
            totalQueued: 0,
            totalProcessed: 0,
            totalEscalated: 0,
            averageWaitTime: 0,
            currentQueueSize: 0
        };
        
        this.maxQueueSize = parseInt(process.env.MAX_QUEUE_SIZE) || 100;
        this.maxWaitTime = parseInt(process.env.MAX_WAIT_TIME) || 900000; // 15 minutes
        this.escalationThreshold = parseInt(process.env.ESCALATION_THRESHOLD) || 600000; // 10 minutes
        this.queueCheckInterval = parseInt(process.env.QUEUE_CHECK_INTERVAL) || 5000; // 5 seconds
        
        this.setupQueueMonitoring();
        this.initializeRoutingRules();
        
        logger.info('QueueService initialized', {
            maxQueueSize: this.maxQueueSize,
            maxWaitTime: this.maxWaitTime,
            escalationThreshold: this.escalationThreshold,
            queueCheckInterval: this.queueCheckInterval
        });
    }

    /**
     * Add customer chat to queue
     */
    async addToQueue(chatSession, priority = 'medium', requirements = {}) {
        try {
            // Check queue capacity
            if (this.chatQueue.size >= this.maxQueueSize) {
                throw new Error('Queue is at maximum capacity');
            }

            const queueId = this.generateQueueId();
            const queueEntry = {
                queueId,
                sessionId: chatSession.sessionId,
                customerId: chatSession.customerId,
                customerName: chatSession.customerName || 'Anonymous',
                priority: this.normalizePriority(priority),
                requirements: {
                    department: requirements.department || 'customer-service',
                    capabilities: requirements.capabilities || ['general-support'],
                    skillLevel: requirements.skillLevel || 'basic',
                    language: requirements.language || 'english',
                    specialization: requirements.specialization || null
                },
                queuedAt: new Date(),
                estimatedWaitTime: this.calculateEstimatedWaitTime(priority),
                attempts: 0,
                maxAttempts: requirements.maxAttempts || 3,
                escalationReason: chatSession.escalationReason || null,
                previousAgent: chatSession.previousAgent || null,
                customerData: {
                    accountType: chatSession.customerData?.accountType || 'standard',
                    membershipLevel: chatSession.customerData?.membershipLevel || 'basic',
                    issueType: chatSession.issueType || 'general',
                    urgency: chatSession.urgency || 'medium',
                    complexity: chatSession.complexity || 'standard'
                },
                metadata: {
                    source: chatSession.source || 'web',
                    userAgent: chatSession.userAgent,
                    referrer: chatSession.referrer,
                    sessionDuration: chatSession.sessionDuration || 0
                }
            };

            // Add to queue maps
            this.chatQueue.set(queueId, queueEntry);
            this.addToPriorityQueue(queueEntry);

            // Update metrics
            this.queueMetrics.totalQueued++;
            this.queueMetrics.currentQueueSize = this.chatQueue.size;

            logger.queue('chat_queued', queueId, {
                sessionId: chatSession.sessionId,
                customerId: chatSession.customerId,
                priority,
                requirements,
                queuePosition: this.getPriorityQueuePosition(queueId),
                estimatedWaitTime: queueEntry.estimatedWaitTime
            });

            this.emit('chatQueued', { queueEntry, position: this.getPriorityQueuePosition(queueId) });

            // Try immediate assignment
            await this.processQueue();

            return {
                queueId,
                position: this.getPriorityQueuePosition(queueId),
                estimatedWaitTime: queueEntry.estimatedWaitTime,
                queuedAt: queueEntry.queuedAt
            };
        } catch (error) {
            logger.error('Error adding chat to queue', {
                error: error.message,
                sessionId: chatSession?.sessionId,
                priority,
                requirements
            });
            throw error;
        }
    }

    /**
     * Process queue and assign chats to available agents
     */
    async processQueue() {
        try {
            if (this.priorityQueue.length === 0) {
                return;
            }

            // Process high priority items first
            const sortedQueue = [...this.priorityQueue].sort((a, b) => {
                // Sort by priority first, then by queue time
                const priorityDiff = this.getPriorityWeight(b.priority) - this.getPriorityWeight(a.priority);
                if (priorityDiff !== 0) return priorityDiff;
                return a.queuedAt - b.queuedAt;
            });

            for (const queueEntry of sortedQueue) {
                if (!this.chatQueue.has(queueEntry.queueId)) {
                    continue; // Already processed
                }

                try {
                    const assigned = await this.attemptAssignment(queueEntry);
                    if (assigned) {
                        await this.removeFromQueue(queueEntry.queueId, 'assigned');
                    }
                } catch (error) {
                    logger.error('Error processing queue entry', {
                        error: error.message,
                        queueId: queueEntry.queueId,
                        sessionId: queueEntry.sessionId
                    });
                }
            }
        } catch (error) {
            logger.error('Error processing queue', { error: error.message });
        }
    }

    /**
     * Attempt to assign chat to an agent
     */
    async attemptAssignment(queueEntry) {
        try {
            queueEntry.attempts++;

            // Get available agents based on requirements
            const availableAgents = await this.getMatchingAgents(queueEntry.requirements);
            
            if (availableAgents.length === 0) {
                logger.queue('no_agents_available', queueEntry.queueId, {
                    sessionId: queueEntry.sessionId,
                    requirements: queueEntry.requirements,
                    attempts: queueEntry.attempts
                });

                // Check if we should escalate due to no available agents
                if (queueEntry.attempts >= queueEntry.maxAttempts) {
                    await this.escalateChat(queueEntry, 'no_agents_available');
                    return true; // Remove from queue
                }

                return false;
            }

            // Select best agent using routing rules
            const selectedAgent = this.selectBestAgent(availableAgents, queueEntry);
            
            if (!selectedAgent) {
                return false;
            }

            // Notify agent assignment
            this.emit('assignmentRequest', {
                queueEntry,
                agentId: selectedAgent.agentId,
                agent: selectedAgent
            });

            logger.queue('assignment_attempted', queueEntry.queueId, {
                sessionId: queueEntry.sessionId,
                agentId: selectedAgent.agentId,
                agentName: selectedAgent.name,
                attempts: queueEntry.attempts,
                waitTime: Date.now() - queueEntry.queuedAt.getTime()
            });

            return true;
        } catch (error) {
            logger.error('Error attempting assignment', {
                error: error.message,
                queueId: queueEntry.queueId,
                sessionId: queueEntry.sessionId
            });
            return false;
        }
    }

    /**
     * Get matching agents for requirements
     */
    async getMatchingAgents(requirements) {
        try {
            // This would typically call the AgentService
            // For now, we'll emit an event to request available agents
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Timeout getting available agents'));
                }, 5000);

                this.emit('getAvailableAgents', {
                    requirements,
                    callback: (agents) => {
                        clearTimeout(timeout);
                        resolve(agents || []);
                    }
                });
            });
        } catch (error) {
            logger.error('Error getting matching agents', {
                error: error.message,
                requirements
            });
            return [];
        }
    }

    /**
     * Select best agent using routing rules
     */
    selectBestAgent(availableAgents, queueEntry) {
        try {
            // Apply routing rules
            const routingRule = this.getRoutingRule(queueEntry);
            
            let candidateAgents = [...availableAgents];

            // Filter by routing rule criteria
            if (routingRule) {
                candidateAgents = candidateAgents.filter(agent => 
                    this.agentMatchesRule(agent, routingRule, queueEntry)
                );
            }

            if (candidateAgents.length === 0) {
                candidateAgents = availableAgents; // Fallback to all available
            }

            // Apply selection strategy
            const strategy = routingRule?.strategy || 'priority';
            
            switch (strategy) {
                case 'round_robin':
                    return this.selectRoundRobin(candidateAgents);
                case 'least_busy':
                    return this.selectLeastBusy(candidateAgents);
                case 'skill_based':
                    return this.selectSkillBased(candidateAgents, queueEntry);
                case 'performance':
                    return this.selectByPerformance(candidateAgents);
                default:
                    return this.selectByPriority(candidateAgents);
            }
        } catch (error) {
            logger.error('Error selecting best agent', {
                error: error.message,
                queueId: queueEntry.queueId,
                agentCount: availableAgents.length
            });
            return availableAgents[0] || null;
        }
    }

    /**
     * Remove chat from queue
     */
    async removeFromQueue(queueId, reason = 'completed') {
        try {
            const queueEntry = this.chatQueue.get(queueId);
            if (!queueEntry) {
                return false;
            }

            // Remove from queue maps
            this.chatQueue.delete(queueId);
            this.removeFromPriorityQueue(queueId);

            // Update metrics
            this.queueMetrics.totalProcessed++;
            this.queueMetrics.currentQueueSize = this.chatQueue.size;

            // Calculate wait time
            const waitTime = Date.now() - queueEntry.queuedAt.getTime();
            this.updateAverageWaitTime(waitTime);

            logger.queue('chat_dequeued', queueId, {
                sessionId: queueEntry.sessionId,
                reason,
                waitTime,
                attempts: queueEntry.attempts
            });

            this.emit('chatDequeued', { queueEntry, reason, waitTime });

            return true;
        } catch (error) {
            logger.error('Error removing chat from queue', {
                error: error.message,
                queueId,
                reason
            });
            return false;
        }
    }

    /**
     * Escalate chat
     */
    async escalateChat(queueEntry, escalationReason) {
        try {
            const escalationId = this.generateEscalationId();
            const escalation = {
                escalationId,
                queueId: queueEntry.queueId,
                sessionId: queueEntry.sessionId,
                customerId: queueEntry.customerId,
                originalPriority: queueEntry.priority,
                escalatedPriority: this.calculateEscalatedPriority(queueEntry.priority),
                escalationReason,
                escalatedAt: new Date(),
                originalQueueTime: queueEntry.queuedAt,
                totalWaitTime: Date.now() - queueEntry.queuedAt.getTime(),
                attempts: queueEntry.attempts,
                requirements: {
                    ...queueEntry.requirements,
                    skillLevel: this.escalateSkillLevel(queueEntry.requirements.skillLevel),
                    urgent: true
                }
            };

            this.escalationQueue.set(escalationId, escalation);
            this.queueMetrics.totalEscalated++;

            logger.queue('chat_escalated', queueEntry.queueId, {
                escalationId,
                sessionId: queueEntry.sessionId,
                escalationReason,
                originalPriority: queueEntry.priority,
                escalatedPriority: escalation.escalatedPriority,
                totalWaitTime: escalation.totalWaitTime
            });

            this.emit('chatEscalated', { escalation, queueEntry });

            // Re-queue with higher priority
            await this.addToQueue({
                sessionId: queueEntry.sessionId,
                customerId: queueEntry.customerId,
                customerName: queueEntry.customerName,
                escalationReason,
                previousAgent: queueEntry.previousAgent
            }, escalation.escalatedPriority, escalation.requirements);

            return escalation;
        } catch (error) {
            logger.error('Error escalating chat', {
                error: error.message,
                queueId: queueEntry.queueId,
                escalationReason
            });
            throw error;
        }
    }

    /**
     * Get queue status
     */
    getQueueStatus() {
        const now = new Date();
        const queueItems = Array.from(this.chatQueue.values());
        
        const statusByPriority = {
            critical: queueItems.filter(item => item.priority === 'critical').length,
            high: queueItems.filter(item => item.priority === 'high').length,
            medium: queueItems.filter(item => item.priority === 'medium').length,
            low: queueItems.filter(item => item.priority === 'low').length
        };

        const averageWaitTime = queueItems.length > 0 ? 
            queueItems.reduce((sum, item) => sum + (now - item.queuedAt), 0) / queueItems.length : 0;

        return {
            totalInQueue: this.chatQueue.size,
            statusByPriority,
            averageWaitTime,
            longestWaitTime: queueItems.length > 0 ? 
                Math.max(...queueItems.map(item => now - item.queuedAt)) : 0,
            escalationCount: this.escalationQueue.size,
            metrics: this.queueMetrics
        };
    }

    /**
     * Initialize routing rules
     */
    initializeRoutingRules() {
        // Default routing rules
        this.routingRules.set('vip', {
            name: 'VIP Customer Routing',
            criteria: { membershipLevel: ['premium', 'vip', 'enterprise'] },
            requirements: { skillLevel: 'advanced', department: 'vip-support' },
            strategy: 'skill_based',
            priority: 100
        });

        this.routingRules.set('technical', {
            name: 'Technical Support Routing',
            criteria: { issueType: ['technical', 'billing', 'integration'] },
            requirements: { capabilities: ['technical-support'] },
            strategy: 'skill_based',
            priority: 80
        });

        this.routingRules.set('escalation', {
            name: 'Escalation Routing',
            criteria: { escalationReason: ['timeout', 'complexity', 'agent_request'] },
            requirements: { skillLevel: 'expert' },
            strategy: 'performance',
            priority: 90
        });

        this.routingRules.set('default', {
            name: 'Default Routing',
            criteria: {},
            requirements: {},
            strategy: 'priority',
            priority: 50
        });
    }

    /**
     * Priority and utility methods
     */
    normalizePriority(priority) {
        const validPriorities = ['low', 'medium', 'high', 'critical'];
        return validPriorities.includes(priority) ? priority : 'medium';
    }

    getPriorityWeight(priority) {
        const weights = { 'low': 1, 'medium': 2, 'high': 3, 'critical': 4 };
        return weights[priority] || 2;
    }

    calculateEstimatedWaitTime(priority) {
        // Simple estimation based on current queue and priority
        const queueSize = this.chatQueue.size;
        const baseTime = 120000; // 2 minutes base
        const priorityMultiplier = { 'critical': 0.5, 'high': 0.7, 'medium': 1, 'low': 1.5 };
        
        return Math.round(baseTime * (priorityMultiplier[priority] || 1) * Math.sqrt(queueSize + 1));
    }

    calculateEscalatedPriority(currentPriority) {
        const escalationMap = { 'low': 'medium', 'medium': 'high', 'high': 'critical', 'critical': 'critical' };
        return escalationMap[currentPriority] || 'high';
    }

    escalateSkillLevel(currentLevel) {
        const escalationMap = { 'basic': 'intermediate', 'intermediate': 'advanced', 'advanced': 'expert', 'expert': 'expert' };
        return escalationMap[currentLevel] || 'intermediate';
    }

    addToPriorityQueue(queueEntry) {
        this.priorityQueue.push(queueEntry);
    }

    removeFromPriorityQueue(queueId) {
        const index = this.priorityQueue.findIndex(entry => entry.queueId === queueId);
        if (index !== -1) {
            this.priorityQueue.splice(index, 1);
        }
    }

    getPriorityQueuePosition(queueId) {
        return this.priorityQueue.findIndex(entry => entry.queueId === queueId) + 1;
    }

    updateAverageWaitTime(waitTime) {
        const totalProcessed = this.queueMetrics.totalProcessed;
        const currentAverage = this.queueMetrics.averageWaitTime;
        this.queueMetrics.averageWaitTime = 
            ((currentAverage * (totalProcessed - 1)) + waitTime) / totalProcessed;
    }

    getRoutingRule(queueEntry) {
        // Find matching routing rule based on customer data and requirements
        for (const [ruleId, rule] of this.routingRules) {
            if (this.queueEntryMatchesRule(queueEntry, rule)) {
                return rule;
            }
        }
        return this.routingRules.get('default');
    }

    queueEntryMatchesRule(queueEntry, rule) {
        const { criteria } = rule;
        
        for (const [key, values] of Object.entries(criteria)) {
            const customerValue = queueEntry.customerData?.[key] || queueEntry[key];
            if (values.length > 0 && !values.includes(customerValue)) {
                return false;
            }
        }
        
        return true;
    }

    agentMatchesRule(agent, rule, queueEntry) {
        const { requirements } = rule;
        
        // Check skill level
        if (requirements.skillLevel) {
            const skillLevels = { 'basic': 1, 'intermediate': 2, 'advanced': 3, 'expert': 4 };
            const agentLevel = skillLevels[agent.skillLevel] || 1;
            const requiredLevel = skillLevels[requirements.skillLevel] || 1;
            if (agentLevel < requiredLevel) return false;
        }
        
        // Check department
        if (requirements.department && agent.department !== requirements.department) {
            return false;
        }
        
        // Check capabilities
        if (requirements.capabilities) {
            const hasCapabilities = requirements.capabilities.some(cap => 
                agent.capabilities.includes(cap)
            );
            if (!hasCapabilities) return false;
        }
        
        return true;
    }

    // Agent selection strategies
    selectByPriority(agents) {
        return agents.sort((a, b) => b.priority - a.priority)[0];
    }

    selectLeastBusy(agents) {
        return agents.sort((a, b) => a.currentChats - b.currentChats)[0];
    }

    selectRoundRobin(agents) {
        // Simple round-robin implementation
        const timestamp = Date.now();
        const index = timestamp % agents.length;
        return agents[index];
    }

    selectSkillBased(agents, queueEntry) {
        // Select agent with best skill match
        return agents.sort((a, b) => {
            const aSkillScore = this.calculateSkillScore(a, queueEntry);
            const bSkillScore = this.calculateSkillScore(b, queueEntry);
            return bSkillScore - aSkillScore;
        })[0];
    }

    selectByPerformance(agents) {
        return agents.sort((a, b) => {
            const aScore = (a.performance.customerRating * 0.6) + 
                          ((a.performance.resolvedChats / Math.max(a.performance.totalChats, 1)) * 0.4);
            const bScore = (b.performance.customerRating * 0.6) + 
                          ((b.performance.resolvedChats / Math.max(b.performance.totalChats, 1)) * 0.4);
            return bScore - aScore;
        })[0];
    }

    calculateSkillScore(agent, queueEntry) {
        let score = 0;
        
        // Skill level match
        const skillLevels = { 'basic': 1, 'intermediate': 2, 'advanced': 3, 'expert': 4 };
        const agentLevel = skillLevels[agent.skillLevel] || 1;
        const requiredLevel = skillLevels[queueEntry.requirements.skillLevel] || 1;
        score += Math.max(0, agentLevel - requiredLevel + 1) * 10;
        
        // Capability match
        const matchingCapabilities = queueEntry.requirements.capabilities.filter(cap => 
            agent.capabilities.includes(cap)
        );
        score += matchingCapabilities.length * 5;
        
        // Department match
        if (agent.department === queueEntry.requirements.department) {
            score += 15;
        }
        
        return score;
    }

    setupQueueMonitoring() {
        setInterval(async () => {
            try {
                // Check for expired queue items
                const now = Date.now();
                const expiredItems = [];
                
                for (const [queueId, queueEntry] of this.chatQueue) {
                    const waitTime = now - queueEntry.queuedAt.getTime();
                    
                    // Check for escalation threshold
                    if (waitTime > this.escalationThreshold && queueEntry.attempts === 0) {
                        expiredItems.push({ queueEntry, reason: 'wait_time_exceeded' });
                    }
                    
                    // Check for maximum wait time
                    if (waitTime > this.maxWaitTime) {
                        expiredItems.push({ queueEntry, reason: 'max_wait_exceeded' });
                    }
                }
                
                // Process expired items
                for (const { queueEntry, reason } of expiredItems) {
                    await this.escalateChat(queueEntry, reason);
                    await this.removeFromQueue(queueEntry.queueId, 'escalated');
                }
                
                // Process queue
                await this.processQueue();
                
            } catch (error) {
                logger.error('Error in queue monitoring', { error: error.message });
            }
        }, this.queueCheckInterval);
    }

    generateQueueId() {
        return `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateEscalationId() {
        return `escalation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Cleanup service
     */
    async cleanup() {
        try {
            // Process remaining queue items
            for (const [queueId, queueEntry] of this.chatQueue) {
                await this.removeFromQueue(queueId, 'service_shutdown');
            }
            
            logger.info('QueueService cleanup completed');
        } catch (error) {
            logger.error('Error during QueueService cleanup', { error: error.message });
        }
    }

    /**
     * Get service health status
     */
    getHealthStatus() {
        const queueItems = Array.from(this.chatQueue.values());
        const now = new Date();
        
        return {
            status: 'healthy',
            currentQueueSize: this.chatQueue.size,
            escalationQueueSize: this.escalationQueue.size,
            maxQueueSize: this.maxQueueSize,
            averageWaitTime: this.queueMetrics.averageWaitTime,
            longestWaitTime: queueItems.length > 0 ? 
                Math.max(...queueItems.map(item => now - item.queuedAt)) : 0,
            metrics: this.queueMetrics,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage()
        };
    }
}

module.exports = QueueService;