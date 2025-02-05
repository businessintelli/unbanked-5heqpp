// External imports - v0.34.0
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js'; // v2.38.0

// Internal imports
import { WalletService, createWallet, getWallet, updateWalletBalance, getUserWallets } from '../../lib/banking/wallets';
import { Wallet, Transaction, Currency, WalletSchema, TransactionSchema } from '../../types/banking';
import { ValidationError, NotFoundError, DatabaseError } from '../../lib/common/errors';
import { CacheService } from '../../lib/common/cache';
import { Logger } from '../../lib/common/logger';

// Test constants
const TEST_USER_ID = 'test-user-id';
const MOCK_WALLET_ID = 'mock-wallet-id';
const TEST_DATABASE_URL = 'postgres://test:test@localhost:5432/test_db';
const TEST_REDIS_URL = 'redis://localhost:6379/1';

// Mock data
const mockWallet: Wallet = {
  id: MOCK_WALLET_ID,
  user_id: TEST_USER_ID,
  currency: Currency.USD,
  balance: 1000,
  active: true,
  plaid_access_token: null,
  last_sync: new Date(),
  daily_limit: 10000,
  monthly_limit: 50000,
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
  version: 1,
  last_modified_by: TEST_USER_ID
};

const mockTransaction: Transaction = {
  id: 'mock-transaction-id',
  wallet_id: MOCK_WALLET_ID,
  type: 'DEPOSIT',
  amount: 100,
  currency: Currency.USD,
  status: 'COMPLETED',
  metadata: {},
  reference: 'TEST-REF',
  description: 'Test transaction',
  category: 'TEST',
  fee: 0,
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
  version: 1,
  last_modified_by: TEST_USER_ID
};

// Mock services
let walletService: WalletService;
let mockDb: ReturnType<typeof createClient>;
let mockCache: CacheService;
let mockLogger: Logger;

