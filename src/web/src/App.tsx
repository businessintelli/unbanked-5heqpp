import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { Analytics } from '@segment/analytics-next';

import { AuthProvider } from './providers/AuthProvider';
import { ThemeProvider } from './providers/ThemeProvider';
import { WebSocketProvider } from './providers/WebSocketProvider';
import { AppShell } from './components/layout/AppShell';
import { storage } from './lib/storage';

// Initialize QueryClient with optimized settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
      suspense: true,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true
    }
  }
});

// Initialize analytics
const analytics = new Analytics({
  writeKey: import.meta.env.VITE_SEGMENT_KEY
});

// Error Fallback Component
const ErrorFallback = ({ error, resetErrorBoundary }: any) => (
  <div role="alert" className="flex flex-col items-center justify-center min-h-screen p-4">
    <h2 className="text-xl font-semibold mb-4">Something went wrong</h2>
    <pre className="text-sm bg-red-50 dark:bg-red-900/10 p-4 rounded-md mb-4">
      {error.message}
    </pre>
    <button
      onClick={resetErrorBoundary}
      className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
    >
      Try again
    </button>
  </div>
);

export const App: React.FC = () => {
  // Initialize storage on app mount
  useEffect(() => {
    storage.initializeStorage().catch(console.error);

    // Track app initialization
    analytics.track('App Initialized', {
      timestamp: new Date().toISOString(),
      environment: import.meta.env.MODE
    });

    return () => {
      // Cleanup analytics on unmount
      analytics.track('App Terminated', {
        timestamp: new Date().toISOString()
      });
    };
  }, []);

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        // Reset app state on error recovery
        queryClient.clear();
        window.location.href = '/';
      }}
      onError={(error) => {
        // Track fatal errors
        analytics.track('Fatal Error', {
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }}
    >
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <WebSocketProvider
                autoConnect={true}
                maxReconnectAttempts={5}
                reconnectInterval={1000}
              >
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center min-h-screen">
                      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
                    </div>
                  }
                >
                  <AppShell />
                </Suspense>
              </WebSocketProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;