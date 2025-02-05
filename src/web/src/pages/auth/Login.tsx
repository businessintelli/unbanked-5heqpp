import React, { useEffect, useState, useCallback } from 'react'; // ^18.2.0
import { useNavigate } from 'react-router-dom'; // ^6.20.0
import FingerprintJS from '@fingerprintjs/fingerprintjs'; // ^3.4.0

import LoginForm from '../../components/auth/LoginForm';
import { useAuth } from '../../hooks/useAuth';
import { AuthResponse } from '../../types/auth';

// Initialize FingerprintJS for device identification
const fpPromise = FingerprintJS.load({
  monitoring: true,
  screenResolution: true,
  audio: true
});

// Rate limiting configuration
const RATE_LIMIT = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  blockDuration: 30 * 60 * 1000 // 30 minutes
};

interface SecurityContext {
  deviceId: string;
  riskScore: number;
  lastAttempt: number;
  attempts: number;
}

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { 
    isAuthenticated, 
    isLoading, 
    handleMFAChallenge, 
    securityLevel,
    sessionStatus 
  } = useAuth();

  const [securityContext, setSecurityContext] = useState<SecurityContext>({
    deviceId: '',
    riskScore: 0,
    lastAttempt: 0,
    attempts: 0
  });

  // Initialize device fingerprinting
  useEffect(() => {
    const initializeFingerprint = async () => {
      try {
        const fp = await fpPromise;
        const result = await fp.get();
        
        setSecurityContext(prev => ({
          ...prev,
          deviceId: result.visitorId,
          riskScore: calculateRiskScore(result.components)
        }));
      } catch (error) {
        console.error('Fingerprint initialization failed:', error);
        // Fallback to basic security measures
        setSecurityContext(prev => ({ ...prev, riskScore: 100 }));
      }
    };

    initializeFingerprint();
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Handle rate limiting and security checks
  const checkRateLimit = useCallback((): boolean => {
    const now = Date.now();
    if (
      securityContext.attempts >= RATE_LIMIT.maxAttempts &&
      now - securityContext.lastAttempt < RATE_LIMIT.windowMs
    ) {
      return false;
    }
    return true;
  }, [securityContext]);

  // Calculate risk score based on device fingerprint
  const calculateRiskScore = (components: any): number => {
    let score = 0;
    
    // Check for suspicious indicators
    if (components.emulator) score += 30;
    if (components.tor) score += 40;
    if (components.proxy) score += 20;
    if (!components.languages) score += 10;
    if (!components.timezone) score += 10;
    
    return score;
  };

  // Enhanced success handler with security validations
  const handleLoginSuccess = async (response: AuthResponse) => {
    try {
      // Validate device fingerprint
      if (response.deviceId !== securityContext.deviceId) {
        throw new Error('Device fingerprint mismatch');
      }

      // Check security level requirements
      if (securityContext.riskScore > 50) {
        await handleMFAChallenge({
          userId: response.user.id,
          deviceId: securityContext.deviceId,
          riskScore: securityContext.riskScore
        });
        return;
      }

      // Reset rate limiting on successful login
      setSecurityContext(prev => ({
        ...prev,
        attempts: 0,
        lastAttempt: Date.now()
      }));

      navigate('/dashboard');
    } catch (error) {
      handleLoginError(error as Error);
    }
  };

  // Comprehensive error handler with security logging
  const handleLoginError = (error: Error) => {
    setSecurityContext(prev => ({
      ...prev,
      attempts: prev.attempts + 1,
      lastAttempt: Date.now()
    }));

    // Log security relevant errors
    console.error('Login security error:', {
      error: error.message,
      deviceId: securityContext.deviceId,
      riskScore: securityContext.riskScore,
      attempts: securityContext.attempts + 1,
      timestamp: new Date().toISOString()
    });
  };

  // Handle MFA challenge response
  const handleMFARequired = async (challenge: any) => {
    try {
      const mfaResult = await handleMFAChallenge(challenge);
      if (mfaResult.verified) {
        navigate('/dashboard');
      }
    } catch (error) {
      handleLoginError(error as Error);
    }
  };

  if (isLoading) {
    return (
      <div 
        className="flex min-h-screen items-center justify-center"
        role="status"
        aria-label="Loading authentication system"
      >
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h1 className="mt-6 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
          Sign in to your account
        </h1>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-[480px]">
        <div className="bg-white px-6 py-12 shadow sm:rounded-lg sm:px-12">
          {!checkRateLimit() ? (
            <div 
              className="rounded-md bg-error-50 p-4 text-sm text-error-700"
              role="alert"
              aria-live="polite"
            >
              Too many login attempts. Please try again later.
            </div>
          ) : (
            <LoginForm
              onSuccess={handleLoginSuccess}
              onError={handleLoginError}
              onMFARequired={handleMFARequired}
              deviceId={securityContext.deviceId}
              rememberDevice={securityContext.riskScore < 30}
            />
          )}
        </div>

        <p className="mt-10 text-center text-sm text-gray-500">
          Don't have an account?{' '}
          <a
            href="/register"
            className="font-semibold leading-6 text-primary-600 hover:text-primary-500"
          >
            Create an account
          </a>
        </p>
      </div>
    </div>
  );
};

export default Login;