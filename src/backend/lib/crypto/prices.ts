// External imports
import WebSocket from 'ws'; // v8.14.2
import axios from 'axios'; // v1.5.0
import Decimal from 'decimal.js'; // v10.4.3
import { CircuitBreaker } from 'circuit-breaker-ts'; // v1.0.0

// Internal imports
import { CryptoCurrency, ExchangeQuote } from '../../types/crypto';
import { CacheService } from '../common/cache';
import { Logger } from '../common/logger';
import { ApplicationError } from '../common/errors';
import { ErrorCode } from '../../types/common';

// Environment and configuration constants
const COINGECKO_API_URL = process.env.COINGECKO_API_URL;
const PRICE_CACHE_TTL = 300; // 5 minutes in seconds
const PRICE_UPDATE_INTERVAL = 60000; // 1 minute in milliseconds
const WEBSOCKET_RECONNECT_DELAY = 5000; // 5 seconds
const MAX_RETRY_ATTEMPTS = 3;
const SLIPPAGE_PERCENTAGE = 0.5; // 0.5% default slippage

/**
 * Interface for price data structure
 */
interface PriceData {
  price: string;
  timestamp: number;
  source: string;
}

/**
 * Interface for exchange rate calculation
 */
interface ExchangeRate {
  rate: string;
  slippage: string;
  networkFee: string;
  outputAmount: string;
}

/**
 * Core service for managing cryptocurrency price data
 */
export class CryptoPriceService {
  private readonly cacheService: CacheService;
  private readonly logger: Logger;
  private priceSocket: WebSocket | null;
  private readonly currentPrices: Map<string, Decimal>;
  private readonly apiBreaker: CircuitBreaker;
  private updateInterval: NodeJS.Timeout | null;
  private isHealthy: boolean;

