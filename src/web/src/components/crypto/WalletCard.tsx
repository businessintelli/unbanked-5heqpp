import React, { memo, useEffect, useCallback } from 'react';
import { cn } from 'class-variance-authority'; // ^0.7.0
import { Bitcoin, Ethereum, CircleDollarSign, Copy, ExternalLink } from 'lucide-react'; // ^0.294.0
import { ErrorBoundary } from 'react-error-boundary'; // ^4.0.11

import { Card, cardVariants } from '../common/Card';
import type { CryptoWallet, CryptoCurrency } from '../../types/crypto';
import { useCrypto } from '../../hooks/useCrypto';
import { formatCryptoCurrency } from '../../utils/currency';

// Constants for component configuration
const CURRENCY_ICONS: Record<CryptoCurrency, React.FC> = {
  BTC: Bitcoin,
  ETH: Ethereum,
  USDC: CircleDollarSign,
  USDT: CircleDollarSign
};

const REFRESH_INTERVAL = 30000; // 30 seconds

const ERROR_MESSAGES = {
  LOAD_FAILED: 'Failed to load wallet data',
  UPDATE_FAILED: 'Failed to update price data',
  INVALID_ADDRESS: 'Invalid wallet address format'
} as const;

// Component props interface with accessibility properties
interface WalletCardProps {
  wallet: CryptoWallet;
  className?: string;
  ariaLabel?: string;
  onError?: (error: Error) => void;
}

// Helper function to format wallet address
const formatAddress = (address: string): string => {
  if (!address || address.length < 10) {
    throw new Error(ERROR_MESSAGES.INVALID_ADDRESS);
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Enhanced wallet card component with real-time updates
const WalletCardComponent: React.FC<WalletCardProps> = ({
  wallet,
  className,
  ariaLabel,
  onError
}) => {
  const {
    prices,
    error: cryptoError,
    subscribeToPrice,
    getBalance
  } = useCrypto();

  // Set up real-time price subscription
  useEffect(() => {
    const unsubscribe = subscribeToPrice(wallet.currency);
    const refreshInterval = setInterval(() => {
      getBalance(wallet.id).catch(error => {
        onError?.(new Error(ERROR_MESSAGES.UPDATE_FAILED));
      });
    }, REFRESH_INTERVAL);

    return () => {
      unsubscribe();
      clearInterval(refreshInterval);
    };
  }, [wallet.id, wallet.currency, subscribeToPrice, getBalance, onError]);

  // Handle copy address to clipboard
  const handleCopyAddress = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(wallet.address);
    } catch (error) {
      onError?.(error as Error);
    }
  }, [wallet.address, onError]);

  // Get currency icon component
  const CurrencyIcon = CURRENCY_ICONS[wallet.currency];

  // Format wallet data
  const formattedBalance = formatCryptoCurrency(wallet.balance, wallet.currency);
  const formattedAddress = formatAddress(wallet.address);
  const currentPrice = prices.find(p => p.currency === wallet.currency)?.price_usd;

  // Calculate USD value
  const usdValue = currentPrice 
    ? `$${(parseFloat(wallet.balance) * parseFloat(currentPrice)).toFixed(2)} USD`
    : 'Loading...';

  return (
    <Card
      variant="elevated"
      className={cn(
        'relative flex flex-col p-4 gap-3 transition-all duration-200',
        'hover:shadow-md dark:hover:shadow-dark-md',
        className
      )}
      role="region"
      aria-label={ariaLabel || `${wallet.currency} Wallet`}
    >
      {/* Header with currency icon and balance */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CurrencyIcon 
            className="w-6 h-6 text-primary" 
            aria-hidden="true"
          />
          <span className="font-semibold text-lg">
            {wallet.currency}
          </span>
        </div>
        <div 
          className="text-right"
          aria-live="polite"
        >
          <div className="font-bold text-xl">
            {formattedBalance}
          </div>
          <div className="text-sm text-muted-foreground">
            {usdValue}
          </div>
        </div>
      </div>

      {/* Wallet address with copy button */}
      <div className="flex items-center justify-between gap-2 bg-muted/50 rounded-md p-2">
        <code className="text-sm font-mono truncate">
          {formattedAddress}
        </code>
        <div className="flex gap-2">
          <button
            onClick={handleCopyAddress}
            className="p-1 hover:bg-muted rounded-md transition-colors"
            aria-label="Copy wallet address"
          >
            <Copy className="w-4 h-4" aria-hidden="true" />
          </button>
          <a
            href={`${wallet.network_config.explorer_url}/address/${wallet.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 hover:bg-muted rounded-md transition-colors"
            aria-label="View on blockchain explorer"
          >
            <ExternalLink className="w-4 h-4" aria-hidden="true" />
          </a>
        </div>
      </div>

      {/* Network information */}
      <div className="text-sm text-muted-foreground">
        <span>Network: </span>
        <span className="font-medium">
          {wallet.network_config.network_type}
        </span>
      </div>

      {/* Error message display */}
      {cryptoError && (
        <div 
          role="alert" 
          className="text-sm text-destructive mt-2"
        >
          {cryptoError.message}
        </div>
      )}
    </Card>
  );
};

// Wrap component with error boundary and memo
const WalletCard = memo((props: WalletCardProps) => (
  <ErrorBoundary
    fallback={<div>Error loading wallet</div>}
    onError={props.onError}
  >
    <WalletCardComponent {...props} />
  </ErrorBoundary>
));

// Set display name for dev tools
WalletCard.displayName = 'WalletCard';

export default WalletCard;