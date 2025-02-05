// External imports
import { createClient } from '@supabase/supabase-js'; // v2.38.0

// Internal imports
import { CryptoWallet, CryptoWalletSchema } from '../../types/crypto';
import { validateSchema } from '../../lib/common/validation';
import { WalletService } from '../../lib/crypto/wallets';
import { ValidationError } from '../../lib/common/errors';
import { CryptoCurrency, ErrorCode } from '../../types/common';
import { Logger } from '../../lib/common/logger';
import { CacheService } from '../../lib/common/cache';

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10);
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '5', 10);

// Constants
const CACHE_NAMESPACE = 'rate_limit:create_wallet';
const CACHE_TTL = 60; // 1 minute

/**
 * Edge Function handler for creating cryptocurrency wallets
 * Supports both custodial and non-custodial wallets with enhanced security
 */
export async function createWalletHandler(request: Request): Promise<Response> {
  const logger = new Logger('CreateWalletFunction');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const cacheService = new CacheService();

  try {
    // Validate request method
    if (request.method !== 'POST') {
      throw new ValidationError('Method not allowed');
    }

    // Extract and validate JWT token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new ValidationError('Missing or invalid authorization header');
    }

    // Parse request body
    const requestBody = await request.json();
    logger.debug('Received wallet creation request', { requestBody });

    // Rate limiting check
    const clientIp = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for');
    const rateLimitKey = `${CACHE_NAMESPACE}:${clientIp}`;
    const requestCount = await cacheService.get<number>(rateLimitKey) || 0;

    if (requestCount >= RATE_LIMIT_MAX_REQUESTS) {
      throw new ValidationError('Rate limit exceeded');
    }
    await cacheService.set(rateLimitKey, requestCount + 1, CACHE_TTL);

    // Validate request parameters
    const { user_id, currency, is_custodial, network, security_level } = requestBody;

    if (!Object.values(CryptoCurrency).includes(currency)) {
      throw new ValidationError('Invalid cryptocurrency');
    }

    // Initialize wallet service
    const walletService = new WalletService(supabase, cacheService);

    // Create wallet with options
    const wallet = await walletService.createWallet(
      user_id,
      currency as CryptoCurrency,
      is_custodial,
      {
        network,
        securityLevel: security_level || 'standard',
        backupEnabled: true
      }
    );

    // Log successful wallet creation
    logger.info('Wallet created successfully', {
      userId: user_id,
      currency,
      walletId: wallet.id,
      isCustodial: is_custodial
    });

    // Return success response
    return new Response(
      JSON.stringify({
        status: 'success',
        data: wallet,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID()
        }
      }),
      {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff'
        }
      }
    );

  } catch (error) {
    // Log error details
    logger.error(error as Error);

    // Determine error response
    const errorResponse = {
      status: 'error',
      error: {
        code: error instanceof ValidationError ? ErrorCode.VALIDATION_ERROR : ErrorCode.INTERNAL_ERROR,
        message: error instanceof Error ? error.message : 'Internal server error'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: crypto.randomUUID()
      }
    };

    // Return error response
    return new Response(
      JSON.stringify(errorResponse),
      {
        status: error instanceof ValidationError ? 400 : 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff'
        }
      }
    );
  } finally {
    // Cleanup resources
    await cacheService.client?.quit();
  }
}