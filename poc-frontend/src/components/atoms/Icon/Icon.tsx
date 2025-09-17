import React from 'react';
import { clsx } from 'clsx';
import './Icon.css';

export interface IconProps {
  name: string;
  size?: 'small' | 'medium' | 'large' | 'xlarge';
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'inherit';
  className?: string;
  'aria-label'?: string;
}

export const Icon: React.FC<IconProps> = ({
  name,
  size = 'medium',
  color = 'inherit',
  className,
  'aria-label': ariaLabel,
}) => {
  const iconClass = clsx(
    'icon',
    `icon--${size}`,
    `icon--${color}`,
    className
  );

  return (
    <i 
      className={`fas fa-${name} ${iconClass}`}
      aria-label={ariaLabel || name}
      aria-hidden={!ariaLabel}
    />
  );
};