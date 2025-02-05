// External imports
import { SupabaseClient } from '@supabase/supabase-js'; // v2.38.0
import { z } from 'zod'; // v3.22.0
import Redis from 'ioredis'; // v5.3.0

// Internal imports
import { Transaction, TransactionType, TransactionSchema } from '../../types/banking';
import { Currency, ErrorCode } from '../../types/common';
import { ValidationError, ApplicationError } from '../common/errors';
import { CacheService } from '../common/cache';
import { Logger } from '../common/logger';

// Constants
const DAILY_TRANSFER_LIMIT = 1000;
const MIN_TRANSFER_AMOUNT = 0.01;
const TRANSFER_LOCK_TIMEOUT = 5000;
const CACHE_TTL = 300;

/**
 * Enhanced transfer request validation schema
 */
const TransferRequestSchema = z.object({
  sourceWalletId: z.string().uuid(),
  destinationWalletId: z.string().uuid(),
  amount: z.number()
    .positive()
    .min(MIN_TRANSFER_AMOUNT)
    .max(DAILY_TRANSFER_LIMIT),
  currency: z.nativeEnum(Currency),
  description: z.string().min(1).max(255),
  metadata: z.record(z.unknown()).optional()
}).refine(data => data.sourceWalletId !== data.destinationWalletId, {
  message: "Source and destination wallets must be different"
});

/**
 * Transfer response type
 */
interface TransferResponse {
  success: boolean;
  transactionId?: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Enhanced bank transfer handler with security and performance optimizations
 */
export async function handleTransfer(req: Request): Promise<Response> {
  const logger = new Logger('TransferHandler');
  const supabase = new SupabaseClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
  const cacheService = new CacheService();

  try {
    // Extract and validate JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new ApplicationError('Missing or invalid authorization', ErrorCode.UNAUTHORIZED, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new ApplicationError('Authentication failed', ErrorCode.UNAUTHORIZED, 401);
    }

    // Verify KYC level
    const { data: kycData } = await supabase
      .from('user_kyc')
      .select('level')
      .eq('user_id', user.id)
      .single();

    if (!kycData || kycData.level < 2) {
      throw new ApplicationError('KYC level 2 required for transfers', ErrorCode.FORBIDDEN, 403);
    }

    // Parse and validate request body
    const body = await req.json();
    const validatedData = await TransferRequestSchema.parseAsync(body);

    // Check daily transfer limit
    const dailyTotal = await checkDailyTransferLimit(
      user.id,
      validatedData.amount,
      validatedData.currency,
      cacheService
    );

    if (dailyTotal + validatedData.amount > DAILY_TRANSFER_LIMIT) {
      throw new ApplicationError('Daily transfer limit exceeded', ErrorCode.FORBIDDEN, 403);
    }

    // Begin database transaction with distributed locking
    const { data: result, error: transferError } = await supabase.rpc(
      'execute_transfer',
      {
        p_source_wallet_id: validatedData.sourceWalletId,
        p_destination_wallet_id: validatedData.destinationWalletId,
        p_amount: validatedData.amount,
        p_currency: validatedData.currency,
        p_user_id: user.id,
        p_description: validatedData.description,
        p_metadata: validatedData.metadata || {}
      }
    );

    if (transferError) {
      throw new ApplicationError(
        'Transfer failed',
        ErrorCode.INTERNAL_ERROR,
        500,
        { details: transferError.message }
      );
    }

    // Update cache
    await Promise.all([
      cacheService.delete(`wallet:${validatedData.sourceWalletId}`),
      cacheService.delete(`wallet:${validatedData.destinationWalletId}`),
      cacheService.set(
        `daily_transfers:${user.id}`,
        dailyTotal + validatedData.amount,
        CACHE_TTL
      )
    ]);

    // Log successful transfer
    logger.info('Transfer completed successfully', {
      userId: user.id,
      sourceWalletId: validatedData.sourceWalletId,
      destinationWalletId: validatedData.destinationWalletId,
      amount: validatedData.amount,
      currency: validatedData.currency,
      transactionId: result.transaction_id
    });

    return new Response(
      JSON.stringify({
        success: true,
        transactionId: result.transaction_id,
        message: 'Transfer completed successfully'
      } as TransferResponse),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        }
      }
    );

  } catch (error) {
    logger.error(error as Error);

    const statusCode = error instanceof ApplicationError ? error.statusCode : 500;
    const errorResponse: TransferResponse = {
      success: false,
      message: error instanceof Error ? error.message : 'Internal server error',
      details: error instanceof ApplicationError ? error.details : undefined
    };

    return new Response(
      JSON.stringify(errorResponse),
      {
        status: statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        }
      }
    );
  }
}

/**
 * Checks and updates daily transfer limit
 */
async function checkDailyTransferLimit(
  userId: string,
  amount: number,
  currency: Currency,
  cacheService: CacheService
): Promise<number> {
  const cacheKey = `daily_transfers:${userId}`;
  const cachedTotal = await cacheService.get<number>(cacheKey);

  if (cachedTotal !== null) {
    return cachedTotal;
  }

  // Calculate daily total from database if not in cache
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: transfers } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('type', TransactionType.TRANSFER)
    .eq('currency', currency)
    .gte('created_at', today.toISOString());

  const dailyTotal = transfers?.reduce((sum, t) => sum + t.amount, 0) || 0;

  // Cache the result
  await cacheService.set(cacheKey, dailyTotal, CACHE_TTL);

  return dailyTotal;
}