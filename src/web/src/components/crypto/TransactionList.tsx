import React, { useMemo, useCallback } from 'react';
import { cn } from 'class-variance-authority'; // ^0.7.0
import { Table, type Column } from '../common/Table';
import type { CryptoTransaction, CryptoTransactionType, CryptoCurrency, TransactionStatus } from '../../types/crypto';
import { formatTransactionDate } from '../../utils/date';
import { formatCryptoCurrency } from '../../utils/currency';

interface TransactionListProps {
  transactions: CryptoTransaction[];
  isLoading: boolean;
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
  onPageChange: (page: number) => void;
  onSort: (column: string, direction: 'asc' | 'desc') => void;
  className?: string;
}

const getStatusColor = (status: TransactionStatus): string => {
  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
  };

  return cn(
    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
    statusColors[status]
  );
};

const getTransactionTypeIcon = (type: CryptoTransactionType): string => {
  const typeIcons = {
    [CryptoTransactionType.DEPOSIT]: '↓',
    [CryptoTransactionType.WITHDRAWAL]: '↑',
    [CryptoTransactionType.EXCHANGE]: '↔'
  };

  return typeIcons[type];
};

export const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  isLoading,
  pagination,
  onPageChange,
  onSort,
  className
}) => {
  const renderAmount = useCallback((amount: string, currency: CryptoCurrency, type: CryptoTransactionType) => {
    const formattedAmount = formatCryptoCurrency(amount, currency);
    const icon = getTransactionTypeIcon(type);
    const isDeposit = type === CryptoTransactionType.DEPOSIT;

    return (
      <div 
        className={cn(
          'flex items-center space-x-1',
          isDeposit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        )}
        role="text"
        aria-label={`${type.toLowerCase()} amount: ${formattedAmount}`}
      >
        <span aria-hidden="true">{icon}</span>
        <span>{formattedAmount}</span>
      </div>
    );
  }, []);

  const renderStatus = useCallback((status: TransactionStatus) => {
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    return (
      <span 
        className={getStatusColor(status)}
        role="status"
        aria-label={`Transaction status: ${statusLabel}`}
      >
        {statusLabel}
      </span>
    );
  }, []);

  const columns = useMemo<Column<CryptoTransaction>[]>(() => [
    {
      id: 'date',
      header: 'Date',
      accessor: 'created_at',
      sortable: true,
      minWidth: '150px',
      render: (value) => formatTransactionDate(value),
      ariaLabel: 'Sort by date'
    },
    {
      id: 'type',
      header: 'Type',
      accessor: 'type',
      sortable: true,
      minWidth: '100px',
      render: (value) => value.toLowerCase(),
      ariaLabel: 'Sort by transaction type'
    },
    {
      id: 'amount',
      header: 'Amount',
      accessor: 'amount',
      sortable: true,
      minWidth: '150px',
      render: (value, row) => renderAmount(value, row.currency, row.type),
      ariaLabel: 'Sort by amount'
    },
    {
      id: 'status',
      header: 'Status',
      accessor: 'status',
      sortable: true,
      minWidth: '120px',
      render: (value) => renderStatus(value),
      ariaLabel: 'Sort by status'
    },
    {
      id: 'txHash',
      header: 'Transaction Hash',
      accessor: 'tx_hash',
      minWidth: '200px',
      render: (value) => (
        <span 
          className="font-mono text-sm truncate"
          title={value}
          aria-label={`Transaction hash: ${value}`}
        >
          {value.slice(0, 8)}...{value.slice(-8)}
        </span>
      )
    }
  ], [renderAmount, renderStatus]);

  return (
    <div 
      className={cn('rounded-lg border border-gray-200 dark:border-gray-700', className)}
      role="region"
      aria-label="Cryptocurrency transactions"
    >
      <Table
        columns={columns}
        data={transactions}
        isLoading={isLoading}
        pagination={pagination}
        stickyHeader
        virtualization={{
          enabled: true,
          rowHeight: 56
        }}
        accessibility={{
          announceChanges: true,
          labelId: 'crypto-transactions-table'
        }}
        onPageChange={onPageChange}
        onSort={([{ id, direction }]) => onSort(id, direction)}
      />
    </div>
  );
};

export default TransactionList;