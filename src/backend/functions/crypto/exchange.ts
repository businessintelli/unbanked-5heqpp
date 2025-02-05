// External imports
import { createClient } from '@supabase/supabase-js'; // v2.33.0
import { rateLimit } from '@upstash/ratelimit'; // v1.0.0
import { CircuitBreaker } from 'opossum'; // v7.0.0
import winston from 'winston'; // v3.10.0

// Internal imports
import { ExchangeRequest, ExchangeQuote, CryptoTransaction, ValidationError } from '../../types/crypto';
import { CryptoExchangeService } from '../../lib/crypto/exchange';
import { CryptoPriceService } from '../../lib/crypto/prices';
import { Logger } from '../../lib/common/logger';
import { CacheService } from '../../lib/common/cache';
import { validateSchema } from '../../lib/common/validation';
import { ErrorCode } from '../../types/common';

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const RATE_LIMIT_REQUESTS = parseInt(process.env.RATE_LIMIT_REQUESTS || '100');
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '60');
const CIRCUIT_BREAKER_THRESHOLD = parseFloat(process.env.CIRCUIT_BREAKER_THRESHOLD || '0.5');
const QUOTE_CACHE_TTL = parseInt(process.env.QUOTE_CACHE_TTL || '30');

// Initialize services
const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
const logger = new Logger('ExchangeFunction');
const cacheService = new CacheService();
const priceService = new CryptoPriceService(cacheService, logger);
const exchangeService = new CryptoExchangeService(priceService, { logger });

// Initialize rate limiter
const limiter = rateLimit({
  max: RATE_LIMIT_REQUESTS,
  windowMs: RATE_LIMIT_WINDOW * 1000
});

// Initialize circuit breaker
const breaker = new CircuitBreaker(exchangeService.executeExchange, {
  timeout: 10000,
  errorThresholdPercentage: CIRCUIT_BREAKER_THRESHOLD * 100,
  resetTimeout: 30000
});

/**
 * Edge function handler for retrieving exchange quotes
 */
export async function getQuoteHandler(req: Request): Promise<Response> {
  const startTime = Date.now();
  const correlationId = crypto.randomUUID();

  try {
    // Validate authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new ValidationError('Missing authentication');
    }

    // Apply rate limiting
    const clientIp = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for');
    const rateLimitResult = await limiter.check(clientIp!);
    if (!rateLimitResult.success) {
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded',
        code: ErrorCode.RATE_LIMIT
      }), { status: 429 });
    }

    // Parse and validate request
    const requestData = await req.json();
    const validatedRequest = await validateSchema<ExchangeRequest>(
      ExchangeRequest,
      requestData
    );

    // Check quote cache
    const cacheKey = `quote:${validatedRequest.from_currency}:${validatedRequest.to_currency}:${validatedRequest.amount}`;
    const cachedQuote = await cacheService.get<ExchangeQuote>(cacheKey);
    
    if (cachedQuote) {
      logger.debug('Cache hit for quote', { correlationId, cacheKey });
      return new Response(JSON.stringify({
        status: 'success',
        data: cachedQuote,
        meta: { cached: true, correlationId }
      }), {
        headers: { 'Cache-Control': `max-age=${QUOTE_CACHE_TTL}` }
      });
    }

    // Generate new quote
    const quote = await exchangeService.getQuote(validatedRequest);

    // Cache the quote
    await cacheService.set(cacheKey, quote, QUOTE_CACHE_TTL);

    // Log success
    logger.info('Quote generated successfully', {
      correlationId,
      duration: Date.now() - startTime,
      fromCurrency: validatedRequest.from_currency,
      toCurrency: validatedRequest.to_currency
    });

    return new Response(JSON.stringify({
      status: 'success',
      data: quote,
      meta: { cached: false, correlationId }
    }), {
      headers: { 'Cache-Control': `max-age=${QUOTE_CACHE_TTL}` }
    });

  } catch (error) {
    logger.error(error as Error, {
      correlationId,
      duration: Date.now() - startTime
    });

    return new Response(JSON.stringify({
      status: 'error',
      error: error instanceof ValidationError ? error.message : 'Internal server error',
      code: error instanceof ValidationError ? ErrorCode.VALIDATION_ERROR : ErrorCode.INTERNAL_ERROR,
      correlationId
    }), {
      status: error instanceof ValidationError ? 400 : 500
    });
  }
}

/**
 * Edge function handler for executing cryptocurrency exchanges
 */
export async function executeExchangeHandler(req: Request): Promise<Response> {
  const startTime = Date.now();
  const correlationId = crypto.randomUUID();

  try {
    // Validate authentication and permissions
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new ValidationError('Missing authentication');
    }

    const session = await supabase.auth.getSession();
    if (!session) {
      throw new ValidationError('Invalid session');
    }

    // Apply rate limiting
    const clientIp = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for');
    const rateLimitResult = await limiter.check(clientIp!);
    if (!rateLimitResult.success) {
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded',
        code: ErrorCode.RATE_LIMIT
      }), { status: 429 });
    }

    // Parse and validate request
    const requestData = await req.json();
    const validatedRequest = await validateSchema<ExchangeRequest>(
      ExchangeRequest,
      requestData
    );

    // Check circuit breaker status
    if (breaker.isOpen()) {
      return new Response(JSON.stringify({
        error: 'Service temporarily unavailable',
        code: ErrorCode.INTERNAL_ERROR
      }), { status: 503 });
    }

    // Execute exchange through circuit breaker
    const result = await breaker.fire(validatedRequest) as CryptoTransaction;

    // Log success
    logger.info('Exchange executed successfully', {
      correlationId,
      duration: Date.now() - startTime,
      transactionId: result.id,
      fromCurrency: validatedRequest.from_currency,
      toCurrency: validatedRequest.to_currency
    });

    return new Response(JSON.stringify({
      status: 'success',
      data: result,
      meta: { correlationId }
    }));

  } catch (error) {
    logger.error(error as Error, {
      correlationId,
      duration: Date.now() - startTime
    });

    return new Response(JSON.stringify({
      status: 'error',
      error: error instanceof ValidationError ? error.message : 'Internal server error',
      code: error instanceof ValidationError ? ErrorCode.VALIDATION_ERROR : ErrorCode.INTERNAL_ERROR,
      correlationId
    }), {
      status: error instanceof ValidationError ? 400 : 500
    });
  }
}