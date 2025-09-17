/**
 * Chat Service
 * Handles chat business logic and response generation
 */

const logger = require('../utils/logger');

class ChatService {
  constructor() {
    this.conversations = new Map(); // In-memory storage for demo
    this.responses = this._initializeResponses();
  }

  /**
   * Generate response based on intent and context
   */
  async generateResponse(intent, context = {}, sessionId) {
    try {
      logger.debug('Generating response', {
        intent: intent.intent,
        confidence: intent.confidence,
        sessionId,
        hasContext: Object.keys(context).length > 0
      });

      // Get or create conversation session
      const conversation = this._getOrCreateConversation(sessionId);
      
      // Add user message to conversation history
      conversation.messages.push({
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'user',
        intent: intent.intent,
        confidence: intent.confidence,
        timestamp: new Date().toISOString(),
        context
      });

      // Generate response based on intent
      const response = this._generateResponseByIntent(intent, context, conversation);
      
      // Add bot response to conversation history
      conversation.messages.push({
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'bot',
        message: response.message,
        responseType: response.type,
        timestamp: new Date().toISOString()
      });

      // Update conversation metadata
      conversation.lastActivity = new Date().toISOString();
      conversation.messageCount = conversation.messages.length;

      logger.debug('Response generated successfully', {
        intent: intent.intent,
        responseType: response.type,
        sessionId,
        messageCount: conversation.messageCount
      });

      return response;

    } catch (error) {
      logger.error('Error generating response', {
        error: error.message,
        stack: error.stack,
        intent: intent?.intent,
        sessionId
      });
      
      throw new Error(`Response generation failed: ${error.message}`);
    }
  }

  /**
   * Get chat history for a session
   */
  async getChatHistory(sessionId, offset = 0, limit = 10) {
    try {
      logger.debug('Retrieving chat history', {
        sessionId,
        offset,
        limit
      });

      const conversation = this.conversations.get(sessionId);
      
      if (!conversation) {
        return {
          messages: [],
          total: 0
        };
      }

      const messages = conversation.messages
        .slice(offset, offset + limit)
        .map(msg => ({
          id: msg.id,
          type: msg.type,
          message: msg.message,
          intent: msg.intent,
          confidence: msg.confidence,
          timestamp: msg.timestamp,
          responseType: msg.responseType
        }));

      return {
        messages,
        total: conversation.messages.length
      };

    } catch (error) {
      logger.error('Error retrieving chat history', {
        error: error.message,
        stack: error.stack,
        sessionId
      });
      
      throw new Error(`History retrieval failed: ${error.message}`);
    }
  }

  /**
   * Reset conversation for a session
   */
  async resetConversation(sessionId) {
    try {
      logger.debug('Resetting conversation', { sessionId });

      const conversation = this.conversations.get(sessionId);
      const previousMessageCount = conversation ? conversation.messages.length : 0;

      // Reset or create new conversation
      this.conversations.set(sessionId, {
        sessionId,
        messages: [],
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        messageCount: 0,
        resetCount: conversation ? (conversation.resetCount || 0) + 1 : 1
      });

      return {
        resetAt: new Date().toISOString(),
        previousMessageCount
      };

    } catch (error) {
      logger.error('Error resetting conversation', {
        error: error.message,
        stack: error.stack,
        sessionId
      });
      
      throw new Error(`Conversation reset failed: ${error.message}`);
    }
  }

  /**
   * Get or create conversation session
   * @private
   */
  _getOrCreateConversation(sessionId) {
    if (!this.conversations.has(sessionId)) {
      this.conversations.set(sessionId, {
        sessionId,
        messages: [],
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        messageCount: 0,
        resetCount: 0
      });
    }
    
    return this.conversations.get(sessionId);
  }

  /**
   * Generate response based on detected intent
   * @private
   */
  _generateResponseByIntent(intent, context, conversation) {
    const intentName = intent.intent;
    const responses = this.responses[intentName] || this.responses.default;
    
    // Select response template
    const template = responses[Math.floor(Math.random() * responses.length)];
    
    // Replace placeholders with context data
    let message = template.message;
    if (context && Object.keys(context).length > 0) {
      message = this._replacePlaceholders(message, context);
    }

    // Add conversational context
    if (conversation.messages.length > 0) {
      const recentMessages = conversation.messages.slice(-3);
      const hasRecentGreeting = recentMessages.some(msg => 
        msg.intent === 'greeting' && Date.now() - new Date(msg.timestamp).getTime() < 30000
      );
      
      if (intentName === 'greeting' && hasRecentGreeting) {
        message = "I'm still here to help! What can I do for you?";
      }
    }

    return {
      message,
      type: template.type || 'text',
      intent: intentName,
      confidence: intent.confidence
    };
  }

