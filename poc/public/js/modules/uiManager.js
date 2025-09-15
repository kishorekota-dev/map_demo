// UI Manager Module
class UIManager {
  constructor() {
    this.connectionStatus = 'disconnected';
    this.sidebarOpen = false;
    this.isMobile = window.innerWidth <= 768;
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.checkConnectionStatus();
    this.updateResponsiveLayout();
  }

  setupEventListeners() {
    // Window resize handler
    window.addEventListener('resize', () => {
      this.updateResponsiveLayout();
    });

    // Connection status updates
    window.addEventListener('online', () => {
      this.updateConnectionStatus('connected');
    });

    window.addEventListener('offline', () => {
      this.updateConnectionStatus('disconnected');
    });

    // Sidebar toggle (for mobile)
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-sidebar-toggle]')) {
        this.toggleSidebar();
      }
    });

    // Click outside sidebar to close (mobile)
    document.addEventListener('click', (event) => {
      if (this.sidebarOpen && this.isMobile) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar && !sidebar.contains(event.target) && !event.target.closest('[data-sidebar-toggle]')) {
          this.closeSidebar();
        }
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (event) => {
      this.handleKeyboardShortcuts(event);
    });

    // Focus management
    this.setupFocusManagement();
  }

  updateConnectionStatus(status) {
    this.connectionStatus = status;
    
    const statusIndicator = document.getElementById('connectionStatus');
    if (!statusIndicator) return;

    const statusDot = statusIndicator.querySelector('.status-dot');
    const statusText = statusIndicator.querySelector('.status-text');

    if (statusDot) {
      statusDot.className = `status-dot status-${status}`;
    }

    if (statusText) {
      const statusMessages = {
        connected: 'Connected',
        connecting: 'Connecting...',
        disconnected: 'Disconnected',
        error: 'Connection Error'
      };
      
      statusText.textContent = statusMessages[status] || 'Unknown';
    }

    // Show toast for status changes
    if (status === 'connected') {
      toastManager.success('Connected to server', 2000);
    } else if (status === 'disconnected') {
      toastManager.warning('Connection lost', 3000);
    } else if (status === 'error') {
      toastManager.error('Connection error occurred', 4000);
    }
  }

  async checkConnectionStatus() {
    try {
      this.updateConnectionStatus('connecting');
      
      const response = await apiClient.healthCheck();
      
      if (response.success) {
        this.updateConnectionStatus('connected');
      } else {
        this.updateConnectionStatus('error');
      }
    } catch (error) {
      console.error('Health check failed:', error);
      this.updateConnectionStatus('disconnected');
    }
  }

  updateResponsiveLayout() {
    const wasMobile = this.isMobile;
    this.isMobile = window.innerWidth <= 768;
    
    // Close sidebar if switching to mobile
    if (!wasMobile && this.isMobile && this.sidebarOpen) {
      this.closeSidebar();
    }
    
    // Update layout classes
    document.body.classList.toggle('mobile-layout', this.isMobile);
    document.body.classList.toggle('desktop-layout', !this.isMobile);
  }

  toggleSidebar() {
    if (this.sidebarOpen) {
      this.closeSidebar();
    } else {
      this.openSidebar();
    }
  }

  openSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    this.sidebarOpen = true;
    sidebar.classList.add('open');
    document.body.classList.add('sidebar-open');

    // Create backdrop for mobile
    if (this.isMobile) {
      this.createSidebarBackdrop();
    }
  }

  closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    this.sidebarOpen = false;
    sidebar.classList.remove('open');
    document.body.classList.remove('sidebar-open');

    // Remove backdrop
    this.removeSidebarBackdrop();
  }

  createSidebarBackdrop() {
    if (document.getElementById('sidebarBackdrop')) return;

    const backdrop = document.createElement('div');
    backdrop.id = 'sidebarBackdrop';
    backdrop.className = 'sidebar-backdrop';
    backdrop.addEventListener('click', () => {
      this.closeSidebar();
    });

    document.body.appendChild(backdrop);
  }

  removeSidebarBackdrop() {
    const backdrop = document.getElementById('sidebarBackdrop');
    if (backdrop) {
      backdrop.remove();
    }
  }

  handleKeyboardShortcuts(event) {
    // Ctrl/Cmd + / to focus search/input
    if ((event.ctrlKey || event.metaKey) && event.key === '/') {
      event.preventDefault();
      const chatInput = document.getElementById('chatInput');
      if (chatInput) {
        chatInput.focus();
      }
    }

    // Ctrl/Cmd + K to clear chat
    if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
      event.preventDefault();
      if (window.chatManager) {
        window.chatManager.clearChat();
      }
    }

    // Ctrl/Cmd + , to open settings
    if ((event.ctrlKey || event.metaKey) && event.key === ',') {
      event.preventDefault();
      if (window.settingsManager) {
        window.settingsManager.openSettingsModal();
      }
    }

    // Escape to close modals or sidebar
    if (event.key === 'Escape') {
      if (this.sidebarOpen && this.isMobile) {
        this.closeSidebar();
      }
    }
  }

  setupFocusManagement() {
    // Focus input on page load
    window.addEventListener('load', () => {
      const chatInput = document.getElementById('chatInput');
      if (chatInput) {
        setTimeout(() => {
          chatInput.focus();
        }, 100);
      }
    });

    // Maintain focus on input after sending message
    document.addEventListener('message:sent', () => {
      const chatInput = document.getElementById('chatInput');
      if (chatInput) {
        setTimeout(() => {
          chatInput.focus();
        }, 100);
      }
    });
  }

  // Show loading state
  showLoading(message = 'Loading...') {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
      const loadingText = loadingScreen.querySelector('p');
      if (loadingText) {
        loadingText.textContent = message;
      }
      loadingScreen.classList.remove('hidden');
    }
  }

  // Hide loading state
  hideLoading() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
      loadingScreen.classList.add('hidden');
    }
  }

  // Update page title with unread count
  updatePageTitle(unreadCount = 0) {
    const baseTitle = 'Chatbot POC - Intent Detection Demo';
    
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }
  }

  // Scroll to element smoothly
  scrollToElement(element, behavior = 'smooth') {
    if (element) {
      element.scrollIntoView({ behavior, block: 'center' });
    }
  }

  // Highlight element temporarily
  highlightElement(element, duration = 2000) {
    if (!element) return;

    element.classList.add('highlighted');
    
    setTimeout(() => {
      element.classList.remove('highlighted');
    }, duration);
  }

  // Create notification
  createNotification(title, body, options = {}) {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return null;
    }

    if (Notification.permission === 'granted') {
      return new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...options
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          return new Notification(title, {
            body,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            ...options
          });
        }
      });
    }

    return null;
  }

  // Add CSS classes for animations
  addAnimation(element, animationClass, duration = 1000) {
    if (!element) return;

    element.classList.add(animationClass);
    
    setTimeout(() => {
      element.classList.remove(animationClass);
    }, duration);
  }

  // Show/hide elements with animation
  showElement(element, animationClass = 'animate-fadeIn') {
    if (!element) return;
    
    element.classList.remove('hidden');
    this.addAnimation(element, animationClass);
  }

  hideElement(element, animationClass = 'animate-fadeOut') {
    if (!element) return;
    
    this.addAnimation(element, animationClass);
    
    setTimeout(() => {
      element.classList.add('hidden');
    }, 300);
  }

  // Get current theme
  getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }

  // Toggle theme
  toggleTheme() {
    const currentTheme = this.getCurrentTheme();
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    if (window.settingsManager) {
      window.settingsManager.updateSetting('theme', newTheme);
    }
  }

  // Copy text to clipboard
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      toastManager.success('Copied to clipboard');
      return true;
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      
      try {
        document.execCommand('copy');
        toastManager.success('Copied to clipboard');
        return true;
      } catch (fallbackError) {
        toastManager.error('Failed to copy to clipboard');
        return false;
      } finally {
        document.body.removeChild(textArea);
      }
    }
  }

  // Print current chat
  printChat() {
    const printWindow = window.open('', '_blank');
    const chatContent = document.getElementById('chatMessages').innerHTML;
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Chat History - ${new Date().toLocaleDateString()}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .message { margin-bottom: 15px; }
            .message-bubble { padding: 10px; border-radius: 10px; }
            .user .message-bubble { background: #007bff; color: white; }
            .bot .message-bubble { background: #f1f1f1; border: 1px solid #ddd; }
            .message-meta { font-size: 12px; color: #666; margin-top: 5px; }
          </style>
        </head>
        <body>
          <h1>Chat History</h1>
          <p>Exported on: ${new Date().toLocaleString()}</p>
          <div>${chatContent}</div>
        </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.print();
  }
}

// Create global UIManager instance
window.UIManager = UIManager;