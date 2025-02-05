// External imports
import Redis from 'ioredis'; // v5.3.0
import ms from 'ms'; // v2.1.3

// Internal imports
import { Logger } from './logger';
import { ApplicationError } from './errors';
import { ErrorCode } from '../../types/common';

// Environment and configuration constants
const REDIS_URL = process.env.REDIS_URL;
const DEFAULT_TTL = 3600; // 1 hour in seconds
const MAX_CACHE_SIZE = 1000000; // 1MB in bytes
const RETRY_OPTIONS = { attempts: 3, delay: 1000 };
const POOL_OPTIONS = { min: 5, max: 20 };

// Compression threshold (in bytes)
const COMPRESSION_THRESHOLD = 100000; // 100KB

/**
 * Cache statistics interface for monitoring
 */
interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
}

/**
 * Cache service configuration options
 */
interface CacheOptions {
  ttl?: number;
  compression?: boolean;
  maxSize?: number;
  enableCircuitBreaker?: boolean;
  poolSize?: { min: number; max: number };
}

/**
 * Circuit breaker for handling Redis failures
 */
class CircuitBreaker {
  private failures: number = 0;
  private lastFailure: number = 0;
  private readonly threshold: number = 5;
  private readonly resetTimeout: number = 30000; // 30 seconds

  isOpen(): boolean {
    if (this.failures >= this.threshold) {
      const now = Date.now();
      if (now - this.lastFailure >= this.resetTimeout) {
        this.reset();
        return false;
      }
      return true;
    }
    return false;
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
  }

  reset(): void {
    this.failures = 0;
    this.lastFailure = 0;
  }
}

/**
 * Generates a consistent cache key format
 */
export function generateCacheKey(namespace: string, identifier: string): string {
  if (!namespace || !identifier) {
    throw new ApplicationError(
      'Invalid cache key parameters',
      ErrorCode.VALIDATION_ERROR,
      400
    );
  }
  return `${namespace}:${identifier}`;
}

/**
 * Core cache service for managing Redis operations
 */
export class CacheService {
  private readonly client: Redis;
  private readonly logger: Logger;
  private readonly breaker: CircuitBreaker;
  private readonly stats: CacheStats;
  private readonly options: Required<CacheOptions>;

  constructor(redisUrl: string = REDIS_URL!, options: CacheOptions = {}) {
    if (!redisUrl) {
      throw new ApplicationError(
        'Redis URL is required',
        ErrorCode.INTERNAL_ERROR,
        500
      );
    }

    this.options = {
      ttl: options.ttl ?? DEFAULT_TTL,
      compression: options.compression ?? true,
      maxSize: options.maxSize ?? MAX_CACHE_SIZE,
      enableCircuitBreaker: options.enableCircuitBreaker ?? true,
      poolSize: options.poolSize ?? POOL_OPTIONS,
    };

    this.client = new Redis(redisUrl, {
      retryStrategy: (times) => {
        if (times > RETRY_OPTIONS.attempts) return null;
        return RETRY_OPTIONS.delay;
      },
      maxRetriesPerRequest: RETRY_OPTIONS.attempts,
      enableReadyCheck: true,
      connectionName: 'unbanked_cache',
      lazyConnect: true,
    });

    this.logger = new Logger('CacheService');
    this.breaker = new CircuitBreaker();
    this.stats = { hits: 0, misses: 0, evictions: 0, size: 0 };

    this.setupEventHandlers();
    this.startHealthCheck();
  }

  /**
   * Retrieves a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      if (this.breaker.isOpen()) {
        this.logger.warn('Circuit breaker is open, skipping cache');
        return null;
      }

      const value = await this.client.get(key);
      
      if (value) {
        this.stats.hits++;
        const deserializedValue = this.deserialize<T>(value);
        this.logger.debug('Cache hit', { key });
        return deserializedValue;
      }

      this.stats.misses++;
      this.logger.debug('Cache miss', { key });
      return null;
    } catch (error) {
      this.handleError(error as Error);
      return null;
    }
  }

  /**
   * Stores a value in cache
   */
  async set(key: string, value: unknown, ttl: number = this.options.ttl): Promise<void> {
    try {
      if (this.breaker.isOpen()) {
        this.logger.warn('Circuit breaker is open, skipping cache write');
        return;
      }

      const serializedValue = this.serialize(value);
      
      if (Buffer.byteLength(serializedValue) > this.options.maxSize) {
        throw new ApplicationError(
          'Value exceeds maximum cache size',
          ErrorCode.VALIDATION_ERROR,
          400
        );
      }

      await this.client.set(key, serializedValue, 'EX', ttl);
      this.stats.size += Buffer.byteLength(serializedValue);
      
      this.logger.debug('Cache set', { key, ttl });
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * Removes a value from cache
   */
  async delete(key: string): Promise<void> {
    try {
      await this.client.del(key);
      this.logger.debug('Cache delete', { key });
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * Clears all values for a namespace
   */
  async clear(namespace: string): Promise<void> {
    try {
      const keys = await this.client.keys(`${namespace}:*`);
      if (keys.length > 0) {
        await this.client.del(...keys);
        this.logger.debug('Cache clear', { namespace, keysCleared: keys.length });
      }
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * Performs health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const testKey = 'health:check';
      await this.client.set(testKey, '1', 'EX', 5);
      const value = await this.client.get(testKey);
      await this.client.del(testKey);
      
      return value === '1';
    } catch (error) {
      this.logger.error(error as Error);
      return false;
    }
  }

  /**
   * Serializes value for storage
   */
  private serialize(value: unknown): string {
    const stringified = JSON.stringify(value);
    if (!this.options.compression || Buffer.byteLength(stringified) < COMPRESSION_THRESHOLD) {
      return stringified;
    }
    
    // Basic compression using Buffer
    const compressed = Buffer.from(stringified).toString('base64');
    return `compressed:${compressed}`;
  }

  /**
   * Deserializes value from storage
   */
  private deserialize<T>(value: string): T {
    if (value.startsWith('compressed:')) {
      const compressed = value.slice(11);
      const decompressed = Buffer.from(compressed, 'base64').toString();
      return JSON.parse(decompressed);
    }
    return JSON.parse(value);
  }

  /**
   * Sets up Redis event handlers
   */
  private setupEventHandlers(): void {
    this.client.on('error', (error) => {
      this.logger.error(error);
      this.breaker.recordFailure();
    });

    this.client.on('ready', () => {
      this.logger.info('Redis connection established');
      this.breaker.reset();
    });

    this.client.on('end', () => {
      this.logger.warn('Redis connection ended');
    });
  }

  /**
   * Starts periodic health check
   */
  private startHealthCheck(): void {
    setInterval(async () => {
      const isHealthy = await this.healthCheck();
      if (!isHealthy) {
        this.logger.warn('Cache health check failed');
        this.breaker.recordFailure();
      }
    }, ms('30s'));
  }

  /**
   * Handles cache operation errors
   */
  private handleError(error: Error): void {
    this.logger.error(error);
    this.breaker.recordFailure();
    throw new ApplicationError(
      'Cache operation failed',
      ErrorCode.INTERNAL_ERROR,
      500,
      { originalError: error.message }
    );
  }
}