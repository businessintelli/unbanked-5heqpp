import React from 'react'; // ^18.2.0
import { render, screen, fireEvent, waitFor } from '@testing-library/react'; // ^14.0.0
import userEvent from '@testing-library/user-event'; // ^14.0.0
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'; // ^0.34.0
import { axe, toHaveNoViolations } from '@axe-core/react'; // ^4.7.0
import WS from 'jest-websocket-mock'; // ^2.4.0

import ExchangeForm from '../../../components/crypto/ExchangeForm';
import { useCrypto } from '../../../hooks/useCrypto';
import type { 
  CryptoCurrency,
  ExchangeRequest,
  CryptoWallet,
  CryptoTransaction,
  PriceData
} from '../../../types/crypto';

// Mock useCrypto hook
vi.mock('../../../hooks/useCrypto');

// Test data setup
const mockWallets: CryptoWallet[] = [
  {
    id: '123e4567-e89b-12d3-a456-426614174000',
    currency: 'BTC',
    address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    balance: '1.5',
    is_custodial: true,
    network_config: {
      network_type: 'bitcoin',
      chain_id: 1,
      rpc_url: 'https://btc.rpc.example.com',
      explorer_url: 'https://btc.explorer.example.com'
    }
  },
  {
    id: '123e4567-e89b-12d3-a456-426614174001',
    currency: 'ETH',
    address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    balance: '10.0',
    is_custodial: true,
    network_config: {
      network_type: 'ethereum',
      chain_id: 1,
      rpc_url: 'https://eth.rpc.example.com',
      explorer_url: 'https://eth.explorer.example.com'
    }
  }
];

const mockPrices: PriceData[] = [
  {
    currency: 'BTC',
    price_usd: '45000.00',
    change_24h: '2.5',
    volume_24h: '1000000000',
    market_cap: '850000000000',
    total_supply: '19000000',
    last_updated: new Date()
  },
  {
    currency: 'ETH',
    price_usd: '3000.00',
    change_24h: '1.8',
    volume_24h: '500000000',
    market_cap: '350000000000',
    total_supply: '120000000',
    last_updated: new Date()
  }
];

// Setup test environment
const setupTest = () => {
  const mockExecuteExchange = vi.fn();
  const mockOnSuccess = vi.fn();
  const mockOnError = vi.fn();
  const mockOnProgress = vi.fn();

  // Mock useCrypto implementation
  (useCrypto as jest.Mock).mockReturnValue({
    executeExchange: mockExecuteExchange,
    wallets: mockWallets,
    prices: mockPrices,
    rateLimit: { minInterval: 1000 }
  });

  const renderResult = render(
    <ExchangeForm
      onSuccess={mockOnSuccess}
      onError={mockOnError}
      onProgress={mockOnProgress}
    />
  );

  return {
    ...renderResult,
    mockExecuteExchange,
    mockOnSuccess,
    mockOnError,
    mockOnProgress
  };
};

