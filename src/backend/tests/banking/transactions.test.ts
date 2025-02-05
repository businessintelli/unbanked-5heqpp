// External imports
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'; // v1.0.0
import { createClient } from '@supabase/supabase-js'; // v2.38.0

// Internal imports
import { TransactionService } from '../../lib/banking/transactions';
import { 
  Transaction, 
  TransactionType, 
  TransactionSchema, 
  SecurityContext 
} from '../../types/banking';
import { 
  ValidationError, 
  NotFoundError, 
  SecurityError, 
  RateLimitError 
} from '../../lib/common/errors';
import { CacheService } from '../../lib/common/cache';
import { Currency } from '../../types/common';

// Mock setup
vi.mock('@supabase/supabase-js');
vi.mock('../../lib/common/cache');

// Test constants
const MOCK_USER_ID = 'user-123';
const MOCK_SESSION_ID = 'session-123';
const MOCK_WALLET_ID = 'wallet-123';
const MOCK_TRANSACTION_ID = 'transaction-123';

// Mock data
const mockSecurityContext: SecurityContext = {
  userId: MOCK_USER_ID,
  sessionId: MOCK_SESSION_ID,
  ipAddress: '127.0.0.1',
  userAgent: 'test-agent',
  mfaVerified: true
};

const mockTransaction: Transaction = {
  id: MOCK_TRANSACTION_ID,
  wallet_id: MOCK_WALLET_ID,
  type: TransactionType.TRANSFER,
  amount: 100.00,
  currency: Currency.USD,
  status: 'COMPLETED',
  metadata: { reference: 'TEST-001' },
  reference: 'TEST-001',
  description: 'Test transaction',
  category: 'transfer',
  fee: 0,
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
  version: 1,
  last_modified_by: MOCK_USER_ID
};

describe('TransactionService', () => {
  let transactionService: TransactionService;
  let mockSupabase: any;
  let mockCache: jest.Mocked<CacheService>;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup Supabase mock
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      rpc: vi.fn(),
    };

    // Setup Cache mock
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
    } as any;

    // Initialize service
    transactionService = new TransactionService(mockSupabase, mockCache);
  });

  describe('create', () => {
    it('should create a valid transaction successfully', async () => {
      const transactionData = {
        wallet_id: MOCK_WALLET_ID,
        type: TransactionType.TRANSFER,
        amount: 100.00,
        currency: Currency.USD,
        metadata: { reference: 'TEST-001' },
        reference: 'TEST-001',
        description: 'Test transaction',
        category: 'transfer',
        fee: 0
      };

      mockSupabase.rpc.mockResolvedValue({ data: mockTransaction, error: null });

      const result = await transactionService.createTransaction(
        transactionData,
        mockSecurityContext
      );

      expect(result).toEqual(mockTransaction);
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'create_transaction',
        expect.any(Object)
      );
      expect(mockCache.clear).toHaveBeenCalled();
    });

    it('should throw ValidationError for invalid transaction data', async () => {
      const invalidData = {
        wallet_id: MOCK_WALLET_ID,
        type: TransactionType.TRANSFER,
        amount: -100, // Invalid negative amount
        currency: Currency.USD
      };

      await expect(
        transactionService.createTransaction(invalidData, mockSecurityContext)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw SecurityError for invalid security context', async () => {
      const invalidContext = { ...mockSecurityContext, mfaVerified: false };

      await expect(
        transactionService.createTransaction(mockTransaction, invalidContext)
      ).rejects.toThrow(SecurityError);
    });

    it('should handle rate limiting correctly', async () => {
      mockSupabase.rpc.mockRejectedValue(new RateLimitError('Rate limit exceeded'));

      await expect(
        transactionService.createTransaction(mockTransaction, mockSecurityContext)
      ).rejects.toThrow(RateLimitError);
    });
  });

  describe('get', () => {
    it('should retrieve transaction from cache when available', async () => {
      mockCache.get.mockResolvedValue(mockTransaction);

      const result = await transactionService.getTransaction(
        MOCK_TRANSACTION_ID,
        mockSecurityContext
      );

      expect(result).toEqual(mockTransaction);
      expect(mockCache.get).toHaveBeenCalledWith(
        expect.stringContaining(MOCK_TRANSACTION_ID)
      );
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it('should retrieve transaction from database on cache miss', async () => {
      mockCache.get.mockResolvedValue(null);
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: mockTransaction,
        error: null
      });

      const result = await transactionService.getTransaction(
        MOCK_TRANSACTION_ID,
        mockSecurityContext
      );

      expect(result).toEqual(mockTransaction);
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should throw NotFoundError for non-existent transaction', async () => {
      mockCache.get.mockResolvedValue(null);
      mockSupabase.from().select().eq().single.mockResolvedValue({
        data: null,
        error: null
      });

      await expect(
        transactionService.getTransaction(MOCK_TRANSACTION_ID, mockSecurityContext)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('list', () => {
    it('should list transactions with pagination', async () => {
      const mockTransactions = [mockTransaction];
      mockSupabase.from().select().eq().mockResolvedValue({
        data: mockTransactions,
        error: null,
        count: 1
      });

      const result = await transactionService.listTransactions(
        MOCK_WALLET_ID,
        mockSecurityContext,
        1,
        20
      );

      expect(result.transactions).toEqual(mockTransactions);
      expect(result.total).toBe(1);
    });

    it('should apply security filtering to transaction list', async () => {
      const unauthorizedContext = {
        ...mockSecurityContext,
        userId: 'different-user'
      };

      await expect(
        transactionService.listTransactions(
          MOCK_WALLET_ID,
          unauthorizedContext,
          1,
          20
        )
      ).rejects.toThrow(SecurityError);
    });

    it('should handle empty results correctly', async () => {
      mockSupabase.from().select().eq().mockResolvedValue({
        data: [],
        error: null,
        count: 0
      });

      const result = await transactionService.listTransactions(
        MOCK_WALLET_ID,
        mockSecurityContext,
        1,
        20
      );

      expect(result.transactions).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });
});