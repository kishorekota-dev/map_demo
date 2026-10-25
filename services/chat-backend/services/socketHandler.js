const logger = require('./logger');
const jwt = require('jsonwebtoken');
const { isQualityDelegation } = require('./accessTokenPolicy');
const HandoffService = require('./handoffService');
const { LiveAgentQueue, isLiveAgentSession, validateLiveSender, buildLiveMessage, buildTransferContext, queueName, boundedReason, hasLiveRequest } = require('./liveAgentChat');
const axios = require('axios');
const KeyedMutex = require('./keyedMutex');
const liveMutex = new KeyedMutex();

class SocketHandler {
    constructor(io, chatService, agentOrchestrator, sessionManager) {
        this.io = io;
        this.chatService = chatService;
        this.agentOrchestrator = agentOrchestrator;
        this.sessionManager = sessionManager;
        this.handoffService = new HandoffService(sessionManager);
        this.liveAgentQueue = new LiveAgentQueue();
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
                principalId: null,
                role: null,
                service: null,
                verifiedPrincipal: null,
                isAgentPrincipal: false,
                canRelayAgent: false,
                agentAssignments: new Map(),
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
        socket.on('requestHandoff', async (data = {}) => {
            const principal = this.connectedClients.get(socket.id);
            try {
                this.assertAuthenticated(principal);
                socket.emit('handoffCreated', await this.handoffService.issue(principal, principal.sessionId, data.targetChannel));
            } catch (error) { socket.emit('sessionError', { error: error.message }); }
        });
        socket.on('resumeSession', async (data = {}) => {
            const principal = this.connectedClients.get(socket.id);
            try {
                this.assertAuthenticated(principal);
                const result = await this.handoffService.resume(principal, data.grant, principal.authToken);
                principal.sessionId = result.sessionId;
                await socket.join(`session:${result.sessionId}`);
                socket.emit('sessionResumed', result);
            } catch (error) { socket.emit('sessionError', { error: error.message }); }
        });

        socket.on('requestLiveAgent', async (data = {}) => {
            const principal = this.connectedClients.get(socket.id);
            try {
                this.assertAuthenticated(principal);
                if (principal.isAgentPrincipal || !principal.sessionId) throw new Error('Customer session required');
                const queue = queueName(data.queue || 'default');
                const session = await this.withLiveSession(principal, principal.sessionId, async session => {
                    if (String(session.userId) !== String(principal.userId)) throw new Error('Access denied');
                    if (isLiveAgentSession(session)) throw new Error('Session is already in live agent mode');
                    if (session.state?.pendingFeedback || session.state?.workflowRecoveryRequired) throw new Error('Finish or recover the active request before requesting an agent');
                    const queued = this.liveAgentQueue.enqueue({ queue, sessionId: session.sessionId, customerId: principal.userId, intent: session.state?.lastIntent || null });
                    await this.sessionManager.updateSessionState(session.sessionId, { liveAgentRequestedAt: queued.requestedAt, liveAgentQueue: queue });
                    socket.emit('liveAgentQueued', { sessionId: session.sessionId, queuePosition: queued.queuePosition });
                    return { ...session, state: { ...session.state, liveAgentRequestedAt: queued.requestedAt, liveAgentQueue: queue } };
                });
                this.io.to('agents').emit('liveAgentRequested', { sessionId: session.sessionId, queue, intent: session.state?.lastIntent || null, requestedAt: session.state?.liveAgentRequestedAt });
            } catch (error) { socket.emit('sessionError', { error: error.message }); }
        });
        socket.on('agentAcceptLiveChat', async (data = {}) => {
            const principal = this.connectedClients.get(socket.id);
            try {
                this.assertAuthenticated(principal);
                if (!principal.isAgentPrincipal) throw new Error('Agent authentication required');
                const agentId = this.getRequestedAgentId(data) || (!principal.canRelayAgent ? principal.principalId : null);
                if (!agentId || (!principal.canRelayAgent && agentId !== principal.principalId)) throw new Error('Access denied');
                const session = await this.claimLiveSession(principal, data.sessionId, agentId, data.reason);
                await this.withLiveSession(principal, session.sessionId, async current => {
                    if (!this.getAssignedSessionAccess(principal, current, agentId).authorized) throw new Error('Assignment has changed');
                    await this.moveSocketSession(principal, session.sessionId);
                    principal.agentAssignments.set(session.sessionId, agentId);
                    const history = await this.chatService.getConversationHistory(session.sessionId);
                    socket.emit('liveAgentStarted', { sessionId: session.sessionId, agentId, transferContext: buildTransferContext(current, history) });
                });
                await this.broadcastToSession(session.sessionId, 'liveAgentJoined', { sessionId: session.sessionId, agentId });
            } catch (error) { socket.emit('sessionError', { error: error.message }); }
        });
        socket.on('endLiveChat', async (data = {}) => {
            const principal = this.connectedClients.get(socket.id);
            try {
                this.assertAuthenticated(principal);
                const sessionId = principal.sessionId;
                const reason = boundedReason(data.reason);
                await this.withLiveSession(principal, sessionId, async session => {
                    const owner = !principal.isAgentPrincipal && String(session.userId) === String(principal.userId);
                    if (!owner && !this.getAssignedSessionAccess(principal, session, this.getRequestedAgentId(data) || principal.agentAssignments?.get(sessionId)).authorized) throw new Error('Access denied');
                    if (!isLiveAgentSession(session) && !session.state?.liveAgentRequestedAt) throw new Error('Session is not in live agent mode');
                    await this.sessionManager.updateSessionState(sessionId, { liveAgentActive: false, liveAgentId: null, assignedAgentId: null, liveAgentRequestedAt: null, liveAgentEndedAt: new Date().toISOString(), assignmentStatus: 'completed' });
                    this.liveAgentQueue.remove(session.state?.liveAgentQueue || 'default', sessionId);
                });
                await this.evictAgentRooms(sessionId);
                await this.broadcastToSession(sessionId, 'liveAgentEnded', { sessionId, reason });
                socket.emit('liveAgentEnded', { sessionId });
            } catch (error) { socket.emit('sessionError', { error: error.message }); }
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

        // Generic agent-surface request/response protocol (used by agent-ui).
        // Every request gets exactly one 'response' so the client never hangs.
        socket.on('request', async (envelope) => {
            await this.handleAgentRequest(socket, envelope);
        });

        // Error handling
        socket.on('error', (error) => {
            this.handleSocketError(socket, error);
        });
    }

    /**
     * Generic request dispatcher for the agent dashboard. The agent-ui wraps all
     * of its operations in a { requestId, type, data } envelope and awaits a
     * matching 'response' { requestId, success, result|error }. Without this the
     * client times out on every call. Routing is a fixed switch (deterministic).
     */
    assertAuthenticated(client) {
        if (!client?.isAuthenticated || (client.authExpiresAt && client.authExpiresAt <= Date.now())) {
            if (client) this.revokeSocketAccess(client);
            throw new Error('Authentication required');
        }
    }

    revokeSocketAccess(client) {
        clearTimeout(client.expiryTimer);
        for (const sessionId of new Set([client.sessionId, ...(client.agentAssignments?.keys() || [])])) if (sessionId) void client.socket.leave(`session:${sessionId}`);
        void client.socket.leave('agents');
        client.sessionId = null; client.isAuthenticated = false; client.agentAssignments = new Map();
    }

    async moveSocketSession(client, sessionId) {
        if (!client.canRelayAgent && client.sessionId && client.sessionId !== sessionId) await client.socket.leave(`session:${client.sessionId}`);
        client.sessionId = sessionId;
        await client.socket.join(`session:${sessionId}`);
    }

    sameTenant(client, session) {
        const tenant = process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise';
        return (client.tenantId || tenant) === (session?.metadata?.tenantId || tenant);
    }

    async withLiveSession(client, sessionId, action) {
        this.assertAuthenticated(client);
        if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 200) throw new Error('Session ID required');
        const tenant = client.tenantId || process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise';
        return liveMutex.runExclusive(`${tenant}:${sessionId}`, async () => {
            let lock; let lost = false; const onError = () => { lost = true; };
            try {
                if (this.sessionManager.databaseService) {
                    await this.handoffService.initialize();
                    if (!this.handoffService.pool) throw new Error('Durable live chat coordination is unavailable');
                    lock = await this.handoffService.pool.connect(); lock.on('error', onError);
                    await lock.query("SET lock_timeout TO '15s'");
                    await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [`chat-live:${tenant}:${sessionId}`]);
                } else if (process.env.NODE_ENV === 'production') throw new Error('Durable live chat coordination is unavailable');
                const session = await this.sessionManager.getSession(sessionId, { refresh: true });
                if (!session || !this.sameTenant(client, session)) throw new Error('Session access denied');
                this.assertAuthenticated(client);
                if (lost) throw new Error('Live chat coordination lost');
                const result = await action(session);
                if (lost) throw new Error('Live chat coordination lost');
                return result;
            } finally {
                if (lock) {
                    if (!lost) await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [`chat-live:${tenant}:${sessionId}`]).catch(() => { lost = true; });
                    lock.removeListener('error', onError); lock.release(lost);
                }
            }
        });
    }

    async claimLiveSession(client, sessionId, agentId, reason) {
        const note = boundedReason(reason);
        return this.withLiveSession(client, sessionId, async session => {
            const current = this.getAssignedAgentId(session);
            if (this.hasActiveAssignment(session) && current !== agentId) throw new Error('Session already assigned');
            if (!this.hasActiveAssignment(session) && !hasLiveRequest(session)) throw new Error('Customer has not requested live agent assistance');
            if (session.state?.pendingFeedback || session.state?.workflowRecoveryRequired) throw new Error('Active workflow must be completed or recovered first');
            await this.sessionManager.updateSession(sessionId, { state: { liveAgentActive: true, liveAgentId: agentId, assignedAgentId: agentId, liveAgentStartedAt: new Date().toISOString(), liveAgentReason: note, assignmentStatus: 'assigned' } });
            this.liveAgentQueue.remove(session.state?.liveAgentQueue || 'default', sessionId);
            return { ...session, state: { ...session.state, liveAgentActive: true, liveAgentId: agentId, assignedAgentId: agentId, assignmentStatus: 'assigned' } };
        });
    }

    async evictAgentRooms(sessionId, retainedAgentId = null) {
        for (const client of this.connectedClients.values()) {
            if (client.isAgentPrincipal && (client.sessionId === sessionId || client.agentAssignments?.has(sessionId)) && client.agentAssignments?.get(sessionId) !== retainedAgentId && client.principalId !== retainedAgentId) {
                await client.socket.leave(`session:${sessionId}`); if (client.sessionId === sessionId) client.sessionId = null;
                client.agentAssignments?.delete(sessionId);
            }
        }
    }

    async handleAgentRequest(socket, envelope = {}) {
        const { requestId, type, data = {} } = envelope;
        const respond = (success, payload) => {
            socket.emit('response', success
                ? { requestId, success: true, result: payload }
                : { requestId, success: false, error: payload });
        };

        try {
            const clientInfo = this.connectedClients.get(socket.id);
            this.assertAuthenticated(clientInfo);
            if (!clientInfo.isAgentPrincipal) {
                return respond(false, 'Agent authorization required');
            }

            switch (type) {
                case 'getSessionHistory': {
                    const session = await this.sessionManager.getSession(data.sessionId);
                    if (!session) return respond(false, 'Session not found');
                    const requestedAgentId = this.getRequestedAgentId(data)
                        || clientInfo.agentAssignments?.get(data.sessionId);
                    const access = this.getAssignedSessionAccess(
                        clientInfo,
                        session,
                        requestedAgentId,
                        { requireActive: false }
                    );
                    if (!access.authorized) return respond(false, 'Access denied');
                    const history = await this.chatService.getMessageHistory?.(data.sessionId)
                        ?? await this.chatService.getConversationHistory?.(data.sessionId)
                        ?? session.messages
                        ?? session.state?.conversationHistory
                        ?? [];
                    return respond(true, { sessionId: data.sessionId, messages: history });
                }

                case 'sendMessage': {
                    if (!data.sessionId) return respond(false, 'Session ID required');
                    if (typeof data.content !== 'string' || !data.content.trim()) {
                        return respond(false, 'Message content required');
                    }
                    const maxLength = parseInt(process.env.MAX_MESSAGE_LENGTH, 10) || 2000;
                    if (data.content.length > maxLength) return respond(false, 'Message too long');

                    let access;
                    await this.withLiveSession(clientInfo, data.sessionId, async session => {
                        const requestedAgentId = this.getRequestedAgentId(data, true);
                        access = this.getAssignedSessionAccess(clientInfo, session, requestedAgentId);
                        if (!access.authorized) throw new Error('Access denied');
                        await this.chatService.sendResponse(data.sessionId, { content: data.content, type: data.type || 'text' }, { agentId: access.agentId, agentType: 'human' });
                    });
                    return respond(true, {
                        sessionId: data.sessionId,
                        agentId: access.agentId,
                        delivered: true
                    });
                }

                case 'assignAgent': {
                    const session = await this.sessionManager.getSession(data.sessionId);
                    if (!session) return respond(false, 'Session not found');
                    const requestedAgentId = this.getRequestedAgentId(data)
                        || (!clientInfo.canRelayAgent ? clientInfo.principalId : null);
                    if (!requestedAgentId) return respond(false, 'Agent ID required');
                    if (!clientInfo.canRelayAgent && requestedAgentId !== clientInfo.principalId) {
                        return respond(false, 'Access denied');
                    }
                    await this.claimLiveSession(clientInfo, data.sessionId, requestedAgentId);
                    clientInfo.agentAssignments.set(data.sessionId, requestedAgentId);
                    this.broadcastToSession(data.sessionId, 'agentAssigned', {
                        sessionId: data.sessionId, agentId: requestedAgentId
                    });
                    return respond(true, {
                        sessionId: data.sessionId,
                        agentId: requestedAgentId,
                        assigned: true
                    });
                }

                case 'transferSession': {
                    const destinationAgentId = this.getRequestedAgentId({ agentId: data.toAgentId });
                    if (!destinationAgentId) return respond(false, 'Destination agent ID required');
                    await this.withLiveSession(clientInfo, data.sessionId, async session => {
                        const requestedAgentId = this.getRequestedAgentId({ agentId: data.fromAgentId }) || clientInfo.agentAssignments?.get(data.sessionId);
                        if (!this.getAssignedSessionAccess(clientInfo, session, requestedAgentId).authorized) throw new Error('Access denied');
                        await this.sessionManager.updateSession(data.sessionId, { state: { assignedAgentId: destinationAgentId, liveAgentId: destinationAgentId, liveAgentActive: true, assignmentStatus: 'transferred' } });
                    });
                    await this.evictAgentRooms(data.sessionId, destinationAgentId);
                    clientInfo.agentAssignments.delete(data.sessionId);
                    await this.broadcastToSession(data.sessionId, 'agentAssigned', { sessionId: data.sessionId, agentId: destinationAgentId, transferred: true });
                    return respond(true, { sessionId: data.sessionId, transferred: true });
                }

                case 'endSession': {
                    await this.withLiveSession(clientInfo, data.sessionId, async session => {
                        const requestedAgentId = this.getRequestedAgentId(data) || clientInfo.agentAssignments?.get(data.sessionId);
                        if (!this.getAssignedSessionAccess(clientInfo, session, requestedAgentId).authorized) throw new Error('Access denied');
                        await this.sessionManager.updateSession(data.sessionId, { state: { liveAgentActive: false, liveAgentId: null, liveAgentRequestedAt: null, assignmentStatus: 'ended' } });
                    });
                    await this.evictAgentRooms(data.sessionId);
                    await this.broadcastToSession(data.sessionId, 'sessionEnded', { sessionId: data.sessionId });
                    return respond(true, { sessionId: data.sessionId, ended: true });
                }

                case 'updateAgentStatus': {
                    const requestedAgentId = this.getRequestedAgentId(data)
                        || (!clientInfo.canRelayAgent ? clientInfo.principalId : null);
                    if (!requestedAgentId) return respond(false, 'Agent ID required');
                    if (!clientInfo.canRelayAgent && requestedAgentId !== clientInfo.principalId) {
                        return respond(false, 'Access denied');
                    }
                    // Agent presence is owned by agent-ui; acknowledge so the
                    // client promise resolves deterministically.
                    return respond(true, { agentId: requestedAgentId, status: data.status });
                }

                default:
                    return respond(false, `Unknown request type: ${type}`);
            }
        } catch (error) {
            logger.error('Agent request failed', { type, error: error.message });
            return respond(false, error.message);
        }
    }

    /**
     * Build an authorization context exclusively from verified, top-level JWT
     * claims. Handshake fields and sessionData are caller-controlled hints and
     * must not grant agent or service privileges.
     */
    getPrincipalContext(decoded = {}) {
        const rawSubject = decoded.userId || decoded.sub || decoded.id;
        const principalId = typeof rawSubject === 'string' || typeof rawSubject === 'number'
            ? String(rawSubject).trim()
            : '';
        const role = typeof decoded.role === 'string' ? decoded.role.trim().toLowerCase() : null;
        const service = typeof decoded.service === 'string' ? decoded.service.trim().toLowerCase() : null;
        const canRelayAgent = Boolean(
            principalId
            && role === 'service'
            && service === 'agent-ui'
        );
        const isAgentPrincipal = Boolean(principalId && (role === 'agent' || canRelayAgent));

        return {
            principalId: principalId || null,
            role,
            service,
            isAgentPrincipal,
            canRelayAgent
        };
    }

    getRequestedAgentId(data = {}, includeMetadata = false) {
        const value = data.agentId ?? (includeMetadata ? data.metadata?.agentId : null);
        if (typeof value !== 'string' && typeof value !== 'number') return null;
        const normalized = String(value).trim();
        return normalized && normalized.length <= 128 ? normalized : null;
    }

    getAssignedAgentId(session) {
        const value = session?.state?.assignedAgentId ?? session?.state?.liveAgentId ?? session?.assignedAgentId;
        if (typeof value !== 'string' && typeof value !== 'number') return null;
        const normalized = String(value).trim();
        return normalized || null;
    }

    hasActiveAssignment(session) {
        if (!this.getAssignedAgentId(session)) return false;
        const rawStatus = session?.state?.assignmentStatus ?? session?.assignmentStatus;
        if (rawStatus === undefined || rawStatus === null || rawStatus === '') return true;
        const status = String(rawStatus).trim().toLowerCase();
        return ['assigned', 'transferred', 'active', 'in_progress', 'in-progress'].includes(status);
    }

    getAssignedSessionAccess(
        clientInfo,
        session,
        requestedAgentId = null,
        { requireActive = true } = {}
    ) {
        const assignedAgentId = this.getAssignedAgentId(session);
        if (!this.sameTenant(clientInfo || {}, session) || !clientInfo?.isAgentPrincipal
            || !assignedAgentId
            || (requireActive && !this.hasActiveAssignment(session))) {
            return { authorized: false, agentId: null };
        }

        if (clientInfo.canRelayAgent) {
            return requestedAgentId && requestedAgentId === assignedAgentId
                ? { authorized: true, agentId: assignedAgentId }
                : { authorized: false, agentId: null };
        }

        const assertedIdentityMatches = !requestedAgentId
            || requestedAgentId === clientInfo.principalId;
        return assertedIdentityMatches && clientInfo.principalId === assignedAgentId
            ? { authorized: true, agentId: assignedAgentId }
            : { authorized: false, agentId: null };
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

        // Human-in-the-loop escalation: surface to the customer session and to
        // the agent dashboard queue so a human can take over.
        this.agentOrchestrator.on('humanEscalation', async (data) => {
            try {
                const session = await this.sessionManager.getSession(data.sessionId, { refresh: true });
                if (!session) return;
                const tenantId = session.metadata?.tenantId || process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise';
                const principal = { isAuthenticated: true, userId: session.userId, tenantId };
                const queue = queueName(data.queue || 'default');
                await this.withLiveSession(principal, data.sessionId, async current => {
                    if (isLiveAgentSession(current) || current.state?.pendingFeedback || current.state?.workflowRecoveryRequired) return;
                    const queued = this.liveAgentQueue.enqueue({ queue, sessionId: data.sessionId, customerId: current.userId, intent: current.state?.lastIntent || null });
                    await this.sessionManager.updateSessionState(data.sessionId, { liveAgentRequestedAt: queued.requestedAt, liveAgentQueue: queue });
                    this.io.to('agents').emit('escalationRequested', { sessionId: data.sessionId, queue, requestedAt: queued.requestedAt, reason: 'human_assistance_required' });
                });
                await this.broadcastToSession(data.sessionId, 'humanEscalation', { sessionId: data.sessionId, queue, reason: 'human_assistance_required' });
            } catch { logger.error('Live assistance queue unavailable', { sessionId: data.sessionId }); }
        });

        // Session manager events
        this.sessionManager.on('sessionExpired', (data) => {
            this.broadcastToSession(data.sessionId, 'sessionExpired', data);
        });
    }

    /**
     * Handle client authentication
     */
    async handleAuthentication(socket, data = {}) {
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

            let authResult = { authenticated: false, userId: null };

            if (data.token) {
                try {
                    const decoded = jwt.verify(
                        data.token,
                        process.env.JWT_SECRET || 'dev-jwt-secret-change-me-in-production-2024',
                        { algorithms: ['HS256'] }
                    );
                    const tenantId = decoded.tenantId || decoded.tenant_id || process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise';
                    if (isQualityDelegation(decoded) || decoded.type === 'refresh' || tenantId !== (process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise')) {
                        throw new Error('Invalid access token tenant or type');
                    }
                    const principal = this.getPrincipalContext(decoded);
                    if (!principal.principalId) {
                        throw new Error('Token subject required');
                    }

                    authResult = {
                        authenticated: true,
                        userId: principal.principalId,
                        tenantId,
                        ...principal,
                        // Retain the verified JWT so it can be propagated to the AI
                        // orchestrator and on to authenticated banking tool calls.
                        authExpiresAt: decoded.exp ? decoded.exp * 1000 : null,
                        authToken: data.token
                    };
                } catch (error) {
                    authResult = { authenticated: false, userId: null };
                }
            } else if (data.credentials) {
                const validation = await this.validateUserCredentials(data.credentials);
                if (validation.valid && validation.authToken) return this.handleAuthentication(socket, { token: validation.authToken });
            }

            if (authResult.authenticated) {
                const previousPrincipalId = clientInfo.principalId;
                if (previousPrincipalId && (previousPrincipalId !== authResult.userId || clientInfo.role !== (authResult.role || null))) this.revokeSocketAccess(clientInfo);
                clearTimeout(clientInfo.expiryTimer);
                if (authResult.isAgentPrincipal) {
                    await socket.join('agents');
                } else if (clientInfo.isAgentPrincipal) {
                    await socket.leave('agents');
                }

                clientInfo.isAuthenticated = true;
                clientInfo.userId = authResult.userId;
                clientInfo.tenantId = authResult.tenantId || process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise';
                clientInfo.principalId = authResult.principalId || authResult.userId;
                clientInfo.role = authResult.role || null;
                clientInfo.service = authResult.service || null;
                clientInfo.verifiedPrincipal = {
                    subject: clientInfo.principalId,
                    role: clientInfo.role,
                    service: clientInfo.service
                };
                clientInfo.isAgentPrincipal = authResult.isAgentPrincipal === true;
                clientInfo.canRelayAgent = authResult.canRelayAgent === true;
                clientInfo.agentAssignments = previousPrincipalId
                    && previousPrincipalId !== clientInfo.principalId
                    ? new Map()
                    : clientInfo.agentAssignments || new Map();
                clientInfo.authToken = authResult.authToken || null;
                clientInfo.authenticationTime = new Date();
                clientInfo.authExpiresAt = authResult.authExpiresAt || null;
                if (clientInfo.authExpiresAt) {
                    clientInfo.expiryTimer = setTimeout(() => { this.revokeSocketAccess(clientInfo); socket.emit('authenticationError', { error: 'Access token expired' }); socket.disconnect?.(true); }, Math.max(1, Math.min(2147483647, clientInfo.authExpiresAt - Date.now())));
                    clientInfo.expiryTimer.unref?.();
                }

                logger.info('Client authenticated', {
                    socketId: socket.id,
                    userId: authResult.userId,
                    role: clientInfo.role,
                    service: clientInfo.service
                });

                socket.emit('authenticationSuccess', {
                    userId: authResult.userId,
                    role: clientInfo.role,
                    service: clientInfo.service,
                    authenticated: true,
                    timestamp: new Date().toISOString()
                });
            } else {
                this.revokeSocketAccess(clientInfo);
                socket.emit('authenticationError', {
                    error: 'Authentication failed',
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            logger.error('Authentication error', {
                error: error.message,
                socketId: socket.id,
                data: Object.keys(data || {})
            });
            socket.emit('authenticationError', { error: 'Authentication error' });
        }
    }

    async validateUserCredentials(credentials) {
        if (!credentials?.username || !credentials?.password) {
            return { valid: false };
        }

        const bankingServiceUrl = process.env.BANKING_SERVICE_URL || 'http://localhost:3005';
        const authUrl = `${bankingServiceUrl}/api/v1/auth/login`;

        try {
            const response = await axios.post(
                authUrl,
                {
                    username: credentials.username,
                    password: credentials.password
                },
                {
                    timeout: 10000,
                    headers: { 'Content-Type': 'application/json' }
                }
            );

            const token = response.data?.data?.tokens?.accessToken;
            return typeof token === 'string' && token ? { valid: true, authToken: token } : { valid: false };
        } catch (error) {
            logger.warn('Credential validation failed', {
                code: error.code || 'AUTHENTICATION_FAILED'
            });

            return { valid: false };
        }
    }

    /**
     * Handle session creation
     */
    async handleCreateSession(socket, data) {
        let clientInfo;
        try {
            clientInfo = this.connectedClients.get(socket.id);
            if (!clientInfo || !clientInfo.isAuthenticated) {
                socket.emit('sessionError', { error: 'Authentication required' });
                return;
            }

            this.assertAuthenticated(clientInfo);
            const sessionMetadata = {
                ...clientInfo.metadata,
                ...data.metadata,
                socketId: socket.id,
                tenantId: clientInfo.tenantId || process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise',
                channel: typeof data.metadata?.channel === 'string' ? data.metadata.channel.trim().toLowerCase() : 'digital'
            };
            if (!['digital', 'ava', 'ivr'].includes(sessionMetadata.channel)) {
                socket.emit('sessionError', { error: 'Unsupported servicing channel' });
                return;
            }

            // SessionManager owns ID generation. Use that same canonical ID in
            // ChatService so the socket room, history, and session state cannot
            // diverge (ChatService does not generate IDs itself).
            const session = await this.sessionManager.createSession(
                clientInfo.userId,
                sessionMetadata
            );

            const chatSession = await this.chatService.createChatSession(
                clientInfo.userId,
                session.sessionId,
                data.userData || {}
            );

            // Update client info
            clientInfo.sessionId = session.sessionId;

            // Join socket room for this session
            socket.join(`session:${session.sessionId}`);

            logger.info('Session created and joined', {
                socketId: socket.id,
                userId: clientInfo.userId,
                sessionId: session.sessionId
            });

            socket.emit('sessionCreated', {
                sessionId: session.sessionId,
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

            this.assertAuthenticated(clientInfo);
            // Get session info
            const session = await this.sessionManager.getSession(data.sessionId, { refresh: true });
            if (!session) {
                socket.emit('sessionError', { error: 'Session not found' });
                return;
            }

            const ownsSession = session.userId !== undefined
                && session.userId !== null
                && clientInfo.userId !== undefined
                && clientInfo.userId !== null
                && String(session.userId) === String(clientInfo.userId);
            const requestedAgentId = this.getRequestedAgentId(data)
                || clientInfo.agentAssignments?.get(data.sessionId);
            const agentAccess = this.getAssignedSessionAccess(
                clientInfo,
                session,
                requestedAgentId
            );

            // Customers may join their own session. A direct agent must be the
            // active assignee; the trusted Agent UI service must identify the
            // active assignee it is relaying for (or have just assigned it on
            // this socket).
            if (!this.sameTenant(clientInfo, session) || (!ownsSession && !agentAccess.authorized)) {
                socket.emit('sessionError', { error: 'Access denied' });
                return;
            }

            // Update client info
            await this.moveSocketSession(clientInfo, data.sessionId);

            // Get conversation history
            const history = await this.chatService.getConversationHistory(data.sessionId);

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
        let clientInfo;
        try {
            clientInfo = this.connectedClients.get(socket.id);
            if (!clientInfo || !clientInfo.sessionId) {
                socket.emit('messageError', { error: 'No active session' });
                return;
            }

            this.assertAuthenticated(clientInfo);
            // Rate limiting
            if (!this.checkMessageRateLimit(socket.id)) {
                socket.emit('messageError', { error: 'Rate limit exceeded' });
                return;
            }

            // Validate message
            if (typeof data?.content !== 'string' || data.content.trim().length === 0) {
                socket.emit('messageError', { error: 'Message content required' });
                return;
            }

            if (data.content.length > (parseInt(process.env.MAX_MESSAGE_LENGTH) || 2000)) {
                socket.emit('messageError', { error: 'Message too long' });
                return;
            }

            // Update client activity
            clientInfo.lastActivity = new Date();

            // Live human agent mode: route human-to-human, never through the
            // AI orchestrator, while keeping the same transcript persistence.
            const liveSession = await this.sessionManager.getSession(clientInfo.sessionId, { refresh: true });
            if (!liveSession || !this.sameTenant(clientInfo, liveSession)) throw new Error('Session access denied');
            if (clientInfo.isAgentPrincipal && !this.getAssignedSessionAccess(clientInfo, liveSession, clientInfo.agentAssignments?.get(clientInfo.sessionId)).authorized) throw new Error('Access denied');
            if (!clientInfo.isAgentPrincipal && String(liveSession.userId) !== String(clientInfo.userId)) throw new Error('Access denied');
            if (!isLiveAgentSession(liveSession) && liveSession.state?.liveAgentRequestedAt && !hasLiveRequest(liveSession)) throw new Error('Live request expired; request assistance again or end live chat');
            if (isLiveAgentSession(liveSession) || hasLiveRequest(liveSession)) {
                return await this.withLiveSession(clientInfo, clientInfo.sessionId, async current => {
                if (!isLiveAgentSession(current) && !hasLiveRequest(current)) throw new Error('Live assignment has changed');
                const liveSession = current;
                const senderRole = clientInfo.isAgentPrincipal ? 'agent' : 'customer';
                const senderId = senderRole === 'agent' ? (clientInfo.canRelayAgent ? clientInfo.agentAssignments?.get(clientInfo.sessionId) : clientInfo.principalId) : clientInfo.userId;
                if (isLiveAgentSession(liveSession)) {
                    if (senderRole === 'agent' && clientInfo.canRelayAgent) { if (!this.getAssignedSessionAccess(clientInfo, liveSession, clientInfo.agentAssignments?.get(clientInfo.sessionId)).authorized) throw new Error('Access denied'); }
                    else validateLiveSender({ role: senderRole, senderId, session: liveSession });
                } else if (senderRole !== 'customer') throw new Error('Access denied');
                const liveMessage = buildLiveMessage({ sessionId: clientInfo.sessionId, senderRole, senderId, content: data.content });
                let stored;
                if (senderRole === 'customer') {
                    stored = await this.chatService.processMessage(clientInfo.sessionId, {
                        content: data.content,
                        type: data.type || 'text',
                        attachments: data.attachments || [],
                        clientInfo: { socketId: socket.id, userAgent: clientInfo.metadata.userAgent, ipAddress: clientInfo.metadata.ipAddress },
                    }, data.metadata || {});
                    await this.deliverMessage(stored);
                } else {
                    stored = await this.chatService.sendResponse(clientInfo.sessionId, { content: data.content, type: data.type || 'text' }, {
                        agentId: senderId,
                        agentType: 'human',
                    });
                }
                let telemetryUnavailable = false;
                try { await this.sessionManager.incrementSessionStatistics(clientInfo.sessionId, { messageCount: 1 }); } catch { telemetryUnavailable = true; }
                socket.emit('messageReceived', { messageId: stored.id, timestamp: liveMessage.timestamp, status: 'stored', telemetryUnavailable });
                return;
                });
            }

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

            // Increment under the session mutex so simultaneous messages cannot
            // overwrite the canonical count.
            await this.sessionManager.incrementSessionStatistics(clientInfo.sessionId, {
                messageCount: 1
            });

            // Acknowledge message received
            socket.emit('messageReceived', {
                messageId: message.id,
                timestamp: message.timestamp,
                status: 'processing'
            });

            // Get conversation context
            const session = await this.sessionManager.getSession(clientInfo.sessionId, { refresh: true });
            const conversationContext = session ? { ...session.state } : {};

            // Attach the authenticated identity + token so the orchestrator can
            // run authenticated banking tools (and resolve pending workflows).
            const enrichedMessage = {
                ...message,
                sessionId: clientInfo.sessionId,
                userId: clientInfo.userId,
                authToken: clientInfo.authToken || null
            };
            conversationContext.userId = clientInfo.userId;
            conversationContext.authToken = clientInfo.authToken || null;
            conversationContext.channel = session?.metadata?.channel || 'digital';
            conversationContext.interactionId = typeof data.clientMessageId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(data.clientMessageId) ? data.clientMessageId : message.id;

            // Process through agent orchestrator (deterministic NLU -> workflow)
            const agentResult = await this.agentOrchestrator.processMessage(
                clientInfo.sessionId,
                enrichedMessage,
                conversationContext
            );

            // Send response through chat service
            await this.chatService.sendResponse(
                clientInfo.sessionId,
                agentResult.finalResponse,
                {
                    agentId: agentResult.finalResponse?.source || 'orchestrator',
                    agentType: agentResult.finalResponse?.source || 'ai',
                    confidence: agentResult.finalResponse?.confidence,
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
    async handleTyping(socket, data) {
        try {
            const clientInfo = this.connectedClients.get(socket.id);
            if (!clientInfo || !clientInfo.sessionId) {
                return;
            }

            this.assertAuthenticated(clientInfo);
            const typingKey = `${clientInfo.sessionId}:${clientInfo.userId}`;
            this.activeTyping.set(typingKey, {
                socketId: socket.id,
                userId: clientInfo.userId,
                startedAt: new Date()
            });

            const recipients = await this.authorizedSessionRecipients(clientInfo.sessionId);
            if (!recipients.includes(socket)) return;
            for (const recipient of recipients) if (recipient !== socket) recipient.emit('userTyping', { userId: clientInfo.userId, timestamp: new Date().toISOString() });

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
    async handleStopTyping(socket, data) {
        try {
            const clientInfo = this.connectedClients.get(socket.id);
            if (!clientInfo || !clientInfo.sessionId) {
                return;
            }

            this.assertAuthenticated(clientInfo);
            const typingKey = `${clientInfo.sessionId}:${clientInfo.userId}`;
            if (this.activeTyping.has(typingKey)) {
                this.activeTyping.delete(typingKey);

                const recipients = await this.authorizedSessionRecipients(clientInfo.sessionId);
                if (!recipients.includes(socket)) return;
                for (const recipient of recipients) if (recipient !== socket) recipient.emit('userStoppedTyping', { userId: clientInfo.userId, timestamp: new Date().toISOString() });
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

            this.assertAuthenticated(clientInfo);
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
        let clientInfo;
        try {
            clientInfo = this.connectedClients.get(socket.id);
            if (!clientInfo || !clientInfo.sessionId) {
                socket.emit('sessionError', { error: 'No active session' });
                return;
            }

            this.assertAuthenticated(clientInfo);
            const session = await this.sessionManager.getSession(clientInfo.sessionId, { refresh: true });
            if (!session || !this.sameTenant(clientInfo, session) || clientInfo.isAgentPrincipal || String(session.userId) !== String(clientInfo.userId)) throw new Error('Access denied');
            const endedSessionId = clientInfo.sessionId;

            // End chat session
            await this.chatService.endSession(endedSessionId, 'user_initiated');

            // End session manager session
            await this.sessionManager.endSession(endedSessionId, 'user_initiated');

            // Leave socket room
            socket.leave(`session:${endedSessionId}`);

            // Clear client session
            clientInfo.sessionId = null;

            logger.info('Session ended', {
                socketId: socket.id,
                userId: clientInfo.userId,
                sessionId: endedSessionId
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
                clearTimeout(clientInfo.expiryTimer);
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
    async authorizedSessionRecipients(sessionId) {
        const session = await this.sessionManager.getSession(sessionId, { refresh: true });
        if (!session) return [];
        const recipients = [];
        for (const client of this.connectedClients.values()) {
            if (client.sessionId !== sessionId && !client.agentAssignments?.has(sessionId)) continue;
            try {
                this.assertAuthenticated(client);
                const authorized = this.sameTenant(client, session) && (!client.isAgentPrincipal
                    ? String(session.userId) === String(client.userId)
                    : this.getAssignedSessionAccess(client, session, client.agentAssignments?.get(sessionId)).authorized);
                if (authorized) recipients.push(client.socket);
                else { await client.socket.leave(`session:${sessionId}`); if (client.sessionId === sessionId) client.sessionId = null; client.agentAssignments?.delete(sessionId); }
            } catch { /* Expired authentication is revoked by assertAuthenticated. */ }
        }
        return recipients;
    }

    async deliverMessage(message) {
        try {
            for (const socket of await this.authorizedSessionRecipients(message.sessionId)) socket.emit('newMessage', message);
        } catch { logger.error('Message delivery authorization failed', { sessionId: message.sessionId }); }
    }

    async broadcastToSession(sessionId, event, data) {
        try {
            for (const socket of await this.authorizedSessionRecipients(sessionId)) socket.emit(event, { ...data, timestamp: new Date().toISOString() });
        } catch { logger.error('Session event authorization failed', { sessionId, event }); }
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
