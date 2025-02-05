import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from 'class-variance-authority'; // ^0.7.0
import { Table, type Column } from '../common/Table';
import type {
  Transaction,
  TransactionType,
  TransactionStatus,
  ComplianceResult
} from '../../types/banking';
import { useBanking } from '../../hooks/useBanking';
import { formatFiatCurrency } from '../../utils/currency';

// Constants for component configuration
const ITEMS_PER_PAGE = 10;
const DEFAULT_SORT_COLUMN = 'createdAt';
const DEFAULT_SORT_DIRECTION = 'desc';
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
const DEBOUNCE_DELAY_MS = 300;

interface TransactionListProps {
  walletId: string;
  className?: string;
  onTransactionSelect?: (transaction: Transaction) => void;
  enableRealtime?: boolean;
  retryAttempts?: number;
}

const getTransactionTypeLabel = (type: TransactionType): string => {
  const labels: Record<TransactionType, string> = {
    deposit: 'Deposit',
    withdrawal: 'Withdrawal',
    transfer: 'Transfer',
    exchange: 'Exchange',
    fee: 'Fee',
    refund: 'Refund'
  };
  return labels[type];
};

const getStatusColor = (status: TransactionStatus): string => {
  const colors: Record<TransactionStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100',
    completed: 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100',
    failed: 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100',
    cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100',
    blocked: 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100',
    under_review: 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100'
  };
  return colors[status];
};

const getComplianceIndicator = (result: ComplianceResult): JSX.Element => {
  const { passed, risk_level } = result;
  const colors = {
    low: 'bg-green-500',
    medium: 'bg-yellow-500',
    high: 'bg-red-500'
  };

  return (
    <div className="flex items-center space-x-2">
      <div
        className={cn(
          'h-2 w-2 rounded-full',
          passed ? colors[risk_level] : 'bg-red-500'
        )}
        aria-label={`Risk Level: ${risk_level}`}
      />
      <span className="text-sm">{risk_level.toUpperCase()}</span>
    </div>
  );
};

export const TransactionList: React.FC<TransactionListProps> = ({
  walletId,
  className,
  onTransactionSelect,
  enableRealtime = true,
  retryAttempts = MAX_RETRY_ATTEMPTS
}) => {
  const [page, setPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({
    column: DEFAULT_SORT_COLUMN,
    direction: DEFAULT_SORT_DIRECTION as 'asc' | 'desc'
  });

  const {
    useTransactions,
    monitorTransaction
  } = useBanking();

  const {
    data: transactionsData,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage
  } = useTransactions(walletId);

  const transactions = useMemo(() => {
    return transactionsData?.pages.flat() || [];
  }, [transactionsData]);

  // Column definitions with responsive priorities
  const columns = useMemo<Column<Transaction>[]>(() => [
    {
      id: 'createdAt',
      header: 'Date',
      accessor: 'created_at',
      sortable: true,
      priority: 1,
      render: (value) => new Date(value).toLocaleString(),
      ariaLabel: 'Transaction Date'
    },
    {
      id: 'type',
      header: 'Type',
      accessor: 'type',
      sortable: true,
      priority: 1,
      render: (value: TransactionType) => getTransactionTypeLabel(value),
      ariaLabel: 'Transaction Type'
    },
    {
      id: 'amount',
      header: 'Amount',
      accessor: 'amount',
      sortable: true,
      priority: 1,
      render: (value, row) => formatFiatCurrency(value, row.currency),
      ariaLabel: 'Transaction Amount'
    },
    {
      id: 'status',
      header: 'Status',
      accessor: 'status',
      sortable: true,
      priority: 2,
      render: (value: TransactionStatus) => (
        <span className={cn('px-2 py-1 rounded-full text-xs font-medium', getStatusColor(value))}>
          {value.replace('_', ' ').toUpperCase()}
        </span>
      ),
      ariaLabel: 'Transaction Status'
    },
    {
      id: 'compliance',
      header: 'Compliance',
      accessor: 'compliance_check_result',
      sortable: false,
      priority: 3,
      render: (value: ComplianceResult) => getComplianceIndicator(value),
      ariaLabel: 'Compliance Status'
    }
  ], []);

  // Handle real-time updates
  useEffect(() => {
    if (!enableRealtime) return;

    const subscription = useBanking().subscribeToTransactions(walletId, {
      onData: (newTransaction) => {
        // Update transaction in the list if it exists, otherwise add it
        const existingIndex = transactions.findIndex(t => t.id === newTransaction.id);
        if (existingIndex >= 0) {
          transactions[existingIndex] = newTransaction;
        } else {
          transactions.unshift(newTransaction);
        }
      },
      onError: (error) => {
        console.error('Real-time subscription error:', error);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [enableRealtime, walletId, transactions]);

  // Handle pagination
  const handlePageChange = useCallback(async (newPage: number) => {
    setPage(newPage);
    await fetchNextPage();
  }, [fetchNextPage]);

  // Handle sorting
  const handleSort = useCallback((column: string, direction: 'asc' | 'desc') => {
    setSortConfig({ column, direction });
  }, []);

  // Handle transaction selection
  const handleTransactionClick = useCallback((transaction: Transaction) => {
    if (onTransactionSelect) {
      onTransactionSelect(transaction);
    }
  }, [onTransactionSelect]);

  // Error handling with retry mechanism
  useEffect(() => {
    if (error && retryAttempts > 0) {
      const timer = setTimeout(() => {
        fetchNextPage();
      }, RETRY_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [error, retryAttempts, fetchNextPage]);

  return (
    <div className={cn('space-y-4', className)}>
      <Table
        columns={columns}
        data={transactions}
        isLoading={isLoading}
        pagination={{
          page,
          limit: ITEMS_PER_PAGE,
          total: transactions.length
        }}
        stickyHeader
        virtualization={{
          enabled: true,
          rowHeight: 48
        }}
        accessibility={{
          announceChanges: true,
          labelId: 'transactions-table'
        }}
        onPageChange={handlePageChange}
        onSort={handleSort}
      />
    </div>
  );
};

export default TransactionList;