import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom'; // ^6.20.0
import { analytics } from '@segment/analytics-next'; // ^1.51.0

import AppShell from '../../components/layout/AppShell';
import TransferForm from '../../components/banking/TransferForm';
import Notification from '../../components/common/Notification';
import { useBanking } from '../../hooks/useBanking';

interface TransferPageProps {
  initialCurrency?: string;
}

interface NotificationState {
  show: boolean;
  message: string;
  variant: 'success' | 'error';
  timeout: number;
}

interface TransferState {
  loading: boolean;
  error: string | null;
  validationErrors: Record<string, string>;
}

const Transfer: React.FC<TransferPageProps> = ({ initialCurrency = 'USD' }) => {
  const navigate = useNavigate();
  const { wallets, createTransaction, validateTransfer } = useBanking();
  const [notification, setNotification] = useState<NotificationState>({
    show: false,
    message: '',
    variant: 'success',
    timeout: 5000,
  });
  const [transferState, setTransferState] = useState<TransferState>({
    loading: false,
    error: null,
    validationErrors: {},
  });

  // Clean up notifications on unmount
  useEffect(() => {
    return () => {
      setNotification({ show: false, message: '', variant: 'success', timeout: 5000 });
    };
  }, []);

  // Handle successful transfer completion
  const handleTransferSuccess = useCallback(async (data: any) => {
    try {
      analytics.track('Transfer Completed', {
        amount: data.amount,
        currency: data.currency,
        destinationType: data.destinationType,
      });

      setNotification({
        show: true,
        message: 'Transfer completed successfully',
        variant: 'success',
        timeout: 5000,
      });

      // Allow notification to show before navigation
      setTimeout(() => {
        navigate('/banking/transactions');
      }, 2000);
    } catch (error) {
      console.error('Error handling transfer success:', error);
    }
  }, [navigate]);

  // Handle transfer errors with detailed feedback
  const handleTransferError = useCallback((error: any) => {
    analytics.track('Transfer Failed', {
      error: error.message,
      code: error.code,
    });

    setNotification({
      show: true,
      message: error.message || 'Transfer failed. Please try again.',
      variant: 'error',
      timeout: 7000,
    });

    setTransferState(prev => ({
      ...prev,
      error: error.message,
      loading: false,
    }));
  }, []);

  // Handle validation start
  const handleValidationStart = useCallback(() => {
    setTransferState(prev => ({
      ...prev,
      loading: true,
      error: null,
    }));
  }, []);

  // Handle validation completion
  const handleValidationComplete = useCallback((isValid: boolean) => {
    setTransferState(prev => ({
      ...prev,
      loading: false,
      error: isValid ? null : 'Validation failed',
    }));
  }, []);

  // Get maximum transfer limit based on KYC level
  const getMaxTransferLimit = useCallback(() => {
    const defaultLimit = 1000;
    const wallet = wallets?.data?.[0];
    if (!wallet) return defaultLimit;

    switch (wallet.compliance_status) {
      case 'compliant':
        return 10000;
      case 'pending_review':
        return 5000;
      default:
        return defaultLimit;
    }
  }, [wallets]);

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-6">Transfer Money</h1>
        
        <div className="bg-card rounded-lg shadow-sm p-6">
          <TransferForm
            onSuccess={handleTransferSuccess}
            onError={handleTransferError}
            defaultValues={{ currency: initialCurrency }}
            complianceLevel={2}
            maxTransferLimit={getMaxTransferLimit()}
            onValidationStart={handleValidationStart}
            onValidationComplete={handleValidationComplete}
          />
        </div>

        {notification.show && (
          <Notification
            variant={notification.variant}
            message={notification.message}
            duration={notification.timeout}
            onClose={() => setNotification(prev => ({ ...prev, show: false }))}
            position="top-right"
            preserveOnRouteChange={true}
          />
        )}

        {transferState.error && (
          <div className="mt-4 p-4 bg-error-50 text-error-700 rounded-md" role="alert">
            <p className="text-sm font-medium">{transferState.error}</p>
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default Transfer;