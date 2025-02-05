// External imports
import Decimal from 'decimal.js'; // v10.4.3
import axios from 'axios'; // v1.5.0

// Internal imports
import { ExchangeRequest, ExchangeQuote, CryptoTransaction, CryptoTransactionType, CryptoCurrency, MarketDepth } from '../../types/crypto';
import { CryptoPriceService } from './prices';
import { validateSchema, RateLimit } from '../common/validation';
import { ApplicationError } from '../common/errors';
import { ErrorCode } from '../../types/common';

// Constants for exchange operations
const EXCHANGE_RATE_CACHE_TTL = 300; // 5 minutes
const MAX_SLIPPAGE_PERCENTAGE = 1.0; // 1% maximum slippage
const MIN_EXCHANGE_AMOUNT = 10; // Minimum exchange amount in USD equivalent
const MAX_RETRY_ATTEMPTS = 3;
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100;

/**
 * Enhanced service for handling cryptocurrency exchange operations
 * with high-volume support and performance optimization
 */
@Injectable()
export class CryptoExchangeService {
  private readonly quoteCache: Map<string, ExchangeQuote>;
  private readonly rateLimit: RateLimit;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(
    private readonly priceService: CryptoPriceService,
    private readonly configService: ConfigService
  ) {
    this.quoteCache = new Map();
    this.rateLimit = new RateLimit({
      windowMs: RATE_LIMIT_WINDOW,
      maxRequests: RATE_LIMIT_MAX_REQUESTS
    });
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 30000
    });
  }

  /**
   * Gets optimized exchange quote with market depth consideration
   */
  public async getQuote(request: ExchangeRequest): Promise<ExchangeQuote> {
    try {
      // Apply rate limiting
      await this.rateLimit.checkLimit(request.from_wallet_id);

      // Validate exchange request
      await validateExchangeRequest(request);

      // Check quote cache
      const cacheKey = this.generateQuoteCacheKey(request);
      const cachedQuote = this.quoteCache.get(cacheKey);
      if (cachedQuote && this.isQuoteValid(cachedQuote)) {
        return cachedQuote;
      }

      // Calculate market impact and slippage
      const slippage = await calculateSlippage(
        request.amount,
        request.from_currency,
        request.to_currency
      );

      // Get current exchange rate with market depth
      const quote = await this.priceService.getExchangeQuote(
        request.from_currency,
        request.to_currency,
        request.amount
      );

      // Apply dynamic fee structure based on volume
      const fee = this.calculateDynamicFee(request.amount, quote.exchangeRate);

      const finalQuote: ExchangeQuote = {
        ...quote,
        fee: fee.toString(),
        slippage: slippage.toString(),
        expiresAt: Date.now() + EXCHANGE_RATE_CACHE_TTL * 1000
      };

      // Cache the quote
      this.quoteCache.set(cacheKey, finalQuote);

      return finalQuote;
    } catch (error) {
      throw new ApplicationError(
        'Failed to generate exchange quote',
        ErrorCode.INTERNAL_ERROR,
        500,
        { request, error: error.message }
      );
    }
  }

  /**
   * Executes exchange with enhanced safety and monitoring
   */
  public async executeExchange(
    request: ExchangeRequest,
    quote: ExchangeQuote
  ): Promise<CryptoTransaction> {
    try {
      // Verify quote freshness
      if (!this.isQuoteValid(quote)) {
        throw new ApplicationError(
          'Quote has expired',
          ErrorCode.VALIDATION_ERROR,
          400,
          { quoteTimestamp: quote.timestamp }
        );
      }

      // Check circuit breaker status
      if (this.circuitBreaker.isOpen()) {
        throw new ApplicationError(
          'Exchange service temporarily unavailable',
          ErrorCode.INTERNAL_ERROR,
          503
        );
      }

      // Begin atomic transaction
      const transaction = await this.beginTransaction();

      try {
        // Lock exchange amounts
        await this.lockFunds(request.from_wallet_id, request.amount);

        // Verify current market conditions
        const currentRate = await this.priceService.getCurrentPrice(request.to_currency);
        if (!this.isRateWithinTolerance(currentRate, quote.exchangeRate)) {
          throw new ApplicationError(
            'Exchange rate has changed significantly',
            ErrorCode.VALIDATION_ERROR,
            400,
            { expectedRate: quote.exchangeRate, currentRate }
          );
        }

        // Execute exchange with retry mechanism
        const result = await this.executeWithRetry(async () => {
          return this.performExchange(request, quote);
        });

        // Commit transaction
        await transaction.commit();

        return result;
      } catch (error) {
        // Rollback transaction on error
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      this.circuitBreaker.recordFailure();
      throw new ApplicationError(
        'Exchange execution failed',
        ErrorCode.INTERNAL_ERROR,
        500,
        { request, error: error.message }
      );
    }
  }

  /**
   * Calculates dynamic fee based on exchange volume
   */
  private calculateDynamicFee(amount: string, rate: string): Decimal {
    const volume = new Decimal(amount).mul(rate);
    let feePercentage: Decimal;

    if (volume.lessThan(1000)) {
      feePercentage = new Decimal(0.01); // 1%
    } else if (volume.lessThan(10000)) {
      feePercentage = new Decimal(0.008); // 0.8%
    } else {
      feePercentage = new Decimal(0.005); // 0.5%
    }

    return volume.mul(feePercentage);
  }

  /**
   * Generates cache key for exchange quotes
   */
  private generateQuoteCacheKey(request: ExchangeRequest): string {
    return `quote:${request.from_currency}:${request.to_currency}:${request.amount}`;
  }

  /**
   * Checks if quote is still valid
   */
  private isQuoteValid(quote: ExchangeQuote): boolean {
    return Date.now() < quote.expiresAt;
  }

  /**
   * Verifies if current rate is within acceptable tolerance
   */
  private isRateWithinTolerance(currentRate: string, quoteRate: string): boolean {
    const current = new Decimal(currentRate);
    const quoted = new Decimal(quoteRate);
    const tolerance = new Decimal(MAX_SLIPPAGE_PERCENTAGE).div(100);

    return current.sub(quoted).abs().div(quoted).lte(tolerance);
  }

  /**
   * Executes operation with retry mechanism
   */
  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let attempts = 0;
    while (attempts < MAX_RETRY_ATTEMPTS) {
      try {
        return await operation();
      } catch (error) {
        attempts++;
        if (attempts === MAX_RETRY_ATTEMPTS) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }
    throw new Error('Max retry attempts reached');
  }
}

