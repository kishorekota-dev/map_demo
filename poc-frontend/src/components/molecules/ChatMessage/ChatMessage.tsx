import React from 'react';
import { clsx } from 'clsx';
import { Icon } from '@components/atoms';
import { ChatMessage as ChatMessageType } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import './ChatMessage.css';

export interface ChatMessageProps {
  message: ChatMessageType;
  showIntent?: boolean;
  className?: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  showIntent = false,
  className,
}) => {
  const messageClass = clsx(
    'chat-message',
    `chat-message--${message.type}`,
    className
  );

  const timeAgo = formatDistanceToNow(new Date(message.timestamp), { addSuffix: true });

  return (
    <div className={messageClass}>
      <div className="chat-message__avatar">
        <Icon 
          name={message.type === 'user' ? 'user' : 'robot'} 
          size="medium"
          color={message.type === 'user' ? 'primary' : 'secondary'}
        />
      </div>
      
      <div className="chat-message__content">
        <div className="chat-message__header">
          <span className="chat-message__sender">
            {message.type === 'user' ? 'You' : 'Bot'}
          </span>
          <span className="chat-message__timestamp" title={message.timestamp.toLocaleString()}>
            {timeAgo}
          </span>
        </div>
        
        <div className="chat-message__text">
          {message.content}
        </div>
        
        {showIntent && message.intent && (
          <div className="chat-message__intent">
            <div className="intent-tag">
              <Icon name="brain" size="small" color="secondary" />
              <span className="intent-tag__name">{message.intent.detected}</span>
              <span className="intent-tag__confidence">
                {Math.round(message.intent.confidence * 100)}%
              </span>
            </div>
          </div>
        )}
        
        {message.metadata?.processingTime && (
          <div className="chat-message__metadata">
            <Icon name="clock" size="small" color="secondary" />
            <span className="processing-time">
              {message.metadata.processingTime}ms
            </span>
          </div>
        )}
      </div>
    </div>
  );
};