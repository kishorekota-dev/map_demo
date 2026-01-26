import React, { TextareaHTMLAttributes, ChangeEvent, KeyboardEvent } from 'react';
import { clsx } from 'clsx';
import './TextArea.css';

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  maxLength?: number;
  showCharCount?: boolean;
  autoResize?: boolean;
  onValueChange?: (value: string) => void;
  onEnterPress?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}

export const TextArea: React.FC<TextAreaProps> = ({
  label,
  error,
  helperText,
  maxLength,
  showCharCount = false,
  autoResize = false,
  className,
  value = '',
  onValueChange,
  onEnterPress,
  onKeyDown,
  onChange,
  ...props
}) => {
  const textAreaClass = clsx(
    'textarea',
    {
      'textarea--error': error,
      'textarea--auto-resize': autoResize,
    },
    className
  );

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = event.target.value;
    
    if (maxLength && newValue.length > maxLength) {
      return;
    }
    
    if (onValueChange) {
      onValueChange(newValue);
    }
    
    if (onChange) {
      onChange(event);
    }
    
    if (autoResize) {
      event.target.style.height = 'auto';
      event.target.style.height = `${event.target.scrollHeight}px`;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && onEnterPress) {
      event.preventDefault();
      onEnterPress(event);
    }
    
    if (onKeyDown) {
      onKeyDown(event);
    }
  };

  const charCount = typeof value === 'string' ? value.length : 0;

  return (
    <div className="textarea-container">
      {label && (
        <label className="textarea__label" htmlFor={props.id}>
          {label}
        </label>
      )}
      
      <div className="textarea-wrapper">
        <textarea
          className={textAreaClass}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          maxLength={maxLength}
          {...props}
        />
        
        {(showCharCount || maxLength) && (
          <div className="textarea__char-count">
            <span className={clsx('char-count', {
              'char-count--warning': maxLength && charCount > maxLength * 0.8,
              'char-count--error': maxLength && charCount >= maxLength,
            })}>
              {charCount}{maxLength && `/${maxLength}`}
            </span>
          </div>
        )}
      </div>
      
      {error && <div className="textarea__error">{error}</div>}
      {helperText && !error && <div className="textarea__helper">{helperText}</div>}
    </div>
  );
};