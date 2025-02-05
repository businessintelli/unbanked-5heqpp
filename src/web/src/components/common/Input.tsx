import React from 'react'; // ^18.2.0
import { cn } from 'class-variance-authority'; // ^0.7.0
import { colors, typography } from '../../config/theme';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  'aria-describedby'?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'data-state'?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      required,
      startIcon,
      endIcon,
      className,
      id,
      'aria-describedby': ariaDescribedby,
      'aria-label': ariaLabel,
      'aria-invalid': ariaInvalid,
      'data-state': dataState,
      ...props
    },
    ref
  ) => {
    // Generate unique IDs for accessibility
    const inputId = id || React.useId();
    const helperId = `${inputId}-helper`;
    const errorId = `${inputId}-error`;

    // Compute ARIA attributes
    const computedAriaDescribedby = cn(
      error ? errorId : null,
      helperText ? helperId : null,
      ariaDescribedby
    );

    // Dynamic class names for input states
    const inputClasses = cn(
      // Base styles
      'w-full rounded-md border border-gray-300 px-4 py-2 text-sm transition-all duration-200 ease-in-out',
      'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
      'focus-visible:ring-2 focus-visible:ring-primary/40',
      'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-50',
      // Error state
      error && 'border-error focus:border-error focus:ring-error/20 focus-visible:ring-error/40',
      // Icon padding adjustments
      startIcon && 'pl-10',
      endIcon && 'pr-10',
      className
    );

    // Label classes
    const labelClasses = cn(
      'mb-1.5 block text-sm font-medium text-gray-700 transition-colors duration-200',
      required && "after:ml-0.5 after:text-error after:content-['*']",
      error && 'text-error'
    );

    // Helper/Error text classes
    const helperClasses = cn(
      'mt-1.5 text-xs transition-colors duration-200',
      error ? 'text-error' : 'text-gray-500'
    );

    // Icon container classes
    const iconClasses = (position: 'start' | 'end') =>
      cn(
        'absolute top-1/2 -translate-y-1/2 text-gray-400 transition-colors duration-200 pointer-events-none',
        position === 'start' ? 'left-3' : 'right-3',
        error && 'text-error'
      );

    return (
      <div className="relative">
        {label && (
          <label htmlFor={inputId} className={labelClasses}>
            {label}
          </label>
        )}
        
        <div className="relative">
          {startIcon && (
            <span className={iconClasses('start')} aria-hidden="true">
              {startIcon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            className={inputClasses}
            aria-invalid={error ? true : ariaInvalid}
            aria-describedby={computedAriaDescribedby || undefined}
            aria-label={!label ? ariaLabel : undefined}
            aria-required={required}
            data-state={dataState || (error ? 'error' : 'default')}
            {...props}
          />

          {endIcon && (
            <span className={iconClasses('end')} aria-hidden="true">
              {endIcon}
            </span>
          )}
        </div>

        {(error || helperText) && (
          <p
            id={error ? errorId : helperId}
            className={helperClasses}
            role={error ? 'alert' : 'status'}
          >
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;