import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { MockWebSocket } from '@vitest/ws-mock';

import Exchange from '../../src/pages/crypto/Exchange';
import { useCrypto } from '../../src/hooks/useCrypto';
import type { CryptoTransaction, PriceData } from '../../src/types/crypto';

// Mock the useCrypto hook
vi.mock('../../src/hooks/useCrypto', () => ({
  useCrypto: vi.fn()
}));

// Mock price data for testing
const mockPriceData: PriceData[] = [
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
    change_24h: '-1.2',
    volume_24h: '500000000',
    market_cap: '350000000000',
    total_supply: '120000000',
    last_updated: new Date()
  }
];

// Mock successful transaction response
const mockTransaction: CryptoTransaction = {
  id: 'tx-123',
  wallet_id: 'wallet-123',
  type: 'EXCHANGE',
  amount: '1.5',
  currency: 'BTC',
  status: 'completed',
  tx_hash: '0x123...',
  network_fee: '0.0001',
  gas_fee: '0.00005',
  created_at: new Date()
};

describe('Exchange Component', () => {
  let mockWebSocket: MockWebSocket;
  
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    
    // Initialize WebSocket mock
    mockWebSocket = new MockWebSocket();
    
    // Mock useCrypto hook implementation
    (useCrypto as jest.Mock).mockReturnValue({
      prices: mockPriceData,
      executeExchange: vi.fn().mockResolvedValue(mockTransaction),
      isLoading: false,
      subscribeToPrice: vi.fn().mockReturnValue(() => {}),
      error: null
    });
  });

  afterEach(() => {
    // Clean up WebSocket connections
    mockWebSocket.close();
  });

  test('renders exchange form with initial state', async () => {
    render(<Exchange />);

    // Verify form elements are present
    expect(screen.getByText('Exchange Cryptocurrency')).toBeInTheDocument();
    expect(screen.getByText('BTC Price Chart')).toBeInTheDocument();

    // Check currency selectors
    const currencySelectors = screen.getAllByRole('combobox');
    expect(currencySelectors).toHaveLength(2);

    // Verify price display
    expect(screen.getByText('$45,000.00')).toBeInTheDocument();
    expect(screen.getByText('+2.5%')).toBeInTheDocument();
  });

  test('handles successful exchange transaction', async () => {
    const executeExchange = vi.fn().mockResolvedValue(mockTransaction);
    (useCrypto as jest.Mock).mockReturnValue({
      ...useCrypto(),
      executeExchange
    });

    render(<Exchange />);

    // Fill exchange form
    await userEvent.type(screen.getByLabelText(/amount/i), '1.5');
    await userEvent.selectOptions(screen.getByLabelText(/from currency/i), 'BTC');
    await userEvent.selectOptions(screen.getByLabelText(/to currency/i), 'ETH');

    // Submit form
    const submitButton = screen.getByRole('button', { name: /execute exchange/i });
    await userEvent.click(submitButton);

    // Verify loading state
    expect(submitButton).toBeDisabled();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    // Verify success message
    await waitFor(() => {
      expect(screen.getByText(/exchange completed successfully/i)).toBeInTheDocument();
      expect(screen.getByText(/transaction id: tx-123/i)).toBeInTheDocument();
    });

    // Verify exchange function was called with correct parameters
    expect(executeExchange).toHaveBeenCalledWith({
      amount: '1.5',
      from_currency: 'BTC',
      to_currency: 'ETH',
      from_wallet_id: expect.any(String),
      to_wallet_id: expect.any(String)
    });
  });

  test('handles real-time price updates via WebSocket', async () => {
    render(<Exchange />);

    // Verify initial price
    expect(screen.getByText('$45,000.00')).toBeInTheDocument();

    // Simulate WebSocket price update
    const updatedPrice: PriceData = {
      ...mockPriceData[0],
      price_usd: '46000.00',
      change_24h: '3.2'
    };

    mockWebSocket.send(JSON.stringify({
      type: 'price_update',
      data: updatedPrice
    }));

    // Verify price update
    await waitFor(() => {
      expect(screen.getByText('$46,000.00')).toBeInTheDocument();
      expect(screen.getByText('+3.2%')).toBeInTheDocument();
    });
  });

  test('handles exchange validation errors', async () => {
    const mockError = new Error('Insufficient balance');
    (useCrypto as jest.Mock).mockReturnValue({
      ...useCrypto(),
      executeExchange: vi.fn().mockRejectedValue(mockError)
    });

    render(<Exchange />);

    // Submit form with invalid data
    await userEvent.type(screen.getByLabelText(/amount/i), '-1');
    await userEvent.click(screen.getByRole('button', { name: /execute exchange/i }));

    // Verify error message
    await waitFor(() => {
      expect(screen.getByText(/insufficient balance/i)).toBeInTheDocument();
    });
  });

  test('handles network errors gracefully', async () => {
    // Simulate network error
    mockWebSocket.error(new Error('WebSocket connection failed'));

    render(<Exchange />);

    // Verify error message
    await waitFor(() => {
      expect(screen.getByText(/failed to connect/i)).toBeInTheDocument();
    });

    // Verify retry functionality
    const retryButton = screen.getByRole('button', { name: /retry/i });
    await userEvent.click(retryButton);

    // Verify loading state during retry
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  test('updates exchange rate calculations', async () => {
    render(<Exchange />);

    // Enter amount
    await userEvent.type(screen.getByLabelText(/amount/i), '1');

    // Verify exchange rate calculation
    await waitFor(() => {
      const rateDisplay = screen.getByText(/exchange rate/i);
      expect(rateDisplay).toHaveTextContent('1 BTC = 15 ETH');
    });

    // Change currencies
    await userEvent.selectOptions(screen.getByLabelText(/from currency/i), 'ETH');
    await userEvent.selectOptions(screen.getByLabelText(/to currency/i), 'BTC');

    // Verify updated exchange rate
    await waitFor(() => {
      const rateDisplay = screen.getByText(/exchange rate/i);
      expect(rateDisplay).toHaveTextContent('1 ETH = 0.0667 BTC');
    });
  });

  test('handles timeframe selection for price chart', async () => {
    render(<Exchange />);

    // Click different timeframe buttons
    const timeframes = ['1H', '24H', '7D', '30D', '1Y'];
    for (const timeframe of timeframes) {
      const button = screen.getByRole('button', { name: timeframe });
      await userEvent.click(button);

      // Verify active state
      expect(button).toHaveClass('bg-primary-600');
      
      // Verify chart data update
      await waitFor(() => {
        expect(useCrypto().subscribeToPrice).toHaveBeenCalledWith(
          'BTC',
          expect.any(Function)
        );
      });
    }
  });
});