describe('WalletService', () => {
  beforeAll(async () => {
    // Initialize test database
    mockDb = createClient(TEST_DATABASE_URL);
    mockCache = new CacheService(TEST_REDIS_URL);
    mockLogger = new Logger('WalletServiceTest');
    
    // Apply database migrations and setup test data
    await setupTestDatabase();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    
    // Initialize wallet service with mocked dependencies
    walletService = new WalletService(mockDb, mockCache, {
      maxConcurrentLocks: 10,
      lockTimeout: 1000,
      cacheEnabled: true,
      retryAttempts: 3
    });
  });

  afterEach(async () => {
    // Clear cache after each test
    await mockCache.clear('wallet');
  });

  describe('createWallet', () => {
    it('should create a new wallet with valid data', async () => {
      const result = await walletService.createWallet(TEST_USER_ID, Currency.USD);
      
      expect(result).toBeDefined();
      expect(result.user_id).toBe(TEST_USER_ID);
      expect(result.currency).toBe(Currency.USD);
      expect(result.balance).toBe(0);
      expect(result.active).toBe(true);
      expect(result.version).toBe(1);
    });

    it('should throw ValidationError for invalid currency', async () => {
      await expect(
        walletService.createWallet(TEST_USER_ID, 'INVALID' as Currency)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for duplicate wallet currency', async () => {
      await walletService.createWallet(TEST_USER_ID, Currency.USD);
      await expect(
        walletService.createWallet(TEST_USER_ID, Currency.USD)
      ).rejects.toThrow(ValidationError);
    });

    it('should properly set default limits and metadata', async () => {
      const wallet = await walletService.createWallet(TEST_USER_ID, Currency.EUR);
      
      expect(wallet.daily_limit).toBe(10000);
      expect(wallet.monthly_limit).toBe(50000);
      expect(wallet.plaid_access_token).toBeNull();
      expect(wallet.last_sync).toBeInstanceOf(Date);
    });
  });

  describe('getWallet', () => {
    it('should retrieve existing wallet by ID', async () => {
      const wallet = await walletService.getWallet(MOCK_WALLET_ID);
      
      expect(wallet).toBeDefined();
      expect(wallet.id).toBe(MOCK_WALLET_ID);
      expect(wallet.user_id).toBe(TEST_USER_ID);
    });

    it('should throw NotFoundError for non-existent wallet', async () => {
      await expect(
        walletService.getWallet('non-existent-id')
      ).rejects.toThrow(NotFoundError);
    });

    it('should return cached wallet data when available', async () => {
      const cacheKey = `wallet:${MOCK_WALLET_ID}`;
      await mockCache.set(cacheKey, mockWallet, 300);
      
      const wallet = await walletService.getWallet(MOCK_WALLET_ID);
      expect(wallet).toEqual(mockWallet);
    });

    it('should update cache on database fetch', async () => {
      const wallet = await walletService.getWallet(MOCK_WALLET_ID);
      const cachedWallet = await mockCache.get(`wallet:${MOCK_WALLET_ID}`);
      
      expect(cachedWallet).toBeDefined();
      expect(cachedWallet).toEqual(wallet);
    });
  });

  describe('updateWalletBalance', () => {
    it('should update wallet balance with valid transaction', async () => {
      const initialWallet = await walletService.getWallet(MOCK_WALLET_ID);
      const amount = 100;
      
      const updatedWallet = await walletService.updateWalletBalance(
        MOCK_WALLET_ID,
        amount,
        mockTransaction
      );
      
      expect(updatedWallet.balance).toBe(initialWallet.balance + amount);
      expect(updatedWallet.version).toBe(initialWallet.version + 1);
    });

    it('should throw ValidationError for insufficient funds', async () => {
      await expect(
        walletService.updateWalletBalance(MOCK_WALLET_ID, -2000, mockTransaction)
      ).rejects.toThrow(ValidationError);
    });

    it('should handle concurrent balance updates', async () => {
      const updates = Array(5).fill(0).map(() => 
        walletService.updateWalletBalance(MOCK_WALLET_ID, 100, mockTransaction)
      );
      
      const results = await Promise.all(updates);
      const finalWallet = await walletService.getWallet(MOCK_WALLET_ID);
      
      expect(finalWallet.balance).toBe(mockWallet.balance + 500);
      expect(results).toHaveLength(5);
    });

    it('should invalidate cache after balance update', async () => {
      await walletService.updateWalletBalance(MOCK_WALLET_ID, 100, mockTransaction);
      const cachedWallet = await mockCache.get(`wallet:${MOCK_WALLET_ID}`);
      
      expect(cachedWallet).toBeNull();
    });
  });

  describe('getUserWallets', () => {
    it('should retrieve all wallets for user', async () => {
      const wallets = await walletService.getUserWallets(TEST_USER_ID);
      
      expect(Array.isArray(wallets)).toBe(true);
      expect(wallets.length).toBeGreaterThan(0);
      expect(wallets[0].user_id).toBe(TEST_USER_ID);
    });

    it('should return empty array for user with no wallets', async () => {
      const wallets = await walletService.getUserWallets('non-existent-user');
      expect(wallets).toEqual([]);
    });

    it('should only return active wallets', async () => {
      const wallets = await walletService.getUserWallets(TEST_USER_ID);
      expect(wallets.every(w => w.active)).toBe(true);
    });

    it('should sort wallets by creation date', async () => {
      const wallets = await walletService.getUserWallets(TEST_USER_ID);
      const sortedWallets = [...wallets].sort((a, b) => 
        b.created_at.getTime() - a.created_at.getTime()
      );
      
      expect(wallets).toEqual(sortedWallets);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      vi.spyOn(mockDb, 'from').mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await expect(
        walletService.getWallet(MOCK_WALLET_ID)
      ).rejects.toThrow(DatabaseError);
    });

    it('should handle cache service failures gracefully', async () => {
      vi.spyOn(mockCache, 'get').mockRejectedValue(new Error('Cache error'));
      
      const wallet = await walletService.getWallet(MOCK_WALLET_ID);
      expect(wallet).toBeDefined();
      expect(wallet.id).toBe(MOCK_WALLET_ID);
    });

    it('should handle transaction validation errors', async () => {
      const invalidTransaction = { ...mockTransaction, amount: -1 };
      await expect(
        walletService.updateWalletBalance(MOCK_WALLET_ID, 100, invalidTransaction)
      ).rejects.toThrow(ValidationError);
    });
  });
});

// Helper function to setup test database
async function setupTestDatabase(): Promise<void> {
  // Create test tables
  await mockDb.query(`
    CREATE TABLE IF NOT EXISTS wallets (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL,
      currency TEXT NOT NULL,
      balance DECIMAL NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true,
      plaid_access_token TEXT,
      last_sync TIMESTAMP WITH TIME ZONE,
      daily_limit DECIMAL NOT NULL,
      monthly_limit DECIMAL NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
      deleted_at TIMESTAMP WITH TIME ZONE,
      version INTEGER NOT NULL DEFAULT 1,
      last_modified_by UUID NOT NULL
    );
  `);

  // Insert test data
  await mockDb.from('wallets').insert(mockWallet);
}

// Helper function to cleanup test database
async function cleanupTestDatabase(): Promise<void> {
  await mockDb.query('DROP TABLE IF EXISTS wallets');
  await mockDb.end();
  await mockCache.clear('wallet');
}