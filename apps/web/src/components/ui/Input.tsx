import React from 'react';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  error?: string;
  label?: string;
  onClear?: () => void;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      icon,
      error,
      label,
      onClear,
      className = '',
      id,
      value,
      disabled,
      ...props
    },
    ref,
  ) => {
    const inputId = id ?? React.useId();
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-semibold text-ink-muted select-none"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center w-full">
          {icon && (
            <span className="absolute left-3.5 text-ink-muted pointer-events-none flex items-center justify-center">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            value={value}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={errorId}
            className={`w-full h-12 rounded-card bg-surface-solid border text-sm text-ink placeholder:text-ink-muted/60 transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:opacity-50 disabled:bg-canvas/50 ${
              icon ? 'pl-10' : 'pl-4'
            } ${onClear && value ? 'pr-10' : 'pr-4'} ${
              error
                ? 'border-warning/80 focus-visible:ring-warning'
                : 'border-border hover:border-ink/20 focus-visible:border-transparent'
            } ${className}`}
            {...props}
          />
          {onClear && value && !disabled && (
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear input"
              className="absolute right-3 p-1 rounded-full text-ink-muted hover:text-ink hover:bg-canvas/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        {error && (
          <p id={errorId} className="text-xs text-warning font-medium mt-0.5">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
