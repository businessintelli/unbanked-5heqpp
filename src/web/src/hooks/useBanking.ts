import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'; // v4.36.1
import { usePlaidLink } from 'react-plaid-link'; // v3.5.0
import { api } from '../lib/api';
import type {
  Wallet,
  Transaction,
  TransactionType,
  Currency,
  ComplianceStatus,
  ComplianceCheckResult,
  AuditTrail,
  TransferDetails
} from '../types/banking';

// Query keys for cache management
const WALLET_QUERY_KEY = 'wallets';
const TRANSACTION_QUERY_KEY = 'transactions';
const COMPLIANCE_CHECK_INTERVAL = 60000; // 1 minute
const TRANSACTION_RETRY_LIMIT = 3;
const CACHE_STALE_TIME = 30000; // 30 seconds

/**
 * Enhanced banking hook providing comprehensive financial functionality
 * with security, compliance tracking, and audit trails
 */
export function useBanking() {
  const queryClient = useQueryClient();

  // Wallet Management with Compliance Tracking
  const {
    data: wallets,
    isLoading: walletsLoading,
    error: walletsError
  } = useQuery<Wallet[]>(
    [WALLET_QUERY_KEY],
    async () => {
      const response = await api.get<Wallet[]>('/banking/wallets');
      return response.data;
    },
    {
      staleTime: CACHE_STALE_TIME,
      refetchInterval: COMPLIANCE_CHECK_INTERVAL,
      select: (data) => data.filter(wallet => wallet.active)
    }
  );

  // Create Wallet with Compliance Checks
  const createWallet = useMutation<
    Wallet,
    Error,
    { currency: Currency }
  >({
    mutationFn: async ({ currency }) => {
      const response = await api.post<Wallet>('/banking/wallets', { currency });
      return response.data;
    },
    onSuccess: (newWallet) => {
      queryClient.setQueryData<Wallet[]>(
        [WALLET_QUERY_KEY],
        (old) => [...(old || []), newWallet]
      );
    }
  });

  // Transaction Management with Audit Trails
  const useTransactions = (walletId: string) => {
    return useInfiniteQuery<Transaction[]>(
      [TRANSACTION_QUERY_KEY, walletId],
      async ({ pageParam = 1 }) => {
        const response = await api.get<Transaction[]>(
          `/banking/wallets/${walletId}/transactions`,
          { params: { page: pageParam, limit: 20 } }
        );
        return response.data;
      },
      {
        getNextPageParam: (lastPage, pages) => {
          return lastPage.length === 20 ? pages.length + 1 : undefined;
        },
        staleTime: CACHE_STALE_TIME
      }
    );
  };

  // Create Transaction with Compliance Checks
  const createTransaction = useMutation<
    Transaction,
    Error,
    {
      walletId: string;
      type: TransactionType;
      amount: number;
      currency: Currency;
      metadata: Record<string, unknown>;
    }
  >({
    mutationFn: async ({ walletId, type, amount, currency, metadata }) => {
      const response = await api.post<Transaction>(
        `/banking/wallets/${walletId}/transactions`,
        { type, amount, currency, metadata }
      );
      return response.data;
    },
    onSuccess: (newTransaction) => {
      queryClient.invalidateQueries([TRANSACTION_QUERY_KEY, newTransaction.wallet_id]);
    }
  });

  // Monitor Transaction Status with Compliance Updates
  const monitorTransaction = async (
    transactionId: string,
    onUpdate: (status: Transaction) => void
  ): Promise<void> => {
    let attempts = 0;
    const checkStatus = async () => {
      const response = await api.get<Transaction>(`/banking/transactions/${transactionId}`);
      const transaction = response.data;
      
      onUpdate(transaction);
      
      if (
        transaction.status === 'pending' &&
        attempts < TRANSACTION_RETRY_LIMIT
      ) {
        attempts++;
        setTimeout(checkStatus, 2000);
      }
    };
    
    await checkStatus();
  };

  // Retry Failed Transaction with Audit Trail
  const retryTransaction = useMutation<
    Transaction,
    Error,
    { transactionId: string }
  >({
    mutationFn: async ({ transactionId }) => {
      const response = await api.post<Transaction>(
        `/banking/transactions/${transactionId}/retry`
      );
      return response.data;
    },
    onSuccess: (transaction) => {
      queryClient.invalidateQueries([TRANSACTION_QUERY_KEY, transaction.wallet_id]);
    }
  });

  // Plaid Integration for Bank Account Linking
  const { open: openPlaid, ready: plaidReady } = usePlaidLink({
    token: null, // Token is fetched when needed
    onSuccess: async (public_token, metadata) => {
      try {
        await api.post('/banking/plaid/exchange', {
          public_token,
          metadata,
          account_id: metadata.account_id
        });
        queryClient.invalidateQueries([WALLET_QUERY_KEY]);
      } catch (error) {
        console.error('Plaid link error:', error);
      }
    }
  });

  // Link Bank Account with Security Checks
  const linkBankAccount = async (walletId: string): Promise<void> => {
    try {
      const response = await api.post<{ link_token: string }>(
        '/banking/plaid/create-link-token',
        { wallet_id: walletId }
      );
      openPlaid({ token: response.data.link_token });
    } catch (error) {
      console.error('Failed to create Plaid link token:', error);
      throw error;
    }
  };

  return {
    // Wallet Management
    wallets: {
      data: wallets,
      isLoading: walletsLoading,
      error: walletsError
    },
    createWallet: createWallet.mutate,
    
    // Transaction Management
    useTransactions,
    createTransaction: createTransaction.mutate,
    monitorTransaction,
    retryTransaction: retryTransaction.mutate,
    
    // Bank Account Integration
    linkBankAccount,
    plaidReady,
    
    // Compliance and Status
    getComplianceStatus: (walletId: string): ComplianceStatus | undefined => {
      return wallets?.find(w => w.id === walletId)?.compliance_status;
    },
    
    // Audit Trail Access
    getTransactionAudit: async (transactionId: string): Promise<AuditTrail[]> => {
      const response = await api.get<AuditTrail[]>(
        `/banking/transactions/${transactionId}/audit`
      );
      return response.data;
    }
  };
}

// Export types for component usage
export type { Wallet, Transaction, TransactionType, Currency, ComplianceStatus };