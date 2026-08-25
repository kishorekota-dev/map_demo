const express = require('express');
const router = express.Router();
const logger = require('../services/logger');
const { verifyToken } = require('./auth');

async function requireSessionOwnership(req, res, next) {
    try {
        const sessionId = req.params.sessionId || req.query.sessionId ||
            req.headers['x-session-id'] || req.body?.sessionId;
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID required', timestamp: new Date().toISOString() });
        }

        const sessionManager = req.app.locals.services?.sessionManager;
        if (!sessionManager) {
            return res.status(503).json({ error: 'Session service not available', timestamp: new Date().toISOString() });
        }

        const session = await sessionManager.getSession(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found', sessionId, timestamp: new Date().toISOString() });
        }

        if (String(session.userId) !== String(req.user.userId)) {
            return res.status(403).json({ error: 'Access denied', timestamp: new Date().toISOString() });
        }

        req.ownedSession = session;
        return next();
    } catch (error) {
        return next(error);
    }
}

// Reusable handler: process a session message (used by both /sessions/:sessionId/messages and /chat/message compatibility)
async function processSessionMessageHandler(req, res, next) {
    try {
        const { sessionId } = req.params;
        const { content, type, metadata } = req.body;

        if (!content) {
            return res.status(400).json({ error: 'Message content required', timestamp: new Date().toISOString() });
        }

        const { chatService, agentOrchestrator, sessionManager } = req.app.locals.services;

        if (!chatService || !agentOrchestrator || !sessionManager) {
            return res.status(503).json({ error: 'Services not available', timestamp: new Date().toISOString() });
        }

        // Get session (try sessionManager first, then fallback to chatService if present)
        let session = null;
        try {
            if (sessionManager && typeof sessionManager.getSession === 'function') {
                session = await sessionManager.getSession(sessionId);
            }
        } catch (err) {
            // ignore and try chatService fallback
            session = null;
        }

        // If sessionManager doesn't know about this session, check chatService (in-memory chat sessions)
        if (!session && chatService && typeof chatService.getSession === 'function') {
            try {
                const cs = chatService.getSession(sessionId);
                if (cs) session = cs;
            } catch (err) {
                // keep session null
            }
        }

        if (!session) {
            return res.status(404).json({ error: 'Session not found', sessionId, timestamp: new Date().toISOString() });
        }

        // Process message via chatService
        const message = await chatService.processMessage(
            sessionId,
            {
                content,
                type: type || 'text',
                attachments: req.body.attachments || []
            },
            metadata || {}
        );

        // Carry the authenticated identity through to the orchestrator. Banking
        // tools require the bearer token and pending workflows use the user id
        // when they resume on a later REST request.
        const authToken = req.headers.authorization?.startsWith('Bearer ')
            ? req.headers.authorization.substring(7)
            : null;
        const userId = req.user?.userId || session.userId;
        const conversationContext = {
            ...(session.state || {}),
            userId,
            authToken
        };
        const enrichedMessage = {
            ...message,
            sessionId,
            userId,
            authToken
        };

        // Process through orchestrator
        const agentResult = await agentOrchestrator.processMessage(
            sessionId,
            enrichedMessage,
            conversationContext
        );

        const finalResponse = agentResult.finalResponse || {};
        const responseIntent = finalResponse.metadata?.intent
            || conversationContext.lockedIntent
            || (typeof finalResponse.source === 'string'
                ? finalResponse.source.replace(/-/g, '_')
                : null);
        const responseMetadata = {
            ...(finalResponse.metadata || {}),
            ...(responseIntent ? { intent: responseIntent } : {})
        };
        const responsePayload = {
            ...finalResponse,
            metadata: responseMetadata
        };

        // Send response
        const response = await chatService.sendResponse(
            sessionId,
            responsePayload,
            {
                agentId: finalResponse.source || 'orchestrator',
                agentType: finalResponse.source || 'ai',
                confidence: finalResponse.confidence,
                processingTime: agentResult.processingTime
            }
        );

        // Persist state returned by the workflow so follow-up REST requests can
        // resume pending confirmation/clarification flows.
        if (agentResult.conversationContextUpdates) {
            await sessionManager.updateSessionState(
                sessionId,
                agentResult.conversationContextUpdates
            );
        }

        logger.info('Message processed via REST API', { sessionId, messageId: message.id, responseId: response.id });

        return res.status(200).json({
            message,
            response,
            agentResult: {
                processingTime: agentResult.processingTime,
                agentsInvolved: agentResult.agentsInvolved,
                intent: responseIntent,
                confidence: finalResponse.confidence ?? null,
                source: finalResponse.source || null,
                metadata: responseMetadata,
                finalResponse: responsePayload
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Message processing error via REST API', {
            error: error.message,
            sessionId: req.params?.sessionId,
            messageContent: req.body?.content?.substring(0, 100)
        });

        return res.status(500).json({ error: 'Failed to process message', details: error.message, timestamp: new Date().toISOString() });
    }
}

// Reusable handler: retrieve session history (used by both /sessions/:sessionId/history and /chat/history compatibility)
async function getSessionHistoryHandler(req, res, next) {
    try {
        const { sessionId } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        const { chatService } = req.app.locals.services;
        if (!chatService) {
            return res.status(503).json({ error: 'Chat service not available', timestamp: new Date().toISOString() });
        }

        const history = await chatService.getConversationHistory(sessionId, limit);

        return res.status(200).json({ sessionId, history, count: history.length, timestamp: new Date().toISOString() });

    } catch (error) {
        logger.error('History retrieval error', { error: error.message, sessionId: req.params.sessionId });
        return res.status(500).json({ error: 'Failed to retrieve history', details: error.message, timestamp: new Date().toISOString() });
    }
}

/**
 * Compatibility routes for frontend expectations
 * - POST /api/chat/message -> maps to POST /api/sessions/:sessionId/messages
 * - GET  /api/chat/history -> maps to GET /api/sessions/:sessionId/history
 */

// Convenience POST /api/chat/message
router.post('/chat/message', verifyToken, requireSessionOwnership, async (req, res, next) => {
    try {
        // frontend sends { message, context } with X-Session-ID header
        const sessionId = req.headers['x-session-id'] || req.body?.sessionId;

        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID required in X-Session-ID header or body', timestamp: new Date().toISOString() });
        }

        // Delegate to the reusable handler
        req.params.sessionId = sessionId;
        req.body.content = req.body.message;

        return processSessionMessageHandler(req, res, next);
    } catch (err) {
        next(err);
    }
});

