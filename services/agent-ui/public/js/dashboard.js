class AgentDashboard {
    constructor() {
        this.socket = null;
        this.agentId = null;
        this.agentData = null;
        this.currentChat = null;
        this.pendingAssignment = null;
        this.activeChats = new Map();
        this.agents = new Map();
        this.notifications = [];
        this.isConnected = false;
        this.isAuthenticated = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.activeModal = null;
        this.chatManager = new ChatManager(this);
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupModals();
        this.setupKeyboardShortcuts();
        this.setupSettings();
        this.startQueueRefresh();
        this.updateConnectionStatus('disconnected');

        const stored = this.getStoredAgentData();
        if (!stored) {
            this.showLogin();
            return;
        }

        try {
            await this.startAuthenticatedSession(stored);
        } catch (error) {
            sessionStorage.removeItem('agentData');
            this.showLogin('Your session expired. Please sign in again.');
        }
    }

    setupEventListeners() {
        document.getElementById('login-form').addEventListener('submit', event => {
            this.handleLogin(event);
        });
        document.getElementById('agent-status').addEventListener('change', event => {
            this.updateAgentStatus(event.target.value);
        });
        document.getElementById('notifications-btn').addEventListener('click', () => this.toggleNotifications());
        document.getElementById('settings-btn').addEventListener('click', () => this.openModal('settings-modal'));
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());
        document.getElementById('refresh-queue-btn').addEventListener('click', () => this.refreshQueue());
        document.getElementById('view-history-btn').addEventListener('click', () => this.viewChatHistory());
        document.getElementById('transfer-chat-btn').addEventListener('click', () => this.openTransferModal());
        document.getElementById('escalate-chat-btn').addEventListener('click', () => this.escalateChat());
        document.getElementById('customer-info-btn').addEventListener('click', () => this.toggleCustomerInfo());
        document.getElementById('end-chat-btn').addEventListener('click', () => this.openEndChatModal());
        document.getElementById('accept-chat-btn').addEventListener('click', () => this.acceptChatAssignment());
        document.getElementById('reject-chat-btn').addEventListener('click', () => this.rejectChatAssignment());
        document.getElementById('confirm-end-chat-btn').addEventListener('click', () => {
            this.chatManager.endChat(
                document.getElementById('resolution-type').value,
                document.getElementById('chat-summary').value
            );
            this.closeModal('end-chat-modal');
        });
        document.getElementById('confirm-transfer-btn').addEventListener('click', () => {
            const agentId = document.getElementById('transfer-agent').value;
            if (!agentId) {
                this.showToast('Select an available agent first.', 'warning');
                return;
            }
            this.chatManager.transferChat(agentId, document.getElementById('transfer-reason').value);
            this.closeModal('transfer-modal');
        });
    }

    async handleLogin(event) {
        event.preventDefault();
        const submit = document.getElementById('login-submit');
        const errorElement = document.getElementById('login-error');
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;

        submit.disabled = true;
        submit.textContent = 'Signing in…';
        errorElement.classList.add('hidden');

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();
            if (!response.ok || !data.success || !data.token || !data.userId) {
                throw new Error(data.error || 'Authentication failed');
            }

            const profile = data.agent || {};
            const agentData = {
                agentId: data.userId,
                token: data.token,
                name: profile.name || username,
                email: profile.email || username,
                department: profile.department || 'customer-service',
                role: profile.role || 'agent',
                capabilities: profile.capabilities || ['general-support']
            };
            sessionStorage.setItem('agentData', JSON.stringify(agentData));
            document.getElementById('login-password').value = '';
            await this.startAuthenticatedSession(agentData);
        } catch (error) {
            errorElement.textContent = error.message || 'Unable to sign in';
            errorElement.classList.remove('hidden');
            document.getElementById('login-password').focus();
        } finally {
            submit.disabled = false;
            submit.textContent = 'Sign in';
        }
    }

    async startAuthenticatedSession(agentData) {
        try {
            this.agentData = agentData;
            this.agentId = agentData.agentId;
            this.showLoadingOverlay('Connecting to the chat system…');
            await this.connectSocket();
            await this.authenticateSocket();
            this.updateAgentInfo();
            this.hideLogin();
            this.hideLoadingOverlay();
            this.requestInitialData();
            this.showToast('Signed in and ready for chats.', 'success');
        } catch (error) {
            this.agentData = null;
            this.agentId = null;
            this.isAuthenticated = false;
            sessionStorage.removeItem('agentData');
            this.socket?.disconnect();
            this.hideLoadingOverlay();
            throw error;
        }
    }

    getStoredAgentData() {
        try {
            const stored = sessionStorage.getItem('agentData');
            return stored ? JSON.parse(stored) : null;
        } catch (error) {
            sessionStorage.removeItem('agentData');
            return null;
        }
    }

    connectSocket() {
        if (this.socket?.connected) return Promise.resolve();
        this.socket?.disconnect();
        this.socket = io({ transports: ['websocket', 'polling'], timeout: 20000, reconnection: false });
        this.setupSocketHandlers();
        this.updateConnectionStatus('connecting');

        return new Promise((resolve, reject) => {
            this.socket.once('connect', () => {
                this.isConnected = true;
                this.reconnectAttempts = 0;
                resolve();
            });
            this.socket.once('connect_error', reject);
        });
    }

    authenticateSocket() {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Authentication timed out')), 10000);
            this.socket.once('authenticated', data => {
                clearTimeout(timer);
                this.agentId = data.agentId;
                this.isAuthenticated = true;
                this.updateConnectionStatus('connected');
                resolve(data);
            });
            this.socket.once('authError', error => {
                clearTimeout(timer);
                reject(new Error(error?.message || 'Authentication failed'));
            });
            this.socket.emit('authenticate', {
                agentId: this.agentData.agentId,
                token: this.agentData.token,
                agentInfo: this.agentData
            });
        });
    }

    setupSocketHandlers() {
        this.socket.on('disconnect', reason => {
            this.isConnected = false;
            this.isAuthenticated = false;
            this.updateConnectionStatus('disconnected');
            if (reason !== 'io client disconnect' && this.agentData) this.handleReconnection();
        });
        this.socket.on('chatAssignment', assignment => this.showChatAssignment(assignment));
        this.socket.on('chatAccepted', data => this.handleChatAccepted(data));
        this.socket.on('chatRejected', () => this.showToast('Assignment returned to the queue.', 'info'));
        this.socket.on('chatEnded', data => this.chatManager.handleChatEnded(data));
        this.socket.on('messageReceived', message => this.handleMessageReceived(message));
        this.socket.on('messageSent', data => this.chatManager.updateMessageStatus(data.messageId, 'sent'));
        this.socket.on('messageError', data => {
            this.chatManager.updateMessageStatus(data.messageId, 'error');
            this.showToast(data.error || 'Message could not be sent.', 'error');
        });
        this.socket.on('chatHistory', data => {
            this.chatManager.handleChatHistoryReceived(data);
            this.renderRecentActivity(data.chats || []);
        });
        this.socket.on('customerInfo', data => this.showCustomerInfoPanel(data.info || {}));
        this.socket.on('queueUpdate', update => this.updateQueueDisplay(update));
        this.socket.on('queueStatus', status => this.updateQueueStats(status));
        this.socket.on('agentList', agents => this.updateAgentsList(agents));
        this.socket.on('agentStatusChanged', data => {
            const agent = this.agents.get(data.agentId);
            if (agent) agent.status = data.status;
            this.updateAgentsList(Array.from(this.agents.values()));
        });
        this.socket.on('systemNotification', notification => this.showSystemNotification(notification));
        this.socket.on('customerTyping', data => this.chatManager.showTypingIndicator(data.isTyping));
        this.socket.on('preferencesUpdated', () => {
            this.closeModal('settings-modal');
            this.showToast('Settings saved.', 'success');
        });
        this.socket.on('preferencesError', data => this.showToast(data.message || 'Settings were not saved.', 'error'));
        this.socket.on('chatError', data => this.showToast(data.error || 'Chat action failed.', 'error'));
        this.socket.on('transferError', data => this.showToast(data.error || 'Transfer failed.', 'error'));
        this.socket.on('error', error => this.showToast(error?.message || 'A connection error occurred.', 'error'));
    }

    showLogin(message = '') {
        const panel = document.getElementById('login-panel');
        const app = document.getElementById('app');
        panel.classList.remove('hidden');
        app.setAttribute('inert', '');
        app.setAttribute('aria-hidden', 'true');
        const error = document.getElementById('login-error');
        error.textContent = message;
        error.classList.toggle('hidden', !message);
        document.getElementById('login-username').focus();
        this.hideLoadingOverlay();
    }

    hideLogin() {
        document.getElementById('login-panel').classList.add('hidden');
        const app = document.getElementById('app');
        app.removeAttribute('inert');
        app.setAttribute('aria-hidden', 'false');
    }

    requestInitialData() {
        this.socket.emit('getQueueStatus');
        this.socket.emit('getAgentList');
        this.socket.emit('getChatHistory', { limit: 10 });
    }

    updateAgentInfo() {
        document.getElementById('agent-name').textContent = this.agentData?.name || this.agentId || 'Agent';
        document.getElementById('agent-department').textContent = this.agentData?.department || '';
    }

    updateConnectionStatus(status) {
        const allowed = ['connected', 'connecting', 'disconnected'];
        const safeStatus = allowed.includes(status) ? status : 'disconnected';
        document.getElementById('connection-indicator').className = `connection-indicator ${safeStatus}`;
        document.getElementById('connection-text').textContent = {
            connected: 'Connected', connecting: 'Connecting…', disconnected: 'Disconnected'
        }[safeStatus];
    }

    updateAgentStatus(status, details = {}) {
        if (!this.isAuthenticated) return;
        this.socket.emit('updateStatus', { status, details });
        document.getElementById('agent-status').value = status;
    }

    showChatAssignment(assignment) {
        this.pendingAssignment = assignment;
        document.getElementById('assignment-customer-name').textContent = assignment.customerName || 'Customer';
        document.getElementById('assignment-issue-type').textContent = assignment.escalationReason || 'General inquiry';
        document.getElementById('assignment-wait-time').textContent = `Wait Time: ${this.formatDuration(assignment.estimatedWaitTime)}`;
        document.getElementById('assignment-priority').textContent = assignment.priority || 'medium';
        document.getElementById('assignment-department').textContent = assignment.requirements?.department || 'Customer Service';
        document.getElementById('assignment-language').textContent = assignment.requirements?.language || 'English';
        this.notifications.push(assignment);
        this.updateNotificationCount();
        this.renderNotifications();
        this.openModal('chat-assignment-modal');
        this.showDesktopNotification('New Chat Assignment', `${assignment.customerName || 'A customer'} is waiting.`);
    }

    acceptChatAssignment() {
        if (!this.pendingAssignment) return;
        this.socket.emit('acceptChat', this.pendingAssignment);
        this.closeModal('chat-assignment-modal');
        this.pendingAssignment = null;
    }

    rejectChatAssignment() {
        if (!this.pendingAssignment) return;
        this.socket.emit('rejectChat', { ...this.pendingAssignment, reason: 'unavailable' });
        this.closeModal('chat-assignment-modal');
        this.pendingAssignment = null;
    }

    handleChatAccepted(data) {
        const chat = {
            ...data,
            customerName: data.customerName || 'Customer',
            priority: this.safePriority(data.priority),
            startTime: new Date(),
            messages: []
        };
        this.activeChats.set(chat.sessionId, chat);
        this.currentChat = chat;
        this.showChatWindow(chat);
        this.updateActiveChatsList();
        this.updateChatStats();
        this.chatManager.loadChatHistory(chat.sessionId);
        if (chat.customerId) this.socket.emit('getCustomerInfo', { customerId: chat.customerId });
    }

    showChatWindow(chat) {
        document.getElementById('no-chat-selected').style.display = 'none';
        document.getElementById('chat-window').classList.remove('hidden');
        document.getElementById('customer-name').textContent = chat.customerName || 'Customer';
        document.getElementById('customer-initial').textContent = (chat.customerName || 'C').charAt(0).toUpperCase();
        const priority = this.safePriority(chat.priority);
        const priorityElement = document.getElementById('chat-priority');
        priorityElement.textContent = priority;
        priorityElement.className = `chat-priority ${priority}`;
        this.chatManager.clearMessages();
        chat.messages.forEach(message => this.chatManager.addMessageToUI(message, false));
        this.startChatTimer(chat);
        this.showCustomerInfoPanel(chat);
    }

    handleMessageReceived(message) {
        const chat = this.activeChats.get(message.sessionId);
        if (!chat) return;
        if (!chat.messages.some(item => item.messageId === message.messageId)) chat.messages.push(message);
        chat.lastMessage = message;
        if (this.currentChat?.sessionId === message.sessionId) {
            this.chatManager.addMessageToUI(message, false);
            this.chatManager.showTypingIndicator(false);
        }
        this.updateActiveChatsList();
    }

    updateQueueStats(status = {}) {
        document.getElementById('queue-waiting').textContent = Number(status.totalInQueue) || 0;
        document.getElementById('avg-wait-time').textContent = this.formatDuration(status.averageWaitTime || 0);
        this.updateChatStats();
    }

    updateChatStats() {
        document.getElementById('my-chats-count').textContent = this.activeChats.size;
    }

    updateQueueDisplay(update) {
        if (update?.message) this.showToast(update.message, 'info');
        this.refreshQueue();
    }

    updateActiveChatsList() {
        const container = document.getElementById('active-chats-list');
        container.replaceChildren();
        if (this.activeChats.size === 0) {
            container.appendChild(this.makeEmptyState('💬', 'No active chats'));
            return;
        }

        for (const chat of this.activeChats.values()) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `chat-item${this.currentChat?.sessionId === chat.sessionId ? ' active' : ''}`;
            button.addEventListener('click', () => this.chatManager.switchToChat(chat));

            const customer = document.createElement('span');
            customer.className = 'chat-customer';
            customer.textContent = chat.customerName || 'Customer';
            const preview = document.createElement('span');
            preview.className = 'chat-preview';
            preview.textContent = chat.lastMessage?.content || 'Chat started';
            const meta = document.createElement('span');
            meta.className = 'chat-meta';
            const priority = document.createElement('span');
            const safePriority = this.safePriority(chat.priority);
            priority.className = `chat-priority ${safePriority}`;
            priority.textContent = safePriority;
            const time = document.createElement('span');
            time.className = 'chat-time';
            time.textContent = this.formatTime(chat.startTime);
            meta.append(priority, time);
            button.append(customer, preview, meta);
            container.appendChild(button);
        }
    }

    updateAgentsList(agents = []) {
        const container = document.getElementById('agents-list');
        container.replaceChildren();
        this.agents.clear();
        if (agents.length === 0) {
            container.appendChild(this.makeEmptyState('👥', 'No agents online'));
            return;
        }
        for (const agent of agents) {
            this.agents.set(agent.agentId, agent);
            const item = document.createElement('div');
            item.className = 'agent-item';
            const dot = document.createElement('span');
            const safeStatus = ['available', 'busy', 'away', 'break', 'offline'].includes(agent.status)
                ? agent.status : 'offline';
            dot.className = `agent-status-dot ${safeStatus}`;
            const details = document.createElement('div');
            details.className = 'agent-details';
            const name = document.createElement('div');
            name.className = 'agent-name';
            name.textContent = agent.name || agent.agentId;
            const stats = document.createElement('div');
            stats.className = 'agent-stats';
            stats.textContent = `${agent.currentChats || 0}/${agent.maxChats || 0} chats`;
            details.append(name, stats);
            item.append(dot, details);
            container.appendChild(item);
        }
    }

    makeEmptyState(iconText, message) {
        const state = document.createElement('div');
        state.className = 'empty-state';
        const icon = document.createElement('span');
        icon.className = 'icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = iconText;
        const text = document.createElement('p');
        text.textContent = message;
        state.append(icon, text);
        return state;
    }

    refreshQueue() {
        if (!this.isAuthenticated) return;
        this.socket.emit('getQueueStatus');
    }

    viewChatHistory() {
        if (!this.isAuthenticated) return;
        document.getElementById('chat-history-panel').classList.remove('hidden');
        this.socket.emit('getChatHistory', { limit: 10 });
        document.getElementById('chat-history-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    renderRecentActivity(chats) {
        const container = document.getElementById('recent-activity');
        container.replaceChildren();
        if (!chats.length) {
            container.appendChild(this.makeEmptyState('📝', 'No recent activity'));
            return;
        }
        for (const chat of chats.slice(0, 10)) {
            const item = document.createElement('div');
            item.className = 'activity-item';
            const title = document.createElement('strong');
            title.textContent = chat.customerName || 'Customer';
            const detail = document.createElement('span');
            detail.textContent = `${chat.status || 'completed'} · ${this.formatTime(chat.startTime)}`;
            item.append(title, detail);
            container.appendChild(item);
        }
    }

    toggleNotifications() {
        const container = document.getElementById('queue-notifications');
        const button = document.getElementById('notifications-btn');
        const willShow = container.classList.contains('hidden');
        this.renderNotifications();
        container.classList.toggle('hidden', !willShow);
        button.setAttribute('aria-expanded', String(willShow));
        if (willShow) {
            this.notifications = [];
            this.updateNotificationCount();
        }
    }

    updateNotificationCount() {
        const count = document.getElementById('notification-count');
        count.textContent = this.notifications.length;
        count.classList.toggle('hidden', this.notifications.length === 0);
    }

    renderNotifications() {
        const container = document.getElementById('queue-notifications');
        container.replaceChildren();
        if (this.notifications.length === 0) {
            container.appendChild(this.makeEmptyState('🔔', 'No new notifications'));
            return;
        }

        for (const notification of this.notifications.slice(-5).reverse()) {
            const item = document.createElement('div');
            item.className = 'queue-notification';
            const title = document.createElement('strong');
            title.textContent = notification.customerName || notification.type || 'System notification';
            const message = document.createElement('p');
            message.textContent = notification.message
                || notification.escalationReason
                || 'A chat is ready for review.';
            item.append(title, message);
            container.appendChild(item);
        }
    }

    showSystemNotification(notification = {}) {
        this.notifications.push(notification);
        this.updateNotificationCount();
        this.renderNotifications();
        this.showToast(notification.message || 'New system notification', notification.severity || 'info');
    }

    toggleCustomerInfo() {
        document.getElementById('customer-info-panel').classList.toggle('hidden');
    }

    showCustomerInfoPanel(info = {}) {
        const chat = this.currentChat || {};
        const name = info.name || chat.customerName || 'Customer';
        document.getElementById('customer-info-panel').classList.remove('hidden');
        document.getElementById('profile-name').textContent = name;
        document.getElementById('profile-initial').textContent = name.charAt(0).toUpperCase();
        document.getElementById('profile-email').textContent = info.email || 'Not available';
        document.getElementById('account-type').textContent = info.accountType || chat.customerData?.accountType || 'Standard';
        document.getElementById('member-since').textContent = info.memberSince || 'Not available';
        document.getElementById('total-chats').textContent = info.totalChats || 0;
        document.getElementById('last-contact').textContent = info.lastContact || 'Not available';
        document.getElementById('issue-description').textContent = chat.escalationReason || 'No issue description available';
        document.getElementById('issue-priority').textContent = this.safePriority(chat.priority);
        document.getElementById('issue-category').textContent = chat.customerData?.issueType || 'General';
        document.getElementById('wait-time').textContent = this.formatDuration(chat.estimatedWaitTime || 0);
    }

    openEndChatModal() {
        if (this.currentChat) this.openModal('end-chat-modal');
    }

    openTransferModal() {
        if (!this.currentChat) return;
        const select = document.getElementById('transfer-agent');
        select.replaceChildren(new Option('Choose an agent…', ''));
        for (const [agentId, agent] of this.agents) {
            if (agentId !== this.agentId && agent.status === 'available') {
                select.appendChild(new Option(`${agent.name} (${agent.department})`, agentId));
            }
        }
        this.openModal('transfer-modal');
    }

    escalateChat() {
        if (!this.currentChat) return;
        this.socket.emit('escalateChat', {
            ...this.currentChat,
            reason: 'agent_request'
        });
        this.showToast('Chat returned to the priority queue.', 'info');
    }

    setupSettings() {
        document.querySelectorAll('.tab-btn').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(item => item.classList.toggle('active', item === button));
                document.querySelectorAll('.tab-pane').forEach(pane => {
                    pane.classList.toggle('hidden', pane.id !== `${button.dataset.tab}-tab`);
                    pane.classList.toggle('active', pane.id === `${button.dataset.tab}-tab`);
                });
            });
        });
        document.getElementById('save-settings-btn').addEventListener('click', async () => {
            if (document.getElementById('desktop-notifications').checked
                && 'Notification' in window
                && Notification.permission === 'default') {
                await Notification.requestPermission();
            }
            this.socket.emit('updatePreferences', {
                maxConcurrentChats: Number(document.getElementById('max-chats').value),
                autoAcceptChats: document.getElementById('auto-accept').checked,
                notificationSound: document.getElementById('sound-notifications').checked,
                defaultStatus: document.getElementById('default-status').value
            });
        });
    }

    setupModals() {
        document.querySelectorAll('.modal-close').forEach(button => {
            button.addEventListener('click', () => this.closeModal(button.dataset.modal));
        });
        document.querySelectorAll('[id^="cancel-"]').forEach(button => {
            button.addEventListener('click', () => this.closeModal(button.closest('.modal').id));
        });
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', event => {
                if (event.target === modal) this.closeModal(modal.id);
            });
        });
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        this.lastFocused = document.activeElement;
        this.activeModal = modal;
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        (modal.querySelector('button, input, select, textarea') || modal.querySelector('.modal-content')).focus();
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.add('hidden');
        this.activeModal = null;
        document.body.style.overflow = '';
        this.lastFocused?.focus();
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', event => {
            if (event.key === 'Tab' && this.activeModal) {
                const focusable = Array.from(this.activeModal.querySelectorAll(
                    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
                )).filter(element => element.offsetParent !== null);
                if (focusable.length) {
                    const first = focusable[0];
                    const last = focusable[focusable.length - 1];
                    if (event.shiftKey && document.activeElement === first) {
                        event.preventDefault();
                        last.focus();
                    } else if (!event.shiftKey && document.activeElement === last) {
                        event.preventDefault();
                        first.focus();
                    }
                }
            }
            if (event.key === 'Escape' && this.activeModal) {
                this.closeModal(this.activeModal.id);
                return;
            }
            if (!(event.ctrlKey || event.metaKey)) return;
            if (event.key === 'Enter' && event.target.id === 'message-input') {
                event.preventDefault();
                this.chatManager.sendMessage();
            } else if (!event.target.matches('input, textarea, select') && event.key.toLowerCase() === 'e') {
                event.preventDefault();
                this.openEndChatModal();
            } else if (!event.target.matches('input, textarea, select') && event.key.toLowerCase() === 't') {
                event.preventDefault();
                this.openTransferModal();
            }
        });
    }

    startQueueRefresh() {
        this.queueTimer = setInterval(() => this.refreshQueue(), 30000);
    }

    async handleReconnection() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.showToast('Connection lost. Sign in again to continue.', 'error');
            this.logout(false);
            return;
        }
        this.reconnectAttempts += 1;
        this.updateConnectionStatus('connecting');
        setTimeout(async () => {
            try {
                await this.connectSocket();
                await this.authenticateSocket();
                this.requestInitialData();
            } catch (error) {
                this.handleReconnection();
            }
        }, 1000 * this.reconnectAttempts);
    }

    startChatTimer(chat) {
        if (chat.timer) clearInterval(chat.timer);
        const update = () => {
            if (this.currentChat?.sessionId === chat.sessionId) {
                document.getElementById('chat-duration').textContent = this.formatDuration(Date.now() - chat.startTime.getTime());
            }
        };
        update();
        chat.timer = setInterval(update, 1000);
    }

    showLoadingOverlay(message) {
        const overlay = document.getElementById('loading-overlay');
        overlay.querySelector('p').textContent = message;
        overlay.classList.remove('hidden');
    }

    hideLoadingOverlay() {
        document.getElementById('loading-overlay').classList.add('hidden');
    }

    showToast(message, type = 'info') {
        const allowed = ['info', 'success', 'warning', 'error'];
        const toast = document.createElement('div');
        toast.className = `toast toast-${allowed.includes(type) ? type : 'info'}`;
        toast.textContent = message;
        document.getElementById('toast-container').appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    }

    showDesktopNotification(title, body) {
        if (document.getElementById('desktop-notifications').checked
            && 'Notification' in window
            && Notification.permission === 'granted') {
            new Notification(title, { body });
        }
    }

    safePriority(priority) {
        return ['low', 'medium', 'high', 'critical'].includes(priority) ? priority : 'medium';
    }

    formatDuration(ms) {
        const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (hours) return `${hours}h ${minutes}m`;
        if (minutes) return `${minutes}m ${seconds}s`;
        return `${seconds}s`;
    }

    formatTime(date) {
        const value = new Date(date || Date.now());
        return Number.isNaN(value.getTime()) ? '' : value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    logout(showLogin = true) {
        sessionStorage.removeItem('agentData');
        localStorage.removeItem('agentData');
        this.agentData = null;
        this.agentId = null;
        this.isAuthenticated = false;
        this.socket?.disconnect();
        if (showLogin) this.showLogin();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new AgentDashboard();
});
