// Local Storage Utility Module
class StorageManager {
  constructor() {
    this.prefix = 'chatbot_poc_';
  }

  // Get prefixed key
  getKey(key) {
    return `${this.prefix}${key}`;
  }

  // Check if localStorage is available
  isStorageAvailable() {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Set item in localStorage
  setItem(key, value) {
    if (!this.isStorageAvailable()) {
      console.warn('localStorage is not available');
      return false;
    }

    try {
      const serializedValue = JSON.stringify(value);
      localStorage.setItem(this.getKey(key), serializedValue);
      return true;
    } catch (error) {
      console.error('Error setting localStorage item:', error);
      return false;
    }
  }

  // Get item from localStorage
  getItem(key, defaultValue = null) {
    if (!this.isStorageAvailable()) {
      return defaultValue;
    }

    try {
      const item = localStorage.getItem(this.getKey(key));
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error('Error getting localStorage item:', error);
      return defaultValue;
    }
  }

  // Remove item from localStorage
  removeItem(key) {
    if (!this.isStorageAvailable()) {
      return false;
    }

    try {
      localStorage.removeItem(this.getKey(key));
      return true;
    } catch (error) {
      console.error('Error removing localStorage item:', error);
      return false;
    }
  }

  // Clear all items with our prefix
  clear() {
    if (!this.isStorageAvailable()) {
      return false;
    }

    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          localStorage.removeItem(key);
        }
      });
      return true;
    } catch (error) {
      console.error('Error clearing localStorage:', error);
      return false;
    }
  }

  // Chat-specific storage methods
  saveChatHistory(history) {
    return this.setItem('chat_history', history);
  }

  getChatHistory() {
    return this.getItem('chat_history', []);
  }

  saveSettings(settings) {
    return this.setItem('settings', settings);
  }

  getSettings() {
    return this.getItem('settings', {
      confidenceThreshold: 0.7,
      enableSound: true,
      showIntentInfo: true,
      theme: 'light'
    });
  }

  saveSessionId(sessionId) {
    return this.setItem('session_id', sessionId);
  }

  getSessionId() {
    return this.getItem('session_id');
  }

  saveUserPreferences(preferences) {
    return this.setItem('user_preferences', preferences);
  }

  getUserPreferences() {
    return this.getItem('user_preferences', {
      quickActions: ['Hello', 'Help', 'What can you do?'],
      showWelcomeMessage: true,
      enableNotifications: false
    });
  }

  // Intent analysis history
  saveIntentHistory(history) {
    return this.setItem('intent_history', history);
  }

  getIntentHistory() {
    return this.getItem('intent_history', []);
  }

  // Add to intent history (limited to last 50 items)
  addToIntentHistory(intentData) {
    const history = this.getIntentHistory();
    history.unshift({
      ...intentData,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 50 items
    const limitedHistory = history.slice(0, 50);
    return this.saveIntentHistory(limitedHistory);
  }
}

// Create global storage instance
window.storageManager = new StorageManager();