  /**
   * Replace placeholders in response templates
   * @private
   */
  _replacePlaceholders(message, context) {
    let result = message;
    
    // Replace common placeholders
    Object.keys(context).forEach(key => {
      const placeholder = `{${key}}`;
      if (result.includes(placeholder)) {
        result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), context[key]);
      }
    });

    return result;
  }

  /**
   * Initialize response templates
   * @private
   */
  _initializeResponses() {
    return {
      greeting: [
        { message: "Hello! How can I help you today?", type: "text" },
        { message: "Hi there! What can I do for you?", type: "text" },
        { message: "Welcome! I'm here to assist you.", type: "text" }
      ],
      farewell: [
        { message: "Goodbye! Have a great day!", type: "text" },
        { message: "Thank you for chatting with me. Take care!", type: "text" },
        { message: "See you later! Feel free to come back anytime.", type: "text" }
      ],
      account_inquiry: [
        { message: "I can help you with account information. What specific details do you need?", type: "text" },
        { message: "Let me assist you with your account. What would you like to know?", type: "text" }
      ],
      balance_inquiry: [
        { message: "I can help you check your account balance. Please provide your account details.", type: "text" },
        { message: "To check your balance, I'll need to verify your account information first.", type: "text" }
      ],
      transfer_request: [
        { message: "I can help you with money transfers. What type of transfer would you like to make?", type: "text" },
        { message: "To process a transfer, I'll need some information from you. What are the transfer details?", type: "text" }
      ],
      payment_inquiry: [
        { message: "I can assist with payment-related questions. What do you need help with?", type: "text" },
        { message: "Let me help you with your payment inquiry. Please provide more details.", type: "text" }
      ],
      help_request: [
        { message: "I'm here to help! I can assist with account inquiries, transfers, payments, and general banking questions. What do you need?", type: "text" },
        { message: "How can I assist you today? I can help with various banking services and questions.", type: "text" }
      ],
      technical_support: [
        { message: "I can help with technical issues. Please describe the problem you're experiencing.", type: "text" },
        { message: "Let me assist you with technical support. What issue are you having?", type: "text" }
      ],
      complaint: [
        { message: "I understand your concern and I'm here to help resolve it. Please tell me more about the issue.", type: "text" },
        { message: "I apologize for any inconvenience. Let me help you address this matter.", type: "text" }
      ],
      general_inquiry: [
        { message: "I'm here to help! Could you please provide more details about what you're looking for?", type: "text" },
        { message: "I'd be happy to assist you. Can you tell me more about what you need?", type: "text" }
      ],
      default: [
        { message: "I'm not sure I understand. Could you please rephrase your question?", type: "text" },
        { message: "I didn't quite catch that. Can you provide more details about what you need?", type: "text" },
        { message: "I'm here to help! Please let me know how I can assist you.", type: "text" }
      ]
    };
  }

  /**
   * Get conversation statistics
   */
  async getConversationStats() {
    try {
      const stats = {
        totalSessions: this.conversations.size,
        totalMessages: 0,
        activeSessions: 0,
        averageMessagesPerSession: 0
      };

      const now = Date.now();
      const activeThreshold = 30 * 60 * 1000; // 30 minutes

      for (const conversation of this.conversations.values()) {
        stats.totalMessages += conversation.messageCount;
        
        if (now - new Date(conversation.lastActivity).getTime() < activeThreshold) {
          stats.activeSessions++;
        }
      }

      stats.averageMessagesPerSession = stats.totalSessions > 0 
        ? Math.round(stats.totalMessages / stats.totalSessions * 100) / 100 
        : 0;

      return stats;

    } catch (error) {
      logger.error('Error getting conversation stats', {
        error: error.message,
        stack: error.stack
      });
      
      throw new Error(`Stats retrieval failed: ${error.message}`);
    }
  }
}

module.exports = new ChatService();