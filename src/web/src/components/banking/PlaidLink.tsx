import React, { useCallback, useEffect, useState } from 'react'; // v18.2.0
import { usePlaidLink } from 'react-plaid-link'; // v3.5.0
import { Analytics } from '@segment/analytics-next'; // v1.51.0
import { ErrorBoundary } from 'react-error-boundary'; // v4.0.11
import { useBanking } from '../../hooks/useBanking';
import Button from '../common/Button';

// Analytics instance
const analytics = new Analytics({
  writeKey: process.env.VITE_SEGMENT_WRITE_KEY || ''
});

interface PlaidLinkProps {
  onSuccess?: (result: { public_token: string; metadata: any }) => void;
  onExit?: (error?: any) => void;
  onError?: (error: Error) => void;
  className?: string;
  analyticsData?: Record<string, unknown>;
}

interface PlaidError extends Error {
  error_code?: string;
  error_message?: string;
  error_type?: string;
  display_message?: string;
}

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

export const PlaidLink: React.FC<PlaidLinkProps> = ({
  onSuccess,
  onExit,
  onError,
  className,
  analyticsData = {}
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<PlaidError | null>(null);

  const { linkBankAccount } = useBanking();

  // Initialize Plaid Link token
  useEffect(() => {
    const initializePlaidLink = async () => {
      try {
        setIsLoading(true);
        const token = await linkBankAccount('default');
        setLinkToken(token);
        analytics.track('Plaid Link Initialized', {
          ...analyticsData,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        const error = err as PlaidError;
        setError(error);
        analytics.track('Plaid Link Initialization Failed', {
          error: error.message,
          errorCode: error.error_code,
          ...analyticsData
        });
        onError?.(error);
      } finally {
        setIsLoading(false);
      }
    };

    initializePlaidLink();
  }, [linkBankAccount, analyticsData]);

  // Handle successful bank connection
  const handleSuccess = useCallback(async (public_token: string, metadata: any) => {
    try {
      setIsLoading(true);
      analytics.track('Plaid Link Success Started', {
        ...analyticsData,
        institutionId: metadata.institution?.institution_id,
        accountType: metadata.accounts?.[0]?.type
      });

      // Validate public token format
      if (!public_token || typeof public_token !== 'string') {
        throw new Error('Invalid public token received');
      }

      // Call the success callback with the result
      await onSuccess?.({ public_token, metadata });

      analytics.track('Plaid Link Success Completed', {
        ...analyticsData,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      const error = err as PlaidError;
      setError(error);
      analytics.track('Plaid Link Success Failed', {
        error: error.message,
        errorCode: error.error_code,
        ...analyticsData
      });
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [onSuccess, onError, analyticsData]);

  // Handle Plaid Link exit
  const handleExit = useCallback(async (err?: any) => {
    if (err) {
      analytics.track('Plaid Link Exit With Error', {
        error: err.message,
        errorCode: err.error_code,
        ...analyticsData
      });

      // Implement retry logic for certain error types
      if (retryCount < RETRY_ATTEMPTS && err.error_code === 'INSTITUTION_ERROR') {
        setRetryCount(prev => prev + 1);
        setTimeout(() => {
          open();
        }, RETRY_DELAY * Math.pow(2, retryCount));
        return;
      }
    } else {
      analytics.track('Plaid Link Exit', {
        ...analyticsData,
        timestamp: new Date().toISOString()
      });
    }

    onExit?.(err);
  }, [onExit, retryCount, analyticsData]);

  // Configure Plaid Link
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: handleSuccess,
    onExit: handleExit,
    onEvent: (eventName, metadata) => {
      analytics.track(`Plaid Link Event: ${eventName}`, {
        ...analyticsData,
        ...metadata,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Error fallback component
  const ErrorFallback = ({ error, resetErrorBoundary }: any) => (
    <div role="alert" className="text-error-600 p-4">
      <p>Something went wrong:</p>
      <pre className="text-sm">{error.message}</pre>
      <Button
        variant="secondary"
        onClick={resetErrorBoundary}
        className="mt-4"
      >
        Try again
      </Button>
    </div>
  );

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        setError(null);
        setRetryCount(0);
      }}
    >
      <div className={className}>
        <Button
          variant="primary"
          onClick={() => open()}
          disabled={!ready || isLoading}
          isLoading={isLoading}
          aria-label="Connect bank account"
          fullWidth
        >
          {isLoading ? 'Connecting...' : 'Connect Bank Account'}
        </Button>
        
        {error && (
          <p className="text-error-600 text-sm mt-2" role="alert">
            {error.display_message || error.message}
          </p>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default PlaidLink;