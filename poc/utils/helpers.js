// Utility functions for chatbot POC
class ChatbotUtils {
  
  // Generate unique IDs
  static generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Format timestamps
  static formatTimestamp(timestamp, format = 'relative') {
    const date = new Date(timestamp);
    const now = new Date();
    
    switch (format) {
      case 'relative':
        return this.getRelativeTime(date, now);
      case 'short':
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      case 'long':
        return date.toLocaleString();
      case 'iso':
        return date.toISOString();
      default:
        return date.toString();
    }
  }

  static getRelativeTime(date, now) {
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  // Text processing utilities
  static truncateText(text, maxLength = 100, suffix = '...') {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - suffix.length) + suffix;
  }

  static capitalizeFirst(text) {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  static sanitizeText(text) {
    if (!text) return '';
    return text
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  // Confidence level helpers
  static getConfidenceLevel(confidence) {
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.5) return 'medium';
    return 'low';
  }

  static getConfidenceColor(confidence) {
    if (confidence >= 0.8) return '#10b981'; // green
    if (confidence >= 0.5) return '#f59e0b'; // yellow
    return '#ef4444'; // red
  }

  static getConfidenceEmoji(confidence) {
    if (confidence >= 0.8) return '🟢';
    if (confidence >= 0.5) return '🟡';
    return '🔴';
  }

  // Intent helpers
  static getIntentIcon(intent) {
    const icons = {
      greeting: '👋',
      question: '❓',
      help: '🆘',
      goodbye: '👋',
      affirmation: '✅',
      negation: '❌',
      complaint: '😤',
      compliment: '👍',
      unknown: '❔',
      error: '⚠️'
    };
    return icons[intent] || '💬';
  }

  static getIntentDescription(intent) {
    const descriptions = {
      greeting: 'User is greeting or saying hello',
      question: 'User is asking a question',
      help: 'User needs assistance or support',
      goodbye: 'User is ending the conversation',
      affirmation: 'User is agreeing or confirming',
      negation: 'User is disagreeing or denying',
      complaint: 'User is expressing dissatisfaction',
      compliment: 'User is giving praise or positive feedback',
      unknown: 'Intent could not be determined',
      error: 'Error occurred during intent detection'
    };
    return descriptions[intent] || 'Unknown intent type';
  }

  // Data validation helpers
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static isValidJson(str) {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  // Performance utilities
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  static throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  // Storage helpers
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Export/Import helpers
  static downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  static downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Error handling helpers
  static getErrorMessage(error) {
    if (typeof error === 'string') return error;
    if (error?.message) return error.message;
    if (error?.error) return error.error;
    return 'An unknown error occurred';
  }

  static logError(error, context = {}) {
    const errorInfo = {
      message: this.getErrorMessage(error),
      timestamp: new Date().toISOString(),
      context,
      stack: error?.stack || null
    };
    
    console.error('Chatbot Error:', errorInfo);
    return errorInfo;
  }

  // Analytics helpers
  static calculateAverageConfidence(messages) {
    const botMessages = messages.filter(m => 
      m.type === 'bot' && 
      typeof m.metadata?.confidence === 'number'
    );
    
    if (botMessages.length === 0) return 0;
    
    const total = botMessages.reduce((sum, m) => sum + m.metadata.confidence, 0);
    return Math.round((total / botMessages.length) * 100) / 100;
  }

  static getIntentDistribution(messages) {
    const intentCounts = {};
    
    messages.forEach(message => {
      if (message.type === 'bot' && message.metadata?.intent) {
        const intent = message.metadata.intent;
        intentCounts[intent] = (intentCounts[intent] || 0) + 1;
      }
    });
    
    return intentCounts;
  }

  static calculateResponseTime(messages) {
    const times = messages
      .filter(m => m.type === 'bot' && m.metadata?.processingTime)
      .map(m => m.metadata.processingTime);
    
    if (times.length === 0) return { avg: 0, min: 0, max: 0 };
    
    return {
      avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      min: Math.min(...times),
      max: Math.max(...times)
    };
  }

  // Color utilities
  static hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  static rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // Browser detection
  static getBrowserInfo() {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    
    if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari')) browser = 'Safari';
    else if (ua.includes('Edge')) browser = 'Edge';
    
    return {
      browser,
      userAgent: ua,
      language: navigator.language,
      platform: navigator.platform,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine
    };
  }

  // Device detection
  static getDeviceInfo() {
    return {
      isMobile: /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
      isTablet: /iPad|Android(?!.*Mobile)/i.test(navigator.userAgent),
      isDesktop: !/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
      screenWidth: screen.width,
      screenHeight: screen.height,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    };
  }
}

// Export for Node.js if running on server
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatbotUtils;
}

// Make available globally in browser
if (typeof window !== 'undefined') {
  window.ChatbotUtils = ChatbotUtils;
}