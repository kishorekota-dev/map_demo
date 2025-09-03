import React from 'react';
import { ChatMessage } from '../types';
import Message from './Message';

interface MessageListProps {
  messages: ChatMessage[];
  isLoading?: boolean;
  error?: string | null;
}

const MessageList: React.FC<MessageListProps> = ({ 
  messages, 
  isLoading = false, 
  error = null 
}) => {
  if (messages.length === 0 && !isLoading) {
    return (
      <div className="message-list-empty flex flex-col items-center justify-center py-12 text-gray-500">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.13 8.13 0 01-2.939-.542l-3.618 1.448a.75.75 0 01-.92-.92l1.448-3.618A8.13 8.13 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Welcome to Enterprise Banking Assistant</h3>
        <p className="text-center text-gray-500 max-w-md">
          I'm here to help you with your banking needs. You can ask me about account balances, 
          transaction history, payments, cards, and more. Start by typing a message or using the quick actions below.
        </p>
      </div>
    );
  }

  return (
    <div className="message-list space-y-4">
      {messages.map((message) => (
        <Message
          key={message.id}
          message={message}
        />
      ))}
      
      {isLoading && (
        <div className="message-loading flex items-center space-x-2 p-4">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
          <span className="text-gray-500 text-sm">Assistant is typing...</span>
        </div>
      )}

      {error && (
        <div className="message-error bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-red-800">Error</h4>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessageList;
