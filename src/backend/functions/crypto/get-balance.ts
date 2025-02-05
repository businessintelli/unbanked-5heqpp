// External imports
import { z } from 'zod'; // v3.22.0
import { createClient } from '@supabase/supabase-js'; // v2.38.0
import { rateLimit } from '@upstash/ratelimit'; // v1.0.0
import * as metrics from '@opentelemetry/api'; // v1.4.0

// Internal imports
import { CryptoWallet } from '../../types/crypto';
import { WalletService } from '../../lib/crypto/wallets';
import { validateSchema } from '../../lib/common/validation';
import { CacheService } from '../../lib/common/cache';
import { Logger } from '../../lib/common/logger';
import { ApplicationError, ValidationError } from '../../lib/common/errors';
import { ErrorCode } from '../../types/common';

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const REDIS_URL = process.env.REDIS_URL!;
const RATE_LIMIT_REQUESTS = parseInt(process.env.RATE_LIMIT_REQUESTS || '100', 10);
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '60', 10);

// Constants
const CACHE_TTL = 60; // 1 minute cache for balance
const CACHE_NAMESPACE = 'wallet_balance';
const METER_NAME = 'crypto.get-balance';

// Request validation schema
const GetBalanceParamsSchema = z.object({
  wallet_id: z.string().uuid(),
  include_price: z.boolean().optional().default(false)
});

// Response type
interface GetBalanceResponse {
  balance: string;
  currency: string;
  usd_value?: string;
  cached: boolean;
  timestamp: string;
}

// Initialize services
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const cacheService = new CacheService(REDIS_URL);
const walletService = new WalletService(supabase, cacheService);
const logger = new Logger('get-balance');
const meter = metrics.getMeter(METER_NAME);
const histogram = meter.createHistogram('response_time');

/**
 * Edge function handler for retrieving crypto wallet balance
 * with caching, rate limiting, and performance monitoring
 */
export const getBalanceHandler = async (req: Request): Promise<Response> => {
  const startTime = performance.now();
  const requestId = crypto.randomUUID();

  try {
    // Apply rate limiting
    const limiter = rateLimit({
      requests: RATE_LIMIT_REQUESTS,
      window: RATE_LIMIT_WINDOW
    });
    const rateLimitResult = await limiter.limit(requestId);
    if (!rateLimitResult.success) {
      throw new ApplicationError(
        'Rate limit exceeded',
        ErrorCode.RATE_LIMIT,
        429,
        { retryAfter: rateLimitResult.reset }
      );
    }

    // Parse and validate request parameters
    const params = await validateSchema(GetBalanceParamsSchema, {
      wallet_id: req.headers.get('wallet-id'),
      include_price: req.headers.get('include-price') === 'true'
    });

    // Check cache first
    const cacheKey = `${CACHE_NAMESPACE}:${params.wallet_id}`;
    const cachedData = await cacheService.get<GetBalanceResponse>(cacheKey);
    
    if (cachedData) {
      logger.debug('Cache hit for wallet balance', { wallet_id: params.wallet_id });
      return createResponse(cachedData);
    }

    // Retrieve wallet details
    const wallet = await walletService.getWallet(params.wallet_id);
    if (!wallet) {
      throw new ApplicationError(
        'Wallet not found',
        ErrorCode.NOT_FOUND,
        404,
        { wallet_id: params.wallet_id }
      );
    }

    // Prepare response
    const response: GetBalanceResponse = {
      balance: wallet.balance,
      currency: wallet.currency,
      cached: false,
      timestamp: new Date().toISOString()
    };

    // Add USD value if requested
    if (params.include_price) {
      const usdValue = await fetchUsdValue(wallet);
      response.usd_value = usdValue;
    }

    // Cache the response
    await cacheService.set(cacheKey, response, CACHE_TTL);

    // Record metrics
    const endTime = performance.now();
    histogram.record(endTime - startTime);

    return createResponse(response);
  } catch (error) {
    logger.error(error as Error, { requestId });
    return handleError(error);
  }
};

/**
 * Fetches current USD value for wallet balance
 */
async function fetchUsdValue(wallet: CryptoWallet): Promise<string> {
  try {
    // Implementation would integrate with price feed service
    // Placeholder for demonstration
    return '0.00';
  } catch (error) {
    logger.error(error as Error);
    return '0.00';
  }
}

/**
 * Creates a standardized response with security headers
 */
function createResponse(data: GetBalanceResponse): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, max-age=0',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block'
  });

  return new Response(
    JSON.stringify({
      status: 'success',
      data,
      error: null
    }),
    {
      status: 200,
      headers
    }
  );
}

/**
 * Handles errors and returns appropriate response
 */
function handleError(error: unknown): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, max-age=0'
  });

  if (error instanceof ApplicationError) {
    return new Response(
      JSON.stringify({
        status: 'error',
        data: null,
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      }),
      {
        status: error.statusCode,
        headers
      }
    );
  }

  return new Response(
    JSON.stringify({
      status: 'error',
      data: null,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'An unexpected error occurred'
      }
    }),
    {
      status: 500,
      headers
    }
  );
}