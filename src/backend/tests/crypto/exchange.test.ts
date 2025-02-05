// External imports - v0.34.0
import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
// External imports - v10.4.3
import Decimal from 'decimal.js';

// Internal imports
import { CryptoExchangeService } from '../../lib/crypto/exchange';
import { CacheService } from '../../lib/common/cache';
import { ApplicationError } from '../../lib/common/errors';
import { Types } from '../../types/crypto';

// Test constants
const TEST_USER_ID = 'test-user-123';
const TEST_WALLET_BTC = 'btc-wallet-123';
const TEST_WALLET_ETH = 'eth-wallet-123';
const PERFORMANCE_THRESHOLDS = {
  RESPONSE_TIME_MS: 500,
  REQUESTS_PER_MINUTE: 1000
};

describe('CryptoExchangeService', () => {
  let exchangeService: CryptoExchangeService;
  let cacheService: CacheService;
  let mockPriceService: any;

  beforeEach(() => {
    // Initialize mock services
    cacheService = new CacheService('redis://localhost:6379');
    mockPriceService = {
      getCurrentPrice: vi.fn(),
      getExchangeQuote: vi.fn(),
      getMarketDepth: vi.fn()
    };

    // Initialize exchange service
    exchangeService = new CryptoExchangeService(mockPriceService, {
      maxRequestsPerMinute: PERFORMANCE_THRESHOLDS.REQUESTS_PER_MINUTE
    });

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Quote Generation', () => {
    test('should generate valid exchange quote with current market rates', async () => {
      // Setup mock data
      const request: Types.ExchangeRequest = {
        from_wallet_id: TEST_WALLET_BTC,
        to_wallet_id: TEST_WALLET_ETH,
        amount: '1.0',
        from_currency: 'BTC',
        to_currency: 'ETH',
        slippage_tolerance: '0.01'
      };

      mockPriceService.getCurrentPrice.mockResolvedValueOnce('40000'); // BTC price
      mockPriceService.getCurrentPrice.mockResolvedValueOnce('2000');  // ETH price

      // Execute test
      const quote = await exchangeService.getQuote(request);

      // Verify quote properties
      expect(quote).toBeDefined();
      expect(quote.fromCurrency).toBe('BTC');
      expect(quote.toCurrency).toBe('ETH');
      expect(new Decimal(quote.exchangeRate)).toBeGreaterThan(0);
      expect(quote.slippage).toBeDefined();
      expect(quote.networkFee).toBeDefined();
      expect(quote.timestamp).toBeDefined();
      expect(quote.expiresAt).toBeGreaterThan(Date.now());
    });

    test('should use cached quote when available and valid', async () => {
      const request: Types.ExchangeRequest = {
        from_wallet_id: TEST_WALLET_BTC,
        to_wallet_id: TEST_WALLET_ETH,
        amount: '1.0',
        from_currency: 'BTC',
        to_currency: 'ETH',
        slippage_tolerance: '0.01'
      };

      // Setup cache
      const cachedQuote = {
        fromCurrency: 'BTC',
        toCurrency: 'ETH',
        exchangeRate: '20',
        timestamp: Date.now(),
        expiresAt: Date.now() + 300000 // 5 minutes
      };

      await cacheService.set(`quote:BTC:ETH:1.0`, cachedQuote);

      const quote = await exchangeService.getQuote(request);
      expect(quote).toEqual(cachedQuote);
      expect(mockPriceService.getCurrentPrice).not.toHaveBeenCalled();
    });

    test('should handle quote generation errors gracefully', async () => {
      const request: Types.ExchangeRequest = {
        from_wallet_id: TEST_WALLET_BTC,
        to_wallet_id: TEST_WALLET_ETH,
        amount: '1.0',
        from_currency: 'BTC',
        to_currency: 'ETH',
        slippage_tolerance: '0.01'
      };

      mockPriceService.getCurrentPrice.mockRejectedValue(new Error('Price service unavailable'));

      await expect(exchangeService.getQuote(request)).rejects.toThrow(ApplicationError);
    });
  });

  describe('Exchange Execution', () => {
    test('should execute exchange successfully with valid quote', async () => {
      const request: Types.ExchangeRequest = {
        from_wallet_id: TEST_WALLET_BTC,
        to_wallet_id: TEST_WALLET_ETH,
        amount: '1.0',
        from_currency: 'BTC',
        to_currency: 'ETH',
        slippage_tolerance: '0.01'
      };

      const quote = {
        fromCurrency: 'BTC',
        toCurrency: 'ETH',
        exchangeRate: '20',
        timestamp: Date.now(),
        expiresAt: Date.now() + 300000,
        slippage: '0.001',
        networkFee: '0.0001'
      };

      const result = await exchangeService.executeExchange(request, quote);

      expect(result).toBeDefined();
      expect(result.status).toBe('COMPLETED');
      expect(result.amount).toBe('1.0');
      expect(result.fee).toBeDefined();
    });

    test('should reject exchange with expired quote', async () => {
      const request: Types.ExchangeRequest = {
        from_wallet_id: TEST_WALLET_BTC,
        to_wallet_id: TEST_WALLET_ETH,
        amount: '1.0',
        from_currency: 'BTC',
        to_currency: 'ETH',
        slippage_tolerance: '0.01'
      };

      const expiredQuote = {
        fromCurrency: 'BTC',
        toCurrency: 'ETH',
        exchangeRate: '20',
        timestamp: Date.now() - 600000, // 10 minutes ago
        expiresAt: Date.now() - 300000  // Expired 5 minutes ago
      };

      await expect(exchangeService.executeExchange(request, expiredQuote))
        .rejects.toThrow('Quote has expired');
    });

    test('should handle insufficient funds error', async () => {
      const request: Types.ExchangeRequest = {
        from_wallet_id: TEST_WALLET_BTC,
        to_wallet_id: TEST_WALLET_ETH,
        amount: '100.0', // Amount larger than balance
        from_currency: 'BTC',
        to_currency: 'ETH',
        slippage_tolerance: '0.01'
      };

      const quote = {
        fromCurrency: 'BTC',
        toCurrency: 'ETH',
        exchangeRate: '20',
        timestamp: Date.now(),
        expiresAt: Date.now() + 300000
      };

      await expect(exchangeService.executeExchange(request, quote))
        .rejects.toThrow(ApplicationError.InsufficientFunds);
    });
  });

  describe('Performance', () => {
    test('should handle high volume of concurrent requests', async () => {
      const request: Types.ExchangeRequest = {
        from_wallet_id: TEST_WALLET_BTC,
        to_wallet_id: TEST_WALLET_ETH,
        amount: '1.0',
        from_currency: 'BTC',
        to_currency: 'ETH',
        slippage_tolerance: '0.01'
      };

      mockPriceService.getCurrentPrice.mockResolvedValue('40000');

      const requests = Array(100).fill(request);
      const startTime = Date.now();

      const results = await Promise.all(
        requests.map(req => exchangeService.getQuote(req))
      );

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(results).toHaveLength(100);
      expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.RESPONSE_TIME_MS);
    });

    test('should enforce rate limits correctly', async () => {
      const request: Types.ExchangeRequest = {
        from_wallet_id: TEST_WALLET_BTC,
        to_wallet_id: TEST_WALLET_ETH,
        amount: '1.0',
        from_currency: 'BTC',
        to_currency: 'ETH',
        slippage_tolerance: '0.01'
      };

      // Exceed rate limit
      const requests = Array(PERFORMANCE_THRESHOLDS.REQUESTS_PER_MINUTE + 1).fill(request);

      await expect(async () => {
        await Promise.all(
          requests.map(req => exchangeService.getQuote(req))
        );
      }).rejects.toThrow(ApplicationError.RateLimitExceeded);
    });

    test('should maintain response time under load', async () => {
      const request: Types.ExchangeRequest = {
        from_wallet_id: TEST_WALLET_BTC,
        to_wallet_id: TEST_WALLET_ETH,
        amount: '1.0',
        from_currency: 'BTC',
        to_currency: 'ETH',
        slippage_tolerance: '0.01'
      };

      mockPriceService.getCurrentPrice.mockResolvedValue('40000');

      const responseTimes: number[] = [];
      const requests = Array(50).fill(request);

      for (const req of requests) {
        const startTime = Date.now();
        await exchangeService.getQuote(req);
        responseTimes.push(Date.now() - startTime);
      }

      const averageResponseTime = responseTimes.reduce((a, b) => a + b) / responseTimes.length;
      expect(averageResponseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.RESPONSE_TIME_MS);
    });
  });

  describe('Cache Management', () => {
    test('should invalidate cache on significant price change', async () => {
      const request: Types.ExchangeRequest = {
        from_wallet_id: TEST_WALLET_BTC,
        to_wallet_id: TEST_WALLET_ETH,
        amount: '1.0',
        from_currency: 'BTC',
        to_currency: 'ETH',
        slippage_tolerance: '0.01'
      };

      // Initial price
      mockPriceService.getCurrentPrice.mockResolvedValueOnce('40000');
      const initialQuote = await exchangeService.getQuote(request);

      // Significant price change
      mockPriceService.getCurrentPrice.mockResolvedValueOnce('44000'); // 10% change
      const newQuote = await exchangeService.getQuote(request);

      expect(newQuote.exchangeRate).not.toBe(initialQuote.exchangeRate);
    });

    test('should handle cache service failures gracefully', async () => {
      const request: Types.ExchangeRequest = {
        from_wallet_id: TEST_WALLET_BTC,
        to_wallet_id: TEST_WALLET_ETH,
        amount: '1.0',
        from_currency: 'BTC',
        to_currency: 'ETH',
        slippage_tolerance: '0.01'
      };

      // Simulate cache service failure
      vi.spyOn(cacheService, 'get').mockRejectedValue(new Error('Cache unavailable'));
      mockPriceService.getCurrentPrice.mockResolvedValue('40000');

      const quote = await exchangeService.getQuote(request);
      expect(quote).toBeDefined();
      expect(quote.exchangeRate).toBeDefined();
    });
  });
});