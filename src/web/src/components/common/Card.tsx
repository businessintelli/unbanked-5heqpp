import React, { memo, forwardRef } from 'react';
import { cn } from 'class-variance-authority'; // ^0.7.0
import { shadows, borderRadius } from '../../config/theme'; // Internal import

// Card component variants and props interface
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outlined' | 'flat';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  radius?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  elevation?: 0 | 1 | 2 | 3;
  className?: string;
  role?: string;
}

// Base styles with proper accessibility focus states
const baseStyles = 
  'relative bg-background transition-all duration-200 ease-in-out ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
  'motion-reduce:transition-none';

// Variant-specific styles with theme support
const variantStyles = {
  default: 'border border-border hover:border-border-hover ' +
          'dark:border-border-dark dark:hover:border-border-hover-dark',
  elevated: 'border-transparent shadow-[var(--shadow-elevation-1)] ' +
           'hover:shadow-[var(--shadow-elevation-2)] dark:bg-background-dark',
  outlined: 'border border-primary dark:border-primary-dark',
  flat: 'border-transparent'
};

// Padding styles with responsive design
const paddingStyles = {
  none: 'p-0',
  sm: 'p-3 md:p-4',
  md: 'p-4 md:p-6',
  lg: 'p-6 md:p-8'
};

// Border radius styles from theme
const radiusStyles = {
  none: 'rounded-none',
  sm: `rounded-[${borderRadius.sm}]`,
  md: `rounded-[${borderRadius.md}]`,
  lg: `rounded-[${borderRadius.lg}]`,
  full: 'rounded-full'
};

// Elevation styles with proper shadow variables
const elevationStyles = {
  0: '',
  1: `shadow-[${shadows.sm}]`,
  2: `shadow-[${shadows.md}]`,
  3: `shadow-[${shadows.lg}]`
};

// Memoized variant generator for performance
const cardVariants = memo(({
  variant = 'default',
  padding = 'md',
  radius = 'md',
  elevation = 0,
  className
}: CardProps) => {
  return cn(
    baseStyles,
    variantStyles[variant],
    paddingStyles[padding],
    radiusStyles[radius],
    elevation > 0 && variant !== 'elevated' && elevationStyles[elevation],
    className
  );
});

// Main Card component with proper accessibility
export const Card = memo(forwardRef<HTMLDivElement, CardProps>(({
  variant = 'default',
  padding = 'md',
  radius = 'md',
  elevation = 0,
  className,
  children,
  role = 'region',
  ...props
}, ref) => {
  // Generate combined class names
  const cardClassName = cardVariants({
    variant,
    padding,
    radius,
    elevation,
    className
  });

  return (
    <div
      ref={ref}
      role={role}
      tabIndex={0}
      className={cardClassName}
      {...props}
      // Ensure proper keyboard interaction
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.currentTarget.click();
        }
        props.onKeyDown?.(e);
      }}
    >
      {children}
    </div>
  );
}));

// Display name for dev tools
Card.displayName = 'Card';

// Export variants utility for external use
export { cardVariants };

// Default export
export default Card;