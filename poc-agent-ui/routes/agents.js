const express = require('express');
const router = express.Router();
const logger = require('../services/logger');

/**
 * Agent management routes
 */

// Get all agents
router.get('/', (req, res) => {
    try {
        const agentService = req.app.get('agentService');
        const agents = agentService.getAllAgents();
        
        const agentList = agents.map(agent => ({
            agentId: agent.agentId,
            name: agent.name,
            email: agent.email,
            department: agent.department,
            role: agent.role,
            status: agent.status,
            isOnline: agent.isOnline,
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
            lastActivity: agent.lastActivity,
            registeredAt: agent.registeredAt
        }));

        res.json({
            success: true,
            agents: agentList,
            total: agentList.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error getting agents list', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to get agents list'
        });
    }
});

// Get agent by ID
router.get('/:agentId', (req, res) => {
    try {
        const { agentId } = req.params;
        const agentService = req.app.get('agentService');
        const agent = agentService.getAgent(agentId);

        if (!agent) {
            return res.status(404).json({
                success: false,
                error: 'Agent not found'
            });
        }

        res.json({
            success: true,
            agent: {
                agentId: agent.agentId,
                name: agent.name,
                email: agent.email,
                department: agent.department,
                role: agent.role,
                status: agent.status,
                isOnline: agent.isOnline,
                currentChats: Array.from(agent.currentChats),
                chatHistory: agent.chatHistory.slice(0, 10), // Last 10 chats
                performance: agent.performance,
                capabilities: agent.capabilities,
                skillLevel: agent.skillLevel,
                languages: agent.languages,
                preferences: agent.preferences,
                lastActivity: agent.lastActivity,
                registeredAt: agent.registeredAt
            }
        });
    } catch (error) {
        logger.error('Error getting agent', { 
            error: error.message, 
            agentId: req.params.agentId 
        });
        res.status(500).json({
            success: false,
            error: 'Failed to get agent'
        });
    }
});

// Register new agent
router.post('/register', async (req, res) => {
    try {
        const agentService = req.app.get('agentService');
        const agentData = {
            ...req.body,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        };

        const agent = await agentService.registerAgent(agentData);

        logger.info('Agent registered via API', {
            agentId: agent.agentId,
            name: agent.name,
            department: agent.department
        });

        res.status(201).json({
            success: true,
            agent: {
                agentId: agent.agentId,
                name: agent.name,
                email: agent.email,
                department: agent.department,
                status: agent.status,
                registeredAt: agent.registeredAt
            }
        });
    } catch (error) {
        logger.error('Error registering agent', { 
            error: error.message,
            requestBody: Object.keys(req.body)
        });
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Update agent status
router.patch('/:agentId/status', async (req, res) => {
    try {
        const { agentId } = req.params;
        const { status, reason } = req.body;

        if (!status) {
            return res.status(400).json({
                success: false,
                error: 'Status is required'
            });
        }

        const agentService = req.app.get('agentService');
        const agent = await agentService.updateAgentStatus(agentId, status, { reason });

        res.json({
            success: true,
            agent: {
                agentId: agent.agentId,
                status: agent.status,
                isOnline: agent.isOnline,
                lastStatusUpdate: agent.lastStatusUpdate
            }
        });
    } catch (error) {
        logger.error('Error updating agent status', {
            error: error.message,
            agentId: req.params.agentId,
            status: req.body.status
        });
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Get available agents for assignment
router.get('/available/for-assignment', (req, res) => {
    try {
        const agentService = req.app.get('agentService');
        const requirements = {
            department: req.query.department,
            capabilities: req.query.capabilities ? req.query.capabilities.split(',') : undefined,
            skillLevel: req.query.skillLevel,
            language: req.query.language
        };

        const availableAgents = agentService.getAvailableAgents(requirements);

        res.json({
            success: true,
            agents: availableAgents,
            total: availableAgents.length,
            requirements,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error getting available agents', {
            error: error.message,
            requirements: req.query
        });
        res.status(500).json({
            success: false,
            error: 'Failed to get available agents'
        });
    }
});

// Assign chat to agent
router.post('/:agentId/assign-chat', async (req, res) => {
    try {
        const { agentId } = req.params;
        const chatSession = req.body;

        const agentService = req.app.get('agentService');
        const assignment = await agentService.assignChatToAgent(agentId, chatSession);

        logger.info('Chat assigned to agent via API', {
            agentId,
            sessionId: chatSession.sessionId,
            customerId: chatSession.customerId
        });

        res.json({
            success: true,
            assignment
        });
    } catch (error) {
        logger.error('Error assigning chat to agent', {
            error: error.message,
            agentId: req.params.agentId,
            sessionId: req.body?.sessionId
        });
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Remove chat from agent
router.delete('/:agentId/chats/:sessionId', async (req, res) => {
    try {
        const { agentId, sessionId } = req.params;
        const { resolution } = req.query;

        const agentService = req.app.get('agentService');
        const agent = await agentService.removeChatFromAgent(agentId, sessionId, resolution);

        res.json({
            success: true,
            agent: {
                agentId: agent.agentId,
                currentChats: agent.currentChats.size,
                status: agent.status
            }
        });
    } catch (error) {
        logger.error('Error removing chat from agent', {
            error: error.message,
            agentId: req.params.agentId,
            sessionId: req.params.sessionId
        });
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Get agent performance stats
router.get('/:agentId/performance', (req, res) => {
    try {
        const { agentId } = req.params;
        const agentService = req.app.get('agentService');
        const agent = agentService.getAgent(agentId);

        if (!agent) {
            return res.status(404).json({
                success: false,
                error: 'Agent not found'
            });
        }

        const performance = {
            ...agent.performance,
            currentChats: agent.currentChats.size,
            maxChats: agent.preferences.maxConcurrentChats,
            utilizationRate: agent.currentChats.size / agent.preferences.maxConcurrentChats,
            recentChatHistory: agent.chatHistory.slice(0, 20),
            lastActivity: agent.lastActivity,
            onlineTime: agent.registeredAt ? Date.now() - agent.registeredAt.getTime() : 0
        };

        res.json({
            success: true,
            agentId,
            performance,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error getting agent performance', {
            error: error.message,
            agentId: req.params.agentId
        });
        res.status(500).json({
            success: false,
            error: 'Failed to get agent performance'
        });
    }
});

// Update agent activity
router.post('/:agentId/activity', (req, res) => {
    try {
        const { agentId } = req.params;
        const { activity } = req.body;

        const agentService = req.app.get('agentService');
        agentService.updateAgentActivity(agentId, activity);

        res.json({
            success: true,
            agentId,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error updating agent activity', {
            error: error.message,
            agentId: req.params.agentId
        });
        res.status(500).json({
            success: false,
            error: 'Failed to update agent activity'
        });
    }
});

module.exports = router;