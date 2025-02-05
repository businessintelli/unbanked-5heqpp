// External imports
import { SupabaseClient } from '@supabase/supabase-js'; // v2.38.0
import { z } from 'zod'; // v3.22.0
import rateLimit from 'express-rate-limit'; // v7.1.0
import winston from 'winston'; // v3.11.0
import { injectable, inject } from 'tsyringe'; // v4.0.0

// Internal imports
import { 
  Transaction, 
  TransactionType, 
  TransactionSchema 
} from '../../types/banking';
import { 
  ValidationError, 
  NotFoundError, 
  SecurityError 
} from '../common/errors';
import { 
  validateSchema, 
  validateAmount 
} from '../common/validation';
import { CacheService } from '../common/cache';
import { Logger } from '../common/logger';
import { Currency, ErrorCode } from '../../types/common';

// Constants
const TRANSACTION_CACHE_TTL = 300; // 5 minutes
const TRANSACTION_CACHE_NAMESPACE = 'transactions';
const MAX_TRANSACTION_AMOUNT = 1_000_000; // $1M limit
const RATE_LIMIT_WINDOW = 3600; // 1 hour
const RATE_LIMIT_MAX = 100; // 100 transactions per hour

/**
 * Security context for transaction operations
 */
interface SecurityContext {
  userId: string;
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  mfaVerified: boolean;
}

/**
 * Enhanced transaction validation schema with security rules
 */
const EnhancedTransactionSchema = TransactionSchema.extend({
  amount: z.number()
    .positive()
    .max(MAX_TRANSACTION_AMOUNT)
    .transform(amount => Number(amount.toFixed(2))),
  currency: z.nativeEnum(Currency),
  metadata: z.record(z.unknown()).refine(
    data => Object.keys(data).length <= 20,
    { message: 'Maximum 20 metadata fields allowed' }
  )
});

/**
 * Rate limiter configuration
 */
const transactionRateLimit = rateLimit({
  windowMs: RATE_LIMIT_WINDOW * 1000,
  max: RATE_LIMIT_MAX,
  message: 'Transaction rate limit exceeded',
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Core service for managing banking transactions
 */
@injectable()
export class TransactionService {
  private readonly logger: Logger;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly cacheService: CacheService
  ) {
    this.logger = new Logger('TransactionService');
  }

  /**
   * Creates a new financial transaction with comprehensive validation
   */
  async createTransaction(
    transactionData: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>,
    securityContext: SecurityContext
  ): Promise<Transaction> {
    try {
      // Validate security context
      this.validateSecurityContext(securityContext);

      // Validate transaction data
      const validatedData = await validateSchema<Transaction>(
        EnhancedTransactionSchema,
        transactionData
      );

      // Check rate limits
      if (transactionRateLimit.resetTime) {
        throw new SecurityError(
          'Rate limit exceeded',
          ErrorCode.RATE_LIMIT,
          429
        );
      }

      // Begin database transaction
      const { data: transaction, error } = await this.supabase
        .rpc('create_transaction', {
          transaction_data: validatedData,
          user_id: securityContext.userId
        });

      if (error) {
        throw new Error(error.message);
      }

      // Invalidate relevant caches
      await this.invalidateTransactionCaches(transaction.wallet_id);

      // Log audit trail
      this.logger.audit({
        user_id: securityContext.userId,
        action: 'CREATE_TRANSACTION',
        resource: 'transactions',
        details: {
          transactionId: transaction.id,
          amount: transaction.amount,
          type: transaction.type
        },
        ip_address: securityContext.ipAddress,
        timestamp: new Date(),
        severity: 'INFO',
        correlation_id: crypto.randomUUID(),
        user_agent: securityContext.userAgent,
        category: 'TRANSACTION'
      });

      return transaction;
    } catch (error) {
      this.logger.error(error as Error, {
        userId: securityContext.userId,
        transactionData
      });
      throw error;
    }
  }

  /**
   * Retrieves a transaction by ID with security validation
   */
  async getTransaction(
    transactionId: string,
    securityContext: SecurityContext
  ): Promise<Transaction> {
    try {
      // Check cache first
      const cacheKey = `${TRANSACTION_CACHE_NAMESPACE}:${transactionId}`;
      const cachedTransaction = await this.cacheService.get<Transaction>(cacheKey);

      if (cachedTransaction) {
        return this.validateTransactionAccess(
          cachedTransaction,
          securityContext
        );
      }

      // Fetch from database
      const { data: transaction, error } = await this.supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .single();

      if (error || !transaction) {
        throw new NotFoundError(
          'Transaction not found',
          ErrorCode.NOT_FOUND,
          404
        );
      }

      // Validate access
      const validatedTransaction = await this.validateTransactionAccess(
        transaction,
        securityContext
      );

      // Cache the result
      await this.cacheService.set(
        cacheKey,
        validatedTransaction,
        TRANSACTION_CACHE_TTL
      );

      return validatedTransaction;
    } catch (error) {
      this.logger.error(error as Error, {
        userId: securityContext.userId,
        transactionId
      });
      throw error;
    }
  }

  /**
   * Lists transactions with pagination and filtering
   */
  async listTransactions(
    walletId: string,
    securityContext: SecurityContext,
    page: number = 1,
    limit: number = 20
  ): Promise<{ transactions: Transaction[]; total: number }> {
    try {
      const offset = (page - 1) * limit;

      const { data: transactions, error, count } = await this.supabase
        .from('transactions')
        .select('*', { count: 'exact' })
        .eq('wallet_id', walletId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw error;
      }

      // Validate access for each transaction
      const validatedTransactions = await Promise.all(
        transactions.map(tx => 
          this.validateTransactionAccess(tx, securityContext)
        )
      );

      return {
        transactions: validatedTransactions,
        total: count || 0
      };
    } catch (error) {
      this.logger.error(error as Error, {
        userId: securityContext.userId,
        walletId
      });
      throw error;
    }
  }

  /**
   * Validates security context for transaction operations
   */
  private validateSecurityContext(context: SecurityContext): void {
    if (!context.userId || !context.sessionId) {
      throw new SecurityError(
        'Invalid security context',
        ErrorCode.UNAUTHORIZED,
        401
      );
    }

    if (context.mfaVerified !== true) {
      throw new SecurityError(
        'MFA verification required',
        ErrorCode.UNAUTHORIZED,
        401
      );
    }
  }

  /**
   * Validates user's access to transaction data
   */
  private async validateTransactionAccess(
    transaction: Transaction,
    context: SecurityContext
  ): Promise<Transaction> {
    const { data: wallet, error } = await this.supabase
      .from('wallets')
      .select('user_id')
      .eq('id', transaction.wallet_id)
      .single();

    if (error || !wallet) {
      throw new NotFoundError(
        'Wallet not found',
        ErrorCode.NOT_FOUND,
        404
      );
    }

    if (wallet.user_id !== context.userId) {
      throw new SecurityError(
        'Unauthorized access to transaction',
        ErrorCode.FORBIDDEN,
        403
      );
    }

    return transaction;
  }

  /**
   * Invalidates transaction-related caches
   */
  private async invalidateTransactionCaches(walletId: string): Promise<void> {
    try {
      await this.cacheService.clear(`${TRANSACTION_CACHE_NAMESPACE}:*`);
      await this.cacheService.clear(`wallets:${walletId}:balance`);
    } catch (error) {
      this.logger.error(error as Error, { walletId });
    }
  }
}