/**
 * Enhanced validation for exchange requests
 */
@RateLimit({ windowMs: RATE_LIMIT_WINDOW, maxRequests: RATE_LIMIT_MAX_REQUESTS })
export async function validateExchangeRequest(request: ExchangeRequest): Promise<boolean> {
  try {
    // Validate request schema
    await validateSchema(ExchangeRequestSchema, request);

    // Check minimum exchange amount
    const fromPrice = await this.priceService.getCurrentPrice(request.from_currency);
    const usdValue = new Decimal(request.amount).mul(fromPrice);
    
    if (usdValue.lessThan(MIN_EXCHANGE_AMOUNT)) {
      throw new ApplicationError(
        'Exchange amount below minimum threshold',
        ErrorCode.VALIDATION_ERROR,
        400,
        { minAmount: MIN_EXCHANGE_AMOUNT, currency: 'USD' }
      );
    }

    return true;
  } catch (error) {
    throw new ApplicationError(
      'Exchange request validation failed',
      ErrorCode.VALIDATION_ERROR,
      400,
      { request, error: error.message }
    );
  }
}

/**
 * Advanced slippage calculation considering market depth
 */
export async function calculateSlippage(
  amount: string,
  fromCurrency: CryptoCurrency,
  toCurrency: CryptoCurrency
): Promise<Decimal> {
  try {
    const marketDepth = await this.priceService.getMarketDepth(fromCurrency, toCurrency);
    const orderAmount = new Decimal(amount);

    // Calculate impact on order book
    let remainingAmount = orderAmount;
    let totalCost = new Decimal(0);
    
    for (const level of marketDepth.asks) {
      const levelPrice = new Decimal(level.price);
      const levelVolume = new Decimal(level.volume);

      if (remainingAmount.lessThanOrEqualTo(levelVolume)) {
        totalCost = totalCost.plus(remainingAmount.mul(levelPrice));
        break;
      } else {
        totalCost = totalCost.plus(levelVolume.mul(levelPrice));
        remainingAmount = remainingAmount.minus(levelVolume);
      }
    }

    const averagePrice = totalCost.div(orderAmount);
    const marketPrice = new Decimal(marketDepth.asks[0].price);
    const slippage = averagePrice.minus(marketPrice).div(marketPrice).mul(100);

    return slippage;
  } catch (error) {
    throw new ApplicationError(
      'Failed to calculate slippage',
      ErrorCode.INTERNAL_ERROR,
      500,
      { amount, fromCurrency, toCurrency, error: error.message }
    );
  }
}