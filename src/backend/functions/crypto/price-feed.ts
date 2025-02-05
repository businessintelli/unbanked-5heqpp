// External imports
import WebSocket from 'ws'; // v8.14.2
import cors from 'cors'; // v2.8.5
import compression from 'compression'; // v1.7.4

// Internal imports
import { CryptoPriceService } from '../../lib/crypto/prices';
import { CacheService } from '../../lib/common/cache';
import { CryptoCurrency } from '../../types/crypto';
import { Logger } from '../../lib/common/logger';
import { ApplicationError } from '../../lib/common/errors';
import { ErrorCode } from '../../types/common';

// Constants for configuration and limits
const WEBSOCKET_CLIENTS = new Map<string, WebSocket>();
const PRICE_UPDATE_INTERVAL = 60000; // 1 minute
const MAX_CLIENTS = 10000;
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const RECONNECT_TIMEOUT = 5000; // 5 seconds
const BATCH_SIZE = 100; // Number of clients to process in each batch

/**
 * Message queue for handling high load scenarios
 */
class MessageQueue {
  private queue: Array<{ data: any; timestamp: number }> = [];
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  enqueue(data: any): void {
    if (this.queue.length >= this.maxSize) {
      this.queue.shift(); // Remove oldest message
    }
    this.queue.push({ data, timestamp: Date.now() });
  }

  dequeue(): any {
    return this.queue.shift()?.data;
  }

  clear(): void {
    this.queue = [];
  }
}

const MESSAGE_QUEUE = new MessageQueue(1000);

/**
 * Decorator for rate limiting
 */
function rateLimit(limit: number, window: string) {
  const hits = new Map<string, number[]>();
  
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;
    
    descriptor.value = function (...args: any[]) {
      const now = Date.now();
      const clientId = args[0]?.id || 'default';
      
      if (!hits.has(clientId)) {
        hits.set(clientId, []);
      }
      
      const clientHits = hits.get(clientId)!;
      const windowMs = typeof window === 'string' ? ms(window) : window;
      
      // Clean old hits
      const validHits = clientHits.filter(hit => now - hit < windowMs);
      hits.set(clientId, validHits);
      
      if (validHits.length >= limit) {
        throw new ApplicationError(
          'Rate limit exceeded',
          ErrorCode.RATE_LIMIT,
          429
        );
      }
      
      validHits.push(now);
      return original.apply(this, args);
    };
    
    return descriptor;
  };
}

/**
 * Decorator for performance monitoring
 */
function performanceMetric(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const original = descriptor.value;
  
  descriptor.value = async function (...args: any[]) {
    const start = performance.now();
    try {
      return await original.apply(this, args);
    } finally {
      const duration = performance.now() - start;
      this.logger?.debug('Performance metric', {
        function: propertyKey,
        duration,
        timestamp: new Date().toISOString()
      });
    }
  };
  
  return descriptor;
}

/**
 * Enhanced price feed handler with advanced features
 */
@injectable
@monitored
export class PriceFeedHandler {
  private readonly priceService: CryptoPriceService;
  private readonly cacheService: CacheService;
  private readonly logger: Logger;
  private updateInterval: NodeJS.Timer | null = null;
  private heartbeatInterval: NodeJS.Timer | null = null;
  private readonly messageQueue: MessageQueue;

  constructor(
    priceService: CryptoPriceService,
    cacheService: CacheService,
    logger: Logger
  ) {
    this.priceService = priceService;
    this.cacheService = cacheService;
    this.logger = logger;
    this.messageQueue = MESSAGE_QUEUE;
    
    this.setupErrorHandlers();
  }

  /**
   * Starts the price feed service
   */
  @performanceMetric
  public async startPriceFeed(): Promise<void> {
    try {
      await this.priceService.startPriceUpdates();
      this.startHeartbeat();
      this.startPriceUpdateInterval();
      
      this.logger.info('Price feed service started successfully');
    } catch (error) {
      this.logger.error(error as Error, { context: 'startPriceFeed' });
      throw new ApplicationError(
        'Failed to start price feed service',
        ErrorCode.INTERNAL_ERROR,
        500
      );
    }
  }

