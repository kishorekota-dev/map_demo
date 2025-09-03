import React, { useState, useRef, useEffect } from 'react';

interface MessageInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
}

const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  disabled = false,
  isLoading = false,
  placeholder = "Type your message here...",
}) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  // Focus on textarea when component mounts
  useEffect(() => {
    if (textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const sendMessage = () => {
    const trimmedMessage = message.trim();
    if (trimmedMessage && !disabled && !isLoading) {
      onSendMessage(trimmedMessage);
      setMessage('');
    }
  };

  return (
    <div className="message-input bg-white border-t border-gray-200 p-4">
      <form onSubmit={handleSubmit} className="flex items-end space-x-3">
        {/* Textarea */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={disabled ? 'ChatBot is not connected...' : placeholder}
            disabled={disabled || isLoading}
            rows={1}
            className={`w-full resize-none border border-gray-300 rounded-lg px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              disabled || isLoading 
                ? 'bg-gray-100 text-gray-500 cursor-not-allowed' 
                : 'bg-white text-gray-900'
            }`}
            style={{ maxHeight: '120px' }}
          />
          
          {/* Character count */}
          {message.length > 500 && (
            <div className="absolute bottom-1 right-12 text-xs text-gray-400">
              {message.length}/1000
            </div>
          )}
        </div>

        {/* Send Button */}
        <button
          type="submit"
          disabled={disabled || isLoading || !message.trim()}
          className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
            disabled || isLoading || !message.trim()
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
          }`}
          title={isLoading ? 'Sending...' : 'Send message'}
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </form>

      {/* Quick suggestions */}
      {!disabled && message.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            'Check my balance',
            'Recent transactions',
            'Transfer money',
            'Card status',
            'Help'
          ].map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setMessage(suggestion)}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Status indicators */}
      {disabled && (
        <div className="mt-2 flex items-center text-sm text-gray-500">
          <div className="w-2 h-2 bg-red-400 rounded-full mr-2"></div>
          ChatBot is disconnected
        </div>
      )}

      {isLoading && (
        <div className="mt-2 flex items-center text-sm text-gray-500">
          <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse mr-2"></div>
          Processing your message...
        </div>
      )}
    </div>
  );
};

export default MessageInput;
