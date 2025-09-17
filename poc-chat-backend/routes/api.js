const express = require('express');
const router = express.Router();
const logger = require('../services/logger');

/**
 * @route POST /api/process
 * @desc Process incoming messages from external services
 * @access Private (inter-service communication)
 */
router.post('/process', async (req, res) => {
    try {
        const { message, conversationContext, previousResults, sessionInfo } = req.body;

        if (!message || !sessionInfo) {
            return res.status(400).json({
                error: 'Message and session info required',
                timestamp: new Date().toISOString()
            });
        }

        // Get services from app locals
        const { chatService, agentOrchestrator } = req.app.locals.services;
        
        if (!chatService || !agentOrchestrator) {
            return res.status(503).json({
                error: 'Services not available',
                timestamp: new Date().toISOString()
            });
        }

        logger.info('Processing external message', {
            sessionId: sessionInfo.sessionId,
            messageId: message.id,
            agentType: req.headers['x-agent-type']
        });

        // Process message through orchestrator
        const result = await agentOrchestrator.processMessage(
            sessionInfo.sessionId,
            message,
            conversationContext || {}
        );

        res.status(200).json({
            success: true,
            result,
            timestamp: new Date().toISOString(),
            processingTime: result.processingTime
        });

    } catch (error) {
        logger.error('Message processing error', {
            error: error.message,
            sessionId: req.body?.sessionInfo?.sessionId,
            messageId: req.body?.message?.id
        });

        res.status(500).json({
            error: 'Message processing failed',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @route GET /api/sessions/:sessionId/history
 * @desc Get conversation history for a session
 * @access Private
 */
router.get('/sessions/:sessionId/history', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        const { chatService } = req.app.locals.services;
        
        if (!chatService) {
            return res.status(503).json({
                error: 'Chat service not available',
                timestamp: new Date().toISOString()
            });
        }

        const history = chatService.getConversationHistory(sessionId, limit);

        res.status(200).json({
            sessionId,
            history,
            count: history.length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('History retrieval error', {
            error: error.message,
            sessionId: req.params.sessionId
        });

        res.status(500).json({
            error: 'Failed to retrieve history',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @route GET /api/sessions/:sessionId
 * @desc Get session information
 * @access Private
 */
router.get('/sessions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        const { sessionManager } = req.app.locals.services;
        
        if (!sessionManager) {
            return res.status(503).json({
                error: 'Session service not available',
                timestamp: new Date().toISOString()
            });
        }

        const session = await sessionManager.getSession(sessionId);

        if (!session) {
            return res.status(404).json({
                error: 'Session not found',
                sessionId,
                timestamp: new Date().toISOString()
            });
        }

        res.status(200).json({
            session,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Session retrieval error', {
            error: error.message,
            sessionId: req.params.sessionId
        });

        res.status(500).json({
            error: 'Failed to retrieve session',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @route POST /api/sessions
 * @desc Create a new session (REST API alternative to WebSocket)
 * @access Private
 */
router.post('/sessions', async (req, res) => {
    try {
        const { userId, userData, metadata } = req.body;

        if (!userId) {
            return res.status(400).json({
                error: 'User ID required',
                timestamp: new Date().toISOString()
            });
        }

        const { chatService, sessionManager } = req.app.locals.services;
        
        if (!chatService || !sessionManager) {
            return res.status(503).json({
                error: 'Services not available',
                timestamp: new Date().toISOString()
            });
        }

        // Create chat session
        const chatSession = await chatService.createChatSession(userId, null, userData || {});

        // Create session manager session
        const session = await sessionManager.createSession(userId, metadata || {});

        logger.info('Session created via REST API', {
            sessionId: chatSession.sessionId,
            userId
        });

        res.status(201).json({
            sessionId: chatSession.sessionId,
            chatSession,
            session,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Session creation error', {
            error: error.message,
            userId: req.body?.userId
        });

        res.status(500).json({
            error: 'Failed to create session',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @route POST /api/sessions/:sessionId/messages
 * @desc Send a message to a session (REST API alternative to WebSocket)
 * @access Private
 */
router.post('/sessions/:sessionId/messages', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { content, type, metadata } = req.body;

        if (!content) {
            return res.status(400).json({
                error: 'Message content required',
                timestamp: new Date().toISOString()
            });
        }

        const { chatService, agentOrchestrator, sessionManager } = req.app.locals.services;
        
        if (!chatService || !agentOrchestrator || !sessionManager) {
            return res.status(503).json({
                error: 'Services not available',
                timestamp: new Date().toISOString()
            });
        }

        // Get session
        const session = await sessionManager.getSession(sessionId);
        if (!session) {
            return res.status(404).json({
                error: 'Session not found',
                sessionId,
                timestamp: new Date().toISOString()
            });
        }

        // Process message
        const message = await chatService.processMessage(
            sessionId,
            {
                content,
                type: type || 'text',
                attachments: req.body.attachments || []
            },
            metadata || {}
        );

        // Process through orchestrator
        const agentResult = await agentOrchestrator.processMessage(
            sessionId,
            message,
            session.state || {}
        );

        // Send response
        const response = await chatService.sendResponse(
            sessionId,
            agentResult.finalResponse,
            {
                agentId: 'orchestrator',
                agentType: 'ai',
                processingTime: agentResult.processingTime
            }
        );

        logger.info('Message processed via REST API', {
            sessionId,
            messageId: message.id,
            responseId: response.id
        });

        res.status(200).json({
            message,
            response,
            agentResult: {
                processingTime: agentResult.processingTime,
                agentsInvolved: agentResult.agentsInvolved
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Message processing error via REST API', {
            error: error.message,
            sessionId: req.params.sessionId,
            messageContent: req.body?.content?.substring(0, 100)
        });

        res.status(500).json({
            error: 'Failed to process message',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @route DELETE /api/sessions/:sessionId
 * @desc End a session
 * @access Private
 */
router.delete('/sessions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { reason } = req.body;

        const { chatService, sessionManager } = req.app.locals.services;
        
        if (!chatService || !sessionManager) {
            return res.status(503).json({
                error: 'Services not available',
                timestamp: new Date().toISOString()
            });
        }

        // End sessions
        await chatService.endSession(sessionId, reason || 'api_request');
        await sessionManager.endSession(sessionId, reason || 'api_request');

        logger.info('Session ended via REST API', {
            sessionId,
            reason: reason || 'api_request'
        });

        res.status(200).json({
            success: true,
            sessionId,
            reason: reason || 'api_request',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Session ending error via REST API', {
            error: error.message,
            sessionId: req.params.sessionId
        });

        res.status(500).json({
            error: 'Failed to end session',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @route GET /api/agents
 * @desc Get available agents and their status
 * @access Private
 */
router.get('/agents', async (req, res) => {
    try {
        const { agentOrchestrator } = req.app.locals.services;
        
        if (!agentOrchestrator) {
            return res.status(503).json({
                error: 'Agent orchestrator not available',
                timestamp: new Date().toISOString()
            });
        }

        const status = agentOrchestrator.getHealthStatus();

        res.status(200).json({
            agents: status.agentStatuses || [],
            summary: {
                totalAgents: status.totalAgents,
                activeAgents: status.activeAgents,
                healthyAgents: status.healthyAgents
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Agent status retrieval error', {
            error: error.message
        });

        res.status(500).json({
            error: 'Failed to retrieve agent status',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;