// Convenience GET /api/chat/history
router.get('/chat/history', verifyToken, requireSessionOwnership, async (req, res, next) => {
    try {
        // frontend may provide sessionId as query param
        const sessionId = req.query.sessionId;
        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId query parameter required', timestamp: new Date().toISOString() });
        }

        // Forward to the existing sessions/:sessionId/history handler
        req.params.sessionId = sessionId;
        return getSessionHistoryHandler(req, res, next);
    } catch (err) {
        next(err);
    }
});

/**
 * @route POST /api/process
 * @desc Process incoming messages from external services
 * @access Private (inter-service communication)
 */
router.post('/process', async (req, res) => {
    try {
        const { message, conversationContext, sessionInfo } = req.body;

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
router.get('/sessions/:sessionId/history', verifyToken, requireSessionOwnership, async (req, res) => {
    return getSessionHistoryHandler(req, res);
});

/**
 * @route GET /api/sessions/:sessionId
 * @desc Get session information
 * @access Private
 */
router.get('/sessions/:sessionId', verifyToken, requireSessionOwnership, async (req, res) => {
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
router.post('/sessions', verifyToken, async (req, res) => {
    try {
        const { userData, metadata } = req.body;
        const userId = req.user.userId;

        if (req.body.userId && String(req.body.userId) !== String(userId)) {
            return res.status(403).json({
                error: 'Cannot create a session for another user',
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

        // Create session manager session first to generate canonical sessionId
        const session = await sessionManager.createSession(userId, metadata || {});

        // Use the sessionManager-generated sessionId when creating chatService session so both stay in sync
        const chatSession = await chatService.createChatSession(userId, session.sessionId, userData || {});

        logger.info('Session created via REST API', {
            sessionId: session.sessionId,
            userId
        });

        res.status(201).json({
            sessionId: session.sessionId,
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
router.post('/sessions/:sessionId/messages', verifyToken, requireSessionOwnership, async (req, res) => {
    return processSessionMessageHandler(req, res);
});

/**
 * @route DELETE /api/sessions/:sessionId
 * @desc End a session
 * @access Private
 */
router.delete('/sessions/:sessionId', verifyToken, requireSessionOwnership, async (req, res) => {
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
