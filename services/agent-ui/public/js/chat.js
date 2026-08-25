// Shared with dashboard.js as a classic browser script.
// eslint-disable-next-line no-unused-vars
class ChatManager {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.messageInput = document.getElementById('message-input');
        this.sendButton = document.getElementById('send-message-btn');
        this.messagesContainer = document.getElementById('chat-messages');
        this.typingIndicator = document.getElementById('typing-indicator');
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                this.sendMessage();
            }
        });

        let typingTimer;
        this.messageInput.addEventListener('input', () => {
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = `${Math.min(this.messageInput.scrollHeight, 120)}px`;
            this.updateSendButton();
            if (!this.dashboard.currentChat || !this.dashboard.isAuthenticated) return;
            this.dashboard.socket.emit('typing', {
                sessionId: this.dashboard.currentChat.sessionId,
                isTyping: true
            });
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                if (!this.dashboard.currentChat) return;
                this.dashboard.socket.emit('typing', {
                    sessionId: this.dashboard.currentChat.sessionId,
                    isTyping: false
                });
            }, 2000);
        });

        document.querySelectorAll('.quick-response').forEach(button => {
            button.addEventListener('click', () => {
                this.messageInput.value = button.dataset.message || '';
                this.messageInput.focus();
                this.updateSendButton();
            });
        });
        this.updateSendButton();
    }

    sendMessage() {
        const content = this.messageInput.value.trim();
        if (!content || !this.dashboard.currentChat || !this.dashboard.isAuthenticated) return;

        const message = {
            messageId: globalThis.crypto?.randomUUID?.() || `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            sessionId: this.dashboard.currentChat.sessionId,
            content,
            agentId: this.dashboard.agentId,
            type: 'text',
            sender: 'agent',
            senderName: this.dashboard.agentData?.name || 'Agent',
            timestamp: new Date().toISOString(),
            status: 'sending'
        };

        this.dashboard.socket.emit('sendMessage', message);
        this.addMessageToUI(message);
        this.dashboard.currentChat.lastMessage = message;
        this.dashboard.updateActiveChatsList();
        this.messageInput.value = '';
        this.messageInput.style.height = 'auto';
        this.updateSendButton();
        this.messageInput.focus();
        this.dashboard.socket.emit('typing', {
            sessionId: this.dashboard.currentChat.sessionId,
            isTyping: false
        });
    }

    addMessageToUI(message, addToChat = true) {
        this.messagesContainer.appendChild(this.createMessageElement(message));
        this.scrollToBottom();
        const chat = this.dashboard.currentChat;
        if (addToChat && chat && !chat.messages.some(item => item.messageId === message.messageId)) {
            chat.messages.push(message);
        }
    }

    createMessageElement(message) {
        const sender = ['agent', 'customer', 'system'].includes(message.sender) ? message.sender : 'system';
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        messageDiv.dataset.messageId = String(message.messageId || '');

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = this.getAvatarInitial({ ...message, sender });

        const content = document.createElement('div');
        content.className = 'message-content';
        const header = document.createElement('div');
        header.className = 'message-header';
        const senderName = document.createElement('span');
        senderName.className = 'message-sender';
        senderName.textContent = message.senderName || sender;
        const time = document.createElement('span');
        time.className = 'message-time';
        time.textContent = this.formatMessageTime(message.timestamp);
        header.append(senderName, time);

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        this.appendMessageContent(bubble, message.content || message.message || '');
        content.append(header, bubble);

        if (sender === 'agent') {
            const status = document.createElement('div');
            status.className = 'message-status';
            this.setMessageStatus(status, message.status || 'sent');
            content.appendChild(status);
        }

        messageDiv.append(avatar, content);
        return messageDiv;
    }

    appendMessageContent(container, rawContent) {
        const content = String(rawContent);
        const urlPattern = /https?:\/\/[^\s]+/g;
        let cursor = 0;
        for (const match of content.matchAll(urlPattern)) {
            container.appendChild(document.createTextNode(content.slice(cursor, match.index)));
            const link = document.createElement('a');
            link.href = match[0];
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = match[0];
            container.appendChild(link);
            cursor = match.index + match[0].length;
        }
        container.appendChild(document.createTextNode(content.slice(cursor)));
    }

    getAvatarInitial(message) {
        if (message.sender === 'agent') return (this.dashboard.agentData?.name || 'A').charAt(0).toUpperCase();
        if (message.sender === 'customer') return (this.dashboard.currentChat?.customerName || 'C').charAt(0).toUpperCase();
        return 'S';
    }

    formatMessageTime(timestamp) {
        const date = new Date(timestamp || Date.now());
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    setMessageStatus(element, status) {
        const values = {
            sending: ['⏳', 'Sending…'],
            sent: ['✓', 'Sent'],
            delivered: ['✓✓', 'Delivered'],
            error: ['!', 'Failed']
        };
        const safeStatus = Object.prototype.hasOwnProperty.call(values, status) ? status : 'sent';
        const [iconText, label] = values[safeStatus];
        const icon = document.createElement('span');
        icon.className = `status-icon status-${safeStatus}`;
        icon.textContent = iconText;
        element.replaceChildren(icon, document.createTextNode(` ${label}`));
    }

    updateMessageStatus(messageId, status) {
        const element = Array.from(this.messagesContainer.querySelectorAll('[data-message-id]'))
            .find(item => item.dataset.messageId === String(messageId));
        const statusElement = element?.querySelector('.message-status');
        if (statusElement) this.setMessageStatus(statusElement, status);
    }

    showTypingIndicator(isTyping) {
        this.typingIndicator.classList.toggle('hidden', !isTyping);
        if (isTyping) this.scrollToBottom();
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    updateSendButton() {
        this.sendButton.disabled = !this.messageInput.value.trim()
            || !this.dashboard.currentChat
            || !this.dashboard.isAuthenticated;
    }

    clearMessages() {
        this.messagesContainer.replaceChildren();
    }

    loadChatHistory(sessionId) {
        if (this.dashboard.isAuthenticated) {
            this.dashboard.socket.emit('getChatHistory', { sessionId, limit: 50 });
        }
    }

    handleChatHistoryReceived(data = {}) {
        if (!this.dashboard.currentChat
            || !data.sessionId
            || data.sessionId !== this.dashboard.currentChat.sessionId
            || !Array.isArray(data.messages)) return;
        this.clearMessages();
        this.dashboard.currentChat.messages = [...data.messages];
        data.messages.forEach(message => this.addMessageToUI(message, false));
    }

    switchToChat(chat) {
        this.dashboard.currentChat = chat;
        this.dashboard.showChatWindow(chat);
        this.dashboard.updateActiveChatsList();
        this.loadChatHistory(chat.sessionId);
        this.updateSendButton();
    }

    endChat(reason = 'completed', summary = '') {
        if (!this.dashboard.currentChat || !this.dashboard.isAuthenticated) return;
        this.dashboard.socket.emit('endChat', {
            sessionId: this.dashboard.currentChat.sessionId,
            reason,
            summary
        });
    }

    transferChat(toAgentId, reason = '') {
        if (!this.dashboard.currentChat || !this.dashboard.isAuthenticated) return;
        this.dashboard.socket.emit('transferChat', {
            ...this.dashboard.currentChat,
            sessionId: this.dashboard.currentChat.sessionId,
            toAgentId,
            reason
        });
    }

    handleChatEnded(data) {
        const chat = this.dashboard.activeChats.get(data.sessionId);
        if (!chat) return;
        if (chat.timer) clearInterval(chat.timer);
        this.dashboard.activeChats.delete(data.sessionId);
        if (this.dashboard.currentChat?.sessionId === data.sessionId) {
            this.dashboard.currentChat = null;
            document.getElementById('chat-window').classList.add('hidden');
            document.getElementById('no-chat-selected').style.display = 'flex';
            document.getElementById('customer-info-panel').classList.add('hidden');
        }
        this.dashboard.updateActiveChatsList();
        this.dashboard.updateChatStats();
        this.updateSendButton();
        this.dashboard.showToast(`Chat with ${chat.customerName} ended.`, 'info');
    }
}
