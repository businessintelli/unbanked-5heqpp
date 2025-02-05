import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDebounce } from 'use-debounce'; // v9.0.0
import TransactionList from '../../components/crypto/TransactionList';
import useCrypto from '../../hooks/useCrypto';
import type { CryptoTransaction, CryptoTransactionType, TransactionStatus, CryptoCurrency } from '../../types/crypto';
import { formatTransactionDate } from '../../utils/date';

// Enhanced interface for transaction filtering options
interface TransactionFilters {
  dateRange: { start: Date; end: Date };
  type: CryptoTransactionType[];
  status: TransactionStatus[];
  currency: CryptoCurrency[];
  amount: { min: number; max: number };
}

// Interface for multi-column sort configuration
interface SortConfig {
  column: string;
  direction: 'asc' | 'desc';
  priority: number;
}

const TransactionsPage: React.FC = () => {
  // State management with useCrypto hook
  const {
    transactions,
    pendingTransactions,
    isLoading,
    error,
    metrics
  } = useCrypto();

  // Local state management
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(25);
  const [filters, setFilters] = useState<TransactionFilters>({
    dateRange: {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
      end: new Date()
    },
    type: [],
    status: [],
    currency: [],
    amount: { min: 0, max: Infinity }
  });
  const [sortConfig, setSortConfig] = useState<SortConfig[]>([]);

  // Debounce filter changes for performance
  const [debouncedFilters] = useDebounce(filters, 300);

  // Memoized filtered and sorted transactions
  const filteredTransactions = useMemo(() => {
    let filtered = [...transactions, ...pendingTransactions];

    // Apply filters
    if (debouncedFilters.type.length > 0) {
      filtered = filtered.filter(t => debouncedFilters.type.includes(t.type));
    }
    if (debouncedFilters.status.length > 0) {
      filtered = filtered.filter(t => debouncedFilters.status.includes(t.status));
    }
    if (debouncedFilters.currency.length > 0) {
      filtered = filtered.filter(t => debouncedFilters.currency.includes(t.currency));
    }
    if (debouncedFilters.amount.min > 0 || debouncedFilters.amount.max < Infinity) {
      filtered = filtered.filter(t => {
        const amount = parseFloat(t.amount);
        return amount >= debouncedFilters.amount.min && amount <= debouncedFilters.amount.max;
      });
    }
    filtered = filtered.filter(t => {
      const date = new Date(t.created_at);
      return date >= debouncedFilters.dateRange.start && date <= debouncedFilters.dateRange.end;
    });

    // Apply sorting
    if (sortConfig.length > 0) {
      filtered.sort((a, b) => {
        for (const sort of sortConfig) {
          const aValue = sort.column === 'created_at' ? new Date(a[sort.column]).getTime() : a[sort.column];
          const bValue = sort.column === 'created_at' ? new Date(b[sort.column]).getTime() : b[sort.column];
          
          if (aValue !== bValue) {
            return sort.direction === 'asc' ? 
              (aValue < bValue ? -1 : 1) : 
              (aValue > bValue ? -1 : 1);
          }
        }
        return 0;
      });
    }

    return filtered;
  }, [transactions, pendingTransactions, debouncedFilters, sortConfig]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredTransactions.length / pageSize);
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, currentPage, pageSize]);

  // Handle page changes with optimistic updates
  const handlePageChange = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  }, [totalPages]);

  // Handle sort changes with multi-column support
  const handleSort = useCallback((column: string, direction: 'asc' | 'desc') => {
    setSortConfig(prev => {
      const newConfig = [...prev];
      const existingIndex = newConfig.findIndex(s => s.column === column);

      if (existingIndex >= 0) {
        if (direction === 'asc') {
          newConfig[existingIndex].direction = direction;
        } else {
          newConfig.splice(existingIndex, 1);
        }
      } else {
        newConfig.push({
          column,
          direction,
          priority: newConfig.length
        });
      }

      return newConfig;
    });
  }, []);

  // Handle filter changes with URL sync
  const handleFilterChange = useCallback((newFilters: Partial<TransactionFilters>) => {
    setFilters(prev => {
      const updated = { ...prev, ...newFilters };
      // Update URL with new filters
      const params = new URLSearchParams(window.location.search);
      Object.entries(updated).forEach(([key, value]) => {
        if (value !== undefined) {
          params.set(key, JSON.stringify(value));
        }
      });
      window.history.replaceState(null, '', `?${params.toString()}`);
      return updated;
    });
    setCurrentPage(1); // Reset to first page on filter change
  }, []);

  // Initialize filters from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlFilters: Partial<TransactionFilters> = {};
    
    params.forEach((value, key) => {
      try {
        urlFilters[key as keyof TransactionFilters] = JSON.parse(value);
      } catch (e) {
        console.error(`Error parsing URL parameter: ${key}`, e);
      }
    });

    if (Object.keys(urlFilters).length > 0) {
      setFilters(prev => ({ ...prev, ...urlFilters }));
    }
  }, []);

  // Error handling with accessibility announcements
  useEffect(() => {
    if (error) {
      const errorMessage = `Error loading transactions: ${error.message}`;
      const errorRegion = document.getElementById('error-announcer');
      if (errorRegion) {
        errorRegion.textContent = errorMessage;
      }
    }
  }, [error]);

  return (
    <div 
      className="container mx-auto px-4 py-8"
      role="main"
      aria-label="Cryptocurrency transactions"
    >
      {/* Error announcer for screen readers */}
      <div 
        id="error-announcer" 
        className="sr-only" 
        role="alert" 
        aria-live="polite"
      />

      {/* Metrics summary */}
      <div className="mb-6 text-sm text-gray-600 dark:text-gray-400">
        <p>
          Last updated: {formatTransactionDate(metrics.lastUpdate)}
          {metrics.transactionCount > 0 && ` • ${metrics.transactionCount} transactions processed`}
        </p>
      </div>

      {/* Transaction list with enhanced features */}
      <TransactionList
        transactions={paginatedTransactions}
        isLoading={isLoading}
        pagination={{
          page: currentPage,
          limit: pageSize,
          total: filteredTransactions.length
        }}
        onPageChange={handlePageChange}
        onSort={([{ id, direction }]) => handleSort(id, direction)}
        className="shadow-lg rounded-lg"
      />
    </div>
  );
};

export default TransactionsPage;