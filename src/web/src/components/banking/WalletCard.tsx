import React, { useCallback, useMemo } from 'react';
import { cn } from 'class-variance-authority'; // ^0.7.0
import { Wallet } from '../../types/banking';
import { Card, cardVariants } from '../common/Card';
import { formatFiatCurrency } from '../../utils/currency';
import { useErrorBoundary } from 'react-error-boundary'; // ^4.0.11
import {
  Wallet as WalletIcon,
  CreditCard as CardIcon,
  Building2 as BusinessIcon,
  AlertCircle,
  ArrowUpRight,
  ArrowDownLeft,
  Loader2
} from 'lucide-react'; // ^0.294.0

// Constants for component configuration
const WALLET_ICON_SIZE = 24;

const WALLET_TYPE_LABELS: Record<string, string> = {
  CHECKING: 'Checking Account',
  SAVINGS: 'Savings Account',
  BUSINESS: 'Business Account'
};

const COMPLIANCE_STATUS_LABELS: Record<string, string> = {
  compliant: 'Verified Account',
  pending_review: 'Verification Pending',
  non_compliant: 'Account Restricted'
};

// Component props interface
interface WalletCardProps {
  wallet: Wallet;
  onTransfer: (walletId: string) => Promise<void>;
  onDeposit: (walletId: string) => Promise<void>;
  className?: string;
  isLoading?: boolean;
  error?: Error | null;
}

// Helper function to get appropriate wallet icon
const getWalletIcon = (type: string) => {
  switch (type) {
    case 'CHECKING':
      return WalletIcon;
    case 'BUSINESS':
      return BusinessIcon;
    default:
      return CardIcon;
  }
};

// Main component with accessibility support
export const WalletCard: React.FC<WalletCardProps> = ({
  wallet,
  onTransfer,
  onDeposit,
  className,
  isLoading = false,
  error = null
}) => {
  const { showBoundary } = useErrorBoundary();

  // Memoized icon component
  const WalletTypeIcon = useMemo(() => getWalletIcon(wallet.type), [wallet.type]);

  // Memoized formatted balance
  const formattedBalance = useMemo(() => {
    try {
      return formatFiatCurrency(wallet.balance, wallet.currency);
    } catch (err) {
      showBoundary(err);
      return '---';
    }
  }, [wallet.balance, wallet.currency, showBoundary]);

  // Action handlers with error boundary
  const handleTransfer = useCallback(async () => {
    try {
      await onTransfer(wallet.id);
    } catch (err) {
      showBoundary(err);
    }
  }, [wallet.id, onTransfer, showBoundary]);

  const handleDeposit = useCallback(async () => {
    try {
      await onDeposit(wallet.id);
    } catch (err) {
      showBoundary(err);
    }
  }, [wallet.id, onDeposit, showBoundary]);

  // Render loading state
  if (isLoading) {
    return (
      <Card
        variant="elevated"
        className={cn(
          'min-h-[200px] flex items-center justify-center',
          className
        )}
        aria-busy="true"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="sr-only">Loading wallet information</span>
      </Card>
    );
  }

  // Render error state
  if (error) {
    return (
      <Card
        variant="flat"
        className={cn(
          'min-h-[200px] border-error bg-error/10',
          className
        )}
        role="alert"
        aria-errormessage={error.message}
      >
        <div className="flex items-center gap-2 text-error">
          <AlertCircle className="h-5 w-5" />
          <span>{error.message}</span>
        </div>
      </Card>
    );
  }

  return (
    <Card
      variant="elevated"
      className={cn(
        'p-6 transition-all hover:shadow-md',
        !wallet.active && 'opacity-75',
        className
      )}
      role="region"
      aria-label={`${WALLET_TYPE_LABELS[wallet.type]} Details`}
    >
      {/* Header Section */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <WalletTypeIcon
            className="text-primary"
            aria-hidden="true"
            size={WALLET_ICON_SIZE}
          />
          <div>
            <h3 className="text-lg font-semibold">
              {WALLET_TYPE_LABELS[wallet.type]}
            </h3>
            <p className="text-sm text-muted-foreground">
              {wallet.currency}
            </p>
          </div>
        </div>
        <div
          className={cn(
            'px-2 py-1 rounded-full text-xs font-medium',
            {
              'bg-success/10 text-success': wallet.compliance_status === 'compliant',
              'bg-warning/10 text-warning': wallet.compliance_status === 'pending_review',
              'bg-error/10 text-error': wallet.compliance_status === 'non_compliant'
            }
          )}
          role="status"
        >
          {COMPLIANCE_STATUS_LABELS[wallet.compliance_status]}
        </div>
      </div>

      {/* Balance Section */}
      <div className="mb-6">
        <p className="text-sm text-muted-foreground mb-1">Available Balance</p>
        <p className="text-3xl font-bold tabular-nums">
          {formattedBalance}
        </p>
      </div>

      {/* Actions Section */}
      <div className="flex gap-3">
        <button
          onClick={handleTransfer}
          disabled={!wallet.active}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-md',
            'bg-primary text-primary-foreground',
            'hover:bg-primary/90 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
          )}
          aria-label={`Transfer from ${WALLET_TYPE_LABELS[wallet.type]}`}
        >
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          <span>Transfer</span>
        </button>
        <button
          onClick={handleDeposit}
          disabled={!wallet.active}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-md',
            'bg-secondary text-secondary-foreground',
            'hover:bg-secondary/90 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary'
          )}
          aria-label={`Deposit to ${WALLET_TYPE_LABELS[wallet.type]}`}
        >
          <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
          <span>Deposit</span>
        </button>
      </div>
    </Card>
  );
};

export default WalletCard;