// Main Application Entry Point
class ChatbotApp {
  constructor() {
    this.isInitialized = false;
    this.components = {};
    this.version = '1.0.0';
    
    this.init();
  }

  async init() {
    try {
      // Show loading screen
      this.showInitialLoading();
      
      // Initialize core components
      await this.initializeComponents();
      
      // Setup global error handling
      this.setupErrorHandling();
      
      // Perform initial health check
      await this.performInitialChecks();
      
      // Initialize UI state
      this.initializeUI();
      
      // Mark as initialized
      this.isInitialized = true;
      
      console.log(`Chatbot POC v${this.version} initialized successfully`);
      
      // Hide loading screen
      this.hideInitialLoading();
      
      // Show welcome toast
      toastManager.success('Chatbot is ready!', 3000);
      
    } catch (error) {
      console.error('Failed to initialize chatbot application:', error);
      this.handleInitializationError(error);
    }
  }

  showInitialLoading() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
      loadingScreen.classList.remove('hidden');
    }
  }

  hideInitialLoading() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
      setTimeout(() => {
        loadingScreen.classList.add('hidden');
      }, 500);
    }
  }

  async initializeComponents() {
    // Initialize components in order of dependency
    
    // 1. UI Manager (handles responsive layout and basic UI)
    this.components.uiManager = new UIManager();
    window.uiManager = this.components.uiManager;
    
    // 2. Settings Manager (loads user preferences)
    this.components.settingsManager = new SettingsManager();
    window.settingsManager = this.components.settingsManager;
    
    // 3. Intent Display (for showing intent analysis)
    this.components.intentDisplay = new IntentDisplay('sidebar');
    window.intentDisplay = this.components.intentDisplay;
    
    // 4. Chat Manager (main chat functionality)
    this.components.chatManager = new ChatManager();
    window.chatManager = this.components.chatManager;
    
    console.log('Core components initialized');
  }

  setupErrorHandling() {
    // Global error handler
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
      this.handleGlobalError(event.error);
    });

    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      this.handleGlobalError(event.reason);
    });

    // API error handler
    window.addEventListener('api:error', (event) => {
      console.error('API error:', event.detail);
      this.handleApiError(event.detail);
    });
  }

  async performInitialChecks() {
    try {
      // Check API connectivity
      await this.components.uiManager.checkConnectionStatus();
      
      // Load available intents
      await this.components.intentDisplay.loadAvailableIntents();
      
      // Restore session if available
      await this.restoreSession();
      
      console.log('Initial checks completed');
      
    } catch (error) {
      console.warn('Some initial checks failed:', error);
      // Continue with initialization even if some checks fail
    }
  }

  async restoreSession() {
    const savedSessionId = storageManager.getSessionId();
    
    if (savedSessionId) {
      // Validate session ID format
      const validation = ValidationUtils.validateSessionId(savedSessionId);
      
      if (validation.isValid) {
        apiClient.setSessionId(savedSessionId);
        console.log('Session restored:', savedSessionId);
      } else {
        // Create new session if saved one is invalid
        const newSessionId = apiClient.generateSessionId();
        storageManager.saveSessionId(newSessionId);
        console.log('New session created:', newSessionId);
      }
    } else {
      // Save current session ID
      storageManager.saveSessionId(apiClient.getSessionId());
    }
  }

  initializeUI() {
    // Set initial focus
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      setTimeout(() => {
        chatInput.focus();
      }, 1000);
    }

    // Add keyboard shortcuts info
    this.addKeyboardShortcutsInfo();
    
    // Setup periodic health checks
    this.setupPeriodicHealthChecks();
    
    // Initialize drag and drop for file imports (future feature)
    this.setupDragAndDrop();
  }

  addKeyboardShortcutsInfo() {
    // Add title attributes for keyboard shortcuts
    const settingsButton = document.getElementById('toggleSettings');
    if (settingsButton) {
      settingsButton.title = 'Settings (Ctrl+,)';
    }

    const clearButton = document.getElementById('clearChat');
    if (clearButton) {
      clearButton.title = 'Clear Chat (Ctrl+K)';
    }

    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.title = 'Type your message (Ctrl+/ to focus)';
    }
  }

  setupPeriodicHealthChecks() {
    // Check connection every 30 seconds
    setInterval(() => {
      if (this.isInitialized) {
        this.components.uiManager.checkConnectionStatus();
      }
    }, 30000);
  }

  setupDragAndDrop() {
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      document.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    // Handle file drops (for future settings import feature)
    document.addEventListener('drop', (event) => {
      const files = event.dataTransfer.files;
      
      if (files.length > 0) {
        const file = files[0];
        
        if (file.type === 'application/json' && file.name.includes('settings')) {
          this.components.settingsManager.importSettings(file);
        } else {
          toastManager.info('Drop a settings JSON file to import configuration');
        }
      }
    });
  }

  handleInitializationError(error) {
    const errorMessage = error.message || 'Unknown initialization error';
    
    // Hide loading screen
    this.hideInitialLoading();
    
    // Show error modal
    modalManager.alert(
      `Failed to initialize the chatbot application: ${errorMessage}`,
      'Initialization Error'
    );
    
    // Try to show basic interface anyway
    try {
      document.body.classList.add('error-state');
      toastManager.error('Application failed to initialize properly');
    } catch (fallbackError) {
      console.error('Even fallback error handling failed:', fallbackError);
    }
  }

  handleGlobalError(error) {
    // Don't spam with error toasts
    if (this.lastErrorTime && Date.now() - this.lastErrorTime < 5000) {
      return;
    }
    
    this.lastErrorTime = Date.now();
    
    const errorMessage = error?.message || 'An unexpected error occurred';
    toastManager.error(`Error: ${errorMessage}`, 5000);
  }

  handleApiError(errorDetails) {
    const { status, message, endpoint } = errorDetails;
    
    if (status >= 500) {
      this.components.uiManager.updateConnectionStatus('error');
      toastManager.error('Server error occurred. Please try again later.');
    } else if (status === 429) {
      toastManager.warning('Rate limit exceeded. Please wait before sending more messages.');
    } else if (status >= 400) {
      toastManager.warning(`Request error: ${message}`);
    }
  }

  // Public API methods
  sendMessage(message) {
    if (this.isInitialized && this.components.chatManager) {
      this.components.chatManager.inputElement.value = message;
      this.components.chatManager.sendMessage();
    }
  }

  clearChat() {
    if (this.isInitialized && this.components.chatManager) {
      this.components.chatManager.clearChat();
    }
  }

  openSettings() {
    if (this.isInitialized && this.components.settingsManager) {
      this.components.settingsManager.openSettingsModal();
    }
  }

  exportChatHistory() {
    if (this.isInitialized && this.components.chatManager) {
      this.components.chatManager.exportChatHistory();
    }
  }

  exportIntentHistory() {
    if (this.isInitialized && this.components.intentDisplay) {
      this.components.intentDisplay.exportHistory();
    }
  }

  getAppStatistics() {
    if (!this.isInitialized) {
      return { error: 'Application not initialized' };
    }

    return {
      version: this.version,
      initialized: this.isInitialized,
      sessionId: apiClient.getSessionId(),
      chat: this.components.chatManager?.getChatStatistics(),
      intents: this.components.intentDisplay?.getStatistics(),
      settings: this.components.settingsManager?.getSettings(),
      uptime: Date.now() - this.startTime
    };
  }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.chatbotApp = new ChatbotApp();
  window.chatbotApp.startTime = Date.now();
});

// Export for global access
window.ChatbotApp = ChatbotApp;