describe('ExchangeForm Component', () => {
  let wsServer: WS;

  beforeEach(() => {
    wsServer = new WS('ws://localhost:1234');
    vi.useFakeTimers();
  });

  afterEach(() => {
    WS.clean();
    vi.useRealTimers();
  });

  describe('Rendering and Accessibility', () => {
    it('should render without accessibility violations', async () => {
      const { container } = setupTest();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should render all form fields with proper labels', () => {
      setupTest();
      expect(screen.getByLabelText(/From Currency/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/To Currency/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Source Wallet/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Destination Wallet/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Slippage Tolerance/i)).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      setupTest();
      const user = userEvent.setup();
      const firstInput = screen.getByLabelText(/From Currency/i);
      
      await user.tab();
      expect(firstInput).toHaveFocus();
      
      for (let i = 0; i < 5; i++) {
        await user.tab();
        expect(document.activeElement).not.toBe(firstInput);
      }
    });
  });

  describe('Form Validation', () => {
    it('should validate minimum amount', async () => {
      const { mockOnError } = setupTest();
      const amountInput = screen.getByLabelText(/Amount/i);
      
      await userEvent.type(amountInput, '0');
      fireEvent.submit(screen.getByRole('button', { name: /Execute Exchange/i }));
      
      expect(mockOnError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Amount must be greater than 0' })
      );
    });

    it('should prevent same currency exchange', async () => {
      const { mockOnError } = setupTest();
      const fromCurrency = screen.getByLabelText(/From Currency/i);
      const toCurrency = screen.getByLabelText(/To Currency/i);
      
      await userEvent.selectOptions(fromCurrency, 'BTC');
      await userEvent.selectOptions(toCurrency, 'BTC');
      
      fireEvent.submit(screen.getByRole('button', { name: /Execute Exchange/i }));
      
      expect(mockOnError).toHaveBeenCalledWith(
        expect.objectContaining({ 
          message: 'Source and destination currencies must be different' 
        })
      );
    });

    it('should validate sufficient balance', async () => {
      const { mockOnError } = setupTest();
      const amountInput = screen.getByLabelText(/Amount/i);
      const sourceWallet = screen.getByLabelText(/Source Wallet/i);
      
      await userEvent.selectOptions(sourceWallet, mockWallets[0].id);
      await userEvent.type(amountInput, '2.0');
      
      fireEvent.submit(screen.getByRole('button', { name: /Execute Exchange/i }));
      
      expect(mockOnError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Insufficient balance' })
      );
    });
  });

  describe('Exchange Execution', () => {
    it('should execute exchange with valid inputs', async () => {
      const { mockExecuteExchange, mockOnSuccess } = setupTest();
      const mockTransaction: CryptoTransaction = {
        id: 'tx-123',
        wallet_id: mockWallets[0].id,
        type: 'EXCHANGE',
        amount: '1.0',
        currency: 'BTC',
        status: 'completed',
        tx_hash: '0x123',
        network_fee: '0.001',
        gas_fee: '0.0005',
        created_at: new Date()
      };

      mockExecuteExchange.mockResolvedValueOnce(mockTransaction);

      await userEvent.selectOptions(screen.getByLabelText(/From Currency/i), 'BTC');
      await userEvent.selectOptions(screen.getByLabelText(/To Currency/i), 'ETH');
      await userEvent.type(screen.getByLabelText(/Amount/i), '1.0');
      await userEvent.selectOptions(screen.getByLabelText(/Source Wallet/i), mockWallets[0].id);
      await userEvent.selectOptions(screen.getByLabelText(/Destination Wallet/i), mockWallets[1].id);

      fireEvent.submit(screen.getByRole('button', { name: /Execute Exchange/i }));

      await waitFor(() => {
        expect(mockExecuteExchange).toHaveBeenCalledWith(
          expect.objectContaining({
            from_wallet_id: mockWallets[0].id,
            to_wallet_id: mockWallets[1].id,
            amount: '1.0',
            from_currency: 'BTC',
            to_currency: 'ETH'
          })
        );
        expect(mockOnSuccess).toHaveBeenCalledWith(mockTransaction);
      });
    });

    it('should handle exchange timeout', async () => {
      const { mockExecuteExchange, mockOnError } = setupTest();
      mockExecuteExchange.mockImplementation(() => new Promise(resolve => {
        setTimeout(resolve, 31000);
      }));

      await userEvent.selectOptions(screen.getByLabelText(/From Currency/i), 'BTC');
      await userEvent.type(screen.getByLabelText(/Amount/i), '1.0');
      
      fireEvent.submit(screen.getByRole('button', { name: /Execute Exchange/i }));
      
      vi.advanceTimersByTime(31000);
      
      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Exchange request timed out' })
        );
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits between requests', async () => {
      const { mockOnError } = setupTest();
      
      fireEvent.submit(screen.getByRole('button', { name: /Execute Exchange/i }));
      fireEvent.submit(screen.getByRole('button', { name: /Execute Exchange/i }));
      
      expect(mockOnError).toHaveBeenCalledWith(
        expect.objectContaining({ 
          message: 'Please wait 1 seconds between requests' 
        })
      );
    });
  });

  describe('WebSocket Price Updates', () => {
    it('should update exchange rate on price changes', async () => {
      setupTest();
      
      await userEvent.selectOptions(screen.getByLabelText(/From Currency/i), 'BTC');
      await userEvent.selectOptions(screen.getByLabelText(/To Currency/i), 'ETH');
      await userEvent.type(screen.getByLabelText(/Amount/i), '1.0');

      await wsServer.connected;
      wsServer.send({
        type: 'PRICE_UPDATE',
        data: {
          currency: 'BTC',
          price_usd: '46000.00'
        }
      });

      await waitFor(() => {
        expect(screen.getByText(/Exchange Rate:/)).toBeInTheDocument();
        expect(screen.getByText(/Estimated Output:/)).toBeInTheDocument();
      });
    });
  });

  describe('Performance', () => {
    it('should render within performance budget', async () => {
      const start = performance.now();
      setupTest();
      const end = performance.now();
      
      expect(end - start).toBeLessThan(100);
    });

    it('should debounce price calculations', async () => {
      setupTest();
      const amountInput = screen.getByLabelText(/Amount/i);
      
      await userEvent.type(amountInput, '1');
      await userEvent.type(amountInput, '2');
      await userEvent.type(amountInput, '3');
      
      // Wait for debounce
      vi.advanceTimersByTime(500);
      
      // Should only calculate once
      expect(screen.getByText(/Exchange Rate:/)).toBeInTheDocument();
    });
  });
});