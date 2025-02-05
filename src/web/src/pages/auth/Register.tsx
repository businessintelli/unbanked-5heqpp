import React, { useEffect } from 'react'; // ^18.2.0
import { useNavigate } from 'react-router-dom'; // ^6.0.0
import { ErrorBoundary } from 'react-error-boundary'; // ^4.0.0
import RegisterForm from '../../components/auth/RegisterForm';
import { useAuth } from '../../hooks/useAuth';
import Analytics from '@unbanked/analytics'; // ^1.0.0

// Initialize analytics instance
const analytics = new Analytics({
  appId: process.env.ANALYTICS_APP_ID,
  environment: process.env.NODE_ENV
});

/**
 * Error fallback component for registration page
 */
const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => (
  <div 
    role="alert" 
    className="p-4 bg-destructive/10 rounded-lg text-destructive"
  >
    <h2 className="text-lg font-semibold mb-2">Registration Error</h2>
    <p className="mb-4">{error.message}</p>
    <button
      onClick={resetErrorBoundary}
      className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
    >
      Try Again
    </button>
  </div>
);

/**
 * Enhanced registration page component with security features and analytics
 */
const Register: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

  // Track page view
  useEffect(() => {
    analytics.trackPageView({
      page: 'register',
      timestamp: new Date(),
      metadata: {
        referrer: document.referrer,
        userAgent: navigator.userAgent
      }
    });
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  // Handle loading state
  if (isLoading) {
    return (
      <div 
        className="flex min-h-screen items-center justify-center bg-background p-4"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6 lg:p-8 animate-fadeIn">
      <div className="w-full max-w-md space-y-6 bg-card p-6 sm:p-8 border rounded-lg shadow-lg animate-slideUp">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Create Your Account
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter your details to get started with Unbanked
          </p>
        </div>

        <ErrorBoundary
          FallbackComponent={ErrorFallback}
          onReset={() => {
            // Reset error state
            analytics.trackEvent('registration_error_reset');
          }}
          onError={(error) => {
            // Log error to analytics
            analytics.trackError({
              error: error.message,
              component: 'RegisterPage',
              stackTrace: error.stack
            });
          }}
        >
          <RegisterForm />
        </ErrorBoundary>

        <div className="text-center text-sm">
          <span className="text-muted-foreground">Already have an account? </span>
          <a 
            href="/login"
            className="text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary/20 rounded"
          >
            Sign in
          </a>
        </div>

        {/* Accessibility skip link */}
        <a 
          href="#main-content" 
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-primary text-white p-2 rounded"
        >
          Skip to main content
        </a>
      </div>
    </div>
  );
};

export default Register;