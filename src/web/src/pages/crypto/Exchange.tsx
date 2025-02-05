import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';

import ExchangeForm from '../../components/crypto/ExchangeForm';
import PriceChart from '../../components/crypto/PriceChart';
import { useCrypto } from '../../hooks/useCrypto';
import type { CryptoCurrency, CryptoTransaction } from '../../types/crypto';
import { formatCryptoCurrency } from '../../utils/currency';

// Chart timeframe options
const TIMEFRAMES = ['1H', '24H', '7D', '30D', '1Y'] as const;
type Timeframe = typeof TIMEFRAMES[number];

const Exchange: React.FC = () => {
  // State management
  const [selectedCurrency, setSelectedCurrency] = useState<CryptoCurrency>('BTC');
  const [timeframe, setTimeframe] = useState<Timeframe>('24H');
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastPrice, setLastPrice] = useState<number | null>(null);

  // Custom hooks
  const { prices, executeExchange, isLoading, subscribeToPrice } = useCrypto();

  // Subscribe to real-time price updates
  useEffect(() => {
    const unsubscribe = subscribeToPrice(selectedCurrency, (price) => {
      setLastPrice(parseFloat(price.price_usd));
    });

    return () => {
      unsubscribe();
    };
  }, [selectedCurrency, subscribeToPrice]);

  // Handle successful exchange transaction
  const handleExchangeSuccess = useCallback((transaction: CryptoTransaction) => {
    toast.success(
      `Exchange completed successfully: ${formatCryptoCurrency(
        transaction.amount,
        transaction.currency
      )}`,
      {
        description: `Transaction ID: ${transaction.id}`,
        duration: 5000,
      }
    );
    setIsSubmitting(false);
    setExchangeError(null);
  }, []);

  // Handle exchange transaction errors
  const handleExchangeError = useCallback((error: Error) => {
    const errorMessage = error.message || 'Failed to execute exchange';
    toast.error('Exchange failed', {
      description: errorMessage,
      duration: 5000,
    });
    setExchangeError(errorMessage);
    setIsSubmitting(false);
  }, []);

  // Handle exchange progress updates
  const handleExchangeProgress = useCallback((progress: number) => {
    if (progress === 100) {
      toast.success('Exchange processing completed', {
        description: 'Your transaction is being confirmed',
      });
    }
  }, []);

  // Memoized price data for the selected currency
  const currentPrice = useMemo(() => {
    return prices.find((p) => p.currency === selectedCurrency);
  }, [prices, selectedCurrency]);

  // Price change percentage calculation
  const priceChangePercentage = useMemo(() => {
    if (!currentPrice) return null;
    return parseFloat(currentPrice.change_24h);
  }, [currentPrice]);

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Price Chart Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">
              {selectedCurrency} Price Chart
            </h2>
            <div className="flex space-x-2">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    timeframe === tf
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          <PriceChart
            currency={selectedCurrency}
            timeframe={timeframe}
            showVolume
            showIndicators
            className="h-[400px]"
          />

          {currentPrice && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Current Price
                  </p>
                  <p className="text-lg font-semibold">
                    ${parseFloat(currentPrice.price_usd).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    24h Change
                  </p>
                  <p
                    className={`text-lg font-semibold ${
                      priceChangePercentage && priceChangePercentage >= 0
                        ? 'text-green-500'
                        : 'text-red-500'
                    }`}
                  >
                    {priceChangePercentage
                      ? `${priceChangePercentage.toFixed(2)}%`
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    24h Volume
                  </p>
                  <p className="text-lg font-semibold">
                    ${parseFloat(currentPrice.volume_24h).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Market Cap
                  </p>
                  <p className="text-lg font-semibold">
                    ${parseFloat(currentPrice.market_cap).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Exchange Form Section */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">Exchange Cryptocurrency</h2>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <ExchangeForm
              onSuccess={handleExchangeSuccess}
              onError={handleExchangeError}
              onProgress={handleExchangeProgress}
            />
            {exchangeError && (
              <p className="mt-4 text-sm text-red-500">{exchangeError}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Exchange;