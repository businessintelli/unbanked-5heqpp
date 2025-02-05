import * as React from 'react'; // ^18.2.0
import * as DialogPrimitive from '@radix-ui/react-dialog'; // ^1.0.0
import { X } from 'lucide-react'; // ^0.294.0
import { cn } from 'class-variance-authority'; // ^0.7.0
import { buttonVariants } from './Button';
import { theme } from '../../config/theme';

export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string | React.ReactNode;
  children: React.ReactNode;
  trigger?: React.ReactNode;
  actions?: React.ReactNode;
  size?: 'default' | 'sm' | 'lg' | 'fullscreen' | 'transaction';
  hideCloseButton?: boolean;
  securityLevel?: 'high' | 'medium' | 'low';
  preventBackdropClose?: boolean;
  autoFocus?: boolean;
  onSecurityTimeout?: () => void;
  hapticFeedback?: boolean;
}

export const dialogVariants = ({
  size = 'default',
  securityLevel = 'medium',
}: {
  size?: DialogProps['size'];
  securityLevel?: DialogProps['securityLevel'];
}) => {
  return cn(
    // Base styles
    'relative rounded-lg bg-white shadow-lg dark:bg-gray-900',
    'w-full p-6 animate-in fade-in-0 zoom-in-95',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
    'data-[state=open]:animate-in data-[state=closed]:animate-out',
    'data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
    'dark:border dark:border-gray-800',
    
    // High contrast support
    'contrast-more:border-2 contrast-more:border-primary-600',
    
    // Reduced motion
    'motion-reduce:animate-none',
    
    // Size variants
    {
      'sm:max-w-sm': size === 'sm',
      'sm:max-w-lg': size === 'default',
      'sm:max-w-xl': size === 'lg',
      'w-screen h-screen m-0': size === 'fullscreen',
      'sm:max-w-md bg-white/95 backdrop-blur-sm': size === 'transaction',
    },
    
    // Security level styles
    {
      'border-2 border-red-500 dark:border-red-400': securityLevel === 'high',
      'border border-yellow-500 dark:border-yellow-400': securityLevel === 'medium',
    }
  );
};

export const Dialog = React.forwardRef<HTMLDivElement, DialogProps>(
  ({
    open,
    onOpenChange,
    title,
    description,
    children,
    trigger,
    actions,
    size = 'default',
    hideCloseButton = false,
    securityLevel = 'medium',
    preventBackdropClose = false,
    autoFocus = true,
    onSecurityTimeout,
    hapticFeedback = false,
  }, ref) => {
    const timeoutRef = React.useRef<NodeJS.Timeout>();
    const securityTimeoutDuration = React.useMemo(() => {
      return {
        high: 60000, // 1 minute
        medium: 180000, // 3 minutes
        low: 300000, // 5 minutes
      }[securityLevel];
    }, [securityLevel]);

    const handleSecurityTimeout = React.useCallback(() => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      if (open && securityLevel !== 'low') {
        timeoutRef.current = setTimeout(() => {
          onSecurityTimeout?.();
          onOpenChange?.(false);
        }, securityTimeoutDuration);
      }
    }, [open, securityLevel, securityTimeoutDuration, onSecurityTimeout, onOpenChange]);

    React.useEffect(() => {
      handleSecurityTimeout();
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, [handleSecurityTimeout]);

    const handleOpenChange = React.useCallback(
      (newOpen: boolean) => {
        if (hapticFeedback && navigator.vibrate) {
          navigator.vibrate(10);
        }
        
        if (!newOpen && preventBackdropClose) {
          return;
        }
        
        onOpenChange?.(newOpen);
      },
      [hapticFeedback, preventBackdropClose, onOpenChange]
    );

    return (
      <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        {trigger && (
          <DialogPrimitive.Trigger asChild>
            {trigger}
          </DialogPrimitive.Trigger>
        )}
        
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className={cn(
              'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'motion-reduce:animate-none'
            )}
          />
          
          <DialogPrimitive.Content
            ref={ref}
            className={dialogVariants({ size, securityLevel })}
            onOpenAutoFocus={(event) => {
              if (!autoFocus) {
                event.preventDefault();
              }
            }}
            onPointerDownOutside={(event) => {
              if (preventBackdropClose) {
                event.preventDefault();
              }
            }}
            onEscapeKeyDown={(event) => {
              if (preventBackdropClose) {
                event.preventDefault();
              }
            }}
          >
            <DialogPrimitive.Header className="space-y-2">
              <div className="flex items-center justify-between">
                <DialogPrimitive.Title className="text-lg font-semibold">
                  {title}
                </DialogPrimitive.Title>
                {!hideCloseButton && (
                  <DialogPrimitive.Close
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'icon' }),
                      'absolute right-4 top-4'
                    )}
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                  </DialogPrimitive.Close>
                )}
              </div>
              {description && (
                <DialogPrimitive.Description className="text-sm text-gray-600 dark:text-gray-400">
                  {description}
                </DialogPrimitive.Description>
              )}
            </DialogPrimitive.Header>

            <div className="mt-6">{children}</div>

            {actions && (
              <DialogPrimitive.Footer className="mt-6 flex justify-end space-x-2">
                {actions}
              </DialogPrimitive.Footer>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }
);

Dialog.displayName = 'Dialog';

export default Dialog;