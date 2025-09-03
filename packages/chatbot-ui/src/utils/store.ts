import { 
  ChatSession, 
  ChatMessage, 
  DetectedIntent, 
  MCPAction, 
  DialogFlowConfig, 
  MCPClientConfig, 
  AgentConfig 
} from '../types';
import ChatBotService from '../services/chatbot-enhanced';

// Simple store implementation without Zustand for now
class ChatBotStore {
  private service: ChatBotService | null = null;
  private currentSession: ChatSession | null = null;
  private isLoading: boolean = false;
  private isConnected: boolean = false;
  private error: string | null = null;
  private isInitialized: boolean = false;
  private listeners: Array<() => void> = [];

  // Subscribe to store changes
  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // Notify all listeners
  private notifyListeners() {
    this.listeners.forEach(listener => listener());
  }

  // Get current state
  getState() {
    return {
      service: this.service,
      currentSession: this.currentSession,
      isLoading: this.isLoading,
      isConnected: this.isConnected,
      error: this.error,
      isInitialized: this.isInitialized,
      isAuthenticated: this.currentSession?.isAuthenticated || false,
      messages: this.currentSession?.messages || [],
      userRole: this.currentSession?.userRole,
      customerId: this.currentSession?.userId,
      canSendMessage: this.isConnected && !this.isLoading && this.service !== null,
    };
  }

  // Initialize the ChatBot service
  async initialize(config: {
    dialogFlow: DialogFlowConfig;
    mcp: MCPClientConfig;
    agent: AgentConfig;
  }): Promise<boolean> {
    try {
      this.isLoading = true;
      this.error = null;
      this.notifyListeners();

      const service = new ChatBotService(
        config.dialogFlow,
        config.mcp,
        config.agent
      );

      const success = await service.initialize();

      if (success) {
        this.service = service;
        this.isInitialized = true;
        this.isConnected = true;
        this.isLoading = false;

        // Start initial session
        const session = await service.startSession();
        this.currentSession = session;

        this.notifyListeners();
        return true;
      } else {
        this.isLoading = false;
        this.isConnected = false;
        this.error = 'Failed to initialize ChatBot service';
        this.notifyListeners();
        return false;
      }
    } catch (error) {
      console.error('Store initialization error:', error);
      this.isLoading = false;
      this.isConnected = false;
      this.error = error instanceof Error ? error.message : 'Initialization failed';
      this.notifyListeners();
      return false;
    }
  }

  // Send a message
  async sendMessage(message: string): Promise<void> {
    if (!this.service) {
      this.error = 'ChatBot service not initialized';
      this.notifyListeners();
      return;
    }

    try {
      this.isLoading = true;
      this.error = null;
      this.notifyListeners();

      const result = await this.service.processMessage(message, this.currentSession?.userId);

      this.currentSession = result.session;
      this.isLoading = false;
      this.notifyListeners();
    } catch (error) {
      console.error('Send message error:', error);
      this.isLoading = false;
      this.error = error instanceof Error ? error.message : 'Failed to send message';
      this.notifyListeners();
    }
  }

  // Authenticate user
  async authenticate(username: string, password: string): Promise<boolean> {
    if (!this.service) {
      this.error = 'ChatBot service not initialized';
      this.notifyListeners();
      return false;
    }

    try {
      this.isLoading = true;
      this.error = null;
      this.notifyListeners();

      const authResult = await this.service.authenticate({ email: username, password });

      if (authResult.success) {
        const updatedSession = this.service.getCurrentSession();
        this.currentSession = updatedSession;
        this.isLoading = false;
        this.notifyListeners();
        return true;
      } else {
        this.isLoading = false;
        this.error = 'Authentication failed';
        this.notifyListeners();
        return false;
      }
    } catch (error) {
      console.error('Authentication error:', error);
      this.isLoading = false;
      this.error = error instanceof Error ? error.message : 'Authentication failed';
      this.notifyListeners();
      return false;
    }
  }

  // Logout user
  async logout(): Promise<void> {
    if (!this.service) return;

    try {
      await this.service.logout();
      const updatedSession = this.service.getCurrentSession();
      this.currentSession = updatedSession;
      this.notifyListeners();
    } catch (error) {
      console.error('Logout error:', error);
      this.error = 'Logout failed';
      this.notifyListeners();
    }
  }

  // Clear conversation history
  async clearHistory(): Promise<void> {
    if (!this.service) return;

    try {
      await this.service.clearSession();
      const updatedSession = this.service.getCurrentSession();
      this.currentSession = updatedSession;
      this.notifyListeners();
    } catch (error) {
      console.error('Clear history error:', error);
      this.error = 'Failed to clear history';
      this.notifyListeners();
    }
  }

  // Execute quick action
  async executeQuickAction(action: { intent: string; parameters?: Record<string, any> }): Promise<void> {
    if (!this.service) {
      this.error = 'ChatBot service not initialized';
      this.notifyListeners();
      return;
    }

    try {
      this.isLoading = true;
      this.error = null;
      this.notifyListeners();

      // Quick action execution not implemented in enhanced service
      console.log('Quick action execution:', action);

      // Refresh session after action
      const updatedSession = this.service.getCurrentSession();
      this.currentSession = updatedSession;
      this.isLoading = false;
      this.notifyListeners();
    } catch (error) {
      console.error('Quick action error:', error);
      this.isLoading = false;
      this.error = error instanceof Error ? error.message : 'Action failed';
      this.notifyListeners();
    }
  }

  // Set error
  setError(error: string | null): void {
    this.error = error;
    this.notifyListeners();
  }

  // Clear error
  clearError(): void {
    this.error = null;
    this.notifyListeners();
  }

  // Get quick actions
  getQuickActions() {
    const baseActions = [
      {
        id: 'balance',
        label: 'Check Balance',
        icon: 'CurrencyDollarIcon',
        intent: 'Account Balance',
        category: 'balance_inquiry',
      },
      {
        id: 'transactions',
        label: 'Recent Transactions',
        icon: 'ClockIcon',
        intent: 'Transaction History',
        category: 'transaction_history',
      },
      {
        id: 'transfer',
        label: 'Transfer Money',
        icon: 'ArrowRightLeftIcon',
        intent: 'Transfer Money',
        category: 'payment',
      },
      {
        id: 'cards',
        label: 'Manage Cards',
        icon: 'CreditCardIcon',
        intent: 'Card Information',
        category: 'card_management',
      },
      {
        id: 'payment',
        label: 'Make Payment',
        icon: 'CurrencyDollarIcon',
        intent: 'Make Payment',
        category: 'payment',
      },
    ];

    // Add login action if not authenticated
    if (!this.currentSession?.isAuthenticated) {
      return [
        {
          id: 'login',
          label: 'Login',
          icon: 'UserIcon',
          intent: 'Login',
          category: 'authentication',
        },
        ...baseActions
      ];
    }

    return baseActions;
  }
}

// Create singleton store instance
const chatBotStore = new ChatBotStore();

export default chatBotStore;
