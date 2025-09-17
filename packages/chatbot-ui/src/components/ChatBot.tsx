import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage } from '../types';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import QuickActions from './QuickActions';
import AuthDialog from './AuthDialog';
import chatBotStore from '../utils/store';

interface ChatBotProps {
  className?: string;
}

// Debug logging utility for ChatBot component
class ChatBotDebugLogger {
  private component: string;
  private isDebugMode: boolean;

  constructor(component = 'CHATBOT-UI') {
    this.component = component;
    this.isDebugMode = process.env.NODE_ENV === 'development' || 
                      process.env.NEXT_PUBLIC_DEBUG === 'true' ||
                      localStorage?.getItem('chatbot_debug') === 'true';
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${this.component}] [${level}]`;
    
    if (data) {
      return `${prefix} ${message} | Data: ${JSON.stringify(data, null, 2)}`;
    }
    return `${prefix} ${message}`;
  }

  info(message: string, data?: any): void {
    console.log(this.formatMessage('INFO', message, data));
  }

  debug(message: string, data?: any): void {
    if (this.isDebugMode) {
      console.log(this.formatMessage('DEBUG', message, data));
    }
  }

  warn(message: string, data?: any): void {
    console.warn(this.formatMessage('WARN', message, data));
  }

  error(message: string, error?: any, data?: any): void {
    const errorData = error ? { 
      message: error.message, 
      stack: error.stack, 
      ...(data || {}) 
    } : data;
    console.error(this.formatMessage('ERROR', message, errorData));
  }

  stateChange(stateName: string, previousValue: any, newValue: any): void {
    if (this.isDebugMode) {
      this.debug(`🔄 State Change: ${stateName}`, {
        previous: previousValue,
        new: newValue,
        changed: previousValue !== newValue
      });
    }
  }

  userAction(action: string, details?: any): void {
    this.info(`👤 User Action: ${action}`, details);
  }

  componentEvent(event: string, details?: any): void {
    if (this.isDebugMode) {
      this.debug(`🔧 Component Event: ${event}`, details);
    }
  }
}

const ChatBot: React.FC<ChatBotProps> = ({ className = '' }) => {
  const logger = new ChatBotDebugLogger('CHATBOT-UI');
  const [state, setState] = useState(chatBotStore.getState());
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Enhanced debug state tracking
  const [previousState, setPreviousState] = useState(state);

  logger.componentEvent('ChatBot component mounted', {
    className,
    initialState: {
      isInitialized: state.isInitialized,
      isAuthenticated: state.isAuthenticated,
      isLoading: state.isLoading,
      messageCount: state.messages.length,
      hasError: !!state.error
    }
  });

  // Subscribe to store changes with enhanced logging
  useEffect(() => {
    logger.debug('🔗 Setting up store subscription');
    
    const unsubscribe = chatBotStore.subscribe(() => {
      const newState = chatBotStore.getState();
      
      // Log state changes
      if (newState.isInitialized !== previousState.isInitialized) {
        logger.stateChange('isInitialized', previousState.isInitialized, newState.isInitialized);
      }
      if (newState.isAuthenticated !== previousState.isAuthenticated) {
        logger.stateChange('isAuthenticated', previousState.isAuthenticated, newState.isAuthenticated);
      }
      if (newState.isLoading !== previousState.isLoading) {
        logger.stateChange('isLoading', previousState.isLoading, newState.isLoading);
      }
      if (newState.messages.length !== previousState.messages.length) {
        logger.stateChange('messageCount', previousState.messages.length, newState.messages.length);
        logger.debug('📝 Messages updated', {
          previousCount: previousState.messages.length,
          newCount: newState.messages.length,
          lastMessage: newState.messages[newState.messages.length - 1]
        });
      }
      if (newState.error !== previousState.error) {
        logger.stateChange('error', previousState.error, newState.error);
        if (newState.error) {
          logger.error('❌ Store error detected', null, { error: newState.error });
        }
      }

      setPreviousState(newState);
      setState(newState);
    });

    logger.debug('✅ Store subscription established');

    return () => {
      logger.debug('🔌 Cleaning up store subscription');
      unsubscribe();
    };
  }, [previousState]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      logger.debug('📜 Auto-scrolling to bottom of messages');
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state.messages]);

  // Check for authentication requirements in new messages
  useEffect(() => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage && 
        lastMessage.role === 'system' && 
        lastMessage.metadata?.requiresAuth && 
        !state.isAuthenticated &&
        !showAuthDialog) {
      
      logger.info('🔐 Auto-triggering authentication dialog', {
        messageId: lastMessage.id,
        messageContent: lastMessage.content.substring(0, 100) + '...',
        currentAuthState: state.isAuthenticated,
        dialogCurrentlyOpen: showAuthDialog
      });
      
      setShowAuthDialog(true);
    }
  }, [state.messages, state.isAuthenticated, showAuthDialog]);

  // Initialize ChatBot on mount
  useEffect(() => {
    logger.componentEvent('ChatBot initialization check', {
      isInitialized: state.isInitialized,
      shouldInitialize: !state.isInitialized
    });

    if (!state.isInitialized) {
      logger.info('🚀 Initializing ChatBot...');
      initializeChatBot();
    }
  }, []);

  const initializeChatBot = async () => {
    const startTime = Date.now();
    logger.info('🔧 ChatBot initialization starting...');

    try {
      const config = {
        dialogFlow: {
          projectId: process.env.NEXT_PUBLIC_DIALOGFLOW_PROJECT_ID || 'enterprise-banking-chatbot',
          sessionId: `session-${Date.now()}`,
          languageCode: 'en-US',
        },
        mcp: {
          transport: 'http' as const,
          mcpServerUrl: process.env.NEXT_PUBLIC_MCP_SERVER_URL || 'http://localhost:3001',
          serverPath: process.env.NEXT_PUBLIC_MCP_SERVER_PATH || '../backend/mcp-server.js',
          apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api/v1',
          timeout: 30000,
          retryAttempts: 3,
        },
        agent: {
          name: 'Enterprise Banking Assistant',
          description: 'AI assistant for enterprise banking operations',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 2000,
          systemPrompt: `You are an AI assistant for an enterprise banking system. You help customers with:
            - Account inquiries and balance checks
            - Transaction history and details
            - Payments and transfers
            - Card management
            - Dispute resolution
            - Fraud reporting
            
            Always be professional, helpful, and secure. Protect customer privacy and follow banking regulations.
            If you cannot complete a request due to insufficient information or permissions, explain what is needed.`,
          tools: [],
        },
      };

      logger.info('🔥 Initializing ChatBot with HTTP MCP config', {
        mcpConfig: config.mcp,
        dialogFlowConfig: config.dialogFlow,
        agentConfig: {
          name: config.agent.name,
          model: config.agent.model,
          temperature: config.agent.temperature
        }
      });

      await chatBotStore.initialize(config);
      
      const duration = Date.now() - startTime;
      logger.info('✅ ChatBot initialization completed successfully', {
        duration: `${duration}ms`,
        transport: config.mcp.transport,
        mcpServerUrl: config.mcp.mcpServerUrl
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('❌ ChatBot initialization failed', error, {
        duration: `${duration}ms`
      });
    }
  };

  const handleSendMessage = async (message: string) => {
    const startTime = Date.now();
    logger.userAction('Send Message', {
      messageLength: message.length,
      messagePreview: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
      currentAuthState: state.isAuthenticated,
      canSendMessage: state.canSendMessage
    });

    try {
      // Check if this message requires authentication before sending
      const lowerMessage = message.toLowerCase();
      const authRequiredKeywords = ['balance', 'transfer', 'payment', 'card', 'transaction', 'account'];
      const requiresAuthMessage = authRequiredKeywords.some(keyword => lowerMessage.includes(keyword));
      
      logger.debug('� Message analysis', {
        requiresAuth: requiresAuthMessage,
        containsKeywords: authRequiredKeywords.filter(keyword => lowerMessage.includes(keyword)),
        currentAuthState: state.isAuthenticated
      });
      
      if (requiresAuthMessage && !state.isAuthenticated) {
        logger.info('� Authentication required for message - triggering dialog', {
          message: message.substring(0, 100),
          requiresAuth: requiresAuthMessage
        });
        setShowAuthDialog(true);
        return;
      }

      logger.debug('📤 Sending message to store...');
      await chatBotStore.sendMessage(message);
      
      const duration = Date.now() - startTime;
      logger.info('✅ Message sent successfully', {
        duration: `${duration}ms`,
        messageLength: message.length
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('❌ Failed to send message', error, {
        duration: `${duration}ms`,
        messageLength: message.length
      });
    }
  };

  const handleQuickAction = async (action: { intent: string; parameters?: Record<string, any> }) => {
    const startTime = Date.now();
    logger.userAction('Quick Action', {
      intent: action.intent,
      hasParameters: !!action.parameters,
      parameterKeys: action.parameters ? Object.keys(action.parameters) : [],
      currentAuthState: state.isAuthenticated
    });

    try {
      // Handle Login action specially
      if (action.intent === 'Login') {
        logger.info('� Login quick action - triggering auth dialog');
        setShowAuthDialog(true);
        return;
      }

      // Check if authentication is required for other actions
      if (requiresAuth(action.intent) && !state.isAuthenticated) {
        logger.info('� Auth required for quick action - triggering dialog', {
          intent: action.intent,
          requiresAuth: requiresAuth(action.intent)
        });
        setShowAuthDialog(true);
        return;
      }

      logger.debug('⚡ Executing quick action...');
      await chatBotStore.executeQuickAction(action);
      
      const duration = Date.now() - startTime;
      logger.info('✅ Quick action executed successfully', {
        intent: action.intent,
        duration: `${duration}ms`
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('❌ Failed to execute quick action', error, {
        intent: action.intent,
        duration: `${duration}ms`
      });
    }
  };

  const handleAuthenticate = async (email: string, password: string) => {
    const startTime = Date.now();
    logger.userAction('Authentication Attempt', {
      email,
      hasPassword: !!password
    });

    try {
      logger.debug('🔐 Attempting authentication...');
      const success = await chatBotStore.authenticate(email, password);
      
      const duration = Date.now() - startTime;
      
      if (success) {
        logger.info('✅ Authentication successful', {
          email,
          duration: `${duration}ms`
        });
        setShowAuthDialog(false);
      } else {
        logger.warn('⚠️ Authentication failed', {
          email,
          duration: `${duration}ms`
        });
      }
      
      return success;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('❌ Authentication error', error, {
        email,
        duration: `${duration}ms`
      });
      return false;
    }
  };

  const handleLogout = async () => {
    const startTime = Date.now();
    logger.userAction('Logout', {
      wasAuthenticated: state.isAuthenticated
    });

    try {
      logger.debug('🚪 Attempting logout...');
      await chatBotStore.logout();
      
      const duration = Date.now() - startTime;
      logger.info('✅ Logout successful', {
        duration: `${duration}ms`
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('❌ Logout error', error, {
        duration: `${duration}ms`
      });
    }
  };

  const handleClearHistory = async () => {
    const startTime = Date.now();
    logger.userAction('Clear History', {
      messageCount: state.messages.length
    });

    try {
      logger.debug('🗑️ Clearing chat history...');
      await chatBotStore.clearHistory();
      
      const duration = Date.now() - startTime;
      logger.info('✅ History cleared successfully', {
        duration: `${duration}ms`,
        previousMessageCount: state.messages.length
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('❌ Failed to clear history', error, {
        duration: `${duration}ms`
      });
    }
  };

  const requiresAuth = (intent: string): boolean => {
    const authRequiredIntents = [
      'Account Balance',
      'Transaction History',
      'Transfer Money',
      'Card Information',
      'Make Payment',
      'account.balance',
      'transaction.history',
      'payment.transfer',
      'card.status',
      'payment.bill'
    ];
    
    const required = authRequiredIntents.includes(intent);
    logger.debug('🔍 Checking auth requirement', {
      intent,
      required,
      authRequiredIntents
    });
    
    return required;
  };

  // Component render logic with enhanced logging
  if (!state.isInitialized && state.isLoading) {
    logger.componentEvent('Rendering loading state', {
      isInitialized: state.isInitialized,
      isLoading: state.isLoading
    });

    return (
      <div className={`chatbot-container ${className}`}>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Initializing HTTP MCP ChatBot...</span>
        </div>
      </div>
    );
  }

  if (state.error && !state.isInitialized) {
    logger.componentEvent('Rendering error state', {
      error: state.error,
      isInitialized: state.isInitialized
    });

    return (
      <div className={`chatbot-container ${className}`}>
        <div className="flex flex-col items-center justify-center h-96 p-6">
          <div className="text-red-500 text-center">
            <h3 className="text-lg font-semibold mb-2">ChatBot Initialization Failed</h3>
            <p className="text-sm">{state.error}</p>
          </div>
          <button
            onClick={() => {
              logger.userAction('Retry Initialization');
              initializeChatBot();
            }}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  logger.componentEvent('Rendering main ChatBot interface', {
    isInitialized: state.isInitialized,
    isAuthenticated: state.isAuthenticated,
    messageCount: state.messages.length,
    showAuthDialog,
    canSendMessage: state.canSendMessage
  });

  return (
    <div className={`chatbot-container flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="chatbot-header bg-blue-600 text-white p-4 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-green-400 rounded-full mr-2"></div>
            <h2 className="text-lg font-semibold">Enterprise Banking Assistant (HTTP MCP)</h2>
          </div>
          <div className="flex items-center space-x-2">
            {state.isAuthenticated && (
              <span className="text-sm text-blue-100">
                {state.userRole || 'Customer'}
              </span>
            )}
            <div className="flex space-x-1">
              {state.isAuthenticated && (
                <button
                  onClick={() => {
                    logger.userAction('Logout Button Clicked');
                    handleLogout();
                  }}
                  className="p-2 text-blue-100 hover:text-white hover:bg-blue-700 rounded"
                  title="Logout"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => {
                  logger.userAction('Clear History Button Clicked');
                  handleClearHistory();
                }}
                className="p-2 text-blue-100 hover:text-white hover:bg-blue-700 rounded"
                title="Clear History"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <QuickActions
        actions={chatBotStore.getQuickActions()}
        onActionClick={(action) => {
          logger.debug('🎯 Quick action passed to component', { action });
          handleQuickAction(action);
        }}
        isAuthenticated={state.isAuthenticated}
        isLoading={state.isLoading}
      />

      {/* Messages */}
      <div className="chatbot-messages flex-1 overflow-y-auto p-4 bg-gray-50">
        <MessageList
          messages={state.messages}
          isLoading={state.isLoading}
          error={state.error}
        />
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <MessageInput
        onSendMessage={(message) => {
          logger.debug('💬 Message input submitted', { 
            messageLength: message.length,
            canSendMessage: state.canSendMessage
          });
          handleSendMessage(message);
        }}
        disabled={!state.canSendMessage}
        isLoading={state.isLoading}
      />

      {/* Authentication Dialog */}
      {showAuthDialog && (
        <AuthDialog
          isOpen={showAuthDialog}
          onClose={() => {
            logger.userAction('Auth Dialog Closed');
            logger.debug('🔐 Auth dialog closed by user');
            setShowAuthDialog(false);
          }}
          onAuthenticate={(email, password) => {
            logger.debug('🔐 Auth dialog submitted', { email });
            return handleAuthenticate(email, password);
          }}
          isLoading={state.isLoading}
          error={state.error}
        />
      )}

      {/* Error Toast */}
      {state.error && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white p-3 rounded-lg shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm">{state.error}</span>
            <button
              onClick={() => {
                logger.userAction('Error Toast Dismissed');
                logger.debug('❌ Error toast dismissed');
                chatBotStore.clearError();
              }}
              className="ml-2 text-red-200 hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatBot;
