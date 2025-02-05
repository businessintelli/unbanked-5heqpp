import React from 'react'; // ^18.2.0
import { useForm } from 'react-hook-form'; // ^7.0.0
import { z } from 'zod'; // ^3.0.0
import { zodResolver } from '@hookform/resolvers/zod'; // ^3.0.0
import { Eye, EyeOff, Mail, Lock } from 'lucide-react'; // ^0.294.0

import { Button, buttonVariants } from '../common/Button';
import Input from '../common/Input';
import { useAuth } from '../../hooks/useAuth';
import { loginCredentialsSchema } from '../../types/auth';

// Enhanced login form validation schema
const loginFormSchema = z.object({
  email: z.string()
    .email('Please enter a valid email address')
    .min(1, 'Email is required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
      'Password must contain uppercase, lowercase, number, and special character'
    ),
  rememberDevice: z.boolean().default(false),
});

type LoginFormData = z.infer<typeof loginFormSchema>;

interface LoginFormProps {
  onSuccess: (response: AuthResponse) => void;
  onError: (error: string) => void;
  onMFARequired: (challenge: MFAChallenge) => void;
  deviceId?: string;
  rememberDevice?: boolean;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  onSuccess,
  onError,
  onMFARequired,
  deviceId,
  rememberDevice = false,
}) => {
  const [showPassword, setShowPassword] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { login, isLoading } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberDevice,
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setIsSubmitting(true);
      
      const response = await login({
        email: data.email,
        password: data.password,
        deviceId: deviceId || '',
        rememberDevice: data.rememberDevice,
      });

      if (response.mfaRequired) {
        onMFARequired(response.mfaChallenge);
      } else {
        onSuccess(response);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      setError('root', { message: errorMessage });
      onError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <form 
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6"
      noValidate
      aria-label="Login form"
    >
      <div className="space-y-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          error={errors.email?.message}
          startIcon={<Mail className="h-5 w-5" />}
          aria-invalid={!!errors.email}
          disabled={isSubmitting}
          {...register('email')}
        />

        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          required
          error={errors.password?.message}
          startIcon={<Lock className="h-5 w-5" />}
          endIcon={
            <button
              type="button"
              onClick={togglePasswordVisibility}
              className="text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          }
          aria-invalid={!!errors.password}
          disabled={isSubmitting}
          {...register('password')}
        />

        <div className="flex items-center justify-between">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              {...register('rememberDevice')}
            />
            <span className="text-sm text-gray-700">Remember this device</span>
          </label>

          <Button
            variant="link"
            size="sm"
            type="button"
            className="text-sm text-primary-600 hover:text-primary-500"
            onClick={() => {/* Handle forgot password */}}
          >
            Forgot password?
          </Button>
        </div>
      </div>

      {errors.root && (
        <div
          className="rounded-md bg-error-50 p-4 text-sm text-error-700"
          role="alert"
          aria-live="polite"
        >
          {errors.root.message}
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        isLoading={isSubmitting || isLoading}
        disabled={isSubmitting || isLoading}
        preventDoubleClick
        enableHapticFeedback
      >
        Sign in
      </Button>
    </form>
  );
};

export default LoginForm;