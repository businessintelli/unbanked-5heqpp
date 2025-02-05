// @ts-check
import { z } from 'zod'; // v3.22.0 - Runtime type validation
import type { ApiResponse, PaginatedResponse } from './api';

/**
 * Supported cryptocurrency types in the platform
 */
export type CryptoCurrency = 'BTC' | 'ETH' | 'USDC' | 'USDT';

/**
 * Transaction status states
 */
export type TransactionStatus = 'pending' | 'completed' | 'failed';

/**
 * Supported blockchain network types
 */
export type NetworkType = 'bitcoin' | 'ethereum' | 'polygon';

/**
 * Network-specific configuration for blockchain interactions
 */
export interface NetworkConfig {
  network_type: NetworkType;
  chain_id: number;
  rpc_url: string;
  explorer_url: string;
}

/**
 * Cryptocurrency wallet structure with network configuration
 */
export interface CryptoWallet {
  id: string;
  currency: CryptoCurrency;
  address: string;
  balance: string;
  is_custodial: boolean;
  network_config: NetworkConfig;
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
 * Cryptocurrency transaction details with separate network and gas fees
 */
export interface CryptoTransaction {
  id: string;
  wallet_id: string;
  type: CryptoTransactionType;
  amount: string;
  currency: CryptoCurrency;
  status: TransactionStatus;
  tx_hash: string;
  network_fee: string;
  gas_fee: string;
  created_at: Date;
}

/**
 * Cryptocurrency exchange request structure
 */
export interface ExchangeRequest {
  from_wallet_id: string;
  to_wallet_id: string;
  amount: string;
  from_currency: CryptoCurrency;
  to_currency: CryptoCurrency;
}

/**
 * Exchange quote with rates, fees, and expiry time
 */
export interface ExchangeQuote {
  exchange_rate: string;
  fee_percentage: string;
  fee_amount: string;
  output_amount: string;
  expiry_timestamp: Date;
}

/**
 * Cryptocurrency price and market data with additional metrics
 */
export interface PriceData {
  currency: CryptoCurrency;
  price_usd: string;
  change_24h: string;
  volume_24h: string;
  market_cap: string;
  total_supply: string;
  last_updated: Date;
}

/**
 * Response type for wallet listing endpoint
 */
export type GetWalletsResponse = ApiResponse<PaginatedResponse<CryptoWallet>>;

/**
 * Response type for transaction history endpoint
 */
export type GetTransactionsResponse = ApiResponse<PaginatedResponse<CryptoTransaction>>;

/**
 * Response type for exchange quote endpoint
 */
export type GetExchangeQuoteResponse = ApiResponse<ExchangeQuote>;

// Zod schemas for runtime validation

export const cryptoCurrencySchema = z.enum(['BTC', 'ETH', 'USDC', 'USDT']);

export const transactionStatusSchema = z.enum(['pending', 'completed', 'failed']);

export const networkTypeSchema = z.enum(['bitcoin', 'ethereum', 'polygon']);

export const networkConfigSchema = z.object({
  network_type: networkTypeSchema,
  chain_id: z.number().int().positive(),
  rpc_url: z.string().url(),
  explorer_url: z.string().url()
});

export const cryptoWalletSchema = z.object({
  id: z.string().uuid(),
  currency: cryptoCurrencySchema,
  address: z.string(),
  balance: z.string().regex(/^\d+(\.\d+)?$/),
  is_custodial: z.boolean(),
  network_config: networkConfigSchema
});

export const cryptoTransactionTypeSchema = z.nativeEnum(CryptoTransactionType);

export const cryptoTransactionSchema = z.object({
  id: z.string().uuid(),
  wallet_id: z.string().uuid(),
  type: cryptoTransactionTypeSchema,
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  currency: cryptoCurrencySchema,
  status: transactionStatusSchema,
  tx_hash: z.string(),
  network_fee: z.string().regex(/^\d+(\.\d+)?$/),
  gas_fee: z.string().regex(/^\d+(\.\d+)?$/),
  created_at: z.date()
});

export const exchangeRequestSchema = z.object({
  from_wallet_id: z.string().uuid(),
  to_wallet_id: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  from_currency: cryptoCurrencySchema,
  to_currency: cryptoCurrencySchema
});

export const exchangeQuoteSchema = z.object({
  exchange_rate: z.string().regex(/^\d+(\.\d+)?$/),
  fee_percentage: z.string().regex(/^(?:100|[1-9]?\d)(?:\.\d+)?$/),
  fee_amount: z.string().regex(/^\d+(\.\d+)?$/),
  output_amount: z.string().regex(/^\d+(\.\d+)?$/),
  expiry_timestamp: z.date()
});

export const priceDataSchema = z.object({
  currency: cryptoCurrencySchema,
  price_usd: z.string().regex(/^\d+(\.\d+)?$/),
  change_24h: z.string().regex(/^-?\d+(\.\d+)?$/),
  volume_24h: z.string().regex(/^\d+(\.\d+)?$/),
  market_cap: z.string().regex(/^\d+(\.\d+)?$/),
  total_supply: z.string().regex(/^\d+(\.\d+)?$/),
  last_updated: z.date()
});