import { 
  ChatMessage, 
  ChatSession, 
  DetectedIntent, 
  MCPAction, 
  DialogFlowConfig, 
  MCPClientConfig, 
  AgentConfig,
  ChatBotState,
  AuthenticationContext,
  UserProfile,
  AuthenticationRequest,
  AuthenticationResponse
} from '../types';
import DialogFlowService from './dialogflow';
import MCPClientService from './mcp-client';

// Simple banking agent interface for now
interface BankingConversationAgent {
  initialize(): Promise<void>;
  processMessage(message: string, context: any): Promise<any>;
  setAuthToken(token: string): void;
}

export class ChatBotService {
  private dialogFlow: DialogFlowService;
  private mcpClient: MCPClientService;
  private agent: BankingConversationAgent;
  private currentSession: ChatSession | null = null;
  private state: ChatBotState;
  private authContext: AuthenticationContext | null = null;

  constructor(
    dialogFlowConfig: DialogFlowConfig,
    mcpConfig: MCPClientConfig,
    agentConfig: AgentConfig
  ) {
    // Initialize services
    this.dialogFlow = new DialogFlowService(dialogFlowConfig);
    this.mcpClient = new MCPClientService(mcpConfig);
    this.agent = new BankingConversationAgent(this.mcpClient, agentConfig);

    // Initialize state
    this.state = {
      currentSession: null,
      isLoading: false,
      isConnected: false,
      error: null,
      config: {
        dialogFlow: dialogFlowConfig,
        mcp: mcpConfig,
        agent: agentConfig,
      },
    };
  }

  /**
   * Initialize the ChatBot service
   */
  async initialize(): Promise<boolean> {
    try {
      this.setState({ isLoading: true, error: null });

      // Connect to MCP server
      const mcpConnected = await this.mcpClient.connect();
      if (!mcpConnected) {
        throw new Error('Failed to connect to MCP server');
      }

      // Initialize the conversation agent
      await this.agent.initialize();

      this.setState({ 
        isLoading: false, 
        isConnected: true 
      });

      console.log('ChatBot service initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize ChatBot service:', error);
      this.setState({ 
        isLoading: false, 
        isConnected: false, 
        error: error instanceof Error ? error.message : 'Initialization failed' 
      });
      return false;
    }
  }

  /**
   * Start a new chat session
   */
  async startSession(userId?: string): Promise<ChatSession> {
    try {
      // Create new session ID with DialogFlow
      const sessionId = await this.dialogFlow.createSession(userId || `anonymous-${Date.now()}`);

      // Create new chat session
      const session: ChatSession = {
        id: sessionId,
        userId,
        isAuthenticated: false,
        messages: [],
        context: {
          collectedData: {},
          awaitingConfirmation: false,
        },
        startTime: new Date(),
        lastActivity: new Date(),
      };

      this.currentSession = session;
      this.setState({ currentSession: session });

      console.log('New chat session started:', sessionId);
      return session;
    } catch (error) {
      console.error('Failed to start chat session:', error);
      throw error;
    }
  }

