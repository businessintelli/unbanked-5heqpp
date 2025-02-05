// External imports
import { z } from 'zod'; // v3.22.0 - Runtime type validation

/**
 * Standardized API response structure with enhanced error handling and metadata
 */
export interface ApiResponse<T extends Record<string, unknown>> {
  status: 'success' | 'error';
  data: T;
  error: { code: ErrorCode; message: string } | null;
  meta: {
    timestamp: Date;
    requestId: string;
    version: string;
  };
}

/**
 * Enhanced base schema for database entities with audit and versioning support
 */
export const BaseSchema = z.object({
  id: z.string().uuid(),
  created_at: z.date(),
  updated_at: z.date(),
  deleted_at: z.date().nullable(),
  version: z.number().int().positive(),
  last_modified_by: z.string().uuid()
});

/**
 * Supported fiat currencies for financial operations
 */
export enum Currency {
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP'
}

/**
 * Supported cryptocurrencies for digital asset operations
 */
export enum CryptoCurrency {
  BTC = 'BTC',
  ETH = 'ETH',
  USDT = 'USDT',
  USDC = 'USDC'
}

/**
 * Transaction status states for tracking financial operations
 */
export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

/**
 * Standardized error codes for consistent error handling
 */
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMIT = 'RATE_LIMIT',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

/**
 * Common pagination parameters for list operations
 */
export interface PaginationParams {
  page: number;
  limit: number;
  sort_by: string;
  sort_order: 'asc' | 'desc';
}

/**
 * Date range filter structure for temporal queries
 */
export interface DateRange {
  start_date: Date;
  end_date: Date;
}

/**
 * Enhanced audit logging structure with security and tracking capabilities
 */
export interface AuditLog {
  user_id: string;
  action: string;
  resource: string;
  details: Record<string, unknown>;
  ip_address: string;
  timestamp: Date;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  correlation_id: string;
  user_agent: string;
  category: 'AUTH' | 'TRANSACTION' | 'ADMIN' | 'SYSTEM';
}

// Type validation schemas using Zod
export const PaginationSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive().max(100),
  sort_by: z.string(),
  sort_order: z.enum(['asc', 'desc'])
});

export const DateRangeSchema = z.object({
  start_date: z.date(),
  end_date: z.date()
}).refine((data) => data.start_date <= data.end_date, {
  message: "End date must be after start date"
});

export const AuditLogSchema = z.object({
  user_id: z.string().uuid(),
  action: z.string(),
  resource: z.string(),
  details: z.record(z.unknown()),
  ip_address: z.string().ip(),
  timestamp: z.date(),
  severity: z.enum(['INFO', 'WARNING', 'ERROR', 'CRITICAL']),
  correlation_id: z.string().uuid(),
  user_agent: z.string(),
  category: z.enum(['AUTH', 'TRANSACTION', 'ADMIN', 'SYSTEM'])
});

// Type helpers
export type BaseEntity = z.infer<typeof BaseSchema>;
export type ValidatedPagination = z.infer<typeof PaginationSchema>;
export type ValidatedDateRange = z.infer<typeof DateRangeSchema>;
export type ValidatedAuditLog = z.infer<typeof AuditLogSchema>;