// External imports
import { z } from 'zod'; // v3.22.0
import { createClient } from '@supabase/supabase-js'; // v2.38.0
import { RateLimiter } from '@rate-limiter/core'; // v1.0.0

// Internal imports
import { PlaidService } from '../../lib/banking/plaid';
import { PlaidLinkConfig } from '../../types/banking';
import { ValidationError } from '../../lib/common/errors';
import { Logger } from '../../lib/common/logger';

// Environment validation schema
const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  PLAID_ENV: z.enum(['sandbox', 'development', 'production']),
  PLAID_CLIENT_ID: z.string().min(1),
  PLAID_SECRET: z.string().min(1)
});

// Request validation schemas
const createLinkTokenSchema = z.object({
  user_id: z.string().uuid(),
  products: z.array(z.string()).min(1),
  country_codes: z.array(z.string().length(2)).min(1),
  language: z.string().length(2),
  webhook: z.string().url().optional(),
  redirect_uri: z.string().url().optional()
});

const exchangeTokenSchema = z.object({
  public_token: z.string().min(1),
  user_id: z.string().uuid()
});

// Rate limiter configuration
const rateLimiter = new RateLimiter({
  tokensPerInterval: 100,
  interval: 'minute',
  fireImmediately: true
});

// Initialize logger
const logger = new Logger('PlaidLinkFunction', {
  metadata: { service: 'banking', integration: 'plaid' }
});

/**
 * Validates environment variables
 */
function validateEnvironment(): void {
  try {
    envSchema.parse({
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
      PLAID_ENV: process.env.PLAID_ENV,
      PLAID_CLIENT_ID: process.env.PLAID_CLIENT_ID,
      PLAID_SECRET: process.env.PLAID_SECRET
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(error);
    }
    throw error;
  }
}

/**
 * Creates a Plaid Link token with enhanced security and audit logging
 */
export async function createLinkToken(req: Request): Promise<Response> {
  const correlationId = crypto.randomUUID();
  
  try {
    // Validate environment
    validateEnvironment();

    // Rate limiting check
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    const rateLimitKey = `plaid:${clientIp}`;
    
    if (!rateLimiter.tryRemoveTokens(1, rateLimitKey)) {
      throw new Error('Rate limit exceeded');
    }

    // Validate request body
    const body = await req.json();
    const validatedData = createLinkTokenSchema.parse(body);

    // Initialize Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Verify user exists and has appropriate permissions
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, kyc_level')
      .eq('id', validatedData.user_id)
      .single();

    if (userError || !user) {
      throw new Error('User not found or unauthorized');
    }

    // Create PlaidService instance
    const plaidService = new PlaidService();

    // Generate link token
    const linkConfig: PlaidLinkConfig = {
      user_id: validatedData.user_id,
      client_user_id: validatedData.user_id,
      products: validatedData.products,
      country_codes: validatedData.country_codes,
      language: validatedData.language,
      webhook: validatedData.webhook || '',
      redirect_uri: validatedData.redirect_uri || ''
    };

    const linkToken = await plaidService.createLinkToken(linkConfig);

    // Log audit event
    logger.audit({
      user_id: validatedData.user_id,
      action: 'CREATE_PLAID_LINK_TOKEN',
      resource: 'plaid_link',
      details: {
        products: validatedData.products,
        country_codes: validatedData.country_codes
      },
      ip_address: clientIp,
      timestamp: new Date(),
      severity: 'INFO',
      correlation_id: correlationId,
      user_agent: req.headers.get('user-agent') || 'unknown',
      category: 'TRANSACTION'
    });

    return new Response(
      JSON.stringify({
        status: 'success',
        data: { link_token: linkToken },
        error: null,
        meta: {
          timestamp: new Date(),
          correlation_id: correlationId
        }
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    logger.error(error as Error, { correlation_id: correlationId });

    return new Response(
      JSON.stringify({
        status: 'error',
        data: null,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          code: 'PLAID_LINK_ERROR'
        },
        meta: {
          timestamp: new Date(),
          correlation_id: correlationId
        }
      }),
      {
        status: error instanceof ValidationError ? 400 : 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}

/**
 * Exchanges public token for access token with compliance logging
 */
export async function exchangeToken(req: Request): Promise<Response> {
  const correlationId = crypto.randomUUID();

  try {
    // Validate environment
    validateEnvironment();

    // Rate limiting check
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    const rateLimitKey = `plaid:${clientIp}`;
    
    if (!rateLimiter.tryRemoveTokens(1, rateLimitKey)) {
      throw new Error('Rate limit exceeded');
    }

    // Validate request body
    const body = await req.json();
    const validatedData = exchangeTokenSchema.parse(body);

    // Initialize Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    // Create PlaidService instance
    const plaidService = new PlaidService();

    // Exchange public token for access token
    const accessToken = await plaidService.exchangePublicToken(validatedData.public_token);

    // Store encrypted access token in user's wallet record
    const { error: updateError } = await supabase
      .from('wallets')
      .update({
        plaid_access_token: accessToken,
        last_sync: new Date()
      })
      .eq('user_id', validatedData.user_id);

    if (updateError) {
      throw new Error('Failed to store access token');
    }

    // Log audit event
    logger.audit({
      user_id: validatedData.user_id,
      action: 'EXCHANGE_PLAID_TOKEN',
      resource: 'plaid_link',
      details: {
        success: true
      },
      ip_address: clientIp,
      timestamp: new Date(),
      severity: 'INFO',
      correlation_id: correlationId,
      user_agent: req.headers.get('user-agent') || 'unknown',
      category: 'TRANSACTION'
    });

    return new Response(
      JSON.stringify({
        status: 'success',
        data: { success: true },
        error: null,
        meta: {
          timestamp: new Date(),
          correlation_id: correlationId
        }
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    logger.error(error as Error, { correlation_id: correlationId });

    return new Response(
      JSON.stringify({
        status: 'error',
        data: null,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          code: 'PLAID_EXCHANGE_ERROR'
        },
        meta: {
          timestamp: new Date(),
          correlation_id: correlationId
        }
      }),
      {
        status: error instanceof ValidationError ? 400 : 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}