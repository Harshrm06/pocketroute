import React from 'react';

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  variant?: 'ghost' | 'surface' | 'primary';
  size?: 'sm' | 'md' | 'lg';
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      children,
      'aria-label': ariaLabel,
      variant = 'surface',
      size = 'md',
      className = '',
      disabled,
      ...props
    },
    ref,
  ) => {
    const sizeClasses = {
      sm: 'w-9 h-9 min-w-[36px] min-h-[36px]',
      md: 'w-11 h-11 min-w-[44px] min-h-[44px]', // 44x44 px touch target minimum per PRD §14.8
      lg: 'w-12 h-12 min-w-[48px] min-h-[48px]',
    }[size];

    const variantClasses = {
      ghost: 'text-ink-muted hover:text-ink hover:bg-canvas/80 active:scale-95',
      surface:
        'bg-surface-solid text-ink border border-border shadow-e1 hover:bg-canvas/50 active:scale-95',
      primary:
        'bg-primary text-primary-contrast shadow-e2 hover:opacity-95 active:scale-95',
    }[variant];

    return (
      <button
        ref={ref}
        type="button"
        aria-label={ariaLabel}
        disabled={disabled}
        className={`inline-flex items-center justify-center rounded-full transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:opacity-40 disabled:pointer-events-none select-none ${sizeClasses} ${variantClasses} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  },
);

IconButton.displayName = 'IconButton';
