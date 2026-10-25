import React from 'react';

export interface PillButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  loadingText?: string;
  icon?: React.ReactNode;
}

export const PillButton: React.FC<PillButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingText = 'Finding routes…',
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const isPrimary = variant === 'primary';

  const sizeClasses = {
    sm: 'h-9 px-4 text-xs rounded-card font-medium',
    md: 'h-12 px-6 text-sm rounded-card font-semibold tracking-wide',
    lg: 'h-14 px-8 text-base rounded-[18px] font-semibold tracking-wide',
  }[size];

  const variantClasses = isPrimary
    ? 'bg-ink text-primary-contrast shadow-e2 hover:opacity-95 active:scale-[0.98]'
    : 'bg-surface-solid text-ink border border-border shadow-e1 hover:bg-canvas/50 active:scale-[0.98]';

  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading}
      className={`relative inline-flex items-center justify-center gap-2 select-none transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {loading ? (
        <>
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>{loadingText}</span>
        </>
      ) : (
        <>
          {icon && <span className="inline-flex shrink-0">{icon}</span>}
          <span>{children}</span>
        </>
      )}
    </button>
  );
};
