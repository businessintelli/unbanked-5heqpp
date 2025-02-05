import { Currency } from '../types/banking';
import { CryptoCurrency } from '../types/crypto';
import 'intl'; // v1.2.0 - Internationalization support

// Cache for NumberFormat instances to improve performance
const numberFormatCache: Record<string, Intl.NumberFormat> = {};

/**
 * Get or create a cached NumberFormat instance
 */
const getNumberFormatter = (currency: Currency, options?: Intl.NumberFormatOptions): Intl.NumberFormat => {
  const key = `${currency}-${JSON.stringify(options)}`;
  if (!numberFormatCache[key]) {
    numberFormatCache[key] = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      ...options
    });
  }
  return numberFormatCache[key];
};

/**
 * Currency-specific decimal place configuration
 */
const CURRENCY_DECIMALS: Record<Currency, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  CHF: 2
};

/**
 * Cryptocurrency-specific decimal place configuration
 */
const CRYPTO_DECIMALS: Record<CryptoCurrency, number> = {
  BTC: 8,
  ETH: 18,
  USDC: 6,
  USDT: 6
};

/**
 * Format fiat currency with proper locale and precision handling
 */
export const formatFiatCurrency = (
  amount: number,
  currency: Currency,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    useGrouping?: boolean;
    signDisplay?: 'auto' | 'never' | 'always' | 'exceptZero';
  }
): string => {
  if (!Number.isFinite(amount)) {
    throw new Error('Invalid amount provided for currency formatting');
  }

  const defaultDecimals = CURRENCY_DECIMALS[currency];
  const formatter = getNumberFormatter(currency, {
    minimumFractionDigits: defaultDecimals,
    maximumFractionDigits: defaultDecimals,
    useGrouping: true,
    ...options
  });

  return formatter.format(amount);
};

/**
 * Format cryptocurrency with appropriate precision and notation
 */
export const formatCryptoCurrency = (
  amount: string,
  currency: CryptoCurrency
): string => {
  if (!/^\d*\.?\d*$/.test(amount)) {
    throw new Error('Invalid cryptocurrency amount format');
  }

  const numericAmount = parseFloat(amount);
  const decimals = CRYPTO_DECIMALS[currency];

  // Use scientific notation for very small amounts
  if (numericAmount > 0 && numericAmount < 0.000001) {
    return `${numericAmount.toExponential(decimals)} ${currency}`;
  }

  // Format with appropriate decimal places
  const formattedAmount = numericAmount.toFixed(decimals);
  return `${formattedAmount} ${currency}`;
};

/**
 * Convert between fiat currencies with high precision
 */
export const convertFiatAmount = (
  amount: number,
  fromCurrency: Currency,
  toCurrency: Currency
): number => {
  if (!Number.isFinite(amount)) {
    throw new Error('Invalid amount for currency conversion');
  }

  // Simulated exchange rates - in production, these would come from an API
  const EXCHANGE_RATES: Record<Currency, Record<Currency, number>> = {
    USD: { EUR: 0.85, GBP: 0.73, JPY: 110.0, CHF: 0.92, USD: 1 },
    EUR: { USD: 1.18, GBP: 0.86, JPY: 129.5, CHF: 1.08, EUR: 1 },
    GBP: { USD: 1.37, EUR: 1.16, JPY: 150.7, CHF: 1.26, GBP: 1 },
    JPY: { USD: 0.0091, EUR: 0.0077, GBP: 0.0066, CHF: 0.0084, JPY: 1 },
    CHF: { USD: 1.09, EUR: 0.93, GBP: 0.79, JPY: 119.6, CHF: 1 }
  };

  const rate = EXCHANGE_RATES[fromCurrency][toCurrency];
  const convertedAmount = amount * rate;

  // Apply currency-specific rounding
  const decimals = CURRENCY_DECIMALS[toCurrency];
  return Number(convertedAmount.toFixed(decimals));
};

/**
 * Validate fiat currency amount based on currency-specific rules
 */
export const validateFiatAmount = (
  amount: number,
  currency: Currency
): boolean => {
  if (!Number.isFinite(amount)) {
    return false;
  }

  // Currency-specific validation rules
  const rules = {
    USD: { min: 0.01, max: 1000000 },
    EUR: { min: 0.01, max: 1000000 },
    GBP: { min: 0.01, max: 1000000 },
    JPY: { min: 1, max: 100000000 },
    CHF: { min: 0.01, max: 1000000 }
  };

  const { min, max } = rules[currency];
  
  // Check amount is within allowed range
  if (amount < min || amount > max) {
    return false;
  }

  // Verify decimal places match currency requirements
  const decimalPlaces = (amount.toString().split('.')[1] || '').length;
  return decimalPlaces <= CURRENCY_DECIMALS[currency];
};

/**
 * Validate cryptocurrency amount based on token-specific rules
 */
export const validateCryptoAmount = (
  amount: string,
  currency: CryptoCurrency
): boolean => {
  if (!/^\d*\.?\d*$/.test(amount)) {
    return false;
  }

  const numericAmount = parseFloat(amount);
  
  // Currency-specific validation rules
  const rules = {
    BTC: { min: 0.00000001, max: 21000000 },
    ETH: { min: 0.000000000000000001, max: 115000000 },
    USDC: { min: 0.000001, max: 1000000000 },
    USDT: { min: 0.000001, max: 1000000000 }
  };

  const { min, max } = rules[currency];

  // Check amount is within allowed range
  if (numericAmount < min || numericAmount > max) {
    return false;
  }

  // Verify decimal places match token requirements
  const decimalPlaces = (amount.split('.')[1] || '').length;
  return decimalPlaces <= CRYPTO_DECIMALS[currency];
};