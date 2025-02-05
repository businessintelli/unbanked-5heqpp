import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { vi } from 'vitest';
import WalletCard from '../../src/components/banking/WalletCard';
import { Wallet } from '../../src/types/banking';
import { formatFiatCurrency } from '../../src/utils/currency';

// Add jest-axe custom matcher
expect.extend(toHaveNoViolations);

// Mock wallet data for testing
const mockWallets: Wallet[] = [
  {
    id: 'test-wallet-id-1',
    user_id: 'test-user-id',
    currency: 'USD',
    balance: 1000.50,
    active: true,
    plaid_access_token: null,
    compliance_status: 'compliant',
    last_audit_date: new Date(),
    daily_limit: 10000,
    monthly_limit: 50000
  },
  {
    id: 'test-wallet-id-2',
    user_id: 'test-user-id',
    currency: 'EUR',
    balance: 500.75,
    active: true,
    plaid_access_token: null,
    compliance_status: 'pending_review',
    last_audit_date: new Date(),
    daily_limit: 8500,
    monthly_limit: 42500
  },
  {
    id: 'test-wallet-id-3',
    user_id: 'test-user-id',
    currency: 'GBP',
    balance: 0,
    active: false,
    plaid_access_token: null,
    compliance_status: 'non_compliant',
    last_audit_date: new Date(),
    daily_limit: 0,
    monthly_limit: 0
  }
];

describe('WalletCard', () => {
  // Mock callback functions
  const mockOnTransfer = vi.fn();
  const mockOnDeposit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render wallet information correctly', () => {
      const wallet = mockWallets[0];
      render(
        <WalletCard
          wallet={wallet}
          onTransfer={mockOnTransfer}
          onDeposit={mockOnDeposit}
        />
      );

      // Check wallet type label
      expect(screen.getByText('Checking Account')).toBeInTheDocument();

      // Check currency display
      expect(screen.getByText('USD')).toBeInTheDocument();

      // Check balance formatting
      const formattedBalance = formatFiatCurrency(wallet.balance, wallet.currency);
      expect(screen.getByText(formattedBalance)).toBeInTheDocument();

      // Check compliance status
      expect(screen.getByText('Verified Account')).toBeInTheDocument();
    });

    it('should render loading state correctly', () => {
      render(
        <WalletCard
          wallet={mockWallets[0]}
          onTransfer={mockOnTransfer}
          onDeposit={mockOnDeposit}
          isLoading={true}
        />
      );

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('Loading wallet information')).toBeInTheDocument();
    });

    it('should render error state correctly', () => {
      const error = new Error('Failed to load wallet');
      render(
        <WalletCard
          wallet={mockWallets[0]}
          onTransfer={mockOnTransfer}
          onDeposit={mockOnDeposit}
          error={error}
        />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(error.message)).toBeInTheDocument();
    });

    it('should render inactive wallet with reduced opacity', () => {
      const inactiveWallet = mockWallets[2];
      const { container } = render(
        <WalletCard
          wallet={inactiveWallet}
          onTransfer={mockOnTransfer}
          onDeposit={mockOnDeposit}
        />
      );

      expect(container.firstChild).toHaveClass('opacity-75');
    });
  });

  describe('Interactions', () => {
    it('should handle transfer button click', async () => {
      const wallet = mockWallets[0];
      render(
        <WalletCard
          wallet={wallet}
          onTransfer={mockOnTransfer}
          onDeposit={mockOnDeposit}
        />
      );

      const transferButton = screen.getByRole('button', { name: /transfer/i });
      await fireEvent.click(transferButton);

      expect(mockOnTransfer).toHaveBeenCalledWith(wallet.id);
    });

    it('should handle deposit button click', async () => {
      const wallet = mockWallets[0];
      render(
        <WalletCard
          wallet={wallet}
          onTransfer={mockOnTransfer}
          onDeposit={mockOnDeposit}
        />
      );

      const depositButton = screen.getByRole('button', { name: /deposit/i });
      await fireEvent.click(depositButton);

      expect(mockOnDeposit).toHaveBeenCalledWith(wallet.id);
    });

    it('should disable buttons for inactive wallets', () => {
      const inactiveWallet = mockWallets[2];
      render(
        <WalletCard
          wallet={inactiveWallet}
          onTransfer={mockOnTransfer}
          onDeposit={mockOnDeposit}
        />
      );

      const transferButton = screen.getByRole('button', { name: /transfer/i });
      const depositButton = screen.getByRole('button', { name: /deposit/i });

      expect(transferButton).toBeDisabled();
      expect(depositButton).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <WalletCard
          wallet={mockWallets[0]}
          onTransfer={mockOnTransfer}
          onDeposit={mockOnDeposit}
        />
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper ARIA labels', () => {
      const wallet = mockWallets[0];
      render(
        <WalletCard
          wallet={wallet}
          onTransfer={mockOnTransfer}
          onDeposit={mockOnDeposit}
        />
      );

      expect(screen.getByRole('region')).toHaveAttribute(
        'aria-label',
        'Checking Account Details'
      );
    });

    it('should support keyboard navigation', () => {
      render(
        <WalletCard
          wallet={mockWallets[0]}
          onTransfer={mockOnTransfer}
          onDeposit={mockOnDeposit}
        />
      );

      const transferButton = screen.getByRole('button', { name: /transfer/i });
      const depositButton = screen.getByRole('button', { name: /deposit/i });

      transferButton.focus();
      expect(document.activeElement).toBe(transferButton);

      fireEvent.keyDown(transferButton, { key: 'Tab' });
      expect(document.activeElement).toBe(depositButton);
    });
  });

  describe('Error Handling', () => {
    it('should handle balance formatting errors', () => {
      const invalidWallet = {
        ...mockWallets[0],
        balance: NaN
      };

      render(
        <WalletCard
          wallet={invalidWallet}
          onTransfer={mockOnTransfer}
          onDeposit={mockOnDeposit}
        />
      );

      expect(screen.getByText('---')).toBeInTheDocument();
    });

    it('should handle failed transfer operations', async () => {
      const error = new Error('Transfer failed');
      mockOnTransfer.mockRejectedValueOnce(error);

      render(
        <WalletCard
          wallet={mockWallets[0]}
          onTransfer={mockOnTransfer}
          onDeposit={mockOnDeposit}
        />
      );

      const transferButton = screen.getByRole('button', { name: /transfer/i });
      await fireEvent.click(transferButton);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(error.message)).toBeInTheDocument();
    });

    it('should handle failed deposit operations', async () => {
      const error = new Error('Deposit failed');
      mockOnDeposit.mockRejectedValueOnce(error);

      render(
        <WalletCard
          wallet={mockWallets[0]}
          onTransfer={mockOnTransfer}
          onDeposit={mockOnDeposit}
        />
      );

      const depositButton = screen.getByRole('button', { name: /deposit/i });
      await fireEvent.click(depositButton);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(error.message)).toBeInTheDocument();
    });
  });
});