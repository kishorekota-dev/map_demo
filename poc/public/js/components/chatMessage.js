// Chat Message Component Module
class ChatMessage {
  constructor(content, type = 'user', metadata = {}) {
    this.id = this.generateId();
    this.content = content;
    this.type = type; // 'user' or 'bot'
    this.timestamp = new Date();
    this.metadata = {
      intent: null,
      confidence: 0,
      responseId: null,
      processingTime: null,
      ...metadata
    };
  }

  generateId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Create HTML element for the message
  createElement() {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${this.type}`;
    messageElement.dataset.messageId = this.id;

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';

    const messageBubble = document.createElement('div');
    messageBubble.className = 'message-bubble';
    messageBubble.innerHTML = this.formatContent();

    const messageMeta = document.createElement('div');
    messageMeta.className = 'message-meta';
    messageMeta.innerHTML = this.createMetaContent();

    messageContent.appendChild(messageBubble);
    messageContent.appendChild(messageMeta);
    messageElement.appendChild(messageContent);

    return messageElement;
  }

  // Format message content with basic markdown support
  formatContent() {
    let content = ValidationUtils.escapeHtml(this.content);
    
    // Basic markdown formatting
    content = content
      // Bold text **text**
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Italic text *text*
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Code `code`
      .replace(/`(.*?)`/g, '<code>$1</code>')
      // Line breaks
      .replace(/\n/g, '<br>');

    return content;
  }

  // Create metadata content
  createMetaContent() {
    const timeString = this.formatTime();
    let metaHtml = `<span class="message-time">${timeString}</span>`;

    // Add intent information for bot messages
    if (this.type === 'bot' && this.metadata.intent && storageManager.getSettings().showIntentInfo) {
      const confidence = Math.round(this.metadata.confidence * 100);
      metaHtml += `
        <span class="message-intent">
          <i class="fas fa-brain"></i>
          ${this.metadata.intent}
          <span class="intent-confidence">${confidence}%</span>
        </span>
      `;
    }

    return metaHtml;
  }

  // Format timestamp for display
  formatTime() {
    const now = new Date();
    const isToday = now.toDateString() === this.timestamp.toDateString();
    
    if (isToday) {
      return this.timestamp.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } else {
      return this.timestamp.toLocaleDateString([], { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
  }

  // Update message content
  updateContent(newContent) {
    this.content = newContent;
    
    // Update DOM element if it exists
    const element = document.querySelector(`[data-message-id="${this.id}"]`);
    if (element) {
      const bubble = element.querySelector('.message-bubble');
      if (bubble) {
        bubble.innerHTML = this.formatContent();
      }
    }
  }

  // Update metadata
  updateMetadata(newMetadata) {
    this.metadata = { ...this.metadata, ...newMetadata };
    
    // Update DOM element if it exists
    const element = document.querySelector(`[data-message-id="${this.id}"]`);
    if (element) {
      const meta = element.querySelector('.message-meta');
      if (meta) {
        meta.innerHTML = this.createMetaContent();
      }
    }
  }

  // Add typing animation for bot messages
  addTypingAnimation() {
    if (this.type !== 'bot') return;

    const element = document.querySelector(`[data-message-id="${this.id}"]`);
    if (!element) return;

    const bubble = element.querySelector('.message-bubble');
    if (!bubble) return;

    const originalContent = bubble.innerHTML;
    bubble.innerHTML = '';

    // Simulate typing effect
    let i = 0;
    const typingSpeed = 30; // milliseconds per character
    
    const typeWriter = () => {
      if (i < this.content.length) {
        bubble.innerHTML = this.formatContent().substring(0, i + 1) + '<span class="typing-cursor">|</span>';
        i++;
        setTimeout(typeWriter, typingSpeed);
      } else {
        bubble.innerHTML = originalContent;
      }
    };

    typeWriter();
  }

  // Convert to plain object for storage
  toJSON() {
    return {
      id: this.id,
      content: this.content,
      type: this.type,
      timestamp: this.timestamp.toISOString(),
      metadata: this.metadata
    };
  }

  // Create from plain object
  static fromJSON(data) {
    const message = new ChatMessage(data.content, data.type, data.metadata);
    message.id = data.id;
    message.timestamp = new Date(data.timestamp);
    return message;
  }

  // Create typing indicator message
  static createTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.id = 'typingIndicator';
    
    indicator.innerHTML = `
      <div class="typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span class="typing-text">Bot is typing...</span>
    `;

    return indicator;
  }

  // Create welcome message
  static createWelcomeMessage() {
    const welcomeContent = `
      <div class="welcome-message">
        <h2>Welcome to the Chatbot POC!</h2>
        <p>This is a demonstration of intent detection and response generation.</p>
        
        <div class="welcome-features">
          <div class="welcome-feature">
            <i class="fas fa-brain"></i>
            <h3>Intent Detection</h3>
            <p>Advanced natural language processing to understand your queries</p>
          </div>
          
          <div class="welcome-feature">
            <i class="fas fa-comments"></i>
            <h3>Smart Responses</h3>
            <p>Context-aware responses tailored to your specific needs</p>
          </div>
          
          <div class="welcome-feature">
            <i class="fas fa-chart-line"></i>
            <h3>Real-time Analysis</h3>
            <p>Live confidence scoring and intent analysis</p>
          </div>
        </div>
      </div>
    `;

    const message = new ChatMessage(welcomeContent, 'bot', {
      intent: 'welcome',
      confidence: 1.0,
      isSystemMessage: true
    });

    return message;
  }

  // Create error message
  static createErrorMessage(errorText = 'Sorry, I encountered an error. Please try again.') {
    return new ChatMessage(errorText, 'bot', {
      intent: 'error',
      confidence: 0,
      isErrorMessage: true
    });
  }
}

// Create global ChatMessage class
window.ChatMessage = ChatMessage;