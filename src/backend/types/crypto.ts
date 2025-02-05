// External imports
import { z } from 'zod'; // v3.22.0 - Runtime type validation

// Internal imports
import { BaseSchema, CryptoCurrency, TransactionStatus } from './common';

/**
 * Enhanced cryptocurrency wallet structure with timestamp and validation
 */
export interface CryptoWallet extends z.infer<typeof BaseSchema> {
  user_id: string;
  currency: CryptoCurrency;
  address: string;
  balance: string;
  is_custodial: boolean;
  last_updated: Date;
}

/**
 * Types of cryptocurrency transactions
 */
export enum CryptoTransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  EXCHANGE = 'EXCHANGE'
}

/**
 * Enhanced cryptocurrency transaction details with confirmations
 */
export interface CryptoTransaction extends z.infer<typeof BaseSchema> {
  wallet_id: string;
  type: CryptoTransactionType;
  amount: string;
  currency: CryptoCurrency;
  status: TransactionStatus;
  tx_hash: string;
  fee: string;
  block_confirmations: number;
}

/**
 * Enhanced exchange request with slippage tolerance
 */
export interface ExchangeRequest {
  from_wallet_id: string;
  to_wallet_id: string;
  amount: string;
  from_currency: CryptoCurrency;
  to_currency: CryptoCurrency;
  slippage_tolerance: string;
}

/**
 * Zod validation schema for crypto wallet with enhanced rules
 */
export const CryptoWalletSchema = BaseSchema.extend({
  user_id: z.string().uuid(),
  currency: z.nativeEnum(CryptoCurrency),
  address: z.string().regex(/^(0x)?[0-9a-fA-F]{40}$|^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/),
  balance: z.string().regex(/^\d+\.?\d*$/),
  is_custodial: z.boolean(),
  last_updated: z.date()
});

/**
 * Zod validation schema for crypto transactions with enhanced rules
 */
export const CryptoTransactionSchema = BaseSchema.extend({
  wallet_id: z.string().uuid(),
  type: z.nativeEnum(CryptoTransactionType),
  amount: z.string().regex(/^\d+\.?\d*$/),
  currency: z.nativeEnum(CryptoCurrency),
  status: z.nativeEnum(TransactionStatus),
  tx_hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  fee: z.string().regex(/^\d+\.?\d*$/),
  block_confirmations: z.number().int().min(0)
});

/**
 * Zod validation schema for exchange requests with enhanced rules
 */
export const ExchangeRequestSchema = z.object({
  from_wallet_id: z.string().uuid(),
  to_wallet_id: z.string().uuid(),
  amount: z.string().regex(/^\d+\.?\d*$/),
  from_currency: z.nativeEnum(CryptoCurrency),
  to_currency: z.nativeEnum(CryptoCurrency),
  slippage_tolerance: z.string().regex(/^0?\.[0-9]{1,2}$/)
}).refine(
  (data) => data.from_currency !== data.to_currency,
  {
    message: "Source and destination currencies must be different",
    path: ["to_currency"]
  }
).refine(
  (data) => parseFloat(data.slippage_tolerance) <= 0.05,
  {
    message: "Slippage tolerance cannot exceed 5%",
    path: ["slippage_tolerance"]
  }
);

// Type helpers
export type ValidatedCryptoWallet = z.infer<typeof CryptoWalletSchema>;
export type ValidatedCryptoTransaction = z.infer<typeof CryptoTransactionSchema>;
export type ValidatedExchangeRequest = z.infer<typeof ExchangeRequestSchema>;