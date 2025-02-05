// External imports
import { createClient } from '@supabase/supabase-js'; // v2.38.0
import Redis from 'ioredis'; // v5.3.0
import CircuitBreaker from 'opossum'; // v6.0.0

// Internal imports
import { Wallet } from '../../types/banking';
import { WalletService } from '../../lib/banking/wallets';
import { NotFoundError } from '../../lib/common/errors';
import { Logger } from '../../lib/common/logger';

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const REDIS_URL = process.env.REDIS_URL!;
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '300', 10); // 5 minutes
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || '5000', 10); // 5 seconds

// Constants
const WALLET_CACHE_PREFIX = 'wallet:balance';
const CIRCUIT_BREAKER_OPTIONS = {
  timeout: REQUEST_TIMEOUT,
  errorThresholdPercentage: 50,
  resetTimeout: 30000 // 30 seconds
};

// Initialize logger
const logger = new Logger('GetBalanceFunction');

// Initialize Redis client
const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  connectionName: 'balance_cache'
});

// Initialize circuit breaker
const breaker = new CircuitBreaker(async (walletId: string) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const walletService = new WalletService(supabase, redis);
  return await walletService.getWallet(walletId);
}, CIRCUIT_BREAKER_OPTIONS);

/**
 * Edge function to retrieve wallet balance with caching and monitoring
 */
export async function getBalance(req: Request): Promise<Response> {
  const startTime = Date.now();
  const correlationId = crypto.randomUUID();

  try {
    // Parse and validate request
    const url = new URL(req.url);
    const walletId = url.searchParams.get('wallet_id');

    if (!walletId) {
      throw new Error('wallet_id is required');
    }

    // Generate cache key
    const cacheKey = `${WALLET_CACHE_PREFIX}:${walletId}`;

    // Check cache first
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      const wallet = JSON.parse(cachedData) as Wallet;
      logger.info('Cache hit for wallet balance', {
        walletId,
        correlationId,
        responseTime: Date.now() - startTime,
        cached: true
      });

      return new Response(JSON.stringify({
        status: 'success',
        data: {
          balance: wallet.balance,
          currency: wallet.currency,
          lastUpdated: wallet.lastUpdated
        },
        meta: {
          cached: true,
          timestamp: new Date().toISOString(),
          correlationId
        }
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': correlationId
        }
      });
    }

    // Get wallet data with circuit breaker
    const wallet = await breaker.fire(walletId);

    // Update cache
    await redis.set(cacheKey, JSON.stringify(wallet), 'EX', CACHE_TTL);

    logger.info('Wallet balance retrieved', {
      walletId,
      correlationId,
      responseTime: Date.now() - startTime,
      cached: false
    });

    return new Response(JSON.stringify({
      status: 'success',
      data: {
        balance: wallet.balance,
        currency: wallet.currency,
        lastUpdated: wallet.lastUpdated
      },
      meta: {
        cached: false,
        timestamp: new Date().toISOString(),
        correlationId
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId
      }
    });

  } catch (error) {
    logger.error(error as Error, {
      correlationId,
      responseTime: Date.now() - startTime
    });

    if (error instanceof NotFoundError) {
      return new Response(JSON.stringify({
        status: 'error',
        error: {
          code: 'NOT_FOUND',
          message: 'Wallet not found'
        },
        meta: {
          timestamp: new Date().toISOString(),
          correlationId
        }
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': correlationId
        }
      });
    }

    return new Response(JSON.stringify({
      status: 'error',
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      },
      meta: {
        timestamp: new Date().toISOString(),
        correlationId
      }
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId
      }
    });
  } finally {
    // Clean up resources
    if (!redis.status.includes('end')) {
      await redis.quit();
    }
  }
}