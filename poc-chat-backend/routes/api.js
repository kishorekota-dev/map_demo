const express = require('express');
const router = express.Router();
const logger = require('../services/logger');

/**
 * Compatibility routes for frontend expectations
 * - POST /api/chat/message -> maps to POST /api/sessions/:sessionId/messages
 * - GET  /api/chat/history -> maps to GET /api/sessions/:sessionId/history
 */

// Convenience POST /api/chat/message
router.post('/chat/message', async (req, res) => {
    try {
        // frontend sends { message, context } with X-Session-ID header
        const sessionId = req.headers['x-session-id'] || req.body?.sessionId;

        if (!sessionId) {
            return res.status(400).json({ 
                error: 'Session ID required in X-Session-ID header or body', 
                timestamp: new Date().toISOString() 
            });
        }

        const content = req.body.message || req.body.content;
        const type = req.body.type || 'text';
        const metadata = req.body.metadata || req.body.context || {};

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

        // Get or create session
        let session = await sessionManager.getSession(sessionId);
        let actualSessionId = sessionId; // Track the actual session ID to use
        
        if (!session) {
            // Auto-create session if it doesn't exist
            const userId = req.body.userId || req.headers['x-user-id'] || 'anonymous';
            try {
                // Create session manager session first (it will generate its own sessionId)
                session = await sessionManager.createSession(userId, {
                    autoCreated: true,
                    createdAt: new Date().toISOString(),
                    requestedSessionId: sessionId // Store the originally requested ID for reference
                });
                
                // Use the session ID that was actually created
                actualSessionId = session.sessionId;
                
                // Create chat session with the same sessionId
                await chatService.createChatSession(userId, actualSessionId, {
                    autoCreated: true
                });
                
                logger.info('Auto-created session', { 
                    requestedSessionId: sessionId,
                    actualSessionId: actualSessionId,
                    userId 
                });
            } catch (createError) {
                logger.error('Failed to auto-create session', {
                    error: createError.message,
                    sessionId,
                    userId
                });
                return res.status(500).json({
                    error: 'Failed to create session',
                    details: createError.message,
                    timestamp: new Date().toISOString()
                });
            }
        }

        // Process message  
        logger.debug('About to process message', { 
            sessionId: actualSessionId, 
            hasSession: !!session,
            content: content ? content.substring(0, 50) : 'NO_CONTENT',
            contentType: typeof content,
            chatServiceExists: !!chatService
        });
        
        try {
            const message = await chatService.processMessage(
                actualSessionId,
                {
                    content,
                    type,
                    attachments: req.body.attachments || []
                },
                metadata
            );

            logger.debug('Message processed successfully', { 
                messageId: message?.id,
                hasMessage: !!message,
                messageContent: message?.content?.substring(0, 30)
            });

            // Process through orchestrator
            const agentResult = await agentOrchestrator.processMessage(
                actualSessionId,
                message,
                session.state || {}
            );
            
            logger.debug('Agent processing completed', {
                hasResult: !!agentResult,
                hasFinalResponse: !!agentResult?.finalResponse,
                agentsInvolved: agentResult?.agentsInvolved
            });

            // Send response using finalResponse from aggregated result
            const response = await chatService.sendResponse(
                actualSessionId,
                agentResult.finalResponse, // Use finalResponse instead of response
                {
                    agentType: agentResult.finalResponse?.source || 'system',
                    confidence: agentResult.finalResponse?.confidence,
                    context: agentResult.conversationContextUpdates || {}
                }
            );

            res.status(200).json({
                sessionId: actualSessionId, // Return the actual session ID so frontend knows which to use
                message,
                response,
                agent: {
                    type: agentResult.finalResponse?.source || 'system',
                    confidence: agentResult.finalResponse?.confidence,
                    agentsInvolved: agentResult.agentsInvolved
                },
                timestamp: new Date().toISOString()
            });
        } catch (processingError) {
            logger.error('Error during message processing steps', {
                error: processingError.message,
                stack: processingError.stack,
                sessionId: actualSessionId
            });
            throw processingError; // Re-throw to be caught by outer catch
        }

    } catch (error) {
        logger.error('Message processing error', {
            error: error.message,
            stack: error.stack,
            sessionId: req.headers['x-session-id'] || req.body?.sessionId,
            hasContent: !!(req.body.message || req.body.content)
        });

        res.status(500).json({
            error: 'Failed to process message',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Convenience GET /api/chat/history
router.get('/chat/history', async (req, res) => {
    try {
        // frontend may provide sessionId as query param
        const sessionId = req.query.sessionId;
        if (!sessionId) {
            return res.status(400).json({ 
                error: 'sessionId query parameter required', 
                timestamp: new Date().toISOString() 
            });
        }

        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;

        const { chatService } = req.app.locals.services;
        
        if (!chatService) {
            return res.status(503).json({
                error: 'Chat service not available',
                timestamp: new Date().toISOString()
            });
        }

        const history = chatService.getConversationHistory(sessionId, limit, offset);

        res.status(200).json({
            sessionId,
            history,
            count: history.length,
            offset,
            limit,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('History retrieval error', {
            error: error.message,
            sessionId: req.query.sessionId
        });

        res.status(500).json({
            error: 'Failed to retrieve history',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

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

/**
 * @route GET /api/users/:userId/sessions
 * @desc Get all sessions for a user (active, unresolved, or recent)
 * @access Private
 */
router.get('/users/:userId/sessions', async (req, res) => {
    try {
        const { userId } = req.params;
        const { type = 'active', limit = 10 } = req.query;

        const { chatService } = req.app.locals.services;
        
        if (!chatService) {
            return res.status(503).json({
                error: 'Chat service not available',
                timestamp: new Date().toISOString()
            });
        }

        let sessions = [];
        
        if (type === 'unresolved') {
            sessions = await chatService.getUserUnresolvedSessions(userId);
        } else if (type === 'active') {
            sessions = await chatService.getUserActiveSessions(userId);
        } else if (type === 'recent') {
            sessions = await chatService.dbService.getUserRecentSessions(userId, parseInt(limit));
        } else {
            return res.status(400).json({
                error: 'Invalid session type. Use: active, unresolved, or recent',
                timestamp: new Date().toISOString()
            });
        }

        logger.info('User sessions retrieved', {
            userId,
            type,
            count: sessions.length
        });

        res.status(200).json({
            userId,
            type,
            count: sessions.length,
            sessions: sessions.map(session => ({
                sessionId: session.session_id,
                status: session.status,
                isActive: session.is_active,
                isResolved: session.is_resolved,
                lastActivity: session.last_activity,
                messageCount: session.message_count,
                createdAt: session.created_at,
                recentMessages: session.messages ? session.messages.slice(0, 3) : []
            })),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('User sessions retrieval error', {
            error: error.message,
            userId: req.params.userId
        });

        res.status(500).json({
            error: 'Failed to retrieve user sessions',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @route POST /api/sessions/:sessionId/resume
 * @desc Resume an existing chat session
 * @access Private
 */
router.post('/sessions/:sessionId/resume', async (req, res) => {
    try {
        const { sessionId } = req.params;

        const { chatService } = req.app.locals.services;
        
        if (!chatService) {
            return res.status(503).json({
                error: 'Chat service not available',
                timestamp: new Date().toISOString()
            });
        }

        // Resume the session
        const result = await chatService.resumeSession(sessionId);

        logger.info('Session resumed via API', {
            sessionId,
            userId: result.session.userId,
            messageCount: result.history.length
        });

        res.status(200).json({
            success: true,
            sessionId,
            session: {
                userId: result.session.userId,
                isActive: result.session.isActive,
                lastActivity: result.session.lastActivity,
                messageCount: result.session.messageCount,
                conversationContext: result.session.conversationContext
            },
            history: result.history,
            message: 'Session resumed successfully. You can continue the conversation.',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Session resume error', {
            error: error.message,
            sessionId: req.params.sessionId
        });

        res.status(error.message === 'Session not found' ? 404 : 500).json({
            error: 'Failed to resume session',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * @route POST /api/sessions/:sessionId/resolve
 * @desc Mark a session as resolved
 * @access Private
 */
router.post('/sessions/:sessionId/resolve', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { notes } = req.body;

        const { chatService } = req.app.locals.services;
        
        if (!chatService) {
            return res.status(503).json({
                error: 'Chat service not available',
                timestamp: new Date().toISOString()
            });
        }

        await chatService.markSessionResolved(sessionId, notes);

        logger.info('Session marked as resolved via API', {
            sessionId,
            notes
        });

        res.status(200).json({
            success: true,
            sessionId,
            message: 'Session marked as resolved',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Session resolve error', {
            error: error.message,
            sessionId: req.params.sessionId
        });

        res.status(500).json({
            error: 'Failed to mark session as resolved',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;