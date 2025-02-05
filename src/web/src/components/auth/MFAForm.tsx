import React from 'react'; // ^18.2.0
import { z } from 'zod'; // ^3.22.0
import { useForm } from 'react-hook-form'; // ^7.45.0
import { zodResolver } from '@hookform/resolvers/zod'; // ^3.3.0
import Button, { buttonVariants } from '../common/Button';
import Input from '../common/Input';
import { useAuth } from '../../hooks/useAuth';

// MFA form validation schema with enhanced security rules
const mfaSchema = z.object({
  code: z
    .string()
    .length(6, 'MFA code must be exactly 6 digits')
    .regex(/^[0-9]{6}$/, 'Please enter a valid 6-digit code'),
  deviceId: z.string().uuid('Invalid device ID'),
  timestamp: z.number().int().positive('Invalid timestamp')
});

type MFAFormData = z.infer<typeof mfaSchema>;

interface MFAFormProps {
  onSuccess: (response: any) => void;
  onError: (error: Error) => void;
  maxAttempts?: number;
  timeoutDuration?: number;
}

export const MFAForm: React.FC<MFAFormProps> = ({
  onSuccess,
  onError,
  maxAttempts = 3,
  timeoutDuration = 300000 // 5 minutes
}) => {
  const { verifyMFA } = useAuth();
  const [attempts, setAttempts] = React.useState(0);
  const [isLocked, setIsLocked] = React.useState(false);
  const [lockExpiry, setLockExpiry] = React.useState<Date | null>(null);
  const [remainingTime, setRemainingTime] = React.useState(0);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setError
  } = useForm<MFAFormData>({
    resolver: zodResolver(mfaSchema),
    defaultValues: {
      code: '',
      deviceId: crypto.randomUUID(),
      timestamp: Date.now()
    }
  });

  // Handle form timeout and lockout
  React.useEffect(() => {
    if (isLocked && lockExpiry) {
      const interval = setInterval(() => {
        const now = new Date();
        if (now >= lockExpiry) {
          setIsLocked(false);
          setLockExpiry(null);
          setAttempts(0);
          reset();
        } else {
          setRemainingTime(Math.ceil((lockExpiry.getTime() - now.getTime()) / 1000));
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isLocked, lockExpiry, reset]);

  // Enhanced form submission with security measures
  const onSubmit = async (data: MFAFormData) => {
    try {
      if (isLocked) {
        return;
      }

      // Verify the timestamp is recent
      const timeDiff = Date.now() - data.timestamp;
      if (timeDiff > 30000) { // 30 seconds
        setError('timestamp', { message: 'Form submission expired' });
        return;
      }

      const result = await verifyMFA(data.code, 'totp');

      if (result) {
        onSuccess(result);
        reset();
        setAttempts(0);
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);

        if (newAttempts >= maxAttempts) {
          setIsLocked(true);
          const expiry = new Date(Date.now() + timeoutDuration);
          setLockExpiry(expiry);
          setError('code', { message: `Too many attempts. Please try again in ${timeoutDuration / 60000} minutes.` });
        } else {
          setError('code', { message: `Invalid code. ${maxAttempts - newAttempts} attempts remaining.` });
        }
      }
    } catch (error) {
      onError(error instanceof Error ? error : new Error('MFA verification failed'));
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4"
      aria-labelledby="mfa-title"
      noValidate
    >
      <div className="text-center">
        <h2 id="mfa-title" className="text-xl font-semibold mb-2">
          Two-Factor Authentication
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Please enter the 6-digit code from your authenticator app
        </p>
      </div>

      <Input
        {...register('code')}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        autoComplete="one-time-code"
        label="Authentication Code"
        error={errors.code?.message}
        required
        aria-invalid={!!errors.code}
        disabled={isLocked}
        autoFocus
        data-testid="mfa-input"
      />

      {isLocked && (
        <div
          className="text-sm text-error"
          role="alert"
          aria-live="polite"
        >
          Account temporarily locked. Please try again in {remainingTime} seconds.
        </div>
      )}

      <Button
        type="submit"
        className={buttonVariants({ variant: 'primary', fullWidth: true })}
        isLoading={isSubmitting}
        disabled={isLocked || isSubmitting}
        aria-disabled={isLocked || isSubmitting}
      >
        Verify Code
      </Button>

      <input type="hidden" {...register('deviceId')} />
      <input type="hidden" {...register('timestamp')} />
    </form>
  );
};

export default MFAForm;