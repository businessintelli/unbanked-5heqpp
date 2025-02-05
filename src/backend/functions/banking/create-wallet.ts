// External imports
import { createClient } from '@supabase/supabase-js'; // v2.38.0
import Redis from 'ioredis'; // v5.0.0
import { rateLimit } from 'express-rate-limit'; // v6.7.0

// Internal imports
import { Wallet, WalletSchema } from '../../types/banking';
import { WalletService } from '../../lib/banking/wallets';
import { validateSchema, sanitizeInput } from '../../lib/common/validation';
import { Logger } from '../../lib/common/logger';
import { Currency, ErrorCode } from '../../types/common';
import { ApplicationError } from '../../lib/common/errors';

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const REDIS_URL = process.env.REDIS_URL!;
const WALLET_CACHE_TTL = parseInt(process.env.WALLET_CACHE_TTL || '300', 10);
const MAX_WALLETS_PER_USER = parseInt(process.env.MAX_WALLETS_PER_USER || '5', 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '10', 10);
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10);

// Initialize services
const logger = new Logger('CreateWalletHandler');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  },
  db: {
    schema: 'public'
  }
});

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  connectionName: 'create_wallet_handler'
});

// Request validation schema
const createWalletRequestSchema = WalletSchema.pick({
  currency: true
}).extend({
  user_id: WalletSchema.shape.user_id,
  metadata: WalletSchema.shape.metadata.optional()
});

// Rate limiter configuration
const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: (_, res) => {
    throw new ApplicationError(
      'Rate limit exceeded',
      ErrorCode.RATE_LIMIT,
      429,
      { window_ms: RATE_LIMIT_WINDOW, max_requests: RATE_LIMIT_MAX }
    );
  }
});

/**
 * Edge function handler for creating new banking wallets
 */
export const createWalletHandler = async (req: Request, res: Response): Promise<void> => {
  const correlationId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    // Validate JWT and extract user claims
    const { user, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new ApplicationError(
        'Unauthorized access',
        ErrorCode.UNAUTHORIZED,
        401,
        { details: authError?.message }
      );
    }

    // Apply rate limiting
    await limiter(req, res, () => {});

    // Validate and sanitize request input
    const sanitizedInput = sanitizeInput(req.body);
    const validatedData = await validateSchema(createWalletRequestSchema, {
      ...sanitizedInput,
      user_id: user.id
    });

    // Initialize wallet service
    const walletService = new WalletService(
      supabase,
      redis,
      { cacheEnabled: true, retryAttempts: 3 }
    );

    // Check existing wallets count
    const existingWallets = await walletService.getUserWallets(user.id);
    if (existingWallets.length >= MAX_WALLETS_PER_USER) {
      throw new ApplicationError(
        'Maximum number of wallets reached',
        ErrorCode.VALIDATION_ERROR,
        400,
        { max_wallets: MAX_WALLETS_PER_USER }
      );
    }

    // Create wallet with transaction
    const wallet = await walletService.createWallet(
      user.id,
      validatedData.currency as Currency
    );

    // Log success metrics
    logger.info('Wallet created successfully', {
      userId: user.id,
      walletId: wallet.id,
      currency: wallet.currency,
      correlationId,
      duration: Date.now() - startTime
    });

    // Return success response
    res.status(201).json({
      status: 'success',
      data: { wallet },
      error: null,
      meta: {
        timestamp: new Date(),
        correlationId,
        version: '1.0'
      }
    });

  } catch (error) {
    // Log error metrics
    logger.error(error as Error, {
      correlationId,
      duration: Date.now() - startTime
    });

    // Handle specific error types
    if (error instanceof ApplicationError) {
      res.status(error.statusCode).json({
        status: 'error',
        data: {},
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        },
        meta: {
          timestamp: new Date(),
          correlationId,
          version: '1.0'
        }
      });
      return;
    }

    // Handle unexpected errors
    res.status(500).json({
      status: 'error',
      data: {},
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'An unexpected error occurred',
        details: {}
      },
      meta: {
        timestamp: new Date(),
        correlationId,
        version: '1.0'
      }
    });
  } finally {
    // Cleanup
    await redis.quit();
  }
};

export default createWalletHandler;