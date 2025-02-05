import React, { StrictMode } from 'react'; // ^18.2.0
import ReactDOM from 'react-dom/client'; // ^18.2.0
import * as Sentry from '@sentry/react'; // ^7.0.0
import { ErrorBoundary } from '@sentry/react'; // ^7.0.0

import App from './App';
import './styles/globals.css';
import './styles/tailwind.css';

/**
 * Initialize Sentry for error tracking and performance monitoring
 */
const initializeSentry = (): void => {
  if (!import.meta.env.VITE_SENTRY_DSN) {
    console.warn('Sentry DSN not configured');
    return;
  }

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: `unbanked@${import.meta.env.VITE_APP_VERSION}`,
    integrations: [
      new Sentry.BrowserTracing({
        tracePropagationTargets: ['localhost', /^https:\/\/api\.unbanked\.com/],
      }),
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    beforeSend(event) {
      // Sanitize sensitive data before sending to Sentry
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
      }
      return event;
    },
  });
};

/**
 * Validates required environment variables and runtime configuration
 */
const validateEnvironment = (): boolean => {
  const requiredVars = [
    'VITE_API_URL',
    'VITE_SENTRY_DSN',
    'VITE_APP_VERSION',
  ];

  const missingVars = requiredVars.filter(
    (varName) => !import.meta.env[varName]
  );

  if (missingVars.length > 0) {
    console.error('Missing required environment variables:', missingVars);
    return false;
  }

  if (!document.getElementById('root')) {
    console.error('Root element not found');
    return false;
  }

  return true;
};

/**
 * Initializes and renders the React application with error handling
 */
const renderApp = (): void => {
  // Import global styles
  import('./styles/globals.css');
  import('./styles/tailwind.css');

  // Validate environment
  if (!validateEnvironment()) {
    throw new Error('Environment validation failed');
  }

  // Initialize error tracking
  initializeSentry();

  // Get and validate root element
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found in DOM');
  }

  // Create React root with concurrent features
  const root = ReactDOM.createRoot(rootElement);

  // Render app with error boundary and strict mode
  root.render(
    <StrictMode>
      <ErrorBoundary
        fallback={({ error }) => (
          <div role="alert" className="flex flex-col items-center justify-center min-h-screen p-4">
            <h2 className="text-xl font-semibold mb-4">Something went wrong</h2>
            <pre className="text-sm bg-red-50 dark:bg-red-900/10 p-4 rounded-md mb-4">
              {error.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Reload Application
            </button>
          </div>
        )}
        onError={(error) => {
          Sentry.captureException(error);
        }}
      >
        <App />
      </ErrorBoundary>
    </StrictMode>
  );

  // Log successful initialization
  console.info(
    `Unbanked Web initialized (${import.meta.env.MODE} mode, v${import.meta.env.VITE_APP_VERSION})`
  );
};

// Initialize application
try {
  renderApp();
} catch (error) {
  console.error('Failed to initialize application:', error);
  Sentry.captureException(error);
  
  // Display fallback error UI
  document.body.innerHTML = `
    <div role="alert" style="padding: 2rem; text-align: center;">
      <h1 style="margin-bottom: 1rem; font-size: 1.5rem;">Unable to Load Application</h1>
      <p style="margin-bottom: 1rem;">Please try refreshing the page or contact support if the problem persists.</p>
      <button onclick="window.location.reload()" style="padding: 0.5rem 1rem; background: #0066FF; color: white; border-radius: 0.375rem;">
        Reload Page
      </button>
    </div>
  `;
}