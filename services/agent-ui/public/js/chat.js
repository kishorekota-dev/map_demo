// Chat functionality
class ChatManager {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.messageInput = document.getElementById('message-input');
        this.sendButton = document.getElementById('send-message-btn');
        this.messagesContainer = document.getElementById('chat-messages');
        this.typingIndicator = document.getElementById('typing-indicator');
        
        this.setupChatHandlers();
        this.setupMessageInput();
        this.setupQuickResponses();
    }

    setupChatHandlers() {
        // Send message button
        this.sendButton.addEventListener('click', () => {
            this.sendMessage();
        });

        // Message input enter key
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Typing indicator
        let typingTimer;
        this.messageInput.addEventListener('input', () => {
            if (this.dashboard.currentChat && this.dashboard.socket) {
                // Send typing start
                this.dashboard.socket.emit('typing', {
                    sessionId: this.dashboard.currentChat.sessionId,
                    isTyping: true
                });

                // Clear previous timer
                clearTimeout(typingTimer);

                // Set timer to stop typing
                typingTimer = setTimeout(() => {
                    this.dashboard.socket.emit('typing', {
                        sessionId: this.dashboard.currentChat.sessionId,
                        isTyping: false
                    });
                }, 2000);
            }

            // Update send button state
            this.updateSendButton();
        });
    }

    setupMessageInput() {
        // Auto-resize textarea
        this.messageInput.addEventListener('input', () => {
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
        });

        // Update send button state initially
        this.updateSendButton();
    }

    setupQuickResponses() {
        document.querySelectorAll('.quick-response').forEach(btn => {
            btn.addEventListener('click', () => {
                const message = btn.dataset.message;
                if (message) {
                    this.messageInput.value = message;
                    this.messageInput.focus();
                    this.updateSendButton();
                }
            });
        });
    }

    sendMessage() {
        const content = this.messageInput.value.trim();
        
        if (!content || !this.dashboard.currentChat || !this.dashboard.socket) {
            return;
        }

        const message = {
            sessionId: this.dashboard.currentChat.sessionId,
            content: content,
            agentId: this.dashboard.agentId,
            type: 'text',
            timestamp: new Date().toISOString()
        };

        // Send to server
        this.dashboard.socket.emit('sendMessage', message);

        // Add to UI immediately (optimistic update)
        this.addMessageToUI({
            ...message,
            sender: 'agent',
            senderName: this.dashboard.agentData.name,
            status: 'sending'
        });

        // Clear input
        this.messageInput.value = '';
        this.messageInput.style.height = 'auto';
        this.updateSendButton();

        // Focus back to input
        this.messageInput.focus();

        // Stop typing indicator
        this.dashboard.socket.emit('typing', {
            sessionId: this.dashboard.currentChat.sessionId,
            isTyping: false
        });
    }

    addMessageToUI(message) {
        const messageElement = this.createMessageElement(message);
        this.messagesContainer.appendChild(messageElement);
        this.scrollToBottom();

        // Add to current chat messages
        if (this.dashboard.currentChat) {
            this.dashboard.currentChat.messages.push(message);
        }
    }

    createMessageElement(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.sender}`;
        messageDiv.dataset.messageId = message.messageId;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = this.getAvatarInitial(message);

        const content = document.createElement('div');
        content.className = 'message-content';

        const header = document.createElement('div');
        header.className = 'message-header';
        header.innerHTML = `
            <span class="message-sender">${message.senderName || message.sender}</span>
            <span class="message-time">${this.formatMessageTime(message.timestamp)}</span>
        `;

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.innerHTML = this.formatMessageContent(message.content || message.message);

        content.appendChild(header);
        content.appendChild(bubble);

        // Add status for agent messages
        if (message.sender === 'agent') {
            const status = document.createElement('div');
            status.className = 'message-status';
            status.innerHTML = this.getMessageStatusHTML(message.status || 'sent');
            content.appendChild(status);
        }

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);

        return messageDiv;
    }

    getAvatarInitial(message) {
        if (message.sender === 'agent') {
            return this.dashboard.agentData?.name?.charAt(0)?.toUpperCase() || 'A';
        } else if (message.sender === 'customer') {
            return this.dashboard.currentChat?.customerName?.charAt(0)?.toUpperCase() || 'C';
        } else {
            return 'S'; // System
        }
    }

    formatMessageTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    formatMessageContent(content) {
        if (!content) return '';
        
        // Basic HTML escape
        const escaped = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        // Convert line breaks
        const withBreaks = escaped.replace(/\n/g, '<br>');

        // Convert URLs to links
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const withLinks = withBreaks.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener">$1</a>');

        return withLinks;
    }

    getMessageStatusHTML(status) {
        const icons = {
            sending: '<span class="status-icon status-sending">⏳</span> Sending...',
            sent: '<span class="status-icon status-sent">✓</span> Sent',
            delivered: '<span class="status-icon status-sent">✓✓</span> Delivered',
            error: '<span class="status-icon status-error">❌</span> Failed'
        };

        return icons[status] || icons.sent;
    }

    updateMessageStatus(messageId, status) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            const statusElement = messageElement.querySelector('.message-status');
            if (statusElement) {
                statusElement.innerHTML = this.getMessageStatusHTML(status);
            }
        }
    }

    showTypingIndicator(isTyping) {
        if (isTyping) {
            this.typingIndicator.classList.remove('hidden');
            this.scrollToBottom();
        } else {
            this.typingIndicator.classList.add('hidden');
        }
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    updateSendButton() {
        const hasContent = this.messageInput.value.trim().length > 0;
        const hasChat = !!this.dashboard.currentChat;
        const isConnected = this.dashboard.isConnected;

        this.sendButton.disabled = !hasContent || !hasChat || !isConnected;
    }

    clearMessages() {
        this.messagesContainer.innerHTML = '';
    }

    loadChatHistory(sessionId) {
        if (this.dashboard.socket) {
            this.dashboard.socket.emit('getChatHistory', {
                sessionId: sessionId,
                limit: 50
            });
        }
    }

    handleChatHistoryReceived(data) {
        if (data.sessionId === this.dashboard.currentChat?.sessionId && data.messages) {
            // Clear existing messages
            this.clearMessages();

            // Add historical messages
            data.messages.forEach(message => {
                this.addMessageToUI(message);
            });
        }
    }

    switchToChat(chat) {
        // Update current chat
        this.dashboard.currentChat = chat;

        // Update UI
        this.dashboard.showChatWindow(chat);

        // Clear messages and load history
        this.clearMessages();
        this.loadChatHistory(chat.sessionId);

        // Update active chats list
        this.dashboard.updateActiveChatsList();
    }

    endChat(reason = 'completed', summary = '') {
        if (!this.dashboard.currentChat || !this.dashboard.socket) {
            return;
        }

        const chatData = {
            sessionId: this.dashboard.currentChat.sessionId,
            reason: reason,
            summary: summary
        };

        this.dashboard.socket.emit('endChat', chatData);
    }

    transferChat(toAgentId, reason = '') {
        if (!this.dashboard.currentChat || !this.dashboard.socket) {
            return;
        }

        const transferData = {
            sessionId: this.dashboard.currentChat.sessionId,
            toAgentId: toAgentId,
            reason: reason
        };

        this.dashboard.socket.emit('transferChat', transferData);
    }

    escalateChat(reason = 'customer_request') {
        if (!this.dashboard.currentChat || !this.dashboard.socket) {
            return;
        }

        // Add system message about escalation
        this.addMessageToUI({
            messageId: 'escalation_' + Date.now(),
            sender: 'system',
            senderName: 'System',
            content: `Chat escalated: ${reason}`,
            timestamp: new Date().toISOString(),
            type: 'system'
        });

        // Notify server
        this.dashboard.socket.emit('escalateChat', {
            sessionId: this.dashboard.currentChat.sessionId,
            reason: reason
        });

        this.dashboard.showToast('Chat escalated successfully', 'info');
    }

    handleChatEnded(data) {
        const chat = this.dashboard.activeChats.get(data.sessionId);
        if (chat) {
            // Remove from active chats
            this.dashboard.activeChats.delete(data.sessionId);

            // Clear timer
            if (chat.timer) {
                clearInterval(chat.timer);
            }

            // If this was the current chat, show no-chat state
            if (this.dashboard.currentChat?.sessionId === data.sessionId) {
                this.showNoChatState();
                this.dashboard.currentChat = null;
            }

            // Update UI
            this.dashboard.updateActiveChatsList();
            this.dashboard.updateChatStats();

            // Show notification
            this.dashboard.showToast(`Chat with ${chat.customerName} ended`, 'info');
        }
    }

    showNoChatState() {
        document.getElementById('chat-window').classList.add('hidden');
        document.getElementById('no-chat-selected').style.display = 'flex';
        document.getElementById('customer-info-panel').classList.add('hidden');
    }

    // Handle quick emoji/attachment buttons
    setupEmojiButton() {
        document.getElementById('emoji-btn').addEventListener('click', () => {
            // Simple emoji picker
            const emojis = ['😊', '👍', '❤️', '😢', '😮', '😄', '🎉', '✅', '❌', '⚠️'];
            const emoji = prompt('Select emoji (or type your own):\n\n' + emojis.join(' '));
            if (emoji) {
                this.messageInput.value += emoji;
                this.messageInput.focus();
                this.updateSendButton();
            }
        });
    }

    setupAttachmentButton() {
        document.getElementById('attachment-btn').addEventListener('click', () => {
            // Create file input
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*,application/pdf,.doc,.docx,.txt';
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.handleFileAttachment(file);
                }
            };
            fileInput.click();
        });
    }

    handleFileAttachment(file) {
        // For now, just show a message that file was selected
        this.dashboard.showToast(`File selected: ${file.name}`, 'info');
        
        // In a real implementation, you would upload the file
        // and send a message with the file attachment
    }
}

// Initialize chat manager when dashboard is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for dashboard to be initialized
    const initChat = () => {
        if (window.dashboard) {
            window.dashboard.chatManager = new ChatManager(window.dashboard);
            
            // Add chat methods to dashboard
            window.dashboard.addMessageToChat = window.dashboard.chatManager.addMessageToUI.bind(window.dashboard.chatManager);
            window.dashboard.switchToChat = window.dashboard.chatManager.switchToChat.bind(window.dashboard.chatManager);
            window.dashboard.sendMessage = window.dashboard.chatManager.sendMessage.bind(window.dashboard.chatManager);
            window.dashboard.showTypingIndicator = window.dashboard.chatManager.showTypingIndicator.bind(window.dashboard.chatManager);
            
            // Handle additional events
            window.dashboard.handleChatEnded = window.dashboard.chatManager.handleChatEnded.bind(window.dashboard.chatManager);
            window.dashboard.handleMessageSent = (data) => {
                window.dashboard.chatManager.updateMessageStatus(data.messageId, 'sent');
            };
            
            // Setup additional buttons
            window.dashboard.chatManager.setupEmojiButton();
            window.dashboard.chatManager.setupAttachmentButton();
            
            // End chat modal handlers
            document.getElementById('confirm-end-chat-btn').addEventListener('click', () => {
                const reason = document.getElementById('resolution-type').value;
                const summary = document.getElementById('chat-summary').value;
                window.dashboard.chatManager.endChat(reason, summary);
                window.dashboard.closeModal('end-chat-modal');
            });

            // Transfer chat modal handlers
            document.getElementById('confirm-transfer-btn').addEventListener('click', () => {
                const agentId = document.getElementById('transfer-agent').value;
                const department = document.getElementById('transfer-department').value;
                const reason = document.getElementById('transfer-reason').value;
                
                if (agentId) {
                    window.dashboard.chatManager.transferChat(agentId, reason);
                } else if (department) {
                    // Transfer to department (would need server support)
                    window.dashboard.showToast('Department transfer not yet implemented', 'info');
                } else {
                    window.dashboard.showToast('Please select an agent or department', 'warning');
                    return;
                }
                
                window.dashboard.closeModal('transfer-modal');
            });

            // Escalate chat button
            window.dashboard.escalateChat = () => {
                const reason = prompt('Reason for escalation:') || 'agent_request';
                window.dashboard.chatManager.escalateChat(reason);
            };

            // Open modals
            window.dashboard.openEndChatModal = () => {
                window.dashboard.openModal('end-chat-modal');
            };

            window.dashboard.openTransferModal = () => {
                // Populate agent list in transfer modal
                const agentSelect = document.getElementById('transfer-agent');
                agentSelect.innerHTML = '<option value="">Choose an agent...</option>';
                
                window.dashboard.agents.forEach((agent, agentId) => {
                    if (agentId !== window.dashboard.agentId && agent.status === 'available') {
                        const option = document.createElement('option');
                        option.value = agentId;
                        option.textContent = `${agent.name} (${agent.department})`;
                        agentSelect.appendChild(option);
                    }
                });
                
                window.dashboard.openModal('transfer-modal');
            };

        } else {
            // Retry in 100ms
            setTimeout(initChat, 100);
        }
    };
    
    initChat();
});