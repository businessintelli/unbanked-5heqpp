import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from 'class-variance-authority'; // ^0.7.0
import { useTranslation } from 'react-i18next'; // ^13.0.0
import { useAnalytics } from '@amplitude/analytics-react'; // ^1.0.0
import { ErrorBoundary } from 'react-error-boundary'; // ^4.0.0
import { Skeleton } from '@mui/material'; // ^5.0.0

import WalletCard from '../../components/banking/WalletCard';
import CryptoWalletCard from '../../components/crypto/WalletCard';
import TransactionList from '../../components/banking/TransactionList';
import { useBanking } from '../../hooks/useBanking';
import { useCrypto } from '../../hooks/useCrypto';

// Constants for component configuration
const RECENT_TRANSACTIONS_LIMIT = 20;
const WALLETS_PER_ROW = { sm: 1, md: 2, lg: 3, xl: 4 };
const REFRESH_INTERVAL = 30000;
const ERROR_RETRY_COUNT = 3;

interface OverviewProps {
  className?: string;
}

const Overview: React.FC<OverviewProps> = ({ className }) => {
  const { t } = useTranslation();
  const { track } = useAnalytics();
  const transactionListRef = useRef<HTMLDivElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Banking hook with error handling
  const {
    wallets: { data: bankingWallets, isLoading: bankingLoading, error: bankingError },
    createWallet,
    refreshWallets
  } = useBanking();

  // Crypto hook with WebSocket updates
  const {
    wallets: cryptoWallets,
    prices,
    isLoading: cryptoLoading,
    error: cryptoError
  } = useCrypto();

  // Handle transfer action with optimistic updates
  const handleTransfer = useCallback(async (walletId: string, transferData: any) => {
    try {
      track('transfer_initiated', { walletId });
      // Optimistic update logic here
      await refreshWallets();
    } catch (error) {
      console.error('Transfer failed:', error);
      throw error;
    }
  }, [refreshWallets, track]);

  // Periodic refresh of wallet data
  useEffect(() => {
    const refreshTimer = setInterval(async () => {
      setIsRefreshing(true);
      try {
        await refreshWallets();
      } finally {
        setIsRefreshing(false);
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(refreshTimer);
  }, [refreshWallets]);

  // Error fallback component
  const ErrorFallback = ({ error, resetErrorBoundary }: any) => (
    <div 
      className="p-4 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800"
      role="alert"
    >
      <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">
        {t('error.title')}
      </h3>
      <p className="mt-2 text-sm text-red-700 dark:text-red-300">
        {error.message}
      </p>
      <button
        onClick={resetErrorBoundary}
        className="mt-4 px-4 py-2 text-sm font-medium text-red-800 dark:text-red-200 bg-red-100 dark:bg-red-900/20 rounded-md hover:bg-red-200 dark:hover:bg-red-900/40"
      >
        {t('error.retry')}
      </button>
    </div>
  );

  return (
    <div className={cn('space-y-8', className)}>
      {/* Banking Wallets Section */}
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <section aria-labelledby="banking-wallets-heading">
          <h2 
            id="banking-wallets-heading" 
            className="text-2xl font-semibold mb-4"
          >
            {t('dashboard.bankingWallets')}
          </h2>
          {bankingLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton 
                  key={i}
                  variant="rectangular"
                  height={200}
                  className="rounded-lg"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {bankingWallets?.map(wallet => (
                <WalletCard
                  key={wallet.id}
                  wallet={wallet}
                  onTransfer={handleTransfer}
                  onDeposit={() => {}}
                  isLoading={isRefreshing}
                  error={bankingError}
                />
              ))}
            </div>
          )}
        </section>
      </ErrorBoundary>

      {/* Crypto Wallets Section */}
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <section aria-labelledby="crypto-wallets-heading">
          <h2 
            id="crypto-wallets-heading" 
            className="text-2xl font-semibold mb-4"
          >
            {t('dashboard.cryptoWallets')}
          </h2>
          {cryptoLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton 
                  key={i}
                  variant="rectangular"
                  height={200}
                  className="rounded-lg"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {cryptoWallets?.map(wallet => (
                <CryptoWalletCard
                  key={wallet.id}
                  wallet={wallet}
                  onError={(error) => {
                    track('crypto_wallet_error', { error: error.message });
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </ErrorBoundary>

      {/* Recent Transactions Section */}
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <section 
          ref={transactionListRef}
          aria-labelledby="recent-transactions-heading"
        >
          <h2 
            id="recent-transactions-heading" 
            className="text-2xl font-semibold mb-4"
          >
            {t('dashboard.recentTransactions')}
          </h2>
          {bankingWallets?.[0] && (
            <TransactionList
              walletId={bankingWallets[0].id}
              enableRealtime
              retryAttempts={ERROR_RETRY_COUNT}
              className="rounded-lg border border-gray-200 dark:border-gray-800"
            />
          )}
        </section>
      </ErrorBoundary>
    </div>
  );
};

Overview.displayName = 'Overview';

export default React.memo(Overview);