  constructor(
    cacheService: CacheService,
    logger: Logger
  ) {
    this.cacheService = cacheService;
    this.logger = logger;
    this.priceSocket = null;
    this.currentPrices = new Map();
    this.updateInterval = null;
    this.isHealthy = true;
    
    this.apiBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 30000
    });

    this.initializeWebSocket();
  }

  /**
   * Initializes WebSocket connection for real-time price updates
   */
  private initializeWebSocket(): void {
    try {
      this.priceSocket = new WebSocket(`${COINGECKO_API_URL}/ws`);

      this.priceSocket.on('open', () => {
        this.logger.info('WebSocket connection established');
        this.subscribeToPriceFeeds();
      });

      this.priceSocket.on('message', (data: WebSocket.Data) => {
        this.handlePriceUpdate(data);
      });

      this.priceSocket.on('error', (error: Error) => {
        this.logger.error(error, { context: 'WebSocket error' });
        this.isHealthy = false;
        this.reconnectWebSocket();
      });

      this.priceSocket.on('close', () => {
        this.logger.warn('WebSocket connection closed');
        this.isHealthy = false;
        this.reconnectWebSocket();
      });
    } catch (error) {
      this.logger.error(error as Error, { context: 'WebSocket initialization' });
      this.isHealthy = false;
    }
  }

  /**
   * Handles reconnection of WebSocket
   */
  private reconnectWebSocket(): void {
    setTimeout(() => {
      this.logger.info('Attempting WebSocket reconnection');
      this.initializeWebSocket();
    }, WEBSOCKET_RECONNECT_DELAY);
  }

  /**
   * Subscribes to cryptocurrency price feeds
   */
  private subscribeToPriceFeeds(): void {
    if (!this.priceSocket) return;

    const currencies = Object.values(CryptoCurrency);
    const subscriptionMessage = {
      type: 'subscribe',
      currencies: currencies
    };

    this.priceSocket.send(JSON.stringify(subscriptionMessage));
  }

  /**
   * Handles incoming price updates
   */
  private handlePriceUpdate(data: WebSocket.Data): void {
    try {
      const update = JSON.parse(data.toString());
      const { currency, price, timestamp } = update;

      if (!currency || !price) {
        throw new Error('Invalid price update format');
      }

      const decimalPrice = new Decimal(price);
      this.currentPrices.set(currency, decimalPrice);

      const cacheKey = `price:${currency}`;
      const priceData: PriceData = {
        price: decimalPrice.toString(),
        timestamp,
        source: 'websocket'
      };

      void this.cacheService.set(cacheKey, priceData, PRICE_CACHE_TTL);
      
      this.logger.debug('Price update received', { currency, price });
    } catch (error) {
      this.logger.error(error as Error, { context: 'Price update handling' });
    }
  }

  /**
   * Gets current price for a cryptocurrency
   */
  public async getCurrentPrice(currency: CryptoCurrency): Promise<string> {
    try {
      const cacheKey = `price:${currency}`;
      const cachedPrice = await this.cacheService.get<PriceData>(cacheKey);

      if (cachedPrice) {
        return cachedPrice.price;
      }

      const price = await this.fetchPriceFromAPI(currency);
      return price;
    } catch (error) {
      this.logger.error(error as Error, { context: 'Get current price', currency });
      throw new ApplicationError(
        'Price data unavailable',
        ErrorCode.INTERNAL_ERROR,
        500,
        { currency }
      );
    }
  }

  /**
   * Fetches price from external API with circuit breaker
   */
  private async fetchPriceFromAPI(currency: CryptoCurrency): Promise<string> {
    return this.apiBreaker.execute(async () => {
      let retryCount = 0;
      
      while (retryCount < MAX_RETRY_ATTEMPTS) {
        try {
          const response = await axios.get(
            `${COINGECKO_API_URL}/simple/price`,
            {
              params: {
                ids: currency.toLowerCase(),
                vs_currencies: 'usd'
              }
            }
          );

          const price = new Decimal(response.data[currency.toLowerCase()].usd);
          
          const priceData: PriceData = {
            price: price.toString(),
            timestamp: Date.now(),
            source: 'api'
          };

          const cacheKey = `price:${currency}`;
          await this.cacheService.set(cacheKey, priceData, PRICE_CACHE_TTL);

          return price.toString();
        } catch (error) {
          retryCount++;
          if (retryCount === MAX_RETRY_ATTEMPTS) {
            throw error;
          }
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }

      throw new Error('Max retry attempts reached');
    });
  }

  /**
   * Generates exchange quote between cryptocurrencies
   */
  public async getExchangeQuote(
    fromCurrency: CryptoCurrency,
    toCurrency: CryptoCurrency,
    amount: string
  ): Promise<ExchangeQuote> {
    try {
      const fromPrice = new Decimal(await this.getCurrentPrice(fromCurrency));
      const toPrice = new Decimal(await this.getCurrentPrice(toCurrency));
      
      const inputAmount = new Decimal(amount);
      if (inputAmount.isNegative() || inputAmount.isZero()) {
        throw new ApplicationError(
          'Invalid input amount',
          ErrorCode.VALIDATION_ERROR,
          400,
          { amount }
        );
      }

      const exchangeRate = toPrice.div(fromPrice);
      const baseOutput = inputAmount.mul(exchangeRate);
      
      // Calculate slippage
      const slippageAmount = baseOutput.mul(SLIPPAGE_PERCENTAGE).div(100);
      const outputWithSlippage = baseOutput.minus(slippageAmount);

      // Calculate network fee (example: 0.1% of output)
      const networkFee = outputWithSlippage.mul(0.001);
      const finalOutput = outputWithSlippage.minus(networkFee);

      return {
        fromCurrency,
        toCurrency,
        inputAmount: amount,
        outputAmount: finalOutput.toString(),
        exchangeRate: exchangeRate.toString(),
        slippage: slippageAmount.toString(),
        networkFee: networkFee.toString(),
        timestamp: Date.now()
      };
    } catch (error) {
      this.logger.error(error as Error, {
        context: 'Exchange quote',
        fromCurrency,
        toCurrency,
        amount
      });
      throw new ApplicationError(
        'Exchange quote calculation failed',
        ErrorCode.INTERNAL_ERROR,
        500,
        {
          fromCurrency,
          toCurrency,
          amount
        }
      );
    }
  }

  /**
   * Starts periodic price updates
   */
  public startPriceUpdates(): void {
    if (this.updateInterval) return;

    this.updateInterval = setInterval(() => {
      Object.values(CryptoCurrency).forEach(currency => {
        void this.fetchPriceFromAPI(currency);
      });
    }, PRICE_UPDATE_INTERVAL);

    this.logger.info('Price update interval started');
  }

  /**
   * Stops periodic price updates
   */
  public stopPriceUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.priceSocket) {
      this.priceSocket.close();
      this.priceSocket = null;
    }

    this.logger.info('Price updates stopped');
  }

  /**
   * Returns service health status
   */
  public getHealthStatus(): boolean {
    return this.isHealthy;
  }
}