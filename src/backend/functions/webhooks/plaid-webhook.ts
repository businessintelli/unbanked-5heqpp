// External imports
import { createClient } from '@supabase/supabase-js'; // v2.38.0
import { z } from 'zod'; // v3.22.0
import { Ratelimit } from '@upstash/ratelimit'; // v1.0.0
import Queue from 'bull'; // v4.10.0

// Internal imports
import { PlaidService } from '../../lib/banking/plaid';
import { TransactionService } from '../../lib/banking/transactions';
import { Logger } from '../../lib/common/logger';
import { ValidationError, SecurityError } from '../../lib/common/errors';
import { ErrorCode } from '../../types/common';

// Webhook event types
enum PlaidWebhookType {
  TRANSACTIONS = 'TRANSACTIONS',
  HOLDINGS = 'HOLDINGS',
  INVESTMENTS = 'INVESTMENTS',
  ASSETS = 'ASSETS',
  LIABILITIES = 'LIABILITIES'
}

// Webhook payload validation schema
const WebhookPayloadSchema = z.object({
  webhook_type: z.nativeEnum(PlaidWebhookType),
  webhook_code: z.string(),
  item_id: z.string(),
  error: z.object({
    display_message: z.string().optional(),
    error_code: z.string().optional(),
    error_message: z.string().optional(),
    error_type: z.string().optional()
  }).optional(),
  new_transactions: z.number().optional(),
  removed_transactions: z.array(z.string()).optional(),
  environment: z.enum(['sandbox', 'development', 'production'])
});

/**
 * Enhanced Plaid webhook handler with security, validation, and error handling
 */
export class PlaidWebhookHandler {
  private readonly plaidService: PlaidService;
  private readonly transactionService: TransactionService;
  private readonly logger: Logger;
  private readonly queue: Queue.Queue;
  private readonly rateLimiter: Ratelimit;
  private readonly supabase;

  constructor() {
    this.plaidService = new PlaidService();
    this.transactionService = new TransactionService(
      createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
    );
    this.logger = new Logger('PlaidWebhookHandler', {
      metadata: { service: 'webhooks', provider: 'plaid' }
    });
    this.queue = new Queue('plaid-webhooks', process.env.REDIS_URL!);
    this.rateLimiter = new Ratelimit({
      redis: process.env.REDIS_URL!,
      limiter: Ratelimit.slidingWindow(
        Number(process.env.WEBHOOK_RATE_LIMIT || '100'),
        '1 m'
      )
    });
  }

  /**
   * Main webhook handler with enhanced security and processing
   */
  async handleWebhook(request: Request): Promise<Response> {
    try {
      // Validate request method
      if (request.method !== 'POST') {
        throw new SecurityError(
          'Invalid request method',
          ErrorCode.FORBIDDEN,
          405
        );
      }

      // Validate webhook signature
      const signature = request.headers.get('plaid-verification');
      if (!signature || !this.validateWebhookSignature(signature, await request.text())) {
        throw new SecurityError(
          'Invalid webhook signature',
          ErrorCode.UNAUTHORIZED,
          401
        );
      }

      // Apply rate limiting
      const { success } = await this.rateLimiter.limit(request.url);
      if (!success) {
        throw new SecurityError(
          'Rate limit exceeded',
          ErrorCode.RATE_LIMIT,
          429
        );
      }

      // Parse and validate payload
      const payload = await this.validateWebhookPayload(request);

      // Queue webhook for processing
      await this.queueWebhook(payload);

      return new Response(JSON.stringify({ status: 'success' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      this.logger.error(error as Error);
      
      if (error instanceof SecurityError || error instanceof ValidationError) {
        return new Response(
          JSON.stringify({
            status: 'error',
            error: {
              code: error.code,
              message: error.message
            }
          }),
          {
            status: error.statusCode,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      return new Response(
        JSON.stringify({
          status: 'error',
          error: {
            code: ErrorCode.INTERNAL_ERROR,
            message: 'Internal server error'
          }
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }

  /**
   * Validates webhook signature using Plaid's verification method
   */
  private validateWebhookSignature(signature: string, payload: string): boolean {
    try {
      const webhookSecret = process.env.PLAID_WEBHOOK_SECRET;
      if (!webhookSecret) {
        throw new Error('Webhook secret not configured');
      }

      // Implement Plaid's signature verification logic
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      this.logger.error(error as Error);
      return false;
    }
  }

  /**
   * Validates webhook payload against schema
   */
  private async validateWebhookPayload(request: Request): Promise<z.infer<typeof WebhookPayloadSchema>> {
    try {
      const payload = await request.json();
      return WebhookPayloadSchema.parseAsync(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error);
      }
      throw error;
    }
  }

  /**
   * Queues webhook for asynchronous processing
   */
  private async queueWebhook(payload: z.infer<typeof WebhookPayloadSchema>): Promise<void> {
    try {
      await this.queue.add(
        'process-webhook',
        {
          payload,
          timestamp: new Date().toISOString()
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000
          },
          removeOnComplete: true,
          timeout: 30000
        }
      );

      this.logger.info('Webhook queued for processing', {
        webhookType: payload.webhook_type,
        webhookCode: payload.webhook_code,
        itemId: payload.item_id
      });
    } catch (error) {
      this.logger.error(error as Error);
      throw error;
    }
  }

  /**
   * Processes transaction webhook events
   */
  private async processTransactionWebhook(payload: z.infer<typeof WebhookPayloadSchema>): Promise<void> {
    if (payload.webhook_type !== PlaidWebhookType.TRANSACTIONS) {
      return;
    }

    try {
      const { item_id, new_transactions } = payload;
      if (!new_transactions) {
        return;
      }

      // Fetch transactions in batches
      const transactions = await this.plaidService.getTransactions(
        item_id,
        new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        new Date()
      );

      // Process transactions in batches
      await this.transactionService.createBatch(transactions);

      // Update account balances
      const accounts = await this.plaidService.getAccounts(item_id);
      await this.transactionService.updateBalances(accounts);

      this.logger.audit({
        user_id: 'system',
        action: 'PROCESS_PLAID_TRANSACTIONS',
        resource: 'transactions',
        details: {
          itemId: item_id,
          transactionCount: new_transactions
        },
        ip_address: '',
        timestamp: new Date(),
        severity: 'INFO',
        correlation_id: crypto.randomUUID(),
        user_agent: '',
        category: 'TRANSACTION'
      });
    } catch (error) {
      this.logger.error(error as Error);
      throw error;
    }
  }
}

// Export webhook handler instance
export const plaidWebhookHandler = new PlaidWebhookHandler();