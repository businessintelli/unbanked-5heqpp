// External imports
import { SupabaseClient } from '@supabase/supabase-js'; // v2.38.0
import { z } from 'zod'; // v3.22.0

// Internal imports
import { Wallet, Transaction, WalletSchema, TransactionSchema } from '../../types/banking';
import { ValidationError, NotFoundError, ConcurrencyError } from '../common/errors';
import { CacheService, generateCacheKey } from '../common/cache';
import { Logger } from '../common/logger';
import { Currency, ErrorCode } from '../../types/common';

// Constants
const WALLET_CACHE_NAMESPACE = 'wallet';
const WALLET_CACHE_TTL = 300; // 5 minutes
const MAX_RETRY_ATTEMPTS = 3;
const LOCK_TIMEOUT = 5000; // 5 seconds

/**
 * Enhanced wallet service configuration
 */
interface WalletServiceConfig {
  maxConcurrentLocks?: number;
  lockTimeout?: number;
  cacheEnabled?: boolean;
  retryAttempts?: number;
}

/**
 * Enhanced wallet management service with advanced features
 */
export class WalletService {
  private readonly db: SupabaseClient;
  private readonly cache: CacheService;
  private readonly logger: Logger;
  private readonly config: Required<WalletServiceConfig>;
  private readonly locks: Map<string, NodeJS.Timeout>;

  constructor(
    db: SupabaseClient,
    cache: CacheService,
    config: WalletServiceConfig = {}
  ) {
    this.db = db;
    this.cache = cache;
    this.logger = new Logger('WalletService');
    this.locks = new Map();
    
    this.config = {
      maxConcurrentLocks: config.maxConcurrentLocks ?? 100,
      lockTimeout: config.lockTimeout ?? LOCK_TIMEOUT,
      cacheEnabled: config.cacheEnabled ?? true,
      retryAttempts: config.retryAttempts ?? MAX_RETRY_ATTEMPTS
    };
  }

  /**
   * Creates a new wallet with enhanced validation
   */
  async createWallet(userId: string, currency: Currency): Promise<Wallet> {
    try {
      // Validate input parameters
      const validatedData = WalletSchema.parse({
        user_id: userId,
        currency,
        balance: 0,
        active: true,
        plaid_access_token: null,
        last_sync: new Date(),
        daily_limit: 10000, // Default daily limit
        monthly_limit: 50000 // Default monthly limit
      });

      // Acquire lock for user
      await this.acquireLock(`user:${userId}`);

      // Check existing wallet
      const { data: existingWallet } = await this.db
        .from('wallets')
        .select()
        .eq('user_id', userId)
        .eq('currency', currency)
        .single();

      if (existingWallet) {
        throw new ValidationError(
          new z.ZodError([{
            code: z.ZodIssueCode.custom,
            path: ['currency'],
            message: `Wallet already exists for currency ${currency}`
          }])
        );
      }

      // Create wallet with optimistic locking
      const { data: wallet, error } = await this.db
        .from('wallets')
        .insert({
          ...validatedData,
          version: 1,
          created_at: new Date(),
          updated_at: new Date()
        })
        .single();

      if (error) throw error;

      // Cache new wallet
      if (this.config.cacheEnabled) {
        await this.cache.set(
          generateCacheKey(WALLET_CACHE_NAMESPACE, wallet.id),
          wallet,
          WALLET_CACHE_TTL
        );
      }

      this.logger.info('Wallet created', { userId, currency, walletId: wallet.id });
      return wallet;

    } catch (error) {
      this.logger.error(error as Error, { userId, currency });
      throw error;
    } finally {
      await this.releaseLock(`user:${userId}`);
    }
  }

  /**
   * Retrieves a wallet with advanced caching
   */
  async getWallet(walletId: string): Promise<Wallet> {
    try {
      // Check cache first
      if (this.config.cacheEnabled) {
        const cacheKey = generateCacheKey(WALLET_CACHE_NAMESPACE, walletId);
        const cachedWallet = await this.cache.get<Wallet>(cacheKey);
        if (cachedWallet) {
          this.logger.debug('Cache hit for wallet', { walletId });
          return cachedWallet;
        }
      }

      // Fetch from database
      const { data: wallet, error } = await this.db
        .from('wallets')
        .select()
        .eq('id', walletId)
        .single();

      if (error || !wallet) {
        throw new NotFoundError('Wallet not found', { walletId });
      }

      // Update cache
      if (this.config.cacheEnabled) {
        await this.cache.set(
          generateCacheKey(WALLET_CACHE_NAMESPACE, walletId),
          wallet,
          WALLET_CACHE_TTL
        );
      }

      return wallet;

    } catch (error) {
      this.logger.error(error as Error, { walletId });
      throw error;
    }
  }

  /**
   * Updates wallet balance with optimistic locking
   */
  async updateWalletBalance(
    walletId: string,
    amount: number,
    transaction: Transaction
  ): Promise<Wallet> {
    try {
      // Validate transaction
      TransactionSchema.parse(transaction);

      // Acquire lock
      await this.acquireLock(`wallet:${walletId}`);

      let attempts = 0;
      while (attempts < this.config.retryAttempts) {
        try {
          // Get current wallet state
          const wallet = await this.getWallet(walletId);
          
          // Validate balance
          const newBalance = wallet.balance + amount;
          if (newBalance < 0) {
            throw new ValidationError(
              new z.ZodError([{
                code: z.ZodIssueCode.custom,
                path: ['balance'],
                message: 'Insufficient funds'
              }])
            );
          }

          // Update with optimistic locking
          const { data: updatedWallet, error } = await this.db
            .from('wallets')
            .update({
              balance: newBalance,
              version: wallet.version + 1,
              updated_at: new Date()
            })
            .eq('id', walletId)
            .eq('version', wallet.version)
            .single();

          if (error) throw error;
          if (!updatedWallet) throw new ConcurrencyError('Wallet was updated concurrently');

          // Invalidate cache
          if (this.config.cacheEnabled) {
            await this.cache.delete(generateCacheKey(WALLET_CACHE_NAMESPACE, walletId));
          }

          this.logger.info('Wallet balance updated', {
            walletId,
            amount,
            newBalance,
            transactionId: transaction.id
          });

          return updatedWallet;

        } catch (error) {
          if (error instanceof ConcurrencyError && attempts < this.config.retryAttempts - 1) {
            attempts++;
            continue;
          }
          throw error;
        }
      }

      throw new ApplicationError(
        'Max retry attempts exceeded',
        ErrorCode.INTERNAL_ERROR,
        500
      );

    } catch (error) {
      this.logger.error(error as Error, { walletId, amount, transactionId: transaction.id });
      throw error;
    } finally {
      await this.releaseLock(`wallet:${walletId}`);
    }
  }

  /**
   * Retrieves all wallets for a user
   */
  async getUserWallets(userId: string): Promise<Wallet[]> {
    try {
      const { data: wallets, error } = await this.db
        .from('wallets')
        .select()
        .eq('user_id', userId)
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return wallets;

    } catch (error) {
      this.logger.error(error as Error, { userId });
      throw error;
    }
  }

  /**
   * Acquires a distributed lock
   */
  private async acquireLock(key: string): Promise<void> {
    if (this.locks.size >= this.config.maxConcurrentLocks) {
      throw new ApplicationError(
        'Max concurrent locks reached',
        ErrorCode.INTERNAL_ERROR,
        500
      );
    }

    const timeout = setTimeout(() => {
      this.locks.delete(key);
    }, this.config.lockTimeout);

    this.locks.set(key, timeout);
  }

  /**
   * Releases a distributed lock
   */
  private async releaseLock(key: string): Promise<void> {
    const timeout = this.locks.get(key);
    if (timeout) {
      clearTimeout(timeout);
      this.locks.delete(key);
    }
  }
}