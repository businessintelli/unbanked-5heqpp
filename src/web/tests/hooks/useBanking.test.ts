import { renderHook, act, waitFor } from '@testing-library/react-hooks'; // v8.0.1
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; // v4.36.1
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest'; // v0.34.6
import { useBanking } from '../../src/hooks/useBanking';
import { api } from '../../src/lib/api';
import type {
  Wallet,
  Transaction,
  TransactionType,
  ComplianceStatus,
  ComplianceCheckResult,
  AuditTrail
} from '../../src/types/banking';

// Mock API client
vi.mock('../../src/lib/api');

// Test constants
const TEST_USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const TEST_WALLET_ID = '123e4567-e89b-12d3-a456-426614174001';
const TEST_TRANSACTION_ID = '123e4567-e89b-12d3-a456-426614174002';
const TEST_PLAID_TOKEN = 'link-sandbox-12345';

// Test data generators
const mockWallet = (overrides?: Partial<Wallet>): Wallet => ({
  id: TEST_WALLET_ID,
  user_id: TEST_USER_ID,
  currency: 'USD',
  balance: 1000.00,
  active: true,
  plaid_access_token: null,
  compliance_status: 'compliant',
  last_audit_date: new Date(),
  daily_limit: 10000,
  monthly_limit: 50000,
  ...overrides
});

const mockTransaction = (overrides?: Partial<Transaction>): Transaction => ({
  id: TEST_TRANSACTION_ID,
  wallet_id: TEST_WALLET_ID,
  type: 'deposit',
  amount: 100.00,
  currency: 'USD',
  status: 'completed',
  metadata: {
    reference: 'TEST-REF-001',
    description: 'Test transaction'
  },
  created_at: new Date(),
  compliance_check_result: {
    passed: true,
    risk_level: 'low',
    checks_performed: ['kyc', 'aml'],
    review_required: false
  },
  audit_trail: [{
    timestamp: new Date(),
    action: 'created',
    actor: TEST_USER_ID,
    details: {},
    ip_address: '127.0.0.1'
  }],
  ...overrides
});

// Test setup helper
const setupTest = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        cacheTime: 0,
        staleTime: 0
      }
    }
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  return {
    queryClient,
    wrapper
  };
};

