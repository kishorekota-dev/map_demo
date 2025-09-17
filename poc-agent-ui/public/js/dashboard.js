// Dashboard Main JavaScript
class AgentDashboard {
    constructor() {
        this.socket = null;
        this.agentId = null;
        this.agentData = null;
        this.currentChat = null;
        this.activeChats = new Map();
        this.queueItems = [];
        this.agents = new Map();
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        this.init();
    }

    async init() {
        try {
            this.showLoadingOverlay('Initializing dashboard...');
            
            // Initialize UI components
            this.initializeUI();
            this.setupEventListeners();
            
            // Connect to socket
            await this.connectSocket();
            
            // Initialize agent session
            await this.initializeAgent();
            
            this.hideLoadingOverlay();
            
            console.log('Dashboard initialized successfully');
        } catch (error) {
            console.error('Failed to initialize dashboard:', error);
            this.showToast('Failed to initialize dashboard', 'error');
            this.hideLoadingOverlay();
        }
    }

    initializeUI() {
        // Update dashboard title and info
        this.updateAgentInfo();
        
        // Initialize status
        this.updateConnectionStatus('connecting');
        
        // Setup modal handlers
        this.setupModals();
        
        // Setup keyboard shortcuts
        this.setupKeyboardShortcuts();
        
        // Initialize auto-refresh for queue
        this.startQueueRefresh();
    }

    setupEventListeners() {
        // Status change
        document.getElementById('agent-status').addEventListener('change', (e) => {
            this.updateAgentStatus(e.target.value);
        });

        // Header buttons
        document.getElementById('notifications-btn').addEventListener('click', () => {
            this.toggleNotifications();
        });

        document.getElementById('settings-btn').addEventListener('click', () => {
            this.openModal('settings-modal');
        });

        document.getElementById('logout-btn').addEventListener('click', () => {
            this.logout();
        });

        // Quick action buttons
        document.getElementById('refresh-queue-btn').addEventListener('click', () => {
            this.refreshQueue();
        });

        document.getElementById('view-history-btn').addEventListener('click', () => {
            this.viewChatHistory();
        });

        // Chat action buttons
        document.getElementById('transfer-chat-btn').addEventListener('click', () => {
            this.openTransferModal();
        });

        document.getElementById('escalate-chat-btn').addEventListener('click', () => {
            this.escalateChat();
        });

        document.getElementById('customer-info-btn').addEventListener('click', () => {
            this.toggleCustomerInfo();
        });

        document.getElementById('end-chat-btn').addEventListener('click', () => {
            this.openEndChatModal();
        });

        // Chat assignment modal
        document.getElementById('accept-chat-btn').addEventListener('click', () => {
            this.acceptChatAssignment();
        });

        document.getElementById('reject-chat-btn').addEventListener('click', () => {
            this.rejectChatAssignment();
        });
    }

