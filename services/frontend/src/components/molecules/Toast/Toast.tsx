import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Button, Icon } from '@components/atoms';
import './Toast.css';

export interface ToastProps {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  duration?: number;
  onClose: (id: string) => void;
  className?: string;
}

export const Toast: React.FC<ToastProps> = ({
  id,
  type,
  title,
  message,
  duration = 5000,
  onClose,
  className,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Start entrance animation
    setIsVisible(true);

    // Set auto-dismiss timer
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose(id);
    }, 300); // Match exit animation duration
  };

  const toastClass = clsx(
    'toast',
    `toast--${type}`,
    {
      'toast--visible': isVisible,
      'toast--exiting': isExiting,
    },
    className
  );

  const getIcon = () => {
    switch (type) {
      case 'success':
        return 'check-circle';
      case 'error':
        return 'exclamation-triangle';
      case 'warning':
        return 'exclamation-circle';
      case 'info':
        return 'info-circle';
      default:
        return 'info-circle';
    }
  };

  return (
    <div className={toastClass}>
      <div className="toast__icon">
        <Icon name={getIcon()} size="large" color="inherit" />
      </div>
      
      <div className="toast__content">
        {title && <div className="toast__title">{title}</div>}
        <div className="toast__message">{message}</div>
      </div>
      
      <Button
        variant="close"
        size="small"
        onClick={handleClose}
        className="toast__close"
        aria-label="Close notification"
      >
        <Icon name="times" size="small" color="inherit" />
      </Button>
      
      {duration > 0 && (
        <div 
          className="toast__progress" 
          style={{ animationDuration: `${duration}ms` }}
        />
      )}
    </div>
  );
};