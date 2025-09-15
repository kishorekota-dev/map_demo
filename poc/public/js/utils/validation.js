// Validation Utility Module
class ValidationUtils {
  
  // Validate message content
  static validateMessage(message) {
    const errors = [];
    
    if (!message) {
      errors.push('Message is required');
      return { isValid: false, errors };
    }
    
    if (typeof message !== 'string') {
      errors.push('Message must be a string');
      return { isValid: false, errors };
    }
    
    const trimmedMessage = message.trim();
    
    if (trimmedMessage.length === 0) {
      errors.push('Message cannot be empty');
    }
    
    if (trimmedMessage.length > 500) {
      errors.push('Message cannot exceed 500 characters');
    }
    
    if (trimmedMessage.length < 1) {
      errors.push('Message must be at least 1 character long');
    }
    
    // Check for potentially harmful content (basic XSS prevention)
    const dangerousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /javascript:/gi,
      /data:text\/html/gi
    ];
    
    const hasDangerousContent = dangerousPatterns.some(pattern => 
      pattern.test(trimmedMessage)
    );
    
    if (hasDangerousContent) {
      errors.push('Message contains potentially harmful content');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      cleanMessage: trimmedMessage
    };
  }
  
  // Validate session ID
  static validateSessionId(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') {
      return { isValid: false, error: 'Invalid session ID format' };
    }
    
    // Session ID should match pattern: session_timestamp_randomstring
    const sessionPattern = /^session_\d+_[a-z0-9]+$/;
    
    if (!sessionPattern.test(sessionId)) {
      return { isValid: false, error: 'Session ID format is invalid' };
    }
    
    return { isValid: true };
  }
  
  // Validate confidence threshold
  static validateConfidenceThreshold(threshold) {
    const num = parseFloat(threshold);
    
    if (isNaN(num)) {
      return { isValid: false, error: 'Confidence threshold must be a number' };
    }
    
    if (num < 0 || num > 1) {
      return { isValid: false, error: 'Confidence threshold must be between 0 and 1' };
    }
    
    return { isValid: true, value: num };
  }
  
  // Validate intent data
  static validateIntentData(intentData) {
    const errors = [];
    
    if (!intentData || typeof intentData !== 'object') {
      return { isValid: false, errors: ['Intent data must be an object'] };
    }
    
    if (!intentData.intent || typeof intentData.intent !== 'string') {
      errors.push('Intent name is required and must be a string');
    }
    
    if (intentData.confidence !== undefined) {
      const confidenceValidation = this.validateConfidenceThreshold(intentData.confidence);
      if (!confidenceValidation.isValid) {
        errors.push(`Intent confidence: ${confidenceValidation.error}`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  // Sanitize HTML content
  static sanitizeHtml(html) {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
  }
  
  // Escape special characters for safe display
  static escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    
    return text.replace(/[&<>"']/g, function(m) { 
      return map[m]; 
    });
  }
  
  // Validate email format (if needed for future features)
  static validateEmail(email) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return {
      isValid: emailPattern.test(email),
      error: emailPattern.test(email) ? null : 'Invalid email format'
    };
  }
  
  // Validate URL format
  static validateUrl(url) {
    try {
      new URL(url);
      return { isValid: true };
    } catch {
      return { isValid: false, error: 'Invalid URL format' };
    }
  }
  
  // Rate limiting helper
  static createRateLimiter(maxRequests = 5, windowMs = 60000) {
    const requests = [];
    
    return function() {
      const now = Date.now();
      
      // Remove old requests outside the window
      while (requests.length > 0 && requests[0] <= now - windowMs) {
        requests.shift();
      }
      
      // Check if we've exceeded the limit
      if (requests.length >= maxRequests) {
        return {
          allowed: false,
          resetTime: requests[0] + windowMs,
          error: `Rate limit exceeded. Max ${maxRequests} requests per ${windowMs / 1000} seconds.`
        };
      }
      
      // Add current request
      requests.push(now);
      
      return {
        allowed: true,
        remaining: maxRequests - requests.length
      };
    };
  }
  
  // Debounce function for input validation
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
  
  // Throttle function for API calls
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
}

// Create global validation utilities
window.ValidationUtils = ValidationUtils;