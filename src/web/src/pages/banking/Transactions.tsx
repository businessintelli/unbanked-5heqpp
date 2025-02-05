import React, { memo, useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom'; // ^6.16.0
import { useQueryClient } from 'react-query'; // ^4.0.0
import { ErrorBoundary } from 'react-error-boundary'; // ^4.0.11

import TransactionList, { 
  TransactionListProps, 
  TransactionSortOptions 
} from '../../components/banking/TransactionList';
import Card, { cardVariants } from '../../components/common/Card';
import { useBanking } from '../../hooks/useBanking';
import { formatFiatCurrency } from '../../utils/currency';
import type { Transaction, Wallet } from '../../types/banking';

// Constants for component configuration
const PAGE_TITLE = 'Transaction History';
const RETRY_ATTEMPTS = 3;
const UPDATE_INTERVAL = 30000; // 30 seconds
const CACHE_TIME = 300000; // 5 minutes

/**
 * Enhanced banking transactions page component with real-time updates
 * and accessibility features
 */
const TransactionsPage: React.FC = memo(() => {
  // Get wallet ID from URL parameters
  const { walletId } = useParams<{ walletId: string }>();
  const queryClient = useQueryClient();

  // State for real-time updates and error handling
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Initialize banking hook with real-time updates
  const { 
    wallets: { data: wallets },
    useTransactions,
    monitorTransaction
  } = useBanking();

  // Get current wallet data
  const currentWallet = wallets?.find(w => w.id === walletId);

  // Initialize transaction query with pagination and caching
  const {
    data: transactionsData,
    isLoading,
    hasNextPage,
    fetchNextPage,
    refetch
  } = useTransactions(walletId || '');

  // Handle real-time transaction updates
  const handleTransactionUpdate = useCallback((updatedTransaction: Transaction) => {
    queryClient.setQueryData(
      ['transactions', walletId],
      (oldData: any) => {
        if (!oldData?.pages) return oldData;
        
        return {
          ...oldData,
          pages: oldData.pages.map((page: Transaction[]) =>
            page.map(tx => 
              tx.id === updatedTransaction.id ? updatedTransaction : tx
            )
          )
        };
      }
    );
  }, [walletId, queryClient]);

  // Set up WebSocket connection for real-time updates
  useEffect(() => {
    if (!walletId) return;

    const ws = new WebSocket(`${import.meta.env.VITE_WS_URL}/transactions/${walletId}`);
    
    ws.onmessage = (event) => {
      const transaction = JSON.parse(event.data);
      handleTransactionUpdate(transaction);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError(new Error('Failed to connect to real-time updates'));
    };

    return () => {
      ws.close();
    };
  }, [walletId, handleTransactionUpdate]);

  // Periodic refetch for data consistency
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, [refetch]);

  // Error retry handler
  const handleError = useCallback((error: Error) => {
    setError(error);
    if (retryCount < RETRY_ATTEMPTS) {
      setRetryCount(prev => prev + 1);
      setTimeout(() => {
        refetch();
      }, 1000 * (retryCount + 1));
    }
  }, [retryCount, refetch]);

  // Handle transaction sorting
  const handleSort = useCallback((sortOptions: TransactionSortOptions) => {
    queryClient.setQueryData(['transactions', walletId], (oldData: any) => ({
      ...oldData,
      pages: oldData.pages.map((page: Transaction[]) =>
        [...page].sort((a, b) => {
          const modifier = sortOptions.direction === 'asc' ? 1 : -1;
          return modifier * (a[sortOptions.field] > b[sortOptions.field] ? 1 : -1);
        })
      )
    }));
  }, [walletId, queryClient]);

  if (!walletId) {
    return (
      <div role="alert" className="p-4 text-red-600">
        No wallet ID provided
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <div role="alert" className="p-4 text-red-600">
          Something went wrong. Please try again later.
        </div>
      }
      onError={handleError}
      resetKeys={[walletId]}
    >
      <div className="space-y-6">
        {/* Page header with wallet information */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold" id="page-title">
            {PAGE_TITLE}
          </h1>
          {currentWallet && (
            <div className="text-right">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Available Balance
              </div>
              <div className="text-xl font-medium">
                {formatFiatCurrency(
                  currentWallet.balance,
                  currentWallet.currency
                )}
              </div>
            </div>
          )}
        </div>

        {/* Main transaction list card */}
        <Card
          variant="default"
          padding="md"
          elevation={1}
          className="overflow-hidden"
          aria-labelledby="page-title"
        >
          <TransactionList
            walletId={walletId}
            enableRealtime={true}
            retryAttempts={RETRY_ATTEMPTS}
            onTransactionSelect={(transaction) => {
              // Monitor selected transaction for updates
              monitorTransaction(transaction.id, handleTransactionUpdate);
            }}
            className="min-h-[500px]"
          />
        </Card>

        {/* Error display */}
        {error && (
          <div
            role="alert"
            className="p-4 text-red-600 bg-red-50 rounded-md"
            aria-live="polite"
          >
            {error.message}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
});

TransactionsPage.displayName = 'TransactionsPage';

export default TransactionsPage;