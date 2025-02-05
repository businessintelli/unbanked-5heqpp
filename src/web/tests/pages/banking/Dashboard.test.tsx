import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe, toHaveNoViolations } from 'jest-axe';
import BankingDashboard from '../../src/pages/banking/Dashboard';
import { useBanking } from '../../src/hooks/useBanking';

// Mock the banking hook
vi.mock('../../src/hooks/useBanking');

// Mock data
const mockWallets = [
  {
    id: 'wallet-1',
    currency: 'USD',
    balance: 1000.00,
    type: 'CHECKING',
    isActive: true,
    compliance_status: 'compliant',
    last_audit_date: '2024-01-20T10:00:00Z'
  },
  {
    id: 'wallet-2',
    currency: 'EUR',
    balance: 850.00,
    type: 'SAVINGS',
    isActive: true,
    compliance_status: 'compliant',
    last_audit_date: '2024-01-20T10:00:00Z'
  }
];

const mockTransactions = [
  {
    id: 'tx-1',
    type: 'DEPOSIT',
    amount: 500.00,
    currency: 'USD',
    status: 'COMPLETED',
    timestamp: '2024-01-20T10:00:00Z',
    compliance_check_result: {
      passed: true,
      risk_level: 'low',
      checks_performed: ['kyc', 'limits'],
      review_required: false
    }
  },
  {
    id: 'tx-2',
    type: 'TRANSFER',
    amount: -100.00,
    currency: 'USD',
    status: 'PENDING',
    timestamp: '2024-01-19T15:30:00Z',
    compliance_check_result: {
      passed: true,
      risk_level: 'low',
      checks_performed: ['kyc', 'limits'],
      review_required: false
    }
  }
];

// Test setup utility
const setupTest = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        cacheTime: 0
      }
    }
  });

  // Mock banking hook implementation
  (useBanking as jest.Mock).mockImplementation(() => ({
    wallets: {
      data: mockWallets,
      isLoading: false,
      error: null
    },
    transactions: {
      data: mockTransactions,
      isLoading: false,
      error: null
    },
    createWallet: vi.fn(),
    transferFunds: vi.fn(),
    depositFunds: vi.fn(),
    subscribeToUpdates: vi.fn(),
    unsubscribeFromUpdates: vi.fn()
  }));

  return render(
    <QueryClientProvider client={queryClient}>
      <BankingDashboard />
    </QueryClientProvider>
  );
};

