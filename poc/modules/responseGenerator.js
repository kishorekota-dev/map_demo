const config = require('../config/config');
const logger = require('../utils/logger');

class ResponseGenerator {
  constructor() {
    this.responses = this.loadResponses();
    this.maxResponseLength = config.responses.maxResponseLength;
    this.defaultResponse = config.responses.defaultResponse;
    this.responseHistory = [];
  }

  loadResponses() {
    return {
      greeting: {
        responses: [
          "Hello! How can I help you today?",
          "Hi there! What can I do for you?",
          "Greetings! I'm here to assist you.",
          "Hello! Feel free to ask me anything.",
          "Hi! How may I assist you today?"
        ],
        followUp: [
          "What would you like to know?",
          "How can I help you further?",
          "What questions do you have for me?"
        ]
      },

      question: {
        responses: [
          "That's an interesting question. Let me help you with that.",
          "I'd be happy to help answer your question.",
          "Let me provide you with some information about that.",
          "Great question! Here's what I can tell you:",
          "I'll do my best to answer that for you."
        ],
        followUp: [
          "Does this answer your question?",
          "Would you like more details about this?",
          "Is there anything else you'd like to know?"
        ]
      },

      help: {
        responses: [
          "I'm here to help! I can assist you with various questions and tasks.",
          "Of course! I'm designed to help you. What do you need assistance with?",
          "I'd be glad to help you. Here are some things I can do:",
          "Help is what I'm here for! Let me know what you need.",
          "I'm ready to assist you. What would you like help with?"
        ],
        capabilities: [
          "• Answer general questions",
          "• Provide information and explanations",
          "• Help with problem-solving",
          "• Offer guidance and support",
          "• Engage in conversation"
        ],
        followUp: [
          "What specific area would you like help with?",
          "Feel free to ask me anything!",
          "How can I best assist you today?"
        ]
      },

      goodbye: {
        responses: [
          "Goodbye! Have a great day!",
          "See you later! Take care!",
          "Farewell! It was nice chatting with you.",
          "Thank you for the conversation. Goodbye!",
          "Until next time! Have a wonderful day!"
        ],
        thankYou: [
          "You're very welcome! Happy to help!",
          "My pleasure! Feel free to come back anytime.",
          "Glad I could assist you!",
          "You're welcome! Have a great day!"
        ]
      },

      affirmation: {
        responses: [
          "Great! I'm glad we're on the same page.",
          "Excellent! Is there anything else I can help with?",
          "Perfect! What would you like to do next?",
          "Wonderful! How else can I assist you?",
          "That's right! Anything else you'd like to know?"
        ]
      },

      negation: {
        responses: [
          "I understand. Let me try a different approach.",
          "No problem. How would you like me to help instead?",
          "That's okay. What would you prefer?",
          "I see. Let me know how I can better assist you.",
          "Understood. What would work better for you?"
        ]
      },

      complaint: {
        responses: [
          "I'm sorry to hear you're experiencing issues. Let me try to help.",
          "I understand your frustration. How can I assist you with this problem?",
          "I apologize for any inconvenience. Let's work together to resolve this.",
          "I'm here to help solve this issue. Can you provide more details?",
          "I'm sorry about that. Let me see how I can help fix this problem."
        ],
        followUp: [
          "Can you tell me more about the specific issue?",
          "What exactly is not working as expected?",
          "Let's troubleshoot this together."
        ]
      },

      compliment: {
        responses: [
          "Thank you so much! I'm glad I could be helpful.",
          "That's very kind of you to say! I appreciate it.",
          "Thank you! I'm here whenever you need assistance.",
          "I'm happy to hear that! Thank you for the feedback.",
          "That means a lot! I'm always here to help."
        ]
      },

      unknown: {
        responses: [
          "I'm not quite sure I understand. Could you please rephrase that?",
          "I didn't catch that. Can you tell me more about what you're looking for?",
          "I'm having trouble understanding. Could you provide more details?",
          "Can you help me understand what you're asking about?",
          "I'd like to help, but I need a bit more information. Could you clarify?"
        ],
        suggestions: [
          "Try asking a specific question",
          "Provide more context about what you need",
          "Use different words to describe what you're looking for"
        ]
      },

      error: {
        responses: [
          "I apologize, but I'm experiencing some technical difficulties.",
          "Sorry, something went wrong on my end. Please try again.",
          "I encountered an error while processing your request.",
          "Technical issues are preventing me from responding properly.",
          "I'm having trouble right now. Please try your request again."
        ]
      }
    };
  }

