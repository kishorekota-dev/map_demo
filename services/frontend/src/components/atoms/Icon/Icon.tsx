import React from 'react';
import { clsx } from 'clsx';
import './Icon.css';

const iconPaths: Record<string, React.ReactNode> = {
  user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" />,
  robot: <><rect x="5" y="7" width="14" height="12" rx="3" /><path d="M12 7V4m-4 8h.01M16 12h.01M9 16h6" /></>,
  brain: <><path d="M9.5 4.5A3 3 0 0 0 5 7a3 3 0 0 0 .5 5.5A3 3 0 0 0 9 17.5V5.2" /><path d="M14.5 4.5A3 3 0 0 1 19 7a3 3 0 0 1-.5 5.5A3 3 0 0 1 15 17.5V5.2M9 9H7m8 3h3m-6-6v14" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" /></>,
  times: <path d="m7 7 10 10M17 7 7 17" />,
  'check-circle': <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  'exclamation-triangle': <><path d="M10.3 4.2 2.7 18a2 2 0 0 0 1.8 3h15a2 2 0 0 0 1.8-3L13.7 4.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
  'exclamation-circle': <><circle cx="12" cy="12" r="9" /><path d="M12 8v5m0 3h.01" /></>,
  'info-circle': <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-9h.01" /></>,
};

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
    <svg
      className={iconClass}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={!ariaLabel}
      focusable="false"
    >
      {iconPaths[name] || <circle cx="12" cy="12" r="8" />}
    </svg>
  );
};
