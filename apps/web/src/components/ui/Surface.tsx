import React from 'react';

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  elevation?: 'none' | 'e1' | 'e2' | 'e3';
  as?: React.ElementType;
}

export const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
  (
    {
      children,
      elevation = 'e2',
      as: Component = 'div',
      className = '',
      ...props
    },
    ref,
  ) => {
    const elevationClass = {
      none: '',
      e1: 'shadow-e1',
      e2: 'shadow-e2',
      e3: 'shadow-e3',
    }[elevation];

    return (
      <Component
        ref={ref}
        className={`glass-surface rounded-card text-ink transition-all duration-180 ease-out ${elevationClass} ${className}`}
        {...props}
      >
        {children}
      </Component>
    );
  },
);

Surface.displayName = 'Surface';