  /**
   * Authenticate user and create session
   */
  async authenticate(credentials: AuthenticationRequest): Promise<AuthenticationResponse> {
    try {
      this.setState({ isLoading: true, error: null });

      // Call authentication API
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      const authResult = await response.json();

      if (!response.ok || !authResult.success) {
        return {
          success: false,
          error: authResult.message || 'Authentication failed',
          code: authResult.code || 'AUTH_FAILED'
        };
      }

      // Create authentication context
      this.authContext = {
        token: authResult.token,
        sessionId: authResult.sessionId,
        userId: authResult.user.userId,
        customerId: authResult.user.customerId,
        email: authResult.user.email,
        role: authResult.user.role,
        permissions: authResult.user.permissions,
        accountIds: authResult.user.accountIds,
        isAuthenticated: true,
        expiresAt: new Date(Date.now() + (30 * 60 * 1000)), // 30 minutes
        lastActivity: new Date(),
        paymentLimits: authResult.user.paymentLimits
      };

      // Set auth token in MCP client
      this.mcpClient.setAuthToken(authResult.token);

      // Create or update session
      this.currentSession = {
        id: authResult.sessionId,
        userId: authResult.user.userId,
        isAuthenticated: true,
        authContext: this.authContext,
        userRole: authResult.user.role,
        messages: this.currentSession?.messages || [],
        context: {
          ...this.currentSession?.context,
          user: authResult.user,
          permissions: authResult.user.permissions,
          accountIds: authResult.user.accountIds
        },
        startTime: this.currentSession?.startTime || new Date(),
        lastActivity: new Date()
      };

      this.setState({ isLoading: false });

      // Add system message about authentication
      await this.addMessage({
        id: `msg_${Date.now()}`,
        content: `Welcome back, ${authResult.user.firstName}! You are now authenticated and can access your banking services.`,
        role: 'system',
        timestamp: new Date(),
        metadata: {
          authenticatedUser: authResult.user.firstName,
          role: authResult.user.role,
          accountCount: authResult.user.accountIds.length
        }
      });

      return {
        success: true,
        token: authResult.token,
        sessionId: authResult.sessionId,
        user: authResult.user
      };

    } catch (error) {
      console.error('Authentication error:', error);
      this.setState({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Authentication failed' 
      });
      
      return {
        success: false,
        error: 'Authentication failed',
        code: 'AUTH_ERROR'
      };
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.authContext?.isAuthenticated || false;
  }

  /**
   * Get current authentication context
   */
  getAuthContext(): AuthenticationContext | null {
    return this.authContext;
  }

  /**
   * Check if user has specific permission
   */
  hasPermission(permission: string): boolean {
    if (!this.authContext) return false;
    
    // Check for wildcard permission
    if (this.authContext.permissions.includes('*')) return true;
    
    // Check for exact permission
    if (this.authContext.permissions.includes(permission)) return true;
    
    // Check for category permissions (e.g., accounts:* for accounts:read)
    const parts = permission.split(':');
    if (parts.length > 1) {
      const wildcardPermission = `${parts[0]}:*`;
      return this.authContext.permissions.includes(wildcardPermission);
    }
    
    return false;
  }

  /**
   * Check if user can access specific account
   */
  canAccessAccount(accountId: string): boolean {
    if (!this.authContext) return false;
    return this.authContext.accountIds.includes(accountId);
  }

  /**
   * Check payment authorization
   */
  canMakePayment(amount: number): { authorized: boolean; reason?: string } {
    if (!this.authContext) {
      return { authorized: false, reason: 'Not authenticated' };
    }

    if (!this.hasPermission('payments:initiate') && !this.hasPermission('payments:own')) {
      return { authorized: false, reason: 'Insufficient payment permissions' };
    }

    if (amount > this.authContext.paymentLimits.transaction) {
      return { 
        authorized: false, 
        reason: `Amount exceeds transaction limit of $${this.authContext.paymentLimits.transaction}` 
      };
    }

    return { authorized: true };
  }

  /**
   * Logout and clear authentication
   */
  async logout(): Promise<void> {
    try {
      if (this.authContext?.token) {
        // Call logout API
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.authContext.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: this.authContext.sessionId
          })
        });
      }
    } catch (error) {
      console.error('Logout API error:', error);
    } finally {
      // Clear authentication context
      this.authContext = null;
      this.mcpClient.setAuthToken('');
      
      if (this.currentSession) {
        this.currentSession.isAuthenticated = false;
        this.currentSession.authContext = undefined;
        this.currentSession.userId = undefined;
      }

      // Add system message about logout
      await this.addMessage({
        id: `msg_${Date.now()}`,
        content: 'You have been logged out. Some banking services may not be available until you authenticate again.',
        role: 'system',
        timestamp: new Date(),
        metadata: {
          action: 'logout'
        }
      });
    }
  }

  /**
   * Process a user message
   */
  async processMessage(message: string, userId?: string): Promise<{
    response: string;
    session: ChatSession;
    intent: DetectedIntent;
    actions: MCPAction[];
  }> {
    try {
      this.setState({ isLoading: true, error: null });

      // Ensure we have a session
      if (!this.currentSession) {
        this.currentSession = await this.startSession(userId);
      }

      // Detect intent using DialogFlow
      const intent = await this.dialogFlow.detectIntent(message, userId);
      console.log('Detected intent:', intent);

      // Process message with the conversation agent
      const agentResult = await this.agent.processMessage(
        message,
        intent,
        userId,
        this.currentSession.context
      );

      // Create user message
      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}-user`,
        content: message,
        role: 'user',
        timestamp: new Date(),
        intent,
        status: 'completed',
      };

      // Create assistant message
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}-assistant`,
        content: agentResult.response,
        role: 'assistant',
        timestamp: new Date(),
        mcpAction: agentResult.actions.length > 0 ? agentResult.actions[0] : undefined,
        status: 'completed',
      };

      // Update session
      this.currentSession.messages.push(userMessage, assistantMessage);
      this.currentSession.context = {
        ...this.currentSession.context,
        ...agentResult.updatedContext,
      };
      this.currentSession.lastActivity = new Date();

      // Update authentication status if token was received
      if (agentResult.updatedContext.authToken) {
        this.currentSession.isAuthenticated = true;
        this.currentSession.authToken = agentResult.updatedContext.authToken;
        this.currentSession.userRole = agentResult.updatedContext.userRole;
        this.agent.setAuthToken(agentResult.updatedContext.authToken);
      }

      this.setState({ 
        currentSession: this.currentSession,
        isLoading: false 
      });

      return {
        response: agentResult.response,
        session: this.currentSession,
        intent,
        actions: agentResult.actions,
      };
    } catch (error) {
      console.error('Error processing message:', error);
      this.setState({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Processing failed' 
      });
      throw error;
    }
  }

  /**
   * Authenticate user with enhanced security
   */
  async authenticate(credentials: AuthenticationRequest): Promise<AuthenticationResponse> {
    try {
      this.setState({ isLoading: true, error: null });

      // Call authentication API
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      const authResult = await response.json();

      if (!response.ok || !authResult.success) {
        return {
          success: false,
          error: authResult.message || 'Authentication failed',
          code: authResult.code || 'AUTH_FAILED'
        };
      }

      // Create authentication context
      this.authContext = {
        token: authResult.token,
        sessionId: authResult.sessionId,
        userId: authResult.user.userId,
        customerId: authResult.user.customerId,
        email: authResult.user.email,
        role: authResult.user.role,
        permissions: authResult.user.permissions,
        accountIds: authResult.user.accountIds,
        isAuthenticated: true,
        expiresAt: new Date(Date.now() + (30 * 60 * 1000)), // 30 minutes
        lastActivity: new Date(),
        paymentLimits: authResult.user.paymentLimits
      };

      // Set auth token in MCP client
      this.mcpClient.setAuthToken(authResult.token);

      // Create or update session
      this.currentSession = {
        id: authResult.sessionId,
        userId: authResult.user.userId,
        isAuthenticated: true,
        authContext: this.authContext,
        userRole: authResult.user.role,
        messages: this.currentSession?.messages || [],
        context: {
          ...this.currentSession?.context,
          customerInfo: authResult.user,
          permissions: authResult.user.permissions,
          accountIds: authResult.user.accountIds
        },
        startTime: this.currentSession?.startTime || new Date(),
        lastActivity: new Date()
      };

      this.setState({ 
        currentSession: this.currentSession,
        isLoading: false 
      });

      return {
        success: true,
        token: authResult.token,
        sessionId: authResult.sessionId,
        user: authResult.user
      };

    } catch (error) {
      console.error('Authentication error:', error);
      this.setState({ 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Authentication failed' 
      });
      
      return {
        success: false,
        error: 'Authentication failed',
        code: 'AUTH_ERROR'
      };
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      if (this.currentSession) {
        this.currentSession.isAuthenticated = false;
        this.currentSession.authToken = undefined;
        this.currentSession.userRole = undefined;
        this.currentSession.context.customerInfo = undefined;
      }

      // Clear auth tokens from services
      this.mcpClient.setAuthToken('');
      this.agent.setAuthToken('');

      // Clear DialogFlow session
      await this.dialogFlow.clearSession();

      this.setState({ currentSession: this.currentSession });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  /**
   * Get current session
   */
  getCurrentSession(): ChatSession | null {
    return this.currentSession;
  }

  /**
   * Get chat state
   */
  getState(): ChatBotState {
    return { ...this.state };
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.currentSession?.isAuthenticated || false;
  }

  /**
   * Get conversation history
   */
  getConversationHistory(): ChatMessage[] {
    return this.currentSession?.messages || [];
  }

  /**
   * Clear conversation history
   */
  async clearHistory(): Promise<void> {
    try {
      if (this.currentSession) {
        this.currentSession.messages = [];
        this.currentSession.context = {
          collectedData: {},
          awaitingConfirmation: false,
        };
      }

      // Clear agent history
      this.agent.clearHistory();

      // Clear DialogFlow session
      await this.dialogFlow.clearSession();

      this.setState({ currentSession: this.currentSession });
    } catch (error) {
      console.error('Error clearing history:', error);
    }
  }

  /**
   * Execute a quick action
   */
  async executeQuickAction(action: {
    intent: string;
    parameters?: Record<string, any>;
  }): Promise<{
    response: string;
    actions: MCPAction[];
  }> {
    try {
      // Create mock intent for quick action
      const mockIntent: DetectedIntent = {
        name: action.intent,
        displayName: action.intent,
        confidence: 1.0,
        parameters: action.parameters || {},
        category: this.categorizeQuickAction(action.intent),
      };

      // Process with agent
      const result = await this.agent.processMessage(
        `Execute ${action.intent}`,
        mockIntent,
        this.currentSession?.userId,
        this.currentSession?.context
      );

      return {
        response: result.response,
        actions: result.actions,
      };
    } catch (error) {
      console.error('Error executing quick action:', error);
      throw error;
    }
  }

  /**
   * Get available quick actions based on current state
   */
  getQuickActions(): Array<{
    id: string;
    label: string;
    icon: string;
    intent: string;
    category: string;
  }> {
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
    ];

    // Filter based on authentication status
    if (!this.isAuthenticated()) {
      return [
        {
          id: 'login',
          label: 'Login',
          icon: 'UserIcon',
          intent: 'Login',
          category: 'authentication',
        },
        {
          id: 'help',
          label: 'Help',
          icon: 'QuestionMarkCircleIcon',
          intent: 'Help',
          category: 'customer_service',
        },
      ];
    }

    return baseActions;
  }

  /**
   * Get health status
   */
  async getHealthStatus(): Promise<{
    mcpConnected: boolean;
    dialogFlowReady: boolean;
    agentReady: boolean;
  }> {
    try {
      const mcpHealth = await this.mcpClient.healthCheck();
      
      return {
        mcpConnected: mcpHealth,
        dialogFlowReady: true, // DialogFlow is stateless
        agentReady: this.agent !== null,
      };
    } catch (error) {
      console.error('Health check error:', error);
      return {
        mcpConnected: false,
        dialogFlowReady: false,
        agentReady: false,
      };
    }
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    try {
      await this.mcpClient.disconnect();
      this.currentSession = null;
      this.setState({ 
        currentSession: null, 
        isConnected: false 
      });
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  }

  /**
   * Update internal state
   */
  private setState(updates: Partial<ChatBotState>): void {
    this.state = { ...this.state, ...updates };
  }

  /**
   * Categorize quick action intent
   */
  private categorizeQuickAction(intent: string): string {
    const categoryMap: Record<string, string> = {
      'Login': 'authentication',
      'Account Balance': 'balance_inquiry',
      'Transaction History': 'transaction_history',
      'Transfer Money': 'payment',
      'Card Information': 'card_management',
      'Help': 'customer_service',
    };

    return categoryMap[intent] || 'general_inquiry';
  }
}

export default ChatBotService;
