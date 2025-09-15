// Chat Manager Module
class ChatManager {
  constructor() {
    this.messages = [];
    this.isTyping = false;
    this.messageContainer = null;
    this.inputElement = null;
    this.sendButton = null;
    this.rateLimiter = ValidationUtils.createRateLimiter(10, 60000); // 10 messages per minute
    
    this.init();
  }

  init() {
    this.messageContainer = document.getElementById('chatMessages');
    this.inputElement = document.getElementById('chatInput');
    this.sendButton = document.getElementById('sendButton');
    
    this.setupEventListeners();
    this.loadChatHistory();
    this.showWelcomeMessage();
  }

  setupEventListeners() {
    // Send button click
    if (this.sendButton) {
      this.sendButton.addEventListener('click', () => {
        this.sendMessage();
      });
    }

    // Enter key to send (Shift+Enter for new line)
    if (this.inputElement) {
      this.inputElement.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          this.sendMessage();
        }
      });

      // Auto-resize textarea
      this.inputElement.addEventListener('input', () => {
        this.autoResizeInput();
        this.updateCharCount();
        this.updateSendButton();
      });

      // Update send button state on input
      this.inputElement.addEventListener('input', () => {
        this.updateSendButton();
      });
    }

    // Quick action buttons
    const quickActions = document.querySelectorAll('.quick-action');
    quickActions.forEach(button => {
      button.addEventListener('click', () => {
        const message = button.dataset.message;
        if (message) {
          this.inputElement.value = message;
          this.updateSendButton();
          this.sendMessage();
        }
      });
    });

    // Clear chat button
    const clearButton = document.getElementById('clearChat');
    if (clearButton) {
      clearButton.addEventListener('click', () => {
        this.clearChat();
      });
    }
  }

  async sendMessage() {
    const message = this.inputElement.value.trim();
    
    // Validate message
    const validation = ValidationUtils.validateMessage(message);
    if (!validation.isValid) {
      toastManager.error(validation.errors[0]);
      return;
    }

    // Check rate limiting
    const rateLimitResult = this.rateLimiter();
    if (!rateLimitResult.allowed) {
      toastManager.warning(rateLimitResult.error);
      return;
    }

    // Clear input
    this.inputElement.value = '';
    this.updateSendButton();
    this.autoResizeInput();
    this.updateCharCount();

    // Add user message to chat
    const userMessage = new ChatMessage(validation.cleanMessage, 'user');
    this.addMessage(userMessage);

    // Show typing indicator
    this.showTypingIndicator();

    try {
      // Send message to API
      const response = await apiClient.sendMessage(validation.cleanMessage);
      
      if (response.success && response.data) {
        // Create bot response message
        const botMessage = new ChatMessage(
          response.data.message,
          'bot',
          {
            intent: response.data.intent.detected,
            confidence: response.data.intent.confidence,
            responseId: response.data.metadata.responseId,
            processingTime: response.data.metadata.processingTime
          }
        );

        // Add bot message to chat
        this.addMessage(botMessage);

        // Update intent display
        if (window.intentDisplay) {
          window.intentDisplay.updateIntent(
            response.data.intent.detected,
            response.data.intent.confidence
          );
        }

        // Save to storage
        storageManager.addToIntentHistory({
          message: validation.cleanMessage,
          intent: response.data.intent.detected,
          confidence: response.data.intent.confidence,
          response: response.data.message
        });

      } else {
        throw new Error('Invalid response from server');
      }

    } catch (error) {
      console.error('Failed to send message:', error);
      
      // Show error message
      const errorMessage = ChatMessage.createErrorMessage(
        'Sorry, I\'m having trouble connecting. Please try again.'
      );
      this.addMessage(errorMessage);
      
      toastManager.error('Failed to send message. Please try again.');
    } finally {
      this.hideTypingIndicator();
    }
  }

  addMessage(message) {
    this.messages.push(message);
    
    // Create and append message element
    const messageElement = message.createElement();
    this.messageContainer.appendChild(messageElement);
    
    // Scroll to bottom
    this.scrollToBottom();
    
    // Add typing animation for bot messages
    if (message.type === 'bot' && !message.metadata.isSystemMessage) {
      setTimeout(() => {
        message.addTypingAnimation();
      }, 100);
    }
    
    // Save chat history
    this.saveChatHistory();
  }

  showTypingIndicator() {
    if (this.isTyping) return;
    
    this.isTyping = true;
    const typingIndicator = ChatMessage.createTypingIndicator();
    this.messageContainer.appendChild(typingIndicator);
    this.scrollToBottom();
  }

  hideTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
    this.isTyping = false;
  }

  scrollToBottom() {
    if (this.messageContainer) {
      this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
    }
  }

  autoResizeInput() {
    if (!this.inputElement) return;
    
    this.inputElement.style.height = 'auto';
    this.inputElement.style.height = Math.min(this.inputElement.scrollHeight, 120) + 'px';
  }

  updateCharCount() {
    const charCountElement = document.getElementById('charCount');
    if (!charCountElement || !this.inputElement) return;
    
    const currentLength = this.inputElement.value.length;
    const maxLength = 500;
    
    charCountElement.textContent = `${currentLength}/${maxLength}`;
    
    // Update styling based on character count
    charCountElement.className = 'char-count';
    if (currentLength > maxLength * 0.9) {
      charCountElement.classList.add('warning');
    }
    if (currentLength >= maxLength) {
      charCountElement.classList.add('error');
    }
  }

  updateSendButton() {
    if (!this.sendButton || !this.inputElement) return;
    
    const hasText = this.inputElement.value.trim().length > 0;
    this.sendButton.disabled = !hasText || this.isTyping;
  }

  showWelcomeMessage() {
    const userPreferences = storageManager.getUserPreferences();
    
    if (userPreferences.showWelcomeMessage && this.messages.length === 0) {
      const welcomeMessage = ChatMessage.createWelcomeMessage();
      this.addMessage(welcomeMessage);
    }
  }

  async clearChat() {
    const confirmed = await modalManager.confirm(
      'Are you sure you want to clear the chat history? This action cannot be undone.',
      'Clear Chat History'
    );
    
    if (confirmed) {
      // Clear messages array
      this.messages = [];
      
      // Clear DOM
      this.messageContainer.innerHTML = '';
      
      // Clear storage
      storageManager.removeItem('chat_history');
      
      // Reset API session
      try {
        await apiClient.resetChat();
      } catch (error) {
        console.error('Failed to reset chat session:', error);
      }
      
      // Show welcome message again
      this.showWelcomeMessage();
      
      // Clear intent display
      if (window.intentDisplay) {
        window.intentDisplay.clearHistory();
        window.intentDisplay.updateIntent('none', 0);
      }
      
      toastManager.success('Chat history cleared');
    }
  }

  saveChatHistory() {
    const historyData = this.messages.map(message => message.toJSON());
    storageManager.saveChatHistory(historyData);
  }

  loadChatHistory() {
    const historyData = storageManager.getChatHistory();
    
    if (historyData && historyData.length > 0) {
      // Limit history to last 50 messages to avoid performance issues
      const recentHistory = historyData.slice(-50);
      
      recentHistory.forEach(messageData => {
        const message = ChatMessage.fromJSON(messageData);
        this.messages.push(message);
        
        const messageElement = message.createElement();
        this.messageContainer.appendChild(messageElement);
      });
      
      this.scrollToBottom();
    }
  }

  // Export chat history
  exportChatHistory() {
    const exportData = {
      exportDate: new Date().toISOString(),
      sessionId: apiClient.getSessionId(),
      messages: this.messages.map(message => message.toJSON()),
      messageCount: this.messages.length
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
      type: 'application/json' 
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-history-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    
    toastManager.success('Chat history exported successfully');
  }

  // Get chat statistics
  getChatStatistics() {
    const totalMessages = this.messages.length;
    const userMessages = this.messages.filter(m => m.type === 'user').length;
    const botMessages = this.messages.filter(m => m.type === 'bot').length;
    
    const intents = this.messages
      .filter(m => m.type === 'bot' && m.metadata.intent)
      .map(m => m.metadata.intent);
    
    const averageConfidence = this.messages
      .filter(m => m.type === 'bot' && m.metadata.confidence)
      .reduce((sum, m) => sum + m.metadata.confidence, 0) / botMessages || 0;

    return {
      totalMessages,
      userMessages,
      botMessages,
      uniqueIntents: [...new Set(intents)].length,
      averageConfidence: Math.round(averageConfidence * 100) / 100,
      firstMessage: this.messages[0]?.timestamp,
      lastMessage: this.messages[this.messages.length - 1]?.timestamp
    };
  }
}

// Create global ChatManager instance
window.ChatManager = ChatManager;