describe('useBanking Hook', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Wallet Management', () => {
    it('should fetch wallets with compliance status', async () => {
      const { wrapper } = setupTest();
      const mockWallets = [mockWallet(), mockWallet({ id: 'wallet-2' })];
      
      vi.mocked(api.get).mockResolvedValueOnce({ data: mockWallets });

      const { result } = renderHook(() => useBanking(), { wrapper });

      await waitFor(() => {
        expect(result.current.wallets.data).toHaveLength(2);
        expect(result.current.wallets.data![0].compliance_status).toBe('compliant');
      });

      expect(api.get).toHaveBeenCalledWith('/banking/wallets');
    });

    it('should create wallet with compliance checks', async () => {
      const { wrapper } = setupTest();
      const newWallet = mockWallet();
      
      vi.mocked(api.post).mockResolvedValueOnce({ data: newWallet });

      const { result } = renderHook(() => useBanking(), { wrapper });

      await act(async () => {
        await result.current.createWallet({ currency: 'USD' });
      });

      expect(api.post).toHaveBeenCalledWith('/banking/wallets', { currency: 'USD' });
    });

    it('should handle wallet creation errors', async () => {
      const { wrapper } = setupTest();
      
      vi.mocked(api.post).mockRejectedValueOnce(new Error('Compliance check failed'));

      const { result } = renderHook(() => useBanking(), { wrapper });

      await act(async () => {
        await expect(
          result.current.createWallet({ currency: 'USD' })
        ).rejects.toThrow('Compliance check failed');
      });
    });
  });

  describe('Transaction Management', () => {
    it('should fetch paginated transactions with audit trail', async () => {
      const { wrapper } = setupTest();
      const mockTransactions = [mockTransaction(), mockTransaction()];
      
      vi.mocked(api.get).mockResolvedValueOnce({ data: mockTransactions });

      const { result } = renderHook(() => useBanking(), { wrapper });
      const transactions = result.current.useTransactions(TEST_WALLET_ID);

      await waitFor(() => {
        expect(transactions.data?.pages[0]).toHaveLength(2);
        expect(transactions.data?.pages[0][0].audit_trail).toBeDefined();
      });
    });

    it('should create transaction with compliance check', async () => {
      const { wrapper } = setupTest();
      const newTransaction = mockTransaction();
      
      vi.mocked(api.post).mockResolvedValueOnce({ data: newTransaction });

      const { result } = renderHook(() => useBanking(), { wrapper });

      await act(async () => {
        await result.current.createTransaction.mutate({
          walletId: TEST_WALLET_ID,
          type: 'deposit',
          amount: 100,
          currency: 'USD',
          metadata: { description: 'Test deposit' }
        });
      });

      expect(api.post).toHaveBeenCalledWith(
        `/banking/wallets/${TEST_WALLET_ID}/transactions`,
        expect.any(Object)
      );
    });

    it('should monitor transaction status with retries', async () => {
      const { wrapper } = setupTest();
      const pendingTransaction = mockTransaction({ status: 'pending' });
      const completedTransaction = mockTransaction({ status: 'completed' });
      
      vi.mocked(api.get)
        .mockResolvedValueOnce({ data: pendingTransaction })
        .mockResolvedValueOnce({ data: completedTransaction });

      const { result } = renderHook(() => useBanking(), { wrapper });
      const onUpdate = vi.fn();

      await act(async () => {
        await result.current.monitorTransaction(TEST_TRANSACTION_ID, onUpdate);
      });

      expect(onUpdate).toHaveBeenCalledTimes(2);
      expect(onUpdate).toHaveBeenLastCalledWith(completedTransaction);
    });
  });

  describe('Plaid Integration', () => {
    it('should initiate bank account linking', async () => {
      const { wrapper } = setupTest();
      
      vi.mocked(api.post).mockResolvedValueOnce({
        data: { link_token: TEST_PLAID_TOKEN }
      });

      const { result } = renderHook(() => useBanking(), { wrapper });

      await act(async () => {
        await result.current.linkBankAccount(TEST_WALLET_ID);
      });

      expect(api.post).toHaveBeenCalledWith(
        '/banking/plaid/create-link-token',
        { wallet_id: TEST_WALLET_ID }
      );
    });
  });

  describe('Compliance and Audit', () => {
    it('should track compliance status changes', async () => {
      const { wrapper } = setupTest();
      const wallet = mockWallet({ compliance_status: 'pending_review' });
      
      vi.mocked(api.get).mockResolvedValueOnce({ data: [wallet] });

      const { result } = renderHook(() => useBanking(), { wrapper });

      await waitFor(() => {
        const status = result.current.getComplianceStatus(TEST_WALLET_ID);
        expect(status).toBe('pending_review');
      });
    });

    it('should retrieve transaction audit trail', async () => {
      const { wrapper } = setupTest();
      const auditTrail: AuditTrail[] = [{
        timestamp: new Date(),
        action: 'compliance_check',
        actor: TEST_USER_ID,
        details: { check_type: 'aml' },
        ip_address: '127.0.0.1'
      }];
      
      vi.mocked(api.get).mockResolvedValueOnce({ data: auditTrail });

      const { result } = renderHook(() => useBanking(), { wrapper });

      await act(async () => {
        const audit = await result.current.getTransactionAudit(TEST_TRANSACTION_ID);
        expect(audit).toHaveLength(1);
        expect(audit[0].action).toBe('compliance_check');
      });
    });
  });

  describe('Performance and Caching', () => {
    it('should cache wallet data within stale time', async () => {
      const { wrapper } = setupTest();
      const mockWallets = [mockWallet()];
      
      vi.mocked(api.get).mockResolvedValueOnce({ data: mockWallets });

      const { result, rerender } = renderHook(() => useBanking(), { wrapper });

      await waitFor(() => {
        expect(result.current.wallets.data).toBeDefined();
      });

      rerender();

      expect(api.get).toHaveBeenCalledTimes(1);
    });

    it('should invalidate cache on transaction creation', async () => {
      const { wrapper, queryClient } = setupTest();
      const newTransaction = mockTransaction();
      
      vi.mocked(api.post).mockResolvedValueOnce({ data: newTransaction });

      const { result } = renderHook(() => useBanking(), { wrapper });

      await act(async () => {
        await result.current.createTransaction.mutate({
          walletId: TEST_WALLET_ID,
          type: 'deposit',
          amount: 100,
          currency: 'USD',
          metadata: { description: 'Test deposit' }
        });
      });

      expect(queryClient.getQueryData(['transactions', TEST_WALLET_ID])).toBeNull();
    });
  });
});