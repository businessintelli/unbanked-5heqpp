import { useState, useCallback, useEffect } from 'react'; // v18.2.0
import { User, Session, UserRole, KYCLevel, LoginCredentials, AuthResponse } from '../types/auth';

// Security and session management constants
const TOKEN_REFRESH_INTERVAL = 14 * 60 * 1000; // 14 minutes
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const MAX_CONCURRENT_SESSIONS = 3;

// Enhanced security types
type SecurityLevel = 'high' | 'medium' | 'low';
type KYCStatus = 'none' | 'pending' | 'verified' | 'rejected';
type MFAMethod = 'totp' | 'sms' | 'email';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  error: string | null;
  kycStatus: KYCStatus;
  securityLevel: SecurityLevel;
  mfaRequired: boolean;
  lastActivity: Date;
}

/**
 * Enhanced authentication hook with advanced security features and session management
 */
export function useAuth() {
  // Initialize comprehensive auth state
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    error: null,
    kycStatus: 'none',
    securityLevel: 'low',
    mfaRequired: false,
    lastActivity: new Date()
  });

  /**
   * Generate unique device fingerprint for session tracking
   */
  const generateDeviceFingerprint = useCallback(async (): Promise<string> => {
    const deviceData = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
    
    const fingerprint = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(deviceData))
    );
    
    return Array.from(new Uint8Array(fingerprint))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }, []);

  /**
   * Enhanced login with MFA and device verification
   */
  const login = useCallback(async (credentials: LoginCredentials): Promise<void> => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
      
      // Generate device fingerprint
      const deviceId = await generateDeviceFingerprint();
      
      // Attempt login with enhanced security
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, deviceId })
      });
      
      const authResponse: AuthResponse = await response.json();
      
      if (!response.ok) {
        throw new Error(authResponse.error || 'Authentication failed');
      }

      // Handle MFA requirement
      if (authResponse.mfaRequired) {
        setAuthState(prev => ({
          ...prev,
          isLoading: false,
          mfaRequired: true
        }));
        return;
      }

      // Initialize secure session
      const session: Session = {
        token: authResponse.access_token,
        refresh_token: authResponse.refresh_token,
        deviceId,
        lastRefresh: new Date()
      };

      setAuthState(prev => ({
        ...prev,
        user: authResponse.user,
        session,
        isLoading: false,
        kycStatus: getKYCStatus(authResponse.user.kyc_level),
        securityLevel: calculateSecurityLevel(authResponse.user),
        mfaRequired: false,
        lastActivity: new Date()
      }));

      // Initialize session monitoring
      startSessionMonitoring();
      scheduleTokenRefresh();
      
    } catch (error) {
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Login failed'
      }));
    }
  }, []);

  /**
   * Verify MFA code during authentication
   */
  const verifyMFA = useCallback(async (code: string, method: MFAMethod): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/verify-mfa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authState.session?.token}`
        },
        body: JSON.stringify({ code, method })
      });

      const result = await response.json();
      
      if (result.verified) {
        setAuthState(prev => ({
          ...prev,
          mfaRequired: false,
          securityLevel: 'high'
        }));
        return true;
      }
      return false;
    } catch (error) {
      setAuthState(prev => ({
        ...prev,
        error: 'MFA verification failed'
      }));
      return false;
    }
  }, [authState.session]);

  /**
   * Enhanced session refresh with token rotation
   */
  const refreshSession = useCallback(async (): Promise<void> => {
    if (!authState.session?.refresh_token) return;

    try {
      const deviceId = await generateDeviceFingerprint();
      
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refresh_token: authState.session.refresh_token,
          deviceId
        })
      });

      const result = await response.json();

      if (!response.ok) throw new Error(result.error);

      setAuthState(prev => ({
        ...prev,
        session: {
          ...prev.session!,
          token: result.access_token,
          refresh_token: result.refresh_token,
          lastRefresh: new Date()
        },
        lastActivity: new Date()
      }));
    } catch (error) {
      // Force logout on refresh failure
      logout();
    }
  }, [authState.session]);

  /**
   * Secure logout with session cleanup
   */
  const logout = useCallback(async (): Promise<void> => {
    try {
      if (authState.session) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authState.session.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            deviceId: authState.session.deviceId
          })
        });
      }
    } finally {
      setAuthState({
        user: null,
        session: null,
        isLoading: false,
        error: null,
        kycStatus: 'none',
        securityLevel: 'low',
        mfaRequired: false,
        lastActivity: new Date()
      });
    }
  }, [authState.session]);

  /**
   * Update KYC status and trigger verification if needed
   */
  const updateKYC = useCallback(async (documents: FormData): Promise<void> => {
    if (!authState.session?.token) return;

    try {
      const response = await fetch('/api/kyc/update', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authState.session.token}`
        },
        body: documents
      });

      const result = await response.json();

      if (!response.ok) throw new Error(result.error);

      setAuthState(prev => ({
        ...prev,
        kycStatus: 'pending',
        user: result.user
      }));
    } catch (error) {
      setAuthState(prev => ({
        ...prev,
        error: 'KYC update failed'
      }));
    }
  }, [authState.session]);

  // Helper functions
  const getKYCStatus = (level: KYCLevel): KYCStatus => {
    switch (level) {
      case KYCLevel.NONE: return 'none';
      case KYCLevel.BASIC: return 'pending';
      case KYCLevel.VERIFIED: return 'verified';
      default: return 'none';
    }
  };

  const calculateSecurityLevel = (user: User): SecurityLevel => {
    if (user.mfa_enabled && user.kyc_level >= KYCLevel.VERIFIED) return 'high';
    if (user.mfa_enabled || user.kyc_level >= KYCLevel.BASIC) return 'medium';
    return 'low';
  };

  // Session monitoring
  const startSessionMonitoring = useCallback(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const lastActivity = new Date(authState.lastActivity);
      
      if (now.getTime() - lastActivity.getTime() > SESSION_TIMEOUT) {
        logout();
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [authState.lastActivity, logout]);

  // Token refresh scheduling
  const scheduleTokenRefresh = useCallback(() => {
    const interval = setInterval(refreshSession, TOKEN_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [refreshSession]);

  // Initialize auth state from stored session
  useEffect(() => {
    const initializeAuth = async () => {
      const storedSession = localStorage.getItem('auth_session');
      if (!storedSession) {
        setAuthState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      try {
        const session = JSON.parse(storedSession);
        const deviceId = await generateDeviceFingerprint();
        
        if (session.deviceId !== deviceId) {
          throw new Error('Invalid device fingerprint');
        }

        await refreshSession();
      } catch {
        localStorage.removeItem('auth_session');
        setAuthState(prev => ({ ...prev, isLoading: false }));
      }
    };

    initializeAuth();
  }, []);

  return {
    user: authState.user,
    session: authState.session,
    isAuthenticated: !!authState.user,
    isLoading: authState.isLoading,
    error: authState.error,
    kycStatus: authState.kycStatus,
    securityLevel: authState.securityLevel,
    mfaRequired: authState.mfaRequired,
    login,
    logout,
    verifyMFA,
    updateKYC
  };
}