import React, { memo, useCallback, useEffect, useState } from 'react'; // ^18.2.0
import { useForm } from 'react-hook-form'; // ^7.0.0
import { zodResolver } from '@hookform/resolvers/zod'; // ^3.0.0
import { toast } from 'sonner'; // ^1.0.0
import { Button, buttonVariants } from '../common/Button';
import Input from '../common/Input';
import { useAuth } from '../../hooks/useAuth';
import { registerSchema } from '../../lib/validation';

// Enhanced registration form data interface
interface RegisterFormData {
  email: string;
  password: string;
  confirmPassword: string;
  deviceFingerprint: string;
  acceptTerms: boolean;
}

// Enhanced registration form component with security features
const RegisterForm = memo(() => {
  // Form state management with validation
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setError,
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    mode: 'onChange',
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      acceptTerms: false,
    },
  });

  // Auth hook for registration functionality
  const { register: registerUser } = useAuth();
  
  // Device fingerprint state
  const [deviceFingerprint, setDeviceFingerprint] = useState<string>('');
  
  // Rate limiting state
  const [lastAttempt, setLastAttempt] = useState<number>(0);
  const RATE_LIMIT_DELAY = 2000; // 2 seconds between attempts

  // Generate device fingerprint on mount
  useEffect(() => {
    const generateFingerprint = async () => {
      try {
        const deviceData = {
          userAgent: navigator.userAgent,
          language: navigator.language,
          platform: navigator.platform,
          screenResolution: `${window.screen.width}x${window.screen.height}`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };

        const fingerprint = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(JSON.stringify(deviceData))
        );

        const fingerprintHex = Array.from(new Uint8Array(fingerprint))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        setDeviceFingerprint(fingerprintHex);
      } catch (error) {
        console.error('Failed to generate device fingerprint:', error);
        toast.error('Security initialization failed. Please try again.');
      }
    };

    generateFingerprint();
  }, []);

  // Enhanced form submission handler with security measures
  const onSubmit = useCallback(async (data: RegisterFormData) => {
    try {
      // Rate limiting check
      const now = Date.now();
      if (now - lastAttempt < RATE_LIMIT_DELAY) {
        toast.error('Please wait before trying again');
        return;
      }
      setLastAttempt(now);

      // Verify device fingerprint
      if (!deviceFingerprint) {
        toast.error('Security verification failed. Please refresh the page.');
        return;
      }

      // Password confirmation check
      if (data.password !== data.confirmPassword) {
        setError('confirmPassword', {
          type: 'manual',
          message: 'Passwords do not match',
        });
        return;
      }

      // Terms acceptance check
      if (!data.acceptTerms) {
        setError('acceptTerms', {
          type: 'manual',
          message: 'You must accept the terms and conditions',
        });
        return;
      }

      // Process registration
      await registerUser({
        email: data.email,
        password: data.password,
        deviceFingerprint,
      });

      toast.success('Registration successful! Please check your email to verify your account.');
    } catch (error) {
      console.error('Registration failed:', error);
      toast.error(
        error instanceof Error ? error.message : 'Registration failed. Please try again.'
      );
    }
  }, [registerUser, deviceFingerprint, lastAttempt, setError]);

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6"
      noValidate
      aria-label="Registration form"
    >
      {/* Email field */}
      <Input
        label="Email"
        type="email"
        error={errors.email?.message}
        required
        autoComplete="email"
        {...register('email')}
        aria-invalid={!!errors.email}
      />

      {/* Password field */}
      <Input
        label="Password"
        type="password"
        error={errors.password?.message}
        required
        autoComplete="new-password"
        {...register('password')}
        aria-invalid={!!errors.password}
      />

      {/* Confirm password field */}
      <Input
        label="Confirm Password"
        type="password"
        error={errors.confirmPassword?.message}
        required
        autoComplete="new-password"
        {...register('confirmPassword')}
        aria-invalid={!!errors.confirmPassword}
      />

      {/* Terms acceptance */}
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="acceptTerms"
          className="h-4 w-4 rounded border-gray-300"
          {...register('acceptTerms')}
        />
        <label
          htmlFor="acceptTerms"
          className="text-sm text-gray-600"
        >
          I accept the terms and conditions
        </label>
      </div>
      {errors.acceptTerms && (
        <p className="mt-1 text-sm text-red-600" role="alert">
          {errors.acceptTerms.message}
        </p>
      )}

      {/* Submit button */}
      <Button
        type="submit"
        isLoading={isSubmitting}
        fullWidth
        preventDoubleClick
        enableHapticFeedback
        aria-disabled={isSubmitting}
      >
        Create Account
      </Button>
    </form>
  );
});

RegisterForm.displayName = 'RegisterForm';

export default RegisterForm;