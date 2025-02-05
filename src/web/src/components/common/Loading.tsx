import React from 'react'; // ^18.2.0
import { cn } from 'class-variance-authority'; // ^0.7.0
import { colors } from '../config/theme';

interface LoadingProps {
  /**
   * Size variant of the loading spinner
   * @default "md"
   */
  size?: 'sm' | 'md' | 'lg';
  
  /**
   * Color variant with theme-aware values
   * @default "primary"
   */
  color?: 'primary' | 'secondary' | 'white';
  
  /**
   * Additional CSS classes for custom styling
   */
  className?: string;
  
  /**
   * Accessibility label for screen readers
   * @default "Loading..."
   */
  label?: string;
}

/**
 * A highly customizable loading spinner component with Material Design aesthetics,
 * theme support, and accessibility features.
 * 
 * @example
 * ```tsx
 * <Loading size="md" color="primary" />
 * ```
 */
export const Loading: React.FC<LoadingProps> = ({
  size = 'md',
  color = 'primary',
  className,
  label = 'Loading...',
}) => {
  // Size variants following Material Design specifications
  const sizeVariants = {
    sm: 'w-4 h-4 border-1',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-2',
  };

  // Color variants with theme support
  const colorVariants = {
    primary: 'text-primary-600 dark:text-primary-400',
    secondary: 'text-gray-600 dark:text-gray-400',
    white: 'text-white',
  };

  // Base styles with animation and reduced motion support
  const baseStyles = 'inline-block animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]';

  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center justify-center"
    >
      <div
        className={cn(
          baseStyles,
          sizeVariants[size],
          colorVariants[color],
          className
        )}
      />
      <span className="sr-only" aria-live="polite">
        {label}
      </span>
    </div>
  );
};

// Type export for component props
export type { LoadingProps };

// Default export
export default Loading;