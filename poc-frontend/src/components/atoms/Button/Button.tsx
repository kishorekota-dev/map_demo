import React, { ButtonHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';
import './Button.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'icon' | 'send' | 'close';
  size?: 'small' | 'medium' | 'large';
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children: ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'medium',
  isLoading = false,
  leftIcon,
  rightIcon,
  className,
  disabled,
  children,
  ...props
}) => {
  const buttonClass = clsx(
    'button',
    `button--${variant}`,
    `button--${size}`,
    {
      'button--loading': isLoading,
      'button--disabled': disabled || isLoading,
    },
    className
  );

  return (
    <button
      className={buttonClass}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <span className="button__spinner" />}
      {!isLoading && leftIcon && <span className="button__icon button__icon--left">{leftIcon}</span>}
      <span className="button__content">{children}</span>
      {!isLoading && rightIcon && <span className="button__icon button__icon--right">{rightIcon}</span>}
    </button>
  );
};