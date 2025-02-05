import React, { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { analytics } from '@segment/analytics-next';

import SecuritySettings from '../../components/profile/SecuritySettings';
import { useAuth } from '../../hooks/useAuth';
import { AppShell } from '../../components/layout/AppShell';

// Analytics event types
interface SecurityEvent {
  eventType: string;
  metadata: Record<string, unknown>;
}

/**
 * Security page component providing comprehensive security management interface
 * with enhanced error handling and analytics tracking
 */
const Security: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, validateSession } = useAuth();

  /**
   * Track security-related events with analytics
   */
  const trackSecurityEvent = useCallback((event: SecurityEvent) => {
    analytics.track(event.eventType, {
      userId: user?.id,
      timestamp: new Date().toISOString(),
      ...event.metadata
    });
  }, [user]);

  /**
   * Enhanced session validation with security checks
   */
  const checkAuth = useCallback(async () => {
    if (!isAuthenticated) {
      trackSecurityEvent({
        eventType: 'security_page_unauthorized_access',
        metadata: {
          path: '/profile/security',
          timestamp: new Date().toISOString()
        }
      });
      navigate('/auth/login', { replace: true });
      return;
    }

    const isSessionValid = await validateSession();
    if (!isSessionValid) {
      trackSecurityEvent({
        eventType: 'security_page_invalid_session',
        metadata: {
          userId: user?.id,
          timestamp: new Date().toISOString()
        }
      });
      navigate('/auth/login', { replace: true });
    }
  }, [isAuthenticated, validateSession, navigate, user, trackSecurityEvent]);

  /**
   * Handle security settings changes with analytics
   */
  const handleSettingsChange = useCallback((settings: any) => {
    trackSecurityEvent({
      eventType: 'security_settings_updated',
      metadata: {
        userId: user?.id,
        changes: settings,
        timestamp: new Date().toISOString()
      }
    });
  }, [user, trackSecurityEvent]);

  /**
   * Comprehensive error handler for security operations
   */
  const handleError = useCallback((error: Error) => {
    console.error('Security page error:', error);
    
    trackSecurityEvent({
      eventType: 'security_page_error',
      metadata: {
        userId: user?.id,
        error: error.message,
        timestamp: new Date().toISOString()
      }
    });

    return (
      <div 
        role="alert" 
        className="p-4 bg-red-50 border border-red-200 rounded-md"
      >
        <h2 className="text-lg font-semibold text-red-700 mb-2">
          Security Settings Error
        </h2>
        <p className="text-red-600">
          An error occurred while loading security settings. Please try again later.
        </p>
      </div>
    );
  }, [user, trackSecurityEvent]);

  // Validate authentication and track page view
  useEffect(() => {
    checkAuth();

    trackSecurityEvent({
      eventType: 'security_page_viewed',
      metadata: {
        userId: user?.id,
        timestamp: new Date().toISOString()
      }
    });

    // Cleanup analytics on unmount
    return () => {
      analytics.reset();
    };
  }, [checkAuth, user, trackSecurityEvent]);

  return (
    <AppShell>
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            Security Settings
          </h1>
          <p className="mt-2 text-muted-foreground">
            Manage your account security preferences and authentication settings
          </p>
        </header>

        <ErrorBoundary
          FallbackComponent={({ error }) => handleError(error)}
          onReset={checkAuth}
        >
          <SecuritySettings
            onSettingsChange={handleSettingsChange}
          />
        </ErrorBoundary>
      </div>
    </AppShell>
  );
};

export default Security;