    async connectSocket() {
        return new Promise((resolve, reject) => {
            try {
                this.socket = io({
                    transports: ['websocket'],
                    timeout: 20000,
                    reconnection: false
                });

                this.socket.on('connect', () => {
                    console.log('Connected to server');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.updateConnectionStatus('connected');
                    this.setupSocketHandlers();
                    resolve();
                });

                this.socket.on('connect_error', (error) => {
                    console.error('Connection error:', error);
                    this.updateConnectionStatus('disconnected');
                    reject(error);
                });

                this.socket.on('disconnect', (reason) => {
                    console.log('Disconnected:', reason);
                    this.isConnected = false;
                    this.updateConnectionStatus('disconnected');
                    this.handleReconnection();
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    setupSocketHandlers() {
        // Authentication
        this.socket.on('authenticated', (data) => {
            console.log('Agent authenticated:', data);
            this.agentId = data.agentId;
            this.showToast('Successfully connected to chat system', 'success');
        });

        this.socket.on('authError', (error) => {
            console.error('Authentication error:', error);
            this.showToast('Authentication failed', 'error');
        });

        // Chat assignments
        this.socket.on('chatAssignment', (assignment) => {
            console.log('New chat assignment:', assignment);
            this.showChatAssignment(assignment);
        });

        // Chat events
        this.socket.on('chatAccepted', (data) => {
            console.log('Chat accepted:', data);
            this.handleChatAccepted(data);
        });

        this.socket.on('chatEnded', (data) => {
            console.log('Chat ended:', data);
            this.handleChatEnded(data);
        });

        this.socket.on('messageReceived', (message) => {
            console.log('Message received:', message);
            this.handleMessageReceived(message);
        });

        this.socket.on('messageSent', (data) => {
            console.log('Message sent:', data);
            this.handleMessageSent(data);
        });

        // Queue updates
        this.socket.on('queueUpdate', (update) => {
            console.log('Queue update:', update);
            this.updateQueueDisplay(update);
        });

        this.socket.on('queueStatus', (status) => {
            console.log('Queue status:', status);
            this.updateQueueStats(status);
        });

        // Agent updates
        this.socket.on('agentList', (agents) => {
            console.log('Agent list:', agents);
            this.updateAgentsList(agents);
        });

        this.socket.on('agentStatusChanged', (data) => {
            console.log('Agent status changed:', data);
            this.updateAgentStatus(data.agentId, data.status);
        });

        // System notifications
        this.socket.on('systemNotification', (notification) => {
            console.log('System notification:', notification);
            this.showSystemNotification(notification);
        });

        // Typing indicators
        this.socket.on('customerTyping', (data) => {
            this.showTypingIndicator(data.isTyping);
        });

        // Error handling
        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showToast('Connection error occurred', 'error');
        });
    }

    async initializeAgent() {
        // Get agent info from session or prompt for login
        this.agentData = this.getStoredAgentData() || await this.promptAgentLogin();
        
        if (this.agentData) {
            // Authenticate with server
            this.socket.emit('authenticate', {
                agentId: this.agentData.agentId,
                token: this.agentData.token,
                agentInfo: this.agentData
            });

            // Update UI with agent info
            this.updateAgentInfo();
            
            // Request initial data
            this.requestInitialData();
        }
    }

    getStoredAgentData() {
        try {
            const stored = localStorage.getItem('agentData');
            return stored ? JSON.parse(stored) : null;
        } catch (error) {
            console.error('Error reading stored agent data:', error);
            return null;
        }
    }

    async promptAgentLogin() {
        // For demo purposes, create a mock agent
        const mockAgent = {
            agentId: `agent_${Date.now()}`,
            token: 'mock_token_' + Math.random().toString(36).substr(2, 9),
            name: prompt('Enter your name:') || 'Agent',
            email: prompt('Enter your email:') || 'agent@example.com',
            department: 'customer-service',
            role: 'agent',
            capabilities: ['general-support', 'technical-support']
        };

        // Store for next session
        localStorage.setItem('agentData', JSON.stringify(mockAgent));
        
        return mockAgent;
    }

    updateAgentInfo() {
        if (this.agentData) {
            document.getElementById('agent-name').textContent = this.agentData.name;
            document.getElementById('agent-department').textContent = this.agentData.department;
        }
    }

    updateConnectionStatus(status) {
        const indicator = document.getElementById('connection-indicator');
        const text = document.getElementById('connection-text');
        
        indicator.className = `connection-indicator ${status}`;
        
        switch (status) {
            case 'connected':
                text.textContent = 'Connected';
                break;
            case 'connecting':
                text.textContent = 'Connecting...';
                break;
            case 'disconnected':
                text.textContent = 'Disconnected';
                break;
            default:
                text.textContent = 'Unknown';
        }
    }

    requestInitialData() {
        // Request queue status
        this.socket.emit('getQueueStatus');
        
        // Request agent list
        this.socket.emit('getAgentList');
        
        // Request chat history
        this.socket.emit('getChatHistory', { limit: 10 });
    }

    updateAgentStatus(status, details = {}) {
        if (this.socket && this.isConnected) {
            this.socket.emit('updateStatus', { status, details });
            
            // Update UI
            document.getElementById('agent-status').value = status;
            this.showToast(`Status updated to ${status}`, 'info');
        }
    }

    showChatAssignment(assignment) {
        // Show assignment modal
        document.getElementById('assignment-customer-name').textContent = assignment.customerName;
        document.getElementById('assignment-issue-type').textContent = assignment.escalationReason || 'General inquiry';
        document.getElementById('assignment-wait-time').textContent = `Wait Time: ${this.formatDuration(assignment.estimatedWaitTime)}`;
        document.getElementById('assignment-priority').textContent = assignment.priority;
        document.getElementById('assignment-department').textContent = assignment.customerData?.department || 'Customer Service';
        document.getElementById('assignment-language').textContent = 'English';
        
        // Store assignment data
        this.pendingAssignment = assignment;
        
        // Show modal
        this.openModal('chat-assignment-modal');
        
        // Play notification sound
        this.playNotificationSound();
        
        // Show desktop notification if enabled
        this.showDesktopNotification('New Chat Assignment', {
            body: `${assignment.customerName} is waiting for assistance`,
            icon: '/favicon.ico'
        });
    }

    acceptChatAssignment() {
        if (this.pendingAssignment && this.socket) {
            this.socket.emit('acceptChat', this.pendingAssignment);
            this.closeModal('chat-assignment-modal');
            this.pendingAssignment = null;
            this.showToast('Chat assignment accepted', 'success');
        }
    }

    rejectChatAssignment() {
        if (this.pendingAssignment && this.socket) {
            const reason = prompt('Reason for rejection (optional):') || 'unavailable';
            this.socket.emit('rejectChat', {
                ...this.pendingAssignment,
                reason
            });
            this.closeModal('chat-assignment-modal');
            this.pendingAssignment = null;
            this.showToast('Chat assignment rejected', 'info');
        }
    }

    handleChatAccepted(data) {
        // Create new active chat
        const chat = {
            sessionId: data.sessionId,
            customerId: data.customerId,
            customerName: data.customerName,
            priority: data.priority,
            startTime: new Date(),
            messages: []
        };

        this.activeChats.set(data.sessionId, chat);
        this.currentChat = chat;

        // Update UI
        this.showChatWindow(chat);
        this.updateActiveChatsList();
        this.updateChatStats();

        // Request customer info
        this.socket.emit('getCustomerInfo', { customerId: data.customerId });
    }

    showChatWindow(chat) {
        // Hide no-chat state
        document.getElementById('no-chat-selected').style.display = 'none';
        
        // Show chat window
        const chatWindow = document.getElementById('chat-window');
        chatWindow.classList.remove('hidden');

        // Update chat header
        document.getElementById('customer-name').textContent = chat.customerName;
        document.getElementById('customer-initial').textContent = chat.customerName.charAt(0).toUpperCase();
        document.getElementById('chat-priority').textContent = chat.priority;
        document.getElementById('chat-priority').className = `chat-priority ${chat.priority}`;

        // Clear messages
        document.getElementById('chat-messages').innerHTML = '';

        // Start chat timer
        this.startChatTimer(chat);

        // Show customer info panel
        this.showCustomerInfoPanel(chat);
    }

    handleMessageReceived(message) {
        if (this.currentChat && message.sessionId === this.currentChat.sessionId) {
            // Add message to current chat
            this.addMessageToChat(message);
            
            // Hide typing indicator
            this.showTypingIndicator(false);
        }
        
        // Update chat in active chats
        const chat = this.activeChats.get(message.sessionId);
        if (chat) {
            chat.messages.push(message);
            chat.lastMessage = message;
            this.updateActiveChatsList();
        }
    }

    updateQueueStats(status) {
        document.getElementById('queue-waiting').textContent = status.totalInQueue || 0;
        document.getElementById('my-chats-count').textContent = this.activeChats.size;
        document.getElementById('avg-wait-time').textContent = this.formatDuration(status.averageWaitTime || 0);
    }

    updateActiveChatsList() {
        const container = document.getElementById('active-chats-list');
        
        if (this.activeChats.size === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="icon">💬</span>
                    <p>No active chats</p>
                </div>
            `;
            return;
        }

        const chatItems = Array.from(this.activeChats.values()).map(chat => {
            const isActive = this.currentChat && this.currentChat.sessionId === chat.sessionId;
            const lastMessage = chat.lastMessage;
            const preview = lastMessage ? 
                (lastMessage.content || lastMessage.message || 'No message') : 
                'Chat started';

            return `
                <div class="chat-item ${isActive ? 'active' : ''}" data-session-id="${chat.sessionId}">
                    <div class="chat-customer">${chat.customerName}</div>
                    <div class="chat-preview">${preview}</div>
                    <div class="chat-meta">
                        <span class="chat-priority ${chat.priority}">${chat.priority}</span>
                        <span class="chat-time">${this.formatTime(chat.startTime)}</span>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = chatItems;

        // Add click handlers
        container.querySelectorAll('.chat-item').forEach(item => {
            item.addEventListener('click', () => {
                const sessionId = item.dataset.sessionId;
                const chat = this.activeChats.get(sessionId);
                if (chat) {
                    this.switchToChat(chat);
                }
            });
        });
    }

    updateAgentsList(agents) {
        const container = document.getElementById('agents-list');
        
        if (!agents || agents.length === 0) {
            container.innerHTML = '<div class="loading">No agents online</div>';
            return;
        }

        const agentItems = agents.map(agent => {
            this.agents.set(agent.agentId, agent);
            
            return `
                <div class="agent-item">
                    <div class="agent-status-dot ${agent.status}"></div>
                    <div class="agent-details">
                        <div class="agent-name">${agent.name}</div>
                        <div class="agent-stats">${agent.currentChats}/${agent.maxChats} chats</div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = agentItems;
    }

    refreshQueue() {
        if (this.socket && this.isConnected) {
            this.socket.emit('getQueueStatus');
            this.showToast('Queue refreshed', 'info');
        }
    }

    // Utility methods
    formatDuration(ms) {
        if (!ms || ms < 1000) return '0m';
        
        const minutes = Math.floor(ms / 60000);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        }
        return `${minutes}m`;
    }

    formatTime(date) {
        return new Intl.DateTimeFormat('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date(date));
    }

    showLoadingOverlay(message = 'Loading...') {
        const overlay = document.getElementById('loading-overlay');
        overlay.querySelector('p').textContent = message;
        overlay.style.display = 'flex';
    }

    hideLoadingOverlay() {
        document.getElementById('loading-overlay').style.display = 'none';
    }

    showToast(message, type = 'info') {
        // This will be implemented in notifications.js
        if (window.showToast) {
            window.showToast(message, type);
        } else {
            console.log(`Toast: ${type} - ${message}`);
        }
    }

    playNotificationSound() {
        try {
            const audio = document.getElementById('notification-sound');
            if (audio) {
                audio.play().catch(console.error);
            }
        } catch (error) {
            console.error('Error playing notification sound:', error);
        }
    }

    showDesktopNotification(title, options = {}) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, options);
        }
    }

    // Modal management
    setupModals() {
        // Close modal when clicking outside
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modal.id);
                }
            });
        });

        // Close modal buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modalId = btn.dataset.modal;
                this.closeModal(modalId);
            });
        });

        // Cancel buttons
        document.querySelectorAll('[id$="-cancel-btn"], [id^="cancel-"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.modal');
                if (modal) {
                    this.closeModal(modal.id);
                }
            });
        });
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        }
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 'enter':
                        if (e.target.id === 'message-input') {
                            e.preventDefault();
                            this.sendMessage();
                        }
                        break;
                    case 'e':
                        if (!e.target.matches('input, textarea')) {
                            e.preventDefault();
                            this.openEndChatModal();
                        }
                        break;
                    case 't':
                        if (!e.target.matches('input, textarea')) {
                            e.preventDefault();
                            this.openTransferModal();
                        }
                        break;
                    case 'r':
                        if (!e.target.matches('input, textarea')) {
                            e.preventDefault();
                            this.refreshQueue();
                        }
                        break;
                }
            }
        });
    }

    startQueueRefresh() {
        // Refresh queue every 30 seconds
        setInterval(() => {
            if (this.socket && this.isConnected) {
                this.socket.emit('getQueueStatus');
            }
        }, 30000);
    }

    handleReconnection() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this.updateConnectionStatus('connecting');
            
            setTimeout(() => {
                this.connectSocket().catch(() => {
                    // Retry failed, will be handled by the retry logic
                });
            }, 5000 * this.reconnectAttempts);
        } else {
            this.showToast('Connection lost. Please refresh the page.', 'error');
        }
    }

    startChatTimer(chat) {
        // Update chat duration every second
        const updateDuration = () => {
            if (this.currentChat && this.currentChat.sessionId === chat.sessionId) {
                const duration = Date.now() - chat.startTime.getTime();
                document.getElementById('chat-duration').textContent = this.formatDuration(duration);
            }
        };

        chat.timer = setInterval(updateDuration, 1000);
    }

    logout() {
        if (confirm('Are you sure you want to logout?')) {
            // Clear stored data
            localStorage.removeItem('agentData');
            
            // Disconnect socket
            if (this.socket) {
                this.socket.disconnect();
            }
            
            // Redirect to login or reload
            window.location.reload();
        }
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new AgentDashboard();
});