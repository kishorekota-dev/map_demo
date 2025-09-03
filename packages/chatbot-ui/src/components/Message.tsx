import React from 'react';
import { ChatMessage } from '../types';

interface MessageProps {
  message: ChatMessage;
}

const Message: React.FC<MessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  // Format timestamp
  const formatTime = (timestamp: Date) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Get status indicator
  const getStatusIndicator = () => {
    if (message.status === 'pending') {
      return (
        <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" title="Pending"></div>
      );
    }
    if (message.status === 'error') {
      return (
        <div className="w-2 h-2 bg-red-400 rounded-full" title="Error"></div>
      );
    }
    if (message.status === 'completed') {
      return (
        <div className="w-2 h-2 bg-green-400 rounded-full" title="Completed"></div>
      );
    }
    return null;
  };

  // Get intent confidence badge
  const getIntentBadge = () => {
    if (!message.intent || isUser) return null;

    const confidenceColor = message.intent.confidence > 0.8 
      ? 'bg-green-100 text-green-800' 
      : message.intent.confidence > 0.6 
        ? 'bg-yellow-100 text-yellow-800' 
        : 'bg-red-100 text-red-800';

    return (
      <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${confidenceColor} mt-1`}>
        {message.intent.displayName} ({Math.round(message.intent.confidence * 100)}%)
      </div>
    );
  };

  // Get MCP action info
  const getMCPActionInfo = () => {
    if (!message.mcpAction || isUser) return null;

    return (
      <div className="mt-2 p-2 bg-gray-100 rounded text-xs">
        <div className="font-medium text-gray-700">
          Action: {message.mcpAction.tool}
        </div>
        {message.mcpAction.error && (
          <div className="text-red-600 mt-1">
            Error: {message.mcpAction.error}
          </div>
        )}
        {message.mcpAction.executionTime && (
          <div className="text-gray-500 mt-1">
            Execution time: {message.mcpAction.executionTime}ms
          </div>
        )}
      </div>
    );
  };

  if (isSystem) {
    return (
      <div className="message-system flex justify-center my-4">
        <div className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={`message flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-xs lg:max-w-md ${isUser ? 'order-1' : 'order-2'}`}>
        {/* Avatar */}
        <div className={`flex items-end ${isUser ? 'justify-end' : 'justify-start'} mb-1`}>
          {!isUser && (
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center mr-2">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          
          <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
            <div className="text-xs text-gray-500 mb-1">
              {isUser ? 'You' : 'Assistant'} • {formatTime(message.timestamp)}
            </div>
          </div>
          
          {isUser && (
            <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center ml-2">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          )}
        </div>

        {/* Message Bubble */}
        <div
          className={`relative px-4 py-2 rounded-lg ${
            isUser
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-900 border border-gray-200'
          }`}
        >
          {/* Message Content */}
          <div className="whitespace-pre-wrap break-words">
            {message.content}
          </div>

          {/* Status and metadata */}
          <div className={`flex items-center justify-between mt-2 ${isUser ? 'text-blue-100' : 'text-gray-500'}`}>
            <div className="flex items-center space-x-2">
              {getStatusIndicator()}
              {message.metadata?.source && (
                <span className="text-xs">via {message.metadata.source}</span>
              )}
            </div>
          </div>

          {/* Speech bubble tail */}
          <div
            className={`absolute top-3 w-0 h-0 ${
              isUser
                ? 'right-0 transform translate-x-2 border-l-8 border-l-blue-600 border-t-4 border-t-transparent border-b-4 border-b-transparent'
                : 'left-0 transform -translate-x-2 border-r-8 border-r-white border-t-4 border-t-transparent border-b-4 border-b-transparent'
            }`}
          />
        </div>

        {/* Intent and action info for assistant messages */}
        {!isUser && (
          <div className="mt-2 space-y-1">
            {getIntentBadge()}
            {getMCPActionInfo()}
          </div>
        )}
      </div>
    </div>
  );
};

export default Message;
