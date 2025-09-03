import { MCPClientService } from './mcp-client';
import {
  AuthenticationContext,
  ChatMessage,
  DialogFlowConfig,
  MCPClientConfig,
  AgentConfig,
  ChatBotState,
  DetectedIntent,
  IntentCategory
} from '../types';

export class ChatBotService {
  private mcpClient: MCPClientService;
  private state: ChatBotState;
  private authContext: AuthenticationContext | null = null;

  constructor(
    dialogFlowConfig: DialogFlowConfig,
    mcpConfig: MCPClientConfig,
    agentConfig: AgentConfig
  ) {
    this.mcpClient = new MCPClientService(mcpConfig);

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

      // Connect to backend via MCP client
      const connected = await this.mcpClient.connect();
      if (!connected) {
        throw new Error('Failed to connect to backend');
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
   * Send a message to the chatbot
   */
  async sendMessage(message: string): Promise<ChatMessage> {
    try {
      if (!this.state.isConnected) {
        throw new Error('ChatBot service not connected');
      }

      // Simple banking intent detection
      const intent = this.detectIntent(message);

      // Process based on intent
      let response: any = {};
      switch (intent.name) {
        case 'check_balance':
          response = await this.mcpClient.getAccountBalance('demo-account');
          break;
        case 'view_transactions':
          response = await this.mcpClient.getTransactionHistory('demo-account');
          break;
        case 'transfer_money':
          response = await this.mcpClient.transferFunds('from-account', 'to-account', 100);
          break;
        default:
          response = { success: true, data: { message: 'How can I help you with your banking needs today?' } };
      }

      return {
        id: `msg-${Date.now()}`,
        content: response.data?.message || response.error || 'I received your message',
        role: 'assistant',
        timestamp: new Date(),
        intent: intent,
        status: 'completed'
      };
    } catch (error) {
      console.error('Error sending message:', error);
      return {
        id: `msg-${Date.now()}`,
        content: 'Sorry, I encountered an error processing your message.',
        role: 'assistant',
        timestamp: new Date(),
        intent: this.createErrorIntent(),
        status: 'error'
      };
    }
  }

  /**
   * Simple intent detection
   */
  private detectIntent(message: string): DetectedIntent {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('balance') || lowerMessage.includes('how much')) {
      return {
        name: 'check_balance',
        displayName: 'Check Balance',
        confidence: 0.8,
        category: 'balance_inquiry'
      };
    }
    if (lowerMessage.includes('transaction') || lowerMessage.includes('history')) {
      return {
        name: 'view_transactions',
        displayName: 'View Transactions',
        confidence: 0.8,
        category: 'transaction_history'
      };
    }
    if (lowerMessage.includes('transfer') || lowerMessage.includes('send money')) {
      return {
        name: 'transfer_money',
        displayName: 'Transfer Money',
        confidence: 0.8,
        category: 'payment'
      };
    }
    if (lowerMessage.includes('pay bill') || lowerMessage.includes('payment')) {
      return {
        name: 'pay_bill',
        displayName: 'Pay Bill',
        confidence: 0.7,
        category: 'payment'
      };
    }
    if (lowerMessage.includes('card') && lowerMessage.includes('block')) {
      return {
        name: 'block_card',
        displayName: 'Block Card',
        confidence: 0.8,
        category: 'card_management'
      };
    }

    return {
      name: 'general_query',
      displayName: 'General Query',
      confidence: 0.5,
      category: 'general_inquiry'
    };
  }

  /**
   * Create error intent
   */
  private createErrorIntent(): DetectedIntent {
    return {
      name: 'error',
      displayName: 'Error',
      confidence: 0,
      category: 'general_inquiry'
    };
  }

  /**
   * Set authentication context
   */
  setAuthContext(context: AuthenticationContext): void {
    this.authContext = context;
    this.mcpClient.setAuthToken(context.token);
  }

  /**
   * Clear authentication context
   */
  clearAuthContext(): void {
    this.authContext = null;
    this.mcpClient.setAuthToken('');
  }

  /**
   * Get current state
   */
  getState(): ChatBotState {
    return this.state;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.authContext !== null && this.authContext.isAuthenticated;
  }

  /**
   * Get service status
   */
  async getStatus(): Promise<{
    mcpConnected: boolean;
    dialogFlowReady: boolean;
    agentReady: boolean;
  }> {
    try {
      const mcpHealth = this.mcpClient.isClientConnected();

      return {
        mcpConnected: mcpHealth,
        dialogFlowReady: true,
        agentReady: true,
      };
    } catch (error) {
      console.error('Error getting status:', error);
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
      this.setState({ isConnected: false });
      console.log('ChatBot service disconnected');
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  }

  private setState(updates: Partial<ChatBotState>): void {
    this.state = { ...this.state, ...updates };
  }
}
