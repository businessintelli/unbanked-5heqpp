// @ts-check
import { z } from 'zod'; // v3.22.0 - Runtime type validation
import type { ApiResponse, PaginatedResponse } from './api';
import type { User } from './auth';

/**
 * Supported currencies in the banking system
 */
export type Currency = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CHF';

/**
 * Transaction status with enhanced tracking capabilities
 */
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'cancelled' | 'blocked' | 'under_review';

/**
 * Card status for enhanced security management
 */
export type CardStatus = 'active' | 'inactive' | 'blocked' | 'expired';

/**
 * Card types supported by the platform
 */
export type CardType = 'virtual' | 'physical';

/**
 * Compliance status for regulatory tracking
 */
export type ComplianceStatus = 'compliant' | 'pending_review' | 'non_compliant';

/**
 * Transaction types supported by the platform
 */
export type TransactionType = 'deposit' | 'withdrawal' | 'transfer' | 'exchange' | 'fee' | 'refund';

/**
 * Enhanced wallet interface with compliance and limits
 */
export interface Wallet {
  id: string;
  user_id: string;
  currency: Currency;
  balance: number;
  active: boolean;
  plaid_access_token: string | null;
  compliance_status: ComplianceStatus;
  last_audit_date: Date;
  daily_limit: number;
  monthly_limit: number;
}

/**
 * Transaction metadata for enhanced tracking
 */
export interface TransactionMetadata {
  reference: string;
  description: string;
  merchant?: {
    name: string;
    category: string;
    location?: string;
  };
  exchange_rate?: number;
  original_amount?: number;
  original_currency?: Currency;
}

/**
 * Compliance check result interface
 */
export interface ComplianceCheckResult {
  passed: boolean;
  risk_level: 'low' | 'medium' | 'high';
  checks_performed: string[];
  failure_reasons?: string[];
  review_required: boolean;
  reviewed_by?: string;
  reviewed_at?: Date;
}

/**
 * Audit trail entry for transaction tracking
 */
export interface AuditTrail {
  timestamp: Date;
  action: string;
  actor: string;
  details: Record<string, unknown>;
  ip_address: string;
  location?: string;
}

/**
 * Enhanced transaction interface with compliance and audit
 */
export interface Transaction {
  id: string;
  wallet_id: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  status: TransactionStatus;
  metadata: TransactionMetadata;
  created_at: Date;
  compliance_check_result: ComplianceCheckResult;
  audit_trail: AuditTrail[];
}

/**
 * Card security settings interface
 */
export interface CardSecuritySettings {
  online_payments: boolean;
  international_payments: boolean;
  contactless_enabled: boolean;
  atm_withdrawals: boolean;
  max_online_amount: number;
  max_atm_amount: number;
  allowed_countries: string[];
  blocked_merchants: string[];
}

/**
 * Enhanced card management interface
 */
export interface Card {
  id: string;
  wallet_id: string;
  type: CardType;
  status: CardStatus;
  last_four: string;
  expiry_date: Date;
  daily_limit: number;
  security_settings: CardSecuritySettings;
}

/**
 * Transfer details interface for currency exchanges
 */
export interface TransferDetails {
  source_wallet_id: string;
  destination_wallet_id: string;
  exchange_rate: number;
  fee: number;
}

// Zod schemas for runtime validation
export const currencySchema = z.enum(['USD', 'EUR', 'GBP', 'JPY', 'CHF']);

export const transactionStatusSchema = z.enum([
  'pending',
  'completed',
  'failed',
  'cancelled',
  'blocked',
  'under_review'
]);

export const walletSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  currency: currencySchema,
  balance: z.number().nonnegative(),
  active: z.boolean(),
  plaid_access_token: z.string().nullable(),
  compliance_status: z.enum(['compliant', 'pending_review', 'non_compliant']),
  last_audit_date: z.date(),
  daily_limit: z.number().positive(),
  monthly_limit: z.number().positive()
});

export const transactionMetadataSchema = z.object({
  reference: z.string(),
  description: z.string(),
  merchant: z.object({
    name: z.string(),
    category: z.string(),
    location: z.string().optional()
  }).optional(),
  exchange_rate: z.number().positive().optional(),
  original_amount: z.number().optional(),
  original_currency: currencySchema.optional()
});

export const complianceCheckResultSchema = z.object({
  passed: z.boolean(),
  risk_level: z.enum(['low', 'medium', 'high']),
  checks_performed: z.array(z.string()),
  failure_reasons: z.array(z.string()).optional(),
  review_required: z.boolean(),
  reviewed_by: z.string().uuid().optional(),
  reviewed_at: z.date().optional()
});

export const auditTrailSchema = z.object({
  timestamp: z.date(),
  action: z.string(),
  actor: z.string().uuid(),
  details: z.record(z.unknown()),
  ip_address: z.string(),
  location: z.string().optional()
});

export const transactionSchema = z.object({
  id: z.string().uuid(),
  wallet_id: z.string().uuid(),
  type: z.enum(['deposit', 'withdrawal', 'transfer', 'exchange', 'fee', 'refund']),
  amount: z.number().positive(),
  currency: currencySchema,
  status: transactionStatusSchema,
  metadata: transactionMetadataSchema,
  created_at: z.date(),
  compliance_check_result: complianceCheckResultSchema,
  audit_trail: z.array(auditTrailSchema)
});

export const cardSecuritySettingsSchema = z.object({
  online_payments: z.boolean(),
  international_payments: z.boolean(),
  contactless_enabled: z.boolean(),
  atm_withdrawals: z.boolean(),
  max_online_amount: z.number().nonnegative(),
  max_atm_amount: z.number().nonnegative(),
  allowed_countries: z.array(z.string()),
  blocked_merchants: z.array(z.string())
});

export const cardSchema = z.object({
  id: z.string().uuid(),
  wallet_id: z.string().uuid(),
  type: z.enum(['virtual', 'physical']),
  status: z.enum(['active', 'inactive', 'blocked', 'expired']),
  last_four: z.string().length(4),
  expiry_date: z.date(),
  daily_limit: z.number().positive(),
  security_settings: cardSecuritySettingsSchema
});

export const transferDetailsSchema = z.object({
  source_wallet_id: z.string().uuid(),
  destination_wallet_id: z.string().uuid(),
  exchange_rate: z.number().positive(),
  fee: z.number().nonnegative()
});