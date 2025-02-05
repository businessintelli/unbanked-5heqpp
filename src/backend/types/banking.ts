// External imports
import { z } from 'zod'; // v3.22.0 - Runtime type validation

// Internal imports
import { BaseSchema, Currency, TransactionStatus, ApiResponse } from '../types/common';

/**
 * Enhanced banking wallet structure extending BaseSchema with limits and sync tracking
 */
export interface Wallet extends z.infer<typeof BaseSchema> {
  user_id: string;
  currency: Currency;
  balance: number;
  active: boolean;
  plaid_access_token: string | null;
  last_sync: Date;
  daily_limit: number;
  monthly_limit: number;
}

/**
 * Extended types of banking transactions including refunds and adjustments
 */
export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  TRANSFER = 'TRANSFER',
  FEE = 'FEE',
  REFUND = 'REFUND',
  ADJUSTMENT = 'ADJUSTMENT'
}

/**
 * Enhanced banking transaction structure with detailed tracking and categorization
 */
export interface Transaction extends z.infer<typeof BaseSchema> {
  wallet_id: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  status: TransactionStatus;
  metadata: Record<string, unknown>;
  reference: string;
  description: string;
  category: string;
  fee: number;
}

/**
 * Enhanced Plaid Link configuration with webhook and redirect support
 */
export interface PlaidLinkConfig {
  user_id: string;
  client_user_id: string;
  products: string[];
  country_codes: string[];
  language: string;
  webhook: string;
  redirect_uri: string;
}

/**
 * Zod schema for comprehensive wallet validation
 */
export const WalletSchema = BaseSchema.extend({
  user_id: z.string().uuid(),
  currency: z.nativeEnum(Currency),
  balance: z.number().min(0),
  active: z.boolean(),
  plaid_access_token: z.string().nullable(),
  last_sync: z.date(),
  daily_limit: z.number().min(0),
  monthly_limit: z.number().min(0)
}).strict();

/**
 * Zod schema for comprehensive transaction validation
 */
export const TransactionSchema = BaseSchema.extend({
  wallet_id: z.string().uuid(),
  type: z.nativeEnum(TransactionType),
  amount: z.number(),
  currency: z.nativeEnum(Currency),
  status: z.nativeEnum(TransactionStatus),
  metadata: z.record(z.unknown()),
  reference: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  fee: z.number().min(0)
}).strict();

/**
 * Zod schema for Plaid Link configuration validation
 */
export const PlaidLinkConfigSchema = z.object({
  user_id: z.string().uuid(),
  client_user_id: z.string(),
  products: z.array(z.string()).min(1),
  country_codes: z.array(z.string().length(2)).min(1),
  language: z.string().length(2),
  webhook: z.string().url(),
  redirect_uri: z.string().url()
}).strict();

// Type helpers for API responses
export type WalletResponse = ApiResponse<{ wallet: Wallet }>;
export type WalletsResponse = ApiResponse<{ wallets: Wallet[]; total: number }>;
export type TransactionResponse = ApiResponse<{ transaction: Transaction }>;
export type TransactionsResponse = ApiResponse<{ transactions: Transaction[]; total: number }>;
export type PlaidLinkResponse = ApiResponse<{ link_token: string; config: PlaidLinkConfig }>;