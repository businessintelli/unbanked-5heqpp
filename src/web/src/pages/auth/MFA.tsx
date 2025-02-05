import React, { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MFAForm from '../../components/auth/MFAForm';
import Card from '../../components/common/Card';
import Loading from '../../components/common/Loading';
import { useAuth } from '../../hooks/useAuth';

/**
 * Enhanced Multi-Factor Authentication page component with security features,
 * accessibility compliance, and performance optimizations.
 */
const MFAPage: React.FC = () => {
  const navigate = useNavigate();
  const { isLoading, isAuthenticated, verifyMFA } = useAuth();

  // Redirect authenticated users
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Enhanced MFA success handler with security measures
  const handleMFASuccess = useCallback(async (response: any) => {
    try {
      // Clear any sensitive data from the form
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Secure navigation to dashboard
      navigate('/dashboard', { 
        replace: true,
        state: { 
          verified: true,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      console.error('MFA verification error:', error);
    }
  }, [navigate]);

  // Enhanced error handler with security logging
  const handleMFAError = useCallback((error: Error) => {
    // Log security event but avoid exposing sensitive details
    console.error('MFA verification failed');
    
    // Clear any sensitive data
    sessionStorage.removeItem('mfa_state');
  }, []);

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status">
        <Loading 
          size="lg"
          label="Verifying your identity..."
          aria-live="polite"
        />
      </div>
    );
  }

  return (
    <div 
      className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8"
      aria-labelledby="mfa-page-title"
    >
      <div className="w-full max-w-md space-y-8">
        <Card
          variant="elevated"
          padding="lg"
          radius="lg"
          elevation={2}
          role="main"
          aria-label="MFA verification form"
        >
          <div className="text-center">
            <h1 
              id="mfa-page-title"
              className="text-2xl font-bold tracking-tight text-gray-900"
            >
              Two-Factor Authentication
            </h1>
            <p 
              className="mt-2 text-sm text-gray-600"
              id="mfa-description"
            >
              Please enter the verification code from your authenticator app
            </p>
          </div>

          <MFAForm
            onSuccess={handleMFASuccess}
            onError={handleMFAError}
            maxAttempts={3}
            timeoutDuration={300000} // 5 minutes
          />

          <div 
            className="mt-4 text-center text-sm"
            aria-live="polite"
          >
            <button
              type="button"
              onClick={() => navigate('/auth/login')}
              className="text-primary-600 hover:text-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              Return to login
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default MFAPage;