  /**
   * Stops the price feed service
   */
  public async stopPriceFeed(): Promise<void> {
    try {
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
        this.updateInterval = null;
      }
      
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      
      this.messageQueue.clear();
      await this.closeAllConnections();
      await this.priceService.stopPriceUpdates();
      
      this.logger.info('Price feed service stopped successfully');
    } catch (error) {
      this.logger.error(error as Error, { context: 'stopPriceFeed' });
    }
  }

  /**
   * Handles new WebSocket connections
   */
  @rateLimit(100, '1m')
  private async handleWebSocketConnection(ws: WebSocket, request: Request): Promise<void> {
    try {
      if (WEBSOCKET_CLIENTS.size >= MAX_CLIENTS) {
        ws.close(1013, 'Maximum number of clients reached');
        return;
      }

      const clientId = crypto.randomUUID();
      WEBSOCKET_CLIENTS.set(clientId, ws);

      // Setup connection handling
      ws.on('error', (error: Error) => {
        this.logger.error(error, { clientId, context: 'WebSocket error' });
        this.cleanupConnection(clientId);
      });

      ws.on('close', () => {
        this.cleanupConnection(clientId);
      });

      // Setup heartbeat
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Send initial price data
      const initialPrices = await this.getAllCurrentPrices();
      ws.send(JSON.stringify({
        type: 'prices',
        data: initialPrices,
        timestamp: Date.now()
      }));

      this.logger.info('New WebSocket connection established', { clientId });
    } catch (error) {
      this.logger.error(error as Error, { context: 'handleWebSocketConnection' });
      ws.close(1011, 'Internal server error');
    }
  }

  /**
   * Broadcasts price updates to all connected clients
   */
  @performanceMetric
  private async broadcastPriceUpdate(prices: Record<CryptoCurrency, string>): Promise<void> {
    if (WEBSOCKET_CLIENTS.size === 0) return;

    const message = JSON.stringify({
      type: 'prices',
      data: prices,
      timestamp: Date.now()
    });

    // Process clients in batches
    const clients = Array.from(WEBSOCKET_CLIENTS.entries());
    for (let i = 0; i < clients.length; i += BATCH_SIZE) {
      const batch = clients.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(async ([clientId, ws]) => {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
          } else {
            this.cleanupConnection(clientId);
          }
        } catch (error) {
          this.logger.error(error as Error, { clientId, context: 'broadcastPriceUpdate' });
          this.cleanupConnection(clientId);
        }
      }));
    }
  }

  /**
   * Starts the heartbeat interval
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      WEBSOCKET_CLIENTS.forEach((ws, clientId) => {
        if (ws.isAlive === false) {
          this.cleanupConnection(clientId);
          return;
        }
        
        ws.isAlive = false;
        ws.ping();
      });
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Starts the price update interval
   */
  private startPriceUpdateInterval(): void {
    this.updateInterval = setInterval(async () => {
      try {
        const prices = await this.getAllCurrentPrices();
        await this.broadcastPriceUpdate(prices);
      } catch (error) {
        this.logger.error(error as Error, { context: 'priceUpdateInterval' });
      }
    }, PRICE_UPDATE_INTERVAL);
  }

  /**
   * Retrieves current prices for all supported cryptocurrencies
   */
  private async getAllCurrentPrices(): Promise<Record<CryptoCurrency, string>> {
    const prices: Record<CryptoCurrency, string> = {} as Record<CryptoCurrency, string>;
    
    await Promise.all(
      Object.values(CryptoCurrency).map(async (currency) => {
        try {
          prices[currency] = await this.priceService.getCurrentPrice(currency);
        } catch (error) {
          this.logger.error(error as Error, { currency, context: 'getAllCurrentPrices' });
        }
      })
    );

    return prices;
  }

  /**
   * Cleans up a client connection
   */
  private cleanupConnection(clientId: string): void {
    const ws = WEBSOCKET_CLIENTS.get(clientId);
    if (ws) {
      ws.terminate();
      WEBSOCKET_CLIENTS.delete(clientId);
      this.logger.info('WebSocket connection cleaned up', { clientId });
    }
  }

  /**
   * Closes all active connections
   */
  private async closeAllConnections(): Promise<void> {
    const closePromises = Array.from(WEBSOCKET_CLIENTS.entries()).map(([clientId, ws]) => {
      return new Promise<void>((resolve) => {
        ws.close(1000, 'Service shutdown');
        this.cleanupConnection(clientId);
        resolve();
      });
    });

    await Promise.all(closePromises);
  }

  /**
   * Sets up global error handlers
   */
  private setupErrorHandlers(): void {
    process.on('uncaughtException', (error: Error) => {
      this.logger.error(error, { context: 'uncaughtException' });
      this.stopPriceFeed().catch(err => {
        this.logger.error(err, { context: 'stopPriceFeed during uncaughtException' });
      });
    });

    process.on('unhandledRejection', (reason: unknown) => {
      this.logger.error(reason as Error, { context: 'unhandledRejection' });
    });
  }
}

// Export the WebSocket connection handler
export const handleWebSocketConnection = (ws: WebSocket, request: Request): void => {
  const handler = new PriceFeedHandler(
    new CryptoPriceService(new CacheService(), new Logger('PriceFeed')),
    new CacheService(),
    new Logger('PriceFeed')
  );
  
  handler.handleWebSocketConnection(ws, request);
};