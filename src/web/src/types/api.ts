// @ts-check
import { z } from 'zod'; // v3.22.0 - Runtime type validation
import type { User } from './auth';

/**
 * HTTP methods supported by the API
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * API response status types
 */
export type ApiStatus = 'success' | 'error' | 'pending';

/**
 * Standard pagination parameters
 */
export type PaginationParams = {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

/**
 * API environment types
 */
export type ApiEnvironment = 'development' | 'staging' | 'production';

/**
 * WebSocket connection states
 */
export type WebSocketState = 'connecting' | 'open' | 'closing' | 'closed';

/**
 * Enhanced API error codes for financial operations
 */
export enum ApiErrorCode {
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}

/**
 * Enhanced API error interface with tracking capabilities
 */
export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details: Record<string, unknown>;
  timestamp: Date;
  path: string;
}

/**
 * Generic API response interface with enhanced metadata
 */
export interface ApiResponse<T> {
  status: ApiStatus;
  data: T;
  error: ApiError | null;
  timestamp: Date;
  metadata: {
    requestId: string;
    version: string;
  };
}

/**
 * Enhanced paginated response interface with metadata
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
    totalPages: number;
  };
  metadata: {
    lastUpdated: Date;
    queryTime: number;
  };
}

/**
 * Enhanced API request configuration with retry support
 */
export interface ApiRequestConfig {
  method: HttpMethod;
  url: string;
  data: unknown;
  params: Record<string, string | number | boolean>;
  headers: Record<string, string>;
  timeout: number;
  retryConfig: {
    attempts: number;
    backoff: number;
  };
}

/**
 * Enhanced WebSocket message interface with tracking and state
 */
export interface WebSocketMessage {
  id: string;
  type: string;
  payload: unknown;
  timestamp: Date;
  state: WebSocketState;
  metadata: {
    userId: string;
    sessionId: string;
  };
}

// Zod schemas for runtime validation
export const apiErrorSchema = z.object({
  code: z.nativeEnum(ApiErrorCode),
  message: z.string(),
  details: z.record(z.unknown()),
  timestamp: z.date(),
  path: z.string()
});

export const apiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    status: z.enum(['success', 'error', 'pending']),
    data: dataSchema,
    error: apiErrorSchema.nullable(),
    timestamp: z.date(),
    metadata: z.object({
      requestId: z.string(),
      version: z.string()
    })
  });

export const paginatedResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    data: z.array(dataSchema),
    pagination: z.object({
      page: z.number().int().positive(),
      limit: z.number().int().positive(),
      total: z.number().int().nonnegative(),
      hasMore: z.boolean(),
      totalPages: z.number().int().positive()
    }),
    metadata: z.object({
      lastUpdated: z.date(),
      queryTime: z.number().positive()
    })
  });

export const webSocketMessageSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  payload: z.unknown(),
  timestamp: z.date(),
  state: z.enum(['connecting', 'open', 'closing', 'closed']),
  metadata: z.object({
    userId: z.string().uuid(),
    sessionId: z.string().uuid()
  })
});

/**
 * Type guard to check if a response is an API error
 */
export function isApiError(response: unknown): response is ApiError {
  try {
    return apiErrorSchema.safeParse(response).success;
  } catch {
    return false;
  }
}