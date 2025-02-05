import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react'; // ^18.2.0
import { BroadcastChannel } from 'broadcast-channel'; // ^4.20.1
import FingerprintJS from '@fingerprintjs/fingerprintjs'; // ^3.4.0

import { User, Session } from '../types/auth';
import { useAuth } from '../hooks/useAuth';

// Constants
const SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const AUTH_CHANNEL = new BroadcastChannel('auth-channel');
const fpPromise = FingerprintJS.load();

// Types
interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  deviceId: string;
  securityLevel: number;
  lastActivity: Date;
  validateSession: () => Promise<boolean>;
  refreshSession: () => Promise<void>;
  updateActivity: () => void;
}

// Create context with security enhancements
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Enhanced hook for consuming auth context
export function useAuthContext(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const auth = useAuth();
  const [deviceId, setDeviceId] = useState<string>('');
  const [lastActivity, setLastActivity] = useState<Date>(new Date());
  const [securityLevel, setSecurityLevel] = useState<number>(0);

  // Initialize device fingerprint
  useEffect(() => {
    const initializeFingerprint = async () => {
      const fp = await fpPromise;
      const result = await fp.get();
      setDeviceId(result.visitorId);
    };
    initializeFingerprint();
  }, []);

  // Session validation with enhanced security
  const validateSession = useCallback(async (): Promise<boolean> => {
    if (!auth.session || !deviceId) return false;

    try {
      // Verify device fingerprint
      const fp = await fpPromise;
      const result = await fp.get();
      if (result.visitorId !== deviceId) {
        await auth.logout();
        return false;
      }

      // Check session expiration
      const now = new Date();
      const sessionAge = now.getTime() - lastActivity.getTime();
      if (sessionAge > SESSION_TIMEOUT) {
        await auth.logout();
        return false;
      }

      // Validate security level
      if (auth.user && auth.user.securityLevel < securityLevel) {
        await auth.logout();
        return false;
      }

      return true;
    } catch (error) {
      await auth.logout();
      return false;
    }
  }, [auth, deviceId, lastActivity, securityLevel]);

  // Activity tracking with cross-tab synchronization
  const updateActivity = useCallback(() => {
    const now = new Date();
    setLastActivity(now);
    AUTH_CHANNEL.postMessage({
      type: 'ACTIVITY_UPDATE',
      payload: { timestamp: now.toISOString(), deviceId }
    });
  }, [deviceId]);

  // Cross-tab session synchronization
  useEffect(() => {
    const handleAuthMessage = async (message: any) => {
      if (message.type === 'ACTIVITY_UPDATE' && message.payload.deviceId === deviceId) {
        setLastActivity(new Date(message.payload.timestamp));
      } else if (message.type === 'SESSION_TERMINATED') {
        await auth.logout();
      }
    };

    AUTH_CHANNEL.onmessage = handleAuthMessage;
    return () => {
      AUTH_CHANNEL.close();
    };
  }, [auth, deviceId]);

  // Automatic session refresh and validation
  useEffect(() => {
    let activityInterval: NodeJS.Timeout;
    let validationInterval: NodeJS.Timeout;

    if (auth.isAuthenticated) {
      // Monitor user activity
      activityInterval = setInterval(() => {
        const now = new Date();
        const inactiveTime = now.getTime() - lastActivity.getTime();
        if (inactiveTime > SESSION_TIMEOUT) {
          auth.logout();
        }
      }, 60000);

      // Regular session validation
      validationInterval = setInterval(async () => {
        const isValid = await validateSession();
        if (!isValid) {
          AUTH_CHANNEL.postMessage({ type: 'SESSION_TERMINATED' });
        }
      }, 30000);
    }

    return () => {
      clearInterval(activityInterval);
      clearInterval(validationInterval);
    };
  }, [auth, lastActivity, validateSession]);

  // Security level monitoring
  useEffect(() => {
    if (auth.user) {
      setSecurityLevel(auth.user.securityLevel);
    }
  }, [auth.user]);

  // Context value with security enhancements
  const contextValue = useMemo(() => ({
    user: auth.user,
    session: auth.session,
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    deviceId,
    securityLevel,
    lastActivity,
    validateSession,
    refreshSession: auth.refreshSession,
    updateActivity
  }), [
    auth.user,
    auth.session,
    auth.isAuthenticated,
    auth.isLoading,
    deviceId,
    securityLevel,
    lastActivity,
    validateSession,
    auth.refreshSession,
    updateActivity
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}