  generateResponse(intentResult, userMessage, context = {}) {
    try {
      const { intent, confidence } = intentResult;
      
      if (!intent || !this.responses[intent]) {
        return this.createResponse(this.defaultResponse, intent, confidence);
      }

      const intentResponses = this.responses[intent];
      let responseText = this.selectRandomResponse(intentResponses.responses);

      // Add specific content based on intent
      switch (intent) {
        case 'help':
          if (intentResponses.capabilities) {
            responseText += '\n\n' + intentResponses.capabilities.join('\n');
          }
          break;
        
        case 'goodbye':
          // Check if message contains thanks
          if (userMessage && /thank/i.test(userMessage)) {
            responseText = this.selectRandomResponse(intentResponses.thankYou || intentResponses.responses);
          }
          break;
        
        case 'unknown':
          if (intentResponses.suggestions) {
            responseText += '\n\nSuggestions:\n' + intentResponses.suggestions.map(s => `• ${s}`).join('\n');
          }
          break;
        
        case 'complaint':
          if (intentResponses.followUp) {
            responseText += '\n\n' + this.selectRandomResponse(intentResponses.followUp);
          }
          break;
      }

      // Add follow-up if available and appropriate
      if (intentResponses.followUp && !['goodbye', 'complaint', 'unknown'].includes(intent)) {
        if (Math.random() > 0.5) { // 50% chance to add follow-up
          responseText += '\n\n' + this.selectRandomResponse(intentResponses.followUp);
        }
      }

      // Ensure response doesn't exceed max length
      if (responseText.length > this.maxResponseLength) {
        responseText = responseText.substring(0, this.maxResponseLength - 3) + '...';
      }

      const response = this.createResponse(responseText, intent, confidence, context);
      this.addToHistory(response, userMessage);
      
      return response;

    } catch (error) {
      logger.error('Error generating response:', { error: error.message, intent: intentResult.intent });
      return this.createResponse(
        "I apologize, but I'm having trouble generating a response right now.",
        'error',
        0
      );
    }
  }

  selectRandomResponse(responses) {
    if (!responses || responses.length === 0) {
      return this.defaultResponse;
    }
    return responses[Math.floor(Math.random() * responses.length)];
  }

  createResponse(text, intent, confidence, context = {}) {
    return {
      text: text,
      intent: intent,
      confidence: confidence,
      timestamp: new Date().toISOString(),
      metadata: {
        responseId: this.generateResponseId(),
        processingTime: Date.now(),
        context: context
      }
    };
  }

  generateResponseId() {
    return `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  addToHistory(response, userMessage) {
    this.responseHistory.unshift({
      userMessage: userMessage,
      response: response,
      timestamp: new Date().toISOString()
    });

    // Keep only last 50 interactions
    if (this.responseHistory.length > 50) {
      this.responseHistory = this.responseHistory.slice(0, 50);
    }
  }

  getResponseHistory(limit = 10) {
    return this.responseHistory.slice(0, limit);
  }

  // Method to add custom responses (for future extensibility)
  addCustomResponses(intent, responses) {
    if (!intent || !responses) {
      throw new Error('Intent and responses are required');
    }

    if (!this.responses[intent]) {
      this.responses[intent] = {};
    }

    this.responses[intent] = {
      ...this.responses[intent],
      ...responses
    };

    logger.info(`Custom responses for intent '${intent}' added successfully`);
  }

  // Get available response templates
  getAvailableResponses() {
    return Object.keys(this.responses).map(intent => ({
      intent: intent,
      responseCount: this.responses[intent].responses?.length || 0,
      hasFollowUp: Boolean(this.responses[intent].followUp),
      hasSpecialContent: Boolean(
        this.responses[intent].capabilities || 
        this.responses[intent].suggestions ||
        this.responses[intent].thankYou
      )
    }));
  }
}

module.exports = ResponseGenerator;