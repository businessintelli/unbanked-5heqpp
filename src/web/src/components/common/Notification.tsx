import * as React from 'react'; // ^18.2.0
import { cn } from 'class-variance-authority'; // ^0.7.0
import { CheckCircle2, XCircle, AlertCircle, Info } from 'lucide-react'; // ^0.294.0
import { AnimatePresence, motion } from 'framer-motion'; // ^10.16.4
import { colors } from '../../config/theme';
import { Button, buttonVariants } from './Button';

// Constants
const AUTO_DISMISS_DURATION = 5000;
const ANIMATION_DURATION = 0.2;
const REDUCED_MOTION_DURATION = 0.1;
const Z_INDEX_BASE = 50;

type NotificationVariant = 'success' | 'error' | 'warning' | 'info';
type NotificationPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';

interface NotificationProps {
  variant: NotificationVariant;
  message: string;
  description?: string;
  duration?: number;
  onClose?: () => void;
  position?: NotificationPosition;
  className?: string;
  preserveOnRouteChange?: boolean;
  disableAutoClose?: boolean;
}

const notificationVariants = ({
  variant,
  position = 'top-right',
  className,
}: Pick<NotificationProps, 'variant' | 'position' | 'className'>) => {
  return cn(
    // Base styles
    'pointer-events-auto relative flex w-full max-w-md rounded-lg shadow-lg',
    'p-4 text-sm font-medium',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    {
      // Variant styles
      'bg-green-50 text-green-800 dark:bg-green-900 dark:text-green-100': variant === 'success',
      'bg-red-50 text-red-800 dark:bg-red-900 dark:text-red-100': variant === 'error',
      'bg-yellow-50 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100': variant === 'warning',
      'bg-blue-50 text-blue-800 dark:bg-blue-900 dark:text-blue-100': variant === 'info',

      // Position styles
      'fixed right-4': position.includes('right'),
      'fixed left-4': position.includes('left'),
      'fixed top-4': position.includes('top'),
      'fixed bottom-4': position.includes('bottom'),
      'fixed left-1/2 -translate-x-1/2': position.includes('center'),
    },
    className
  );
};

const useNotificationAnimation = ({ position }: { position: NotificationPosition }) => {
  const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = isReduced ? REDUCED_MOTION_DURATION : ANIMATION_DURATION;

  const getAnimationProps = () => {
    const baseProps = {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration },
    };

    const translateY = position.includes('top') ? -10 : 10;

    return {
      ...baseProps,
      initial: { ...baseProps.initial, y: translateY },
      animate: { ...baseProps.animate, y: 0 },
      exit: { ...baseProps.exit, y: translateY },
    };
  };

  return getAnimationProps();
};

export const Notification: React.FC<NotificationProps> = ({
  variant,
  message,
  description,
  duration = AUTO_DISMISS_DURATION,
  onClose,
  position = 'top-right',
  className,
  preserveOnRouteChange = false,
  disableAutoClose = false,
}) => {
  const timeoutId = React.useRef<number>();
  const isExiting = React.useRef(false);
  const animationProps = useNotificationAnimation({ position });

  const getIcon = (variant: NotificationVariant) => {
    const iconProps = {
      className: 'h-5 w-5 flex-shrink-0',
      'aria-hidden': 'true',
    };

    switch (variant) {
      case 'success':
        return <CheckCircle2 {...iconProps} />;
      case 'error':
        return <XCircle {...iconProps} />;
      case 'warning':
        return <AlertCircle {...iconProps} />;
      case 'info':
        return <Info {...iconProps} />;
    }
  };

  const handleClose = React.useCallback(() => {
    if (isExiting.current) return;
    isExiting.current = true;

    if (timeoutId.current) {
      window.clearTimeout(timeoutId.current);
    }

    onClose?.();
  }, [onClose]);

  React.useEffect(() => {
    if (!disableAutoClose && duration) {
      timeoutId.current = window.setTimeout(handleClose, duration);
    }

    return () => {
      if (timeoutId.current) {
        window.clearTimeout(timeoutId.current);
      }
    };
  }, [duration, handleClose, disableAutoClose]);

  React.useEffect(() => {
    if (!preserveOnRouteChange) {
      return () => {
        handleClose();
      };
    }
  }, [handleClose, preserveOnRouteChange]);

  return (
    <AnimatePresence>
      <motion.div
        role="alert"
        aria-live="polite"
        style={{ zIndex: Z_INDEX_BASE }}
        {...animationProps}
        className={notificationVariants({ variant, position, className })}
      >
        <div className="flex w-full">
          <div className="flex-shrink-0">{getIcon(variant)}</div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium">{message}</p>
            {description && (
              <p className="mt-1 text-sm opacity-90">{description}</p>
            )}
          </div>
          {onClose && (
            <div className="ml-4 flex flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="-mr-1 -mt-1"
                aria-label="Close notification"
              >
                <XCircle className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export { notificationVariants, useNotificationAnimation };
export type { NotificationProps, NotificationVariant, NotificationPosition };
export default Notification;