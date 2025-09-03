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

const ChatBot: React.FC<ChatBotProps> = ({ className = '' }) => {
  const [state, setState] = useState(chatBotStore.getState());
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to store changes
  useEffect(() => {
    const unsubscribe = chatBotStore.subscribe(() => {
      setState(chatBotStore.getState());
    });

    return unsubscribe;
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  // Initialize ChatBot on mount
  useEffect(() => {
    if (!state.isInitialized) {
      initializeChatBot();
    }
  }, []);

  const initializeChatBot = async () => {
    try {
      const config = {
        dialogFlow: {
          projectId: process.env.NEXT_PUBLIC_DIALOGFLOW_PROJECT_ID || 'enterprise-banking-chatbot',
          sessionId: `session-${Date.now()}`,
          languageCode: 'en-US',
        },
        mcp: {
          serverPath: process.env.NEXT_PUBLIC_MCP_SERVER_PATH || '../backend/mcp-server.js',
          apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api',
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

      await chatBotStore.initialize(config);
    } catch (error) {
      console.error('Failed to initialize ChatBot:', error);
    }
  };

  const handleSendMessage = async (message: string) => {
    try {
      await chatBotStore.sendMessage(message);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleQuickAction = async (action: { intent: string; parameters?: Record<string, any> }) => {
    try {
      // Check if authentication is required
      if (requiresAuth(action.intent) && !state.isAuthenticated) {
        setShowAuthDialog(true);
        return;
      }

      await chatBotStore.executeQuickAction(action);
    } catch (error) {
      console.error('Failed to execute quick action:', error);
    }
  };

  const handleAuthenticate = async (username: string, password: string) => {
    try {
      const success = await chatBotStore.authenticate(username, password);
      if (success) {
        setShowAuthDialog(false);
      }
      return success;
    } catch (error) {
      console.error('Authentication failed:', error);
      return false;
    }
  };

  const handleLogout = async () => {
    try {
      await chatBotStore.logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleClearHistory = async () => {
    try {
      await chatBotStore.clearHistory();
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  };

  const requiresAuth = (intent: string): boolean => {
    const authRequiredIntents = [
      'Account Balance',
      'Transaction History',
      'Transfer Money',
      'Card Information',
      'Make Payment',
    ];
    return authRequiredIntents.includes(intent);
  };

  if (!state.isInitialized && state.isLoading) {
    return (
      <div className={`chatbot-container ${className}`}>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Initializing ChatBot...</span>
        </div>
      </div>
    );
  }

  if (state.error && !state.isInitialized) {
    return (
      <div className={`chatbot-container ${className}`}>
        <div className="flex flex-col items-center justify-center h-96 p-6">
          <div className="text-red-500 text-center">
            <h3 className="text-lg font-semibold mb-2">ChatBot Initialization Failed</h3>
            <p className="text-sm">{state.error}</p>
          </div>
          <button
            onClick={initializeChatBot}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`chatbot-container flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="chatbot-header bg-blue-600 text-white p-4 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-green-400 rounded-full mr-2"></div>
            <h2 className="text-lg font-semibold">Enterprise Banking Assistant</h2>
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
                  onClick={handleLogout}
                  className="p-2 text-blue-100 hover:text-white hover:bg-blue-700 rounded"
                  title="Logout"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              )}
              <button
                onClick={handleClearHistory}
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
        onActionClick={handleQuickAction}
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
        onSendMessage={handleSendMessage}
        disabled={!state.canSendMessage}
        isLoading={state.isLoading}
      />

      {/* Authentication Dialog */}
      {showAuthDialog && (
        <AuthDialog
          isOpen={showAuthDialog}
          onClose={() => setShowAuthDialog(false)}
          onAuthenticate={handleAuthenticate}
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
              onClick={() => chatBotStore.clearError()}
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