describe('BankingDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset performance measurements
    performance.clearMarks();
    performance.clearMeasures();
  });

  describe('UI Components', () => {
    it('renders all wallet cards correctly', async () => {
      setupTest();
      
      const walletCards = await screen.findAllByRole('region', { name: /Account Details/i });
      expect(walletCards).toHaveLength(mockWallets.length);
      
      mockWallets.forEach((wallet, index) => {
        const card = walletCards[index];
        expect(within(card).getByText(wallet.currency)).toBeInTheDocument();
        expect(within(card).getByText(new RegExp(wallet.balance.toString()))).toBeInTheDocument();
      });
    });

    it('displays loading state for wallets', () => {
      (useBanking as jest.Mock).mockImplementation(() => ({
        wallets: { data: null, isLoading: true, error: null },
        transactions: { data: [], isLoading: false, error: null }
      }));

      setupTest();
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('shows error state when wallet loading fails', () => {
      (useBanking as jest.Mock).mockImplementation(() => ({
        wallets: {
          data: null,
          isLoading: false,
          error: new Error('Failed to load wallets')
        },
        transactions: { data: [], isLoading: false, error: null }
      }));

      setupTest();
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to load wallets/i);
    });

    it('renders transaction list with correct data', async () => {
      setupTest();
      
      const transactionList = await screen.findByRole('region', { name: /Recent Transactions/i });
      expect(transactionList).toBeInTheDocument();
      
      mockTransactions.forEach(transaction => {
        expect(screen.getByText(new RegExp(transaction.amount.toString()))).toBeInTheDocument();
        expect(screen.getByText(new RegExp(transaction.status, 'i'))).toBeInTheDocument();
      });
    });
  });

  describe('Banking Operations', () => {
    it('handles wallet creation successfully', async () => {
      const createWalletMock = vi.fn().mockResolvedValue({ id: 'new-wallet', currency: 'USD' });
      (useBanking as jest.Mock).mockImplementation(() => ({
        ...useBanking(),
        createWallet: createWalletMock
      }));

      setupTest();
      
      const createButton = screen.getByRole('button', { name: /create wallet/i });
      await userEvent.click(createButton);
      
      expect(createWalletMock).toHaveBeenCalledWith({ currency: 'USD' });
    });

    it('handles transfer initiation correctly', async () => {
      const transferFundsMock = vi.fn().mockResolvedValue({ id: 'tx-3' });
      (useBanking as jest.Mock).mockImplementation(() => ({
        ...useBanking(),
        transferFunds: transferFundsMock
      }));

      setupTest();
      
      const transferButton = screen.getByRole('button', { name: /transfer/i });
      await userEvent.click(transferButton);
      
      const transferModal = screen.getByRole('dialog');
      expect(transferModal).toBeInTheDocument();
      
      // Fill transfer form
      await userEvent.type(screen.getByLabelText(/amount/i), '100');
      await userEvent.type(screen.getByLabelText(/recipient/i), 'test@example.com');
      
      const submitButton = screen.getByRole('button', { name: /submit transfer/i });
      await userEvent.click(submitButton);
      
      expect(transferFundsMock).toHaveBeenCalledWith({
        amount: 100,
        recipient: 'test@example.com',
        walletId: mockWallets[0].id
      });
    });

    it('updates real-time data through WebSocket subscription', async () => {
      const subscribeToUpdatesMock = vi.fn();
      (useBanking as jest.Mock).mockImplementation(() => ({
        ...useBanking(),
        subscribeToUpdates: subscribeToUpdatesMock
      }));

      setupTest();
      
      expect(subscribeToUpdatesMock).toHaveBeenCalled();
      
      // Simulate WebSocket update
      const updateHandler = subscribeToUpdatesMock.mock.calls[0][0];
      await updateHandler({
        type: 'WALLET_UPDATE',
        data: { ...mockWallets[0], balance: 1500.00 }
      });
      
      expect(screen.getByText(/1,500.00/)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('meets WCAG 2.1 accessibility guidelines', async () => {
      const { container } = setupTest();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('supports keyboard navigation', async () => {
      setupTest();
      
      const createButton = screen.getByRole('button', { name: /create wallet/i });
      const transferButton = screen.getByRole('button', { name: /transfer/i });
      
      // Test tab order
      await userEvent.tab();
      expect(createButton).toHaveFocus();
      
      await userEvent.tab();
      expect(transferButton).toHaveFocus();
    });

    it('provides proper ARIA labels and roles', () => {
      setupTest();
      
      expect(screen.getByRole('region', { name: /wallets overview/i })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /recent transactions/i })).toBeInTheDocument();
      
      const statusElements = screen.getAllByRole('status');
      expect(statusElements.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('renders within performance budget', async () => {
      performance.mark('renderStart');
      setupTest();
      performance.mark('renderEnd');
      
      performance.measure('renderTime', 'renderStart', 'renderEnd');
      const measurement = performance.getEntriesByName('renderTime')[0];
      
      expect(measurement.duration).toBeLessThan(500); // 500ms budget
    });

    it('handles large transaction lists efficiently', async () => {
      const largeTransactionList = Array.from({ length: 100 }, (_, i) => ({
        ...mockTransactions[0],
        id: `tx-${i}`,
        amount: 100 + i
      }));

      (useBanking as jest.Mock).mockImplementation(() => ({
        ...useBanking(),
        transactions: {
          data: largeTransactionList,
          isLoading: false,
          error: null
        }
      }));

      performance.mark('largeListStart');
      setupTest();
      performance.mark('largeListEnd');
      
      performance.measure('largeListRender', 'largeListStart', 'largeListEnd');
      const measurement = performance.getEntriesByName('largeListRender')[0];
      
      expect(measurement.duration).toBeLessThan(1000); // 1s budget for large lists
    });

    it('implements efficient re-rendering', async () => {
      const { rerender } = setupTest();
      
      performance.mark('rerenderStart');
      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <BankingDashboard />
        </QueryClientProvider>
      );
      performance.mark('rerenderEnd');
      
      performance.measure('rerenderTime', 'rerenderStart', 'rerenderEnd');
      const measurement = performance.getEntriesByName('rerenderTime')[0];
      
      expect(measurement.duration).toBeLessThan(100); // 100ms budget for re-renders
    });
  });
});