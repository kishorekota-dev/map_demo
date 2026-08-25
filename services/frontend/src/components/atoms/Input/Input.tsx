import React, { useId } from 'react';
import './Input.css';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export function Input({ label, error, fullWidth, className, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = props.id || `input-${generatedId.replace(/:/g, '')}`;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={`input-wrapper ${fullWidth ? 'input-wrapper--full-width' : ''}`}>
      {label && <label className="input-label" htmlFor={inputId}>{label}</label>}
      <input
        id={inputId}
        className={`input-field ${error ? 'input-field--error' : ''} ${className || ''}`}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        {...props}
      />
      {error && <span className="input-error" id={errorId} role="alert">{error}</span>}
    </div>
  );
}
