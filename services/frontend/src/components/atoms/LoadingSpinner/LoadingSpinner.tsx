import React from 'react';
import { clsx } from 'clsx';
import './LoadingSpinner.css';

export interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  color?: 'primary' | 'secondary' | 'white';
  text?: string;
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'medium',
  color = 'primary',
  text,
  className,
}) => {
  const spinnerClass = clsx(
    'loading-spinner',
    `loading-spinner--${size}`,
    `loading-spinner--${color}`,
    className
  );

  return (
    <div className="loading-spinner-container">
      <div className={spinnerClass} aria-label="Loading">
        <div className="loading-spinner__circle" />
      </div>
      {text && <div className="loading-spinner__text">{text}</div>}
    </div>
  );
};