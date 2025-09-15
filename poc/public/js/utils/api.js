// API Utility Module
class ApiClient {
  constructor() {
    this.baseUrl = window.location.origin;
    this.apiVersion = 'v1';
    this.sessionId = this.generateSessionId();
    this.timeout = 10000; // 10 seconds
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    const defaultOptions = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': this.sessionId,
        ...options.headers
      },
      timeout: this.timeout
    };

    const requestOptions = { ...defaultOptions, ...options };

    // Add body if provided and method is not GET
    if (requestOptions.body && requestOptions.method !== 'GET') {
      requestOptions.body = JSON.stringify(requestOptions.body);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        ...requestOptions,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return { success: true, data, status: response.status };

    } catch (error) {
      console.error('API request failed:', error);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      
      throw new Error(error.message || 'Network error occurred');
    }
  }

  // Chat API methods
  async sendMessage(message, context = {}) {
    return this.makeRequest('/api/chat/message', {
      method: 'POST',
      body: { message, context }
    });
  }

  async analyzeIntent(message) {
    return this.makeRequest('/api/chat/analyze', {
      method: 'POST',
      body: { message }
    });
  }

  async getChatHistory(limit = 10) {
    return this.makeRequest(`/api/chat/history/${this.sessionId}?limit=${limit}`);
  }

  async getAvailableIntents() {
    return this.makeRequest('/api/chat/intents');
  }

  async resetChat() {
    return this.makeRequest(`/api/chat/reset/${this.sessionId}`, {
      method: 'DELETE'
    });
  }

  async getChatStatus() {
    return this.makeRequest('/api/chat/status');
  }

  // Health check methods
  async healthCheck() {
    return this.makeRequest('/api/health');
  }

  async detailedHealthCheck() {
    return this.makeRequest('/api/health/detailed');
  }

  // Utility methods
  setSessionId(sessionId) {
    this.sessionId = sessionId;
  }

  getSessionId() {
    return this.sessionId;
  }

  setTimeout(timeout) {
    this.timeout = timeout;
  }
}

// Create global API instance
window.apiClient = new ApiClient();