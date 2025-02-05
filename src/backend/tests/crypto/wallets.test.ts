// External imports - v1.0.0
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js'; // v2.38.0

// Internal imports
import { WalletService } from '../../lib/crypto/wallets';
import { CryptoCurrency } from '../../types/crypto';
import { NotFoundError, ValidationError } from '../../lib/common/errors';
import { CacheService } from '../../lib/common/cache';

// Test constants
const TEST_USER_ID = 'test-user-123';
const TEST_WALLET_ID = 'test-wallet-456';
const MOCK_BTC_ADDRESS = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
const MOCK_ETH_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';

describe('WalletService', () => {
  let walletService: WalletService;
  let mockSupabase: any;
  let mockCacheService: any;

  beforeEach(() => {
    // Mock Supabase client
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis()
    };

    // Mock CacheService
    mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn()
    };

    walletService = new WalletService(mockSupabase, mockCacheService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createWallet', () => {
    it('should create a BTC wallet successfully', async () => {
      const mockWallet = {
        id: TEST_WALLET_ID,
        user_id: TEST_USER_ID,
        currency: CryptoCurrency.BTC,
        address: MOCK_BTC_ADDRESS,
        balance: '0',
        is_custodial: true,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        version: 1
      };

      mockSupabase.insert.mockResolvedValueOnce({ data: mockWallet, error: null });

      const result = await walletService.createWallet(
        TEST_USER_ID,
        CryptoCurrency.BTC,
        true
      );

      expect(result).toEqual(mockWallet);
      expect(mockSupabase.from).toHaveBeenCalledWith('crypto_wallets');
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should create an ETH wallet successfully', async () => {
      const mockWallet = {
        id: TEST_WALLET_ID,
        user_id: TEST_USER_ID,
        currency: CryptoCurrency.ETH,
        address: MOCK_ETH_ADDRESS,
        balance: '0',
        is_custodial: true,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        version: 1
      };

      mockSupabase.insert.mockResolvedValueOnce({ data: mockWallet, error: null });

      const result = await walletService.createWallet(
        TEST_USER_ID,
        CryptoCurrency.ETH,
        true
      );

      expect(result).toEqual(mockWallet);
      expect(mockSupabase.from).toHaveBeenCalledWith('crypto_wallets');
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should throw ValidationError for invalid user ID', async () => {
      await expect(
        walletService.createWallet(
          '',
          CryptoCurrency.BTC,
          true
        )
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for unsupported currency', async () => {
      await expect(
        walletService.createWallet(
          TEST_USER_ID,
          'UNSUPPORTED' as CryptoCurrency,
          true
        )
      ).rejects.toThrow(ValidationError);
    });

    it('should handle database errors during creation', async () => {
      mockSupabase.insert.mockResolvedValueOnce({
        data: null,
        error: new Error('Database error')
      });

      await expect(
        walletService.createWallet(
          TEST_USER_ID,
          CryptoCurrency.BTC,
          true
        )
      ).rejects.toThrow('Wallet operation failed');
    });
  });

  describe('getWallet', () => {
    const mockWallet = {
      id: TEST_WALLET_ID,
      user_id: TEST_USER_ID,
      currency: CryptoCurrency.BTC,
      address: MOCK_BTC_ADDRESS,
      balance: '0',
      is_custodial: true
    };

    it('should retrieve wallet from cache if available', async () => {
      mockCacheService.get.mockResolvedValueOnce(mockWallet);

      const result = await walletService.getWallet(TEST_WALLET_ID);

      expect(result).toEqual(mockWallet);
      expect(mockCacheService.get).toHaveBeenCalled();
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('should retrieve wallet from database on cache miss', async () => {
      mockCacheService.get.mockResolvedValueOnce(null);
      mockSupabase.single.mockResolvedValueOnce({ data: mockWallet, error: null });

      const result = await walletService.getWallet(TEST_WALLET_ID);

      expect(result).toEqual(mockWallet);
      expect(mockCacheService.get).toHaveBeenCalled();
      expect(mockSupabase.from).toHaveBeenCalled();
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should throw NotFoundError for non-existent wallet', async () => {
      mockCacheService.get.mockResolvedValueOnce(null);
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });

      await expect(
        walletService.getWallet(TEST_WALLET_ID)
      ).rejects.toThrow(NotFoundError);
    });

    it('should handle database errors during retrieval', async () => {
      mockCacheService.get.mockResolvedValueOnce(null);
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: new Error('Database error')
      });

      await expect(
        walletService.getWallet(TEST_WALLET_ID)
      ).rejects.toThrow('Wallet operation failed');
    });
  });

  describe('updateWalletBalance', () => {
    const mockWallet = {
      id: TEST_WALLET_ID,
      user_id: TEST_USER_ID,
      currency: CryptoCurrency.BTC,
      address: MOCK_BTC_ADDRESS,
      balance: '1.5',
      is_custodial: true,
      version: 1
    };

    it('should update wallet balance successfully', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: mockWallet, error: null });
      mockSupabase.update.mockResolvedValueOnce({
        data: { ...mockWallet, balance: '2.0', version: 2 },
        error: null
      });

      const result = await walletService.updateWalletBalance(TEST_WALLET_ID);

      expect(result.balance).toBe('2.0');
      expect(result.version).toBe(2);
      expect(mockCacheService.delete).toHaveBeenCalled();
    });

    it('should handle concurrent updates with version check', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: mockWallet, error: null });
      mockSupabase.update.mockResolvedValueOnce({
        data: null,
        error: { code: '23514' } // Version mismatch
      });

      await expect(
        walletService.updateWalletBalance(TEST_WALLET_ID)
      ).rejects.toThrow('Wallet operation failed');
    });

    it('should throw NotFoundError for non-existent wallet', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });

      await expect(
        walletService.updateWalletBalance(TEST_WALLET_ID)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getUserWallets', () => {
    const mockWallets = [
      {
        id: TEST_WALLET_ID,
        user_id: TEST_USER_ID,
        currency: CryptoCurrency.BTC,
        address: MOCK_BTC_ADDRESS,
        balance: '1.5',
        is_custodial: true
      },
      {
        id: 'test-wallet-789',
        user_id: TEST_USER_ID,
        currency: CryptoCurrency.ETH,
        address: MOCK_ETH_ADDRESS,
        balance: '10.0',
        is_custodial: true
      }
    ];

    it('should retrieve all user wallets successfully', async () => {
      mockSupabase.select.mockResolvedValueOnce({ data: mockWallets, error: null });

      const result = await walletService.getUserWallets(TEST_USER_ID);

      expect(result).toEqual(mockWallets);
      expect(mockSupabase.from).toHaveBeenCalledWith('crypto_wallets');
      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', TEST_USER_ID);
      expect(mockSupabase.is).toHaveBeenCalledWith('deleted_at', null);
    });

    it('should return empty array for user with no wallets', async () => {
      mockSupabase.select.mockResolvedValueOnce({ data: [], error: null });

      const result = await walletService.getUserWallets(TEST_USER_ID);

      expect(result).toEqual([]);
    });

    it('should handle database errors during list retrieval', async () => {
      mockSupabase.select.mockResolvedValueOnce({
        data: null,
        error: new Error('Database error')
      });

      await expect(
        walletService.getUserWallets(TEST_USER_ID)
      ).rejects.toThrow('Wallet operation failed');
    });
  });
});