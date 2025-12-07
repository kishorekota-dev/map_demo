import React from 'react';
import './Input.css';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export function Input({ label, error, fullWidth, className, ...props }: InputProps) {
  return (
    <div className={`input-wrapper ${fullWidth ? 'input-wrapper--full-width' : ''}`}>
      {label && <label className="input-label">{label}</label>}
      <input
        className={`input-field ${error ? 'input-field--error' : ''} ${className || ''}`}
        {...props}
      />
      {error && <span className="input-error">{error}</span>}
    </div>
  );
}
