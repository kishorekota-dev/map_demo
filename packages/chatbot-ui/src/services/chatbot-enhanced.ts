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
  AuthenticationResponse,
  IntentCategory
} from '../types';
import DialogFlowService from './dialogflow';
import MCPClientService from './mcp-client';

export class ChatBotService {
  private dialogFlow: DialogFlowService;
  private mcpClient: MCPClientService;
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
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      this.currentSession = {
        id: sessionId,
        userId,
        isAuthenticated: false,
        authContext: this.authContext,
        userRole: this.authContext?.role,
        messages: [],
        context: {
          sessionId,
          language: 'en-US',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        startTime: new Date(),
        lastActivity: new Date(),
      };

      this.setState({ currentSession: this.currentSession });
      
      console.log('Chat session started:', sessionId);
      return this.currentSession;
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
          customerInfo: authResult.user,
          accountIds: authResult.user.accountIds
        },
        startTime: this.currentSession?.startTime || new Date(),
        lastActivity: new Date()
      };

      this.setState({ 
        currentSession: this.currentSession,
        isLoading: false 
      });

      // Add authentication success message
      this.addMessage({
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
      this.addMessage({
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
   * Process a user message with authentication checks
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

      // Add user message to session
      const userMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        content: message,
        role: 'user',
        timestamp: new Date(),
      };

      this.addMessage(userMessage);

      // Detect intent using DialogFlow
      const intent = await this.dialogFlow.detectIntent(
        message,
        this.currentSession.id,
        this.currentSession.context
      );

      userMessage.intent = intent;

      // Check if operation requires authentication
      const requiresAuth = this.requiresAuthentication(intent);
      if (requiresAuth && !this.isAuthenticated()) {
        const authPrompt = this.getAuthenticationPrompt(intent);
        const systemMessage: ChatMessage = {
          id: `msg_${Date.now()}`,
          content: authPrompt,
          role: 'system',
          timestamp: new Date(),
          metadata: { requiresAuth: true, intent: intent.name }
        };

        this.addMessage(systemMessage);

        return {
          response: authPrompt,
          session: this.currentSession,
          intent,
          actions: []
        };
      }

      // Check permissions for authenticated operations
      if (this.isAuthenticated() && !this.hasPermissionForIntent(intent)) {
        const permissionDenied = `I'm sorry, but you don't have permission to perform this action. Your current role (${this.authContext?.role}) doesn't allow this operation.`;
        
        const systemMessage: ChatMessage = {
          id: `msg_${Date.now()}`,
          content: permissionDenied,
          role: 'system',
          timestamp: new Date(),
          metadata: { permissionDenied: true, intent: intent.name }
        };

        this.addMessage(systemMessage);

        return {
          response: permissionDenied,
          session: this.currentSession,
          intent,
          actions: []
        };
      }

      // Execute MCP actions based on intent
      const actions = await this.executeMCPActions(intent);

      // Generate response based on intent and actions
      const response = await this.generateResponse(intent, actions);

      // Add assistant response to session
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        content: response,
        role: 'assistant',
        timestamp: new Date(),
        intent,
        mcpAction: actions[0],
        status: 'completed',
      };

      this.addMessage(assistantMessage);

      // Update session activity
      this.currentSession.lastActivity = new Date();
      this.setState({ 
        currentSession: this.currentSession,
        isLoading: false 
      });

      return {
        response,
        session: this.currentSession,
        intent,
        actions,
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
   * Add message to current session
   */
  private addMessage(message: ChatMessage): void {
    if (this.currentSession) {
      this.currentSession.messages.push(message);
      this.setState({ currentSession: this.currentSession });
    }
  }

  /**
   * Check if intent requires authentication
   */
  private requiresAuthentication(intent: DetectedIntent): boolean {
    const publicIntents = [
      'general.greeting',
      'general.help',
      'general.information',
      'banking.hours',
      'banking.locations',
      'banking.services'
    ];

    return !publicIntents.includes(intent.name);
  }

  /**
   * Check if user has permission for intent
   */
  private hasPermissionForIntent(intent: DetectedIntent): boolean {
    if (!this.authContext) return false;

    const intentPermissionMap: Record<string, string> = {
      'account.balance': 'accounts:read',
      'account.statement': 'accounts:read',
      'transaction.history': 'transactions:read',
      'payment.transfer': 'payments:initiate',
      'payment.bill': 'payments:initiate',
      'card.status': 'cards:read',
      'card.block': 'cards:update',
      'dispute.create': 'disputes:create',
      'fraud.report': 'fraud:create'
    };

    const requiredPermission = intentPermissionMap[intent.name];
    return !requiredPermission || this.hasPermission(requiredPermission);
  }

  /**
   * Get authentication prompt based on intent
   */
  private getAuthenticationPrompt(intent: DetectedIntent): string {
    const intentMessages: Record<string, string> = {
      'account.balance': 'To check your account balance, please sign in to your account.',
      'payment.transfer': 'To make a payment or transfer, please authenticate first for security.',
      'card.block': 'To manage your cards, please sign in to verify your identity.',
      'dispute.create': 'To file a dispute, please authenticate to access your account information.'
    };

    return intentMessages[intent.name] || 
           'This action requires authentication. Please sign in to continue.';
  }

  /**
   * Execute MCP actions based on detected intent
   */
  private async executeMCPActions(intent: DetectedIntent): Promise<MCPAction[]> {
    const actions: MCPAction[] = [];

    // Map intents to MCP actions with authentication context
    const actionMap: Record<string, () => Promise<MCPAction>> = {
      'account.balance': () => this.mcpClient.getAccountBalance(intent.parameters?.accountId),
      'account.statement': () => this.mcpClient.getAccountStatement(intent.parameters?.accountId),
      'transaction.history': () => this.mcpClient.getTransactionHistory(intent.parameters?.accountId),
      'payment.transfer': () => this.mcpClient.transferMoney(intent.parameters),
      'payment.bill': () => this.mcpClient.payBill(intent.parameters),
      'card.status': () => this.mcpClient.getCards(),
      'card.block': () => this.mcpClient.blockCard(intent.parameters?.cardId),
      'dispute.create': () => this.mcpClient.createDispute(intent.parameters)
    };

    if (actionMap[intent.name]) {
      try {
        const action = await actionMap[intent.name]();
        actions.push(action);
      } catch (error) {
        console.error(`Error executing action for ${intent.name}:`, error);
        actions.push({
          tool: intent.name,
          parameters: intent.parameters || {},
          error: error instanceof Error ? error.message : 'Action failed'
        });
      }
    }

    return actions;
  }

  /**
   * Generate response based on intent and actions
   */
  private async generateResponse(intent: DetectedIntent, actions: MCPAction[]): Promise<string> {
    if (actions.length === 0) {
      return intent.fulfillmentText || "I understand your request, but I couldn't process it at the moment.";
    }

    const action = actions[0];
    if (action.error) {
      return `I apologize, but I encountered an error: ${action.error}`;
    }

    // Generate contextual responses based on intent
    switch (intent.name) {
      case 'account.balance':
        return this.formatBalanceResponse(action.result);
      case 'transaction.history':
        return this.formatTransactionHistoryResponse(action.result);
      case 'payment.transfer':
        return this.formatPaymentResponse(action.result);
      default:
        return intent.fulfillmentText || 'Your request has been processed successfully.';
    }
  }

  /**
   * Format balance response
   */
  private formatBalanceResponse(result: any): string {
    if (result?.balance !== undefined) {
      return `Your current account balance is $${result.balance.toFixed(2)}.`;
    }
    return 'I was unable to retrieve your account balance at this time.';
  }

  /**
   * Format transaction history response
   */
  private formatTransactionHistoryResponse(result: any): string {
    if (result?.transactions?.length > 0) {
      const count = result.transactions.length;
      return `I found ${count} recent transaction${count > 1 ? 's' : ''} in your account. The most recent transaction was ${result.transactions[0].description} for $${Math.abs(result.transactions[0].amount).toFixed(2)}.`;
    }
    return 'No recent transactions found in your account.';
  }

  /**
   * Format payment response
   */
  private formatPaymentResponse(result: any): string {
    if (result?.success) {
      return `Your payment has been processed successfully. Transaction ID: ${result.transactionId}`;
    }
    return 'Your payment could not be processed at this time. Please try again later.';
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
   * Update internal state
   */
  private setState(updates: Partial<ChatBotState>): void {
    this.state = { ...this.state, ...updates };
  }

  /**
   * Clear session and reset
   */
  async clearSession(): Promise<void> {
    this.currentSession = null;
    this.setState({ currentSession: null });
  }

  /**
   * Disconnect from services
   */
  async disconnect(): Promise<void> {
    await this.mcpClient.disconnect();
    this.setState({ isConnected: false });
  }
}

export default ChatBotService;
