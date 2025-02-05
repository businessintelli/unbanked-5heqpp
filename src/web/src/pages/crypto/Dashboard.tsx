import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ErrorBoundary } from 'react-error-boundary'; // ^4.0.11
import { useVirtualizer } from '@tanstack/react-virtual'; // ^3.0.0
import { useMediaQuery } from '@react-hook/media-query'; // ^1.1.1
import { cn } from 'class-variance-authority'; // ^0.7.0

import WalletCard from '../../components/crypto/WalletCard';
import PriceChart from '../../components/crypto/PriceChart';
import TransactionList from '../../components/crypto/TransactionList';
import { useCrypto } from '../../hooks/useCrypto';
import type { CryptoCurrency } from '../../types/crypto';

// Constants for component configuration
const TIMEFRAMES = ['1H', '24H', '7D', '30D', '1Y'] as const;
const ITEMS_PER_PAGE = 10;
const WEBSOCKET_RETRY_ATTEMPTS = 5;
const PRICE_UPDATE_DEBOUNCE = 500;

const RESPONSIVE_BREAKPOINTS = {
  mobile: '640px',
  tablet: '768px',
  desktop: '1024px'
} as const;

const CryptoDashboard: React.FC = () => {
  // State management
  const [selectedTimeframe, setSelectedTimeframe] = useState<typeof TIMEFRAMES[number]>('24H');
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<Error | null>(null);

  // Custom hooks
  const {
    wallets,
    transactions,
    pendingTransactions,
    prices,
    metrics,
    isLoading,
    error: cryptoError
  } = useCrypto();

  // Media queries for responsive layout
  const isDesktop = useMediaQuery(`(min-width: ${RESPONSIVE_BREAKPOINTS.desktop})`);
  const isTablet = useMediaQuery(`(min-width: ${RESPONSIVE_BREAKPOINTS.tablet})`);

  // Memoized transaction list with pagination
  const paginatedTransactions = useMemo(() => {
    const allTransactions = [...pendingTransactions, ...transactions];
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return allTransactions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [transactions, pendingTransactions, currentPage]);

  // Handle timeframe changes with error boundary
  const handleTimeframeChange = useCallback((timeframe: typeof TIMEFRAMES[number]) => {
    try {
      setSelectedTimeframe(timeframe);
      // Announce timeframe change to screen readers
      const announcement = `Chart timeframe changed to ${timeframe}`;
      const ariaLive = document.getElementById('chart-announcer');
      if (ariaLive) {
        ariaLive.textContent = announcement;
      }
    } catch (err) {
      setError(err as Error);
    }
  }, []);

  // Handle pagination with virtualization
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    // Announce page change to screen readers
    const announcement = `Showing page ${page} of transactions`;
    const ariaLive = document.getElementById('transaction-announcer');
    if (ariaLive) {
      ariaLive.textContent = announcement;
    }
  }, []);

  // Error handler for child components
  const handleComponentError = useCallback((error: Error) => {
    setError(error);
    console.error('Component error:', error);
  }, []);

  // Render error state
  if (error || cryptoError) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg" role="alert">
        <h2 className="text-lg font-semibold text-red-800 dark:text-red-200">
          Error Loading Dashboard
        </h2>
        <p className="mt-2 text-red-600 dark:text-red-300">
          {error?.message || cryptoError?.message}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-red-100 text-red-800 rounded-md hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <ErrorBoundary
      FallbackComponent={({ error }) => (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <p className="text-red-600 dark:text-red-300">{error.message}</p>
        </div>
      )}
      onError={handleComponentError}
    >
      <div className="space-y-6 p-4 md:p-6">
        {/* Accessibility announcements */}
        <div className="sr-only" role="status" id="chart-announcer" aria-live="polite" />
        <div className="sr-only" role="status" id="transaction-announcer" aria-live="polite" />

        {/* Wallet cards grid */}
        <section aria-labelledby="wallets-heading">
          <h2 id="wallets-heading" className="text-2xl font-bold mb-4">
            My Wallets
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {wallets.map((wallet) => (
              <WalletCard
                key={wallet.id}
                wallet={wallet}
                onError={handleComponentError}
                className="h-full"
              />
            ))}
          </div>
        </section>

        {/* Price chart section */}
        <section aria-labelledby="price-chart-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="price-chart-heading" className="text-2xl font-bold">
              Price Chart
            </h2>
            <div className="flex gap-2">
              {TIMEFRAMES.map((timeframe) => (
                <button
                  key={timeframe}
                  onClick={() => handleTimeframeChange(timeframe)}
                  className={cn(
                    'px-3 py-1 rounded-md text-sm font-medium',
                    selectedTimeframe === timeframe
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
                  )}
                  aria-pressed={selectedTimeframe === timeframe}
                >
                  {timeframe}
                </button>
              ))}
            </div>
          </div>
          <PriceChart
            currency={wallets[0]?.currency as CryptoCurrency}
            timeframe={selectedTimeframe}
            showVolume={isTablet}
            showIndicators={isDesktop}
            className="h-[400px]"
          />
        </section>

        {/* Transaction history section */}
        <section aria-labelledby="transactions-heading">
          <h2 id="transactions-heading" className="text-2xl font-bold mb-4">
            Transaction History
          </h2>
          <TransactionList
            transactions={paginatedTransactions}
            isLoading={isLoading}
            pagination={{
              page: currentPage,
              limit: ITEMS_PER_PAGE,
              total: transactions.length + pendingTransactions.length
            }}
            onPageChange={handlePageChange}
            onSort={(column, direction) => {
              console.log('Sorting:', column, direction);
              // Implement sorting logic here
            }}
            className="rounded-lg border border-gray-200 dark:border-gray-700"
          />
        </section>

        {/* Performance metrics */}
        {metrics && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Last updated: {new Date(metrics.lastUpdate).toLocaleString()}
            {' | '}
            Price latency: {metrics.priceLatency}ms
            {' | '}
            Transactions: {metrics.transactionCount}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default CryptoDashboard;