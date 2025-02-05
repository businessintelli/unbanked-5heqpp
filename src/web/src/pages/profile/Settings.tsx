import React, { useState, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { useAnalytics } from '@unbanked/analytics'; // ^1.0.0

import PersonalInfo from '../../components/profile/PersonalInfo';
import SecuritySettings from '../../components/profile/SecuritySettings';
import Preferences from '../../components/profile/Preferences';
import Tabs from '../../components/common/Tabs';

// Interface for settings tab configuration
interface SettingsTabItem {
  id: string;
  label: string;
  content: React.ReactNode;
  accessLevel: number;
  analyticsId: string;
  loadingFallback: React.ReactNode;
}

// Props interface for Settings component
interface SettingsProps {
  className?: string;
  initialTab?: string;
  onTabChange?: (tabId: string) => void;
}

// Loading fallback component
const LoadingSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-4" role="status" aria-label="Loading content">
    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
    <div className="h-4 bg-gray-200 rounded w-2/3"></div>
  </div>
);

// Error fallback component
const ErrorFallback: React.FC<{ error: Error; resetErrorBoundary: () => void }> = ({
  error,
  resetErrorBoundary
}) => (
  <div 
    role="alert" 
    className="p-4 border border-red-200 rounded-md bg-red-50"
    aria-labelledby="error-heading"
  >
    <h2 id="error-heading" className="text-lg font-semibold text-red-700 mb-2">
      Something went wrong
    </h2>
    <p className="text-red-600 mb-4">{error.message}</p>
    <button
      onClick={resetErrorBoundary}
      className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
    >
      Try again
    </button>
  </div>
);

const Settings: React.FC<SettingsProps> = React.memo(({
  className,
  initialTab,
  onTabChange
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const analytics = useAnalytics();
  const [activeTab, setActiveTab] = useState<string>(
    initialTab || new URLSearchParams(location.search).get('tab') || 'personal-info'
  );

  // Define tabs configuration
  const SETTINGS_TABS: SettingsTabItem[] = useMemo(() => [
    {
      id: 'personal-info',
      label: 'Personal Information',
      content: (
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <PersonalInfo />
        </ErrorBoundary>
      ),
      accessLevel: 1,
      analyticsId: 'settings_personal_info',
      loadingFallback: <LoadingSkeleton />
    },
    {
      id: 'security',
      label: 'Security',
      content: (
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <SecuritySettings onSettingsChange={() => {
            analytics.track('security_settings_updated');
          }} />
        </ErrorBoundary>
      ),
      accessLevel: 2,
      analyticsId: 'settings_security',
      loadingFallback: <LoadingSkeleton />
    },
    {
      id: 'preferences',
      label: 'Preferences',
      content: (
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <Preferences />
        </ErrorBoundary>
      ),
      accessLevel: 1,
      analyticsId: 'settings_preferences',
      loadingFallback: <LoadingSkeleton />
    }
  ], [analytics]);

  // Handle tab change with analytics and URL updates
  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId);
    
    // Update URL with new tab
    const searchParams = new URLSearchParams(location.search);
    searchParams.set('tab', tabId);
    navigate({ search: searchParams.toString() }, { replace: true });

    // Track tab change in analytics
    analytics.track('settings_tab_changed', {
      tab_id: tabId,
      previous_tab: activeTab
    });

    // Notify parent component if callback provided
    onTabChange?.(tabId);
  }, [activeTab, location.search, navigate, analytics, onTabChange]);

  // Convert tabs configuration to format expected by Tabs component
  const tabItems = useMemo(() => 
    SETTINGS_TABS.map(tab => ({
      id: tab.id,
      label: tab.label,
      content: tab.content,
      disabled: false // Could be based on user access level
    }))
  , [SETTINGS_TABS]);

  return (
    <div 
      className={`w-full max-w-4xl mx-auto p-6 ${className || ''}`}
      role="region"
      aria-label="Settings"
    >
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        Account Settings
      </h1>

      <Tabs
        items={tabItems}
        defaultTab={activeTab}
        onChange={handleTabChange}
        variant="underline"
        size="default"
        lazyLoad={true}
        className="settings-tabs"
      />

      {/* Accessibility announcement for tab changes */}
      <div 
        role="status" 
        aria-live="polite" 
        className="sr-only"
      >
        {`Current tab: ${SETTINGS_TABS.find(tab => tab.id === activeTab)?.label}`}
      </div>
    </div>
  );
});

Settings.displayName = 'Settings';

export default Settings;