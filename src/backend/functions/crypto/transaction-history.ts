// External imports
import { createClient } from '@supabase/supabase-js'; // v2.38.0
import { z } from 'zod'; // v3.22.0
import { Redis } from 'redis'; // v4.6.0

// Internal imports
import { CryptoTransaction, CryptoTransactionSchema } from '../../types/crypto';
import { validateRequest } from '../../lib/common/validation';
import { NotFoundError, ValidationError, RateLimitError } from '../../lib/common/errors';
import { getWallet, validateWalletAccess } from '../../lib/crypto/wallets';
import { cacheManager } from '../../lib/common/cache';
import { Logger } from '../../lib/common/logger';

// Constants
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const CACHE_TTL = 300; // 5 minutes
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100;

// Initialize logger
const logger = new Logger('transaction-history');

// Request validation schema
const transactionHistorySchema = z.object({
  wallet_id: z.string().uuid(),
  page_size: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().optional(),
  start_date: z.date().optional(),
  end_date: z.date().optional(),
  transaction_type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'EXCHANGE']).optional(),
  min_amount: z.string().regex(/^\d+\.?\d*$/).optional(),
  max_amount: z.string().regex(/^\d+\.?\d*$/).optional(),
  sort_order: z.enum(['asc', 'desc']).default('desc')
});

// Performance decorator
function measurePerformance(
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
) {
  const originalMethod = descriptor.value;
  descriptor.value = async function (...args: any[]) {
    const start = performance.now();
    const result = await originalMethod.apply(this, args);
    const duration = performance.now() - start;
    result.performance = { queryTime: duration };
    return result;
  };
  return descriptor;
}

// Rate limiting decorator
function rateLimit(windowMs: number, maxRequests: number) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const key = `ratelimit:${args[0]}`;
      const count = await cacheManager.get<number>(key) || 0;
      
      if (count >= maxRequests) {
        throw new RateLimitError('Rate limit exceeded');
      }
      
      await cacheManager.set(key, count + 1, windowMs / 1000);
      return originalMethod.apply(this, args);
    };
    return descriptor;
  };
}

class TransactionHistoryService {
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  /**
   * Retrieves paginated transaction history with caching and security checks
   */
  @validateRequest(transactionHistorySchema)
  @rateLimit(RATE_LIMIT_WINDOW, RATE_LIMIT_MAX_REQUESTS)
  @measurePerformance
  async getTransactionHistory(
    wallet_id: string,
    options: z.infer<typeof transactionHistorySchema>
  ): Promise<{
    data: CryptoTransaction[];
    count: number;
    cursor: string;
    performance?: { queryTime: number; cacheHit: boolean };
  }> {
    try {
      // Check cache first
      const cacheKey = `txhistory:${wallet_id}:${JSON.stringify(options)}`;
      const cachedResult = await cacheManager.get<any>(cacheKey);
      
      if (cachedResult) {
        logger.debug('Cache hit for transaction history', { wallet_id });
        return { ...cachedResult, performance: { queryTime: 0, cacheHit: true } };
      }

      // Validate wallet access
      const wallet = await getWallet(wallet_id);
      await validateWalletAccess(wallet);

      // Build query
      let query = this.supabase
        .from('crypto_transactions')
        .select('*', { count: 'exact' })
        .eq('wallet_id', wallet_id)
        .order('created_at', { ascending: options.sort_order === 'asc' })
        .limit(options.page_size);

      // Apply filters
      if (options.cursor) {
        query = query.lt('created_at', new Date(options.cursor));
      }
      if (options.start_date) {
        query = query.gte('created_at', options.start_date);
      }
      if (options.end_date) {
        query = query.lte('created_at', options.end_date);
      }
      if (options.transaction_type) {
        query = query.eq('type', options.transaction_type);
      }
      if (options.min_amount) {
        query = query.gte('amount', options.min_amount);
      }
      if (options.max_amount) {
        query = query.lte('amount', options.max_amount);
      }

      // Execute query with timeout
      const queryPromise = query;
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout')), 5000);
      });

      const { data, error, count } = await Promise.race([
        queryPromise,
        timeoutPromise
      ]) as any;

      if (error) throw error;

      // Validate response data
      const validatedData = data.map((tx: any) =>
        CryptoTransactionSchema.parse(tx)
      );

      // Generate next cursor
      const cursor = data.length
        ? new Date(data[data.length - 1].created_at).toISOString()
        : null;

      const result = {
        data: validatedData,
        count: count || 0,
        cursor
      };

      // Cache results
      await cacheManager.set(cacheKey, result, CACHE_TTL);

      logger.info('Transaction history retrieved', {
        wallet_id,
        count: result.count,
        filters: options
      });

      return result;
    } catch (error) {
      logger.error(error as Error, { wallet_id });
      throw error;
    }
  }
}

const service = new TransactionHistoryService();

export default async function handler(req: any, res: any) {
  try {
    const result = await service.getTransactionHistory(
      req.params.wallet_id,
      req.query
    );
    
    res.setHeader('Cache-Control', `public, max-age=${CACHE_TTL}`);
    return res.json({
      status: 'success',
      data: result,
      error: null,
      meta: {
        timestamp: new Date(),
        version: '1.0'
      }
    });
  } catch (error) {
    logger.error(error as Error);
    
    if (error instanceof ValidationError) {
      return res.status(400).json({
        status: 'error',
        data: null,
        error: { code: 'VALIDATION_ERROR', message: error.message }
      });
    }
    
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        status: 'error',
        data: null,
        error: { code: 'NOT_FOUND', message: error.message }
      });
    }
    
    if (error instanceof RateLimitError) {
      return res.status(429).json({
        status: 'error',
        data: null,
        error: { code: 'RATE_LIMIT', message: error.message }
      });
    }

    return res.status(500).json({
      status: 'error',
      data: null,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
  }
}