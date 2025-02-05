// External imports
import { createClient } from '@supabase/supabase-js'; // v2.38.0
import { z } from 'zod'; // v3.22.0
import { rateLimit } from '@upstash/ratelimit'; // v1.0.0
import { Server as SocketServer } from 'socket.io'; // v4.7.2
import crypto from 'crypto';

// Internal imports
import { CryptoTransaction, CryptoTransactionType, CryptoWallet } from '../../types/crypto';
import { WalletService } from '../../lib/crypto/wallets';
import { validateSchema } from '../../lib/common/validation';
import { Logger } from '../../lib/common/logger';
import { ApplicationError, ValidationError } from '../../lib/common/errors';
import { ErrorCode, TransactionStatus } from '../../types/common';

// Environment variables
const WEBHOOK_SECRET = process.env.CRYPTO_WEBHOOK_SECRET;
const RATE_LIMIT_MAX = parseInt(process.env.WEBHOOK_RATE_LIMIT_MAX || '100', 10);
const RETRY_ATTEMPTS = parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS || '3', 10);

// Initialize services
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
const walletService = new WalletService(supabase);
const logger = new Logger('CryptoWebhook');
const io = new SocketServer();

// Webhook payload schemas
const WebhookHeaderSchema = z.object({
  'x-webhook-timestamp': z.string(),
  'x-webhook-signature': z.string(),
});

const TransactionWebhookSchema = z.object({
  type: z.literal('transaction'),
  data: z.object({
    transaction: CryptoTransaction,
    confirmations: z.number().int().min(0),
    network: z.string(),
    timestamp: z.string().datetime(),
  }),
});

const ExchangeWebhookSchema = z.object({
  type: z.literal('exchange'),
  data: z.object({
    sourceTransaction: CryptoTransaction,
    destinationTransaction: CryptoTransaction,
    rate: z.string(),
    fee: z.string(),
    timestamp: z.string().datetime(),
  }),
});

const WebhookPayloadSchema = z.discriminatedUnion('type', [
  TransactionWebhookSchema,
  ExchangeWebhookSchema,
]);

/**
 * Validates webhook signature using HMAC-SHA256
 */
async function validateWebhookSignature(
  payload: string,
  signature: string,
  timestamp: string
): Promise<boolean> {
  if (!WEBHOOK_SECRET) {
    throw new ApplicationError(
      'Webhook secret not configured',
      ErrorCode.INTERNAL_ERROR,
      500
    );
  }

  // Verify timestamp freshness (5 minutes)
  const timestampDate = new Date(timestamp);
  const now = new Date();
  if (Math.abs(now.getTime() - timestampDate.getTime()) > 5 * 60 * 1000) {
    throw new ValidationError('Webhook timestamp expired');
  }

  // Generate expected signature
  const signaturePayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(signaturePayload)
    .digest('hex');

  // Constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Processes confirmed cryptocurrency transactions
 */
async function handleTransactionConfirmation(
  transaction: CryptoTransaction,
  confirmations: number
): Promise<void> {
  try {
    // Update transaction status based on confirmations
    const requiredConfirmations = transaction.currency === 'BTC' ? 6 : 12;
    if (confirmations >= requiredConfirmations) {
      // Update wallet balance
      await walletService.updateWalletBalance(transaction.wallet_id);

      // Update transaction status
      const { error } = await supabase
        .from('crypto_transactions')
        .update({
          status: TransactionStatus.COMPLETED,
          block_confirmations: confirmations,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.id);

      if (error) throw error;

      // Emit real-time update
      io.emit('transaction:confirmed', {
        wallet_id: transaction.wallet_id,
        transaction_id: transaction.id,
        confirmations,
      });

      logger.info('Transaction confirmed', {
        transactionId: transaction.id,
        confirmations,
        currency: transaction.currency,
      });
    }
  } catch (error) {
    logger.error(error as Error, {
      context: 'handleTransactionConfirmation',
      transactionId: transaction.id,
    });
    throw error;
  }
}

/**
 * Processes completed cryptocurrency exchange operations
 */
async function handleExchangeCompletion(
  sourceTransaction: CryptoTransaction,
  destinationTransaction: CryptoTransaction,
  rate: string
): Promise<void> {
  try {
    // Update both wallets
    await Promise.all([
      walletService.updateWalletBalance(sourceTransaction.wallet_id),
      walletService.updateWalletBalance(destinationTransaction.wallet_id),
    ]);

    // Update transactions status
    const { error } = await supabase
      .from('crypto_transactions')
      .upsert([
        {
          ...sourceTransaction,
          status: TransactionStatus.COMPLETED,
          updated_at: new Date().toISOString(),
        },
        {
          ...destinationTransaction,
          status: TransactionStatus.COMPLETED,
          updated_at: new Date().toISOString(),
        },
      ]);

    if (error) throw error;

    // Emit real-time updates
    io.emit('exchange:completed', {
      source_wallet_id: sourceTransaction.wallet_id,
      destination_wallet_id: destinationTransaction.wallet_id,
      rate,
      timestamp: new Date().toISOString(),
    });

    logger.info('Exchange completed', {
      sourceTransactionId: sourceTransaction.id,
      destinationTransactionId: destinationTransaction.id,
      rate,
    });
  } catch (error) {
    logger.error(error as Error, {
      context: 'handleExchangeCompletion',
      sourceTransactionId: sourceTransaction.id,
      destinationTransactionId: destinationTransaction.id,
    });
    throw error;
  }
}

/**
 * Edge function handler for cryptocurrency webhooks
 */
export async function POST(request: Request) {
  try {
    // Rate limiting
    const limiter = rateLimit({
      max: RATE_LIMIT_MAX,
      window: '1m',
    });

    const isAllowed = await limiter.check(request.headers.get('x-forwarded-for') || '');
    if (!isAllowed) {
      throw new ApplicationError(
        'Rate limit exceeded',
        ErrorCode.RATE_LIMIT,
        429
      );
    }

    // Validate headers
    const headers = await validateSchema(WebhookHeaderSchema, {
      'x-webhook-timestamp': request.headers.get('x-webhook-timestamp'),
      'x-webhook-signature': request.headers.get('x-webhook-signature'),
    });

    // Get and validate payload
    const payload = await request.text();
    const isValidSignature = await validateWebhookSignature(
      payload,
      headers['x-webhook-signature'],
      headers['x-webhook-timestamp']
    );

    if (!isValidSignature) {
      throw new ApplicationError(
        'Invalid webhook signature',
        ErrorCode.UNAUTHORIZED,
        401
      );
    }

    // Parse and validate webhook data
    const webhookData = await validateSchema(
      WebhookPayloadSchema,
      JSON.parse(payload)
    );

    // Handle different webhook types
    switch (webhookData.type) {
      case 'transaction':
        await handleTransactionConfirmation(
          webhookData.data.transaction,
          webhookData.data.confirmations
        );
        break;

      case 'exchange':
        await handleExchangeCompletion(
          webhookData.data.sourceTransaction,
          webhookData.data.destinationTransaction,
          webhookData.data.rate
        );
        break;
    }

    return new Response(JSON.stringify({ status: 'success' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error(error as Error);
    
    const statusCode = error instanceof ApplicationError ? error.statusCode : 500;
    return new Response(
      JSON.stringify({
        status: 'error',
        message: error instanceof Error ? error.message : 'Internal server error',
      }),
      {
        status: statusCode,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}