// External imports
import { z } from 'zod'; // v3.22.0
import { createClient } from '@supabase/supabase-js'; // v2.38.0
import Redis from 'ioredis'; // v5.3.0
import { rateLimit } from '@vercel/edge-rate-limit'; // v1.0.0

// Internal imports
import { Transaction, TransactionType } from '../../../types/banking';
import { TransactionService } from '../../../lib/banking/transactions';
import { validateSchema } from '../../../lib/common/validation';
import { ErrorCode } from '../../../types/common';
import { ApplicationError } from '../../../lib/common/errors';
import { Logger } from '../../../lib/common/logger';
import { CacheService, generateCacheKey } from '../../../lib/common/cache';

// Constants
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const CACHE_TTL = 300; // 5 minutes
const RATE_LIMIT_REQUESTS = 100;
const RATE_LIMIT_WINDOW = 60; // 1 minute

// Initialize services
const logger = new Logger('TransactionHistoryHandler');
const redis = new Redis(process.env.REDIS_URL!);
const cacheService = new CacheService(process.env.REDIS_URL!);
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * Enhanced query parameter validation schema
 */
export const TransactionHistoryQuerySchema = z.object({
  wallet_id: z.string().uuid(),
  cursor: z.string().optional(),
  page_size: z.number().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  type: z.nativeEnum(TransactionType).optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional()
}).refine(data => {
  if (data.start_date && data.end_date) {
    return new Date(data.start_date) <= new Date(data.end_date);
  }
  return true;
}, {
  message: "End date must be after start date"
});

/**
 * Security context for request validation
 */
interface SecurityContext {
  userId: string;
  sessionId: string;
  ipAddress: string;
  userAgent: string;
}

/**
 * Edge function handler for transaction history with advanced features
 */
export const transactionHistoryHandler = async (req: Request): Promise<Response> => {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    // Rate limiting check
    const rateLimitResult = await rateLimit({
      requests: RATE_LIMIT_REQUESTS,
      window: RATE_LIMIT_WINDOW,
      identifier: req.headers.get('x-forwarded-for') || 'anonymous'
    });

    if (!rateLimitResult.success) {
      throw new ApplicationError(
        'Rate limit exceeded',
        ErrorCode.RATE_LIMIT,
        429
      );
    }

    // Parse and validate query parameters
    const url = new URL(req.url);
    const queryParams = Object.fromEntries(url.searchParams);
    const validatedParams = await validateSchema(
      TransactionHistoryQuerySchema,
      queryParams
    );

    // Extract security context from request headers
    const securityContext: SecurityContext = {
      userId: req.headers.get('x-user-id') || '',
      sessionId: req.headers.get('x-session-id') || '',
      ipAddress: req.headers.get('x-forwarded-for') || '',
      userAgent: req.headers.get('user-agent') || ''
    };

    // Generate cache key
    const cacheKey = generateCacheKey('transactions', `${validatedParams.wallet_id}:${validatedParams.cursor || 'start'}`);

    // Try to get from cache
    const cachedData = await cacheService.get<{
      transactions: Transaction[];
      cursor: string | null;
      hasMore: boolean;
    }>(cacheKey);

    if (cachedData) {
      logger.debug('Cache hit for transaction history', {
        wallet_id: validatedParams.wallet_id,
        requestId
      });

      return new Response(JSON.stringify({
        status: 'success',
        data: cachedData,
        meta: {
          timestamp: new Date(),
          requestId,
          cached: true,
          latency: Date.now() - startTime
        }
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `private, max-age=${CACHE_TTL}`,
          'X-Request-ID': requestId
        }
      });
    }

    // Initialize transaction service
    const transactionService = new TransactionService(supabase, cacheService);

    // Build query filters
    const filters = {
      type: validatedParams.type,
      startDate: validatedParams.start_date ? new Date(validatedParams.start_date) : undefined,
      endDate: validatedParams.end_date ? new Date(validatedParams.end_date) : undefined
    };

    // Fetch transactions with cursor-based pagination
    const result = await transactionService.listTransactions(
      validatedParams.wallet_id,
      securityContext,
      validatedParams.page_size,
      validatedParams.cursor,
      filters
    );

    // Cache the results
    await cacheService.set(cacheKey, result, CACHE_TTL);

    // Log successful request
    logger.info('Transaction history retrieved', {
      wallet_id: validatedParams.wallet_id,
      count: result.transactions.length,
      requestId,
      latency: Date.now() - startTime
    });

    // Return formatted response
    return new Response(JSON.stringify({
      status: 'success',
      data: result,
      meta: {
        timestamp: new Date(),
        requestId,
        cached: false,
        latency: Date.now() - startTime
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `private, max-age=${CACHE_TTL}`,
        'X-Request-ID': requestId
      }
    });

  } catch (error) {
    // Log error with context
    logger.error(error as Error, {
      requestId,
      latency: Date.now() - startTime
    });

    // Format error response
    const errorResponse = error instanceof ApplicationError ? error : new ApplicationError(
      'Internal server error',
      ErrorCode.INTERNAL_ERROR,
      500
    );

    return new Response(JSON.stringify({
      status: 'error',
      error: {
        code: errorResponse.code,
        message: errorResponse.message
      },
      meta: {
        timestamp: new Date(),
        requestId,
        latency: Date.now() - startTime
      }
    }), {
      status: errorResponse.statusCode,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId
      }
    });
  }
};