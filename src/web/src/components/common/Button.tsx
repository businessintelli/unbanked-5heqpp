import * as React from 'react'; // ^18.2.0
import { cn } from 'class-variance-authority'; // ^0.7.0
import { Loader2 } from 'lucide-react'; // ^0.294.0
import { colors, typography } from '../../config/theme';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'link' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  isLoading?: boolean;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  fullWidth?: boolean;
  preventDoubleClick?: boolean;
  enableHapticFeedback?: boolean;
}

export const buttonVariants = ({
  variant = 'primary',
  size = 'default',
  fullWidth = false,
  className,
  disabled,
  isLoading,
}: ButtonProps) =>
  cn(
    // Base styles
    'inline-flex items-center justify-center rounded-md font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    'touch-target-adjust',
    {
      // Variants
      'bg-primary-600 text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600':
        variant === 'primary',
      'bg-secondary-200 text-secondary-900 hover:bg-secondary-300 dark:bg-secondary-700 dark:text-secondary-100':
        variant === 'secondary',
      'border-2 border-primary-600 text-primary-600 hover:bg-primary-50 dark:border-primary-400 dark:text-primary-400':
        variant === 'outline',
      'text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900':
        variant === 'ghost',
      'text-primary-600 underline-offset-4 hover:underline dark:text-primary-400':
        variant === 'link',
      'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600':
        variant === 'destructive',

      // Sizes
      'h-10 px-4 py-2 text-sm': size === 'default',
      'h-8 px-3 text-xs': size === 'sm',
      'h-12 px-6 text-base': size === 'lg',
      'h-10 w-10 p-2': size === 'icon',

      // Full width
      'w-full': fullWidth,

      // States
      'cursor-not-allowed opacity-50': disabled || isLoading,
    },
    className
  );

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'default',
      isLoading = false,
      startIcon,
      endIcon,
      fullWidth = false,
      preventDoubleClick = false,
      enableHapticFeedback = false,
      children,
      onClick,
      ...props
    },
    ref
  ) => {
    const [isClickable, setIsClickable] = React.useState(true);

    const handleClick = React.useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        if (!isClickable || isLoading || props.disabled) return;

        if (preventDoubleClick) {
          setIsClickable(false);
          setTimeout(() => setIsClickable(true), 500);
        }

        if (enableHapticFeedback && navigator.vibrate) {
          navigator.vibrate(10);
        }

        onClick?.(event);
      },
      [isClickable, isLoading, props.disabled, preventDoubleClick, enableHapticFeedback, onClick]
    );

    return (
      <button
        ref={ref}
        className={buttonVariants({
          variant,
          size,
          fullWidth,
          isLoading,
          className,
        })}
        onClick={handleClick}
        disabled={!isClickable || isLoading || props.disabled}
        aria-disabled={!isClickable || isLoading || props.disabled}
        aria-busy={isLoading}
        type={props.type || 'button'}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        ) : startIcon ? (
          <span className="mr-2 inline-flex" aria-hidden="true">
            {startIcon}
          </span>
        ) : null}
        <span className={cn('inline-flex', { 'sr-only': size === 'icon' })}>
          {children}
        </span>
        {!isLoading && endIcon && (
          <span className="ml-2 inline-flex" aria-hidden="true">
            {endIcon}
          </span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;