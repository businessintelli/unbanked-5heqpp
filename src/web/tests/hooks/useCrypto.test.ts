import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'; // v0.34.0
import { renderHook, act, waitFor } from '@testing-library/react'; // v14.0.0
import { WebSocket, Server } from 'mock-socket'; // v9.2.1

import { useCrypto } from '../../src/hooks/useCrypto';
import * as CryptoTypes from '../../src/types/crypto';
import { API_CONFIG } from '../../src/config/api';

// Mock WebSocket server setup
const WS_URL = `${API_CONFIG.baseUrl.replace('http', 'ws')}/ws`;
let mockServer: Server;

// Mock API responses
const mockWalletData: CryptoTypes.CryptoWallet = {
  id: 'mock-wallet-id',
  currency: 'BTC',
  address: 'mock-address',
  balance: '1.0',
  is_custodial: true,
  network_config: {
    network_type: 'bitcoin',
    chain_id: 1,
    rpc_url: 'https://mock-rpc.example.com',
    explorer_url: 'https://mock-explorer.example.com'
  }
};

const mockTransactionData: CryptoTypes.CryptoTransaction = {
  id: 'mock-tx-id',
  wallet_id: 'mock-wallet-id',
  type: CryptoTypes.CryptoTransactionType.EXCHANGE,
  amount: '0.1',
  currency: 'BTC',
  status: 'completed',
  tx_hash: 'mock-hash',
  network_fee: '0.001',
  gas_fee: '0.0005',
  created_at: new Date('2024-01-01T00:00:00Z')
};

const mockPriceData: CryptoTypes.PriceData = {
  currency: 'BTC',
  price_usd: '35000.00',
  change_24h: '2.5',
  volume_24h: '1000000000',
  market_cap: '680000000000',
  total_supply: '19000000',
  last_updated: new Date('2024-01-01T00:00:00Z')
};

// Mock API client
vi.mock('../../src/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

// Mock WebSocket
(global as any).WebSocket = WebSocket;

describe('useCrypto Hook', () => {
  beforeEach(() => {
    // Setup WebSocket mock server
    mockServer = new Server(WS_URL);
    mockServer.on('connection', socket => {
      socket.on('message', data => {
        const message = JSON.parse(data.toString());
        if (message.type === 'subscribe' && message.channel === 'crypto') {
          socket.send(JSON.stringify({
            type: 'PRICE_UPDATE',
            data: [mockPriceData],
            channel: 'crypto',
            timestamp: Date.now()
          }));
        }
      });
    });

    // Reset API mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockServer.close();
    vi.clearAllTimers();
  });

  describe('Wallet Management', () => {
    it('should fetch wallets on initialization', async () => {
      const mockResponse = {
        data: {
          data: [mockWalletData],
          pagination: {
            total: 1,
            page: 1,
            limit: 10
          }
        }
      };

      vi.mocked(api.get).mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useCrypto());

      await waitFor(() => {
        expect(result.current.wallets).toHaveLength(1);
        expect(result.current.wallets[0]).toEqual(mockWalletData);
      });

      expect(api.get).toHaveBeenCalledWith('/crypto/wallets');
    });

    it('should handle wallet update events', async () => {
      const { result } = renderHook(() => useCrypto());

      const updatedWallet = { ...mockWalletData, balance: '1.5' };

      await act(async () => {
        mockServer.emit('message', JSON.stringify({
          type: 'WALLET_UPDATE',
          data: updatedWallet,
          channel: 'crypto',
          timestamp: Date.now()
        }));
      });

      await waitFor(() => {
        expect(result.current.wallets[0]?.balance).toBe('1.5');
      });
    });
  });

  describe('Exchange Operations', () => {
    it('should execute exchange with proper validation', async () => {
      const mockExchangeRequest: CryptoTypes.ExchangeRequest = {
        from_wallet_id: 'mock-wallet-id',
        to_wallet_id: 'mock-wallet-id-2',
        amount: '0.1',
        from_currency: 'BTC',
        to_currency: 'ETH'
      };

      vi.mocked(api.post).mockResolvedValueOnce({ data: mockTransactionData });

      const { result } = renderHook(() => useCrypto());

      await act(async () => {
        await result.current.executeExchange(mockExchangeRequest);
      });

      expect(api.post).toHaveBeenCalledWith('/crypto/exchange', mockExchangeRequest);
      expect(result.current.pendingTransactions).toContainEqual(mockTransactionData);
    });

    it('should handle exchange transaction updates', async () => {
      const { result } = renderHook(() => useCrypto());

      const completedTransaction = { ...mockTransactionData, status: 'completed' as const };

      await act(async () => {
        mockServer.emit('message', JSON.stringify({
          type: 'TRANSACTION_UPDATE',
          data: completedTransaction,
          channel: 'crypto',
          timestamp: Date.now()
        }));
      });

      await waitFor(() => {
        expect(result.current.transactions).toContainEqual(completedTransaction);
        expect(result.current.pendingTransactions).not.toContainEqual(completedTransaction);
      });
    });
  });

  describe('Price Tracking', () => {
    it('should handle real-time price updates', async () => {
      const { result } = renderHook(() => useCrypto());

      await act(async () => {
        mockServer.emit('message', JSON.stringify({
          type: 'PRICE_UPDATE',
          data: [mockPriceData],
          channel: 'crypto',
          timestamp: Date.now()
        }));
      });

      await waitFor(() => {
        expect(result.current.prices).toContainEqual(mockPriceData);
      });
    });

    it('should throttle price updates', async () => {
      const { result } = renderHook(() => useCrypto());
      
      const updates = Array.from({ length: 5 }, (_, i) => ({
        ...mockPriceData,
        price_usd: (35000 + i * 100).toString()
      }));

      await act(async () => {
        updates.forEach(update => {
          mockServer.emit('message', JSON.stringify({
            type: 'PRICE_UPDATE',
            data: [update],
            channel: 'crypto',
            timestamp: Date.now()
          }));
        });
      });

      // Wait for throttle timeout
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(result.current.prices[0]?.price_usd).toBe(updates[updates.length - 1].price_usd);
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const error = new Error('API Error');
      vi.mocked(api.get).mockRejectedValueOnce(error);

      const { result } = renderHook(() => useCrypto());

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should handle WebSocket connection errors', async () => {
      mockServer.close();

      const { result } = renderHook(() => useCrypto());

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });
    });
  });

  describe('Performance Metrics', () => {
    it('should track performance metrics', async () => {
      const { result } = renderHook(() => useCrypto());

      await act(async () => {
        mockServer.emit('message', JSON.stringify({
          type: 'PRICE_UPDATE',
          data: [mockPriceData],
          channel: 'crypto',
          timestamp: Date.now()
        }));
      });

      await waitFor(() => {
        expect(result.current.metrics.lastUpdate).toBeInstanceOf(Date);
        expect(result.current.metrics.priceLatency).toBeGreaterThanOrEqual(0);
      });
    });
  });
});