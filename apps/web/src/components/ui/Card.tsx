import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  interactive?: boolean;
  as?: React.ElementType;
}

export const Card: React.FC<CardProps> = ({
  children,
  selected = false,
  interactive = false,
  as: Component = 'div',
  className = '',
  ...props
}) => {
  const selectedClasses = selected
    ? 'ring-2 ring-success border-success/40 bg-surface-solid'
    : 'border-border bg-surface-solid hover:border-ink/20';

  const interactiveClasses = interactive
    ? 'cursor-pointer select-none active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2'
    : '';

  return (
    <Component
      tabIndex={interactive ? 0 : undefined}
      className={`rounded-card border p-4 shadow-e1 transition-all duration-150 ease-out text-ink ${selectedClasses} ${interactiveClasses} ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
};
