import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  formatFiatCurrency,
  formatCryptoCurrency,
  convertFiatAmount,
  validateFiatAmount,
  validateCryptoAmount
} from '../../src/utils/currency';
import type { Currency } from '../../src/types/banking';
import type { CryptoCurrency } from '../../src/types/crypto';

describe('formatFiatCurrency', () => {
  beforeEach(() => {
    // Reset the Intl.NumberFormat cache before each test
    vi.spyOn(Intl, 'NumberFormat');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should format USD with proper symbol and decimals', () => {
    expect(formatFiatCurrency(1234.56, 'USD')).toBe('$1,234.56');
    expect(formatFiatCurrency(0.5, 'USD')).toBe('$0.50');
    expect(formatFiatCurrency(1000000, 'USD')).toBe('$1,000,000.00');
  });

  it('should format EUR with proper symbol and regional variations', () => {
    expect(formatFiatCurrency(1234.56, 'EUR')).toBe('€1,234.56');
    expect(formatFiatCurrency(0.5, 'EUR')).toBe('€0.50');
  });

  it('should format GBP with proper symbol placement', () => {
    expect(formatFiatCurrency(1234.56, 'GBP')).toBe('£1,234.56');
    expect(formatFiatCurrency(0.5, 'GBP')).toBe('£0.50');
  });

  it('should format JPY with no decimal places', () => {
    expect(formatFiatCurrency(1234, 'JPY')).toBe('¥1,234');
    expect(formatFiatCurrency(1234.56, 'JPY')).toBe('¥1,235'); // Rounds to nearest whole number
  });

  it('should handle custom formatting options', () => {
    expect(formatFiatCurrency(1234.56, 'USD', { useGrouping: false })).toBe('$1234.56');
    expect(formatFiatCurrency(1234.56, 'USD', { signDisplay: 'always' })).toBe('+$1,234.56');
  });

  it('should throw error for invalid amounts', () => {
    expect(() => formatFiatCurrency(NaN, 'USD')).toThrow('Invalid amount provided for currency formatting');
    expect(() => formatFiatCurrency(Infinity, 'USD')).toThrow('Invalid amount provided for currency formatting');
  });

  it('should maintain formatter cache for performance', () => {
    formatFiatCurrency(100, 'USD');
    formatFiatCurrency(200, 'USD');
    expect(Intl.NumberFormat).toHaveBeenCalledTimes(1); // Should reuse cached formatter
  });
});

describe('formatCryptoCurrency', () => {
  it('should format BTC with 8 decimal precision', () => {
    expect(formatCryptoCurrency('1.23456789', 'BTC')).toBe('1.23456789 BTC');
    expect(formatCryptoCurrency('0.00000001', 'BTC')).toBe('0.00000001 BTC');
  });

  it('should format ETH with 18 decimal precision', () => {
    expect(formatCryptoCurrency('1.234567890123456789', 'ETH')).toBe('1.234567890123456789 ETH');
    expect(formatCryptoCurrency('0.000000000000000001', 'ETH')).toBe('0.000000000000000001 ETH');
  });

  it('should format USDC/USDT with 6 decimal precision', () => {
    expect(formatCryptoCurrency('1.234567', 'USDC')).toBe('1.234567 USDC');
    expect(formatCryptoCurrency('1.234567', 'USDT')).toBe('1.234567 USDT');
  });

  it('should handle very small amounts with scientific notation', () => {
    expect(formatCryptoCurrency('0.0000000001', 'BTC')).toMatch(/^1e-10 BTC$/);
  });

  it('should throw error for invalid amount format', () => {
    expect(() => formatCryptoCurrency('invalid', 'BTC')).toThrow('Invalid cryptocurrency amount format');
    expect(() => formatCryptoCurrency('-1.23', 'BTC')).toThrow('Invalid cryptocurrency amount format');
  });
});

describe('convertFiatAmount', () => {
  it('should convert USD to EUR correctly', () => {
    expect(convertFiatAmount(100, 'USD', 'EUR')).toBe(85.00);
    expect(convertFiatAmount(1000, 'USD', 'EUR')).toBe(850.00);
  });

  it('should convert EUR to GBP correctly', () => {
    expect(convertFiatAmount(100, 'EUR', 'GBP')).toBe(86.00);
    expect(convertFiatAmount(1000, 'EUR', 'GBP')).toBe(860.00);
  });

  it('should handle same currency conversion', () => {
    expect(convertFiatAmount(100, 'USD', 'USD')).toBe(100.00);
    expect(convertFiatAmount(1000, 'EUR', 'EUR')).toBe(1000.00);
  });

  it('should apply correct decimal places for target currency', () => {
    expect(convertFiatAmount(100, 'USD', 'JPY')).toBe(11000); // JPY has 0 decimals
    expect(convertFiatAmount(100, 'JPY', 'USD')).toBe(0.91); // USD has 2 decimals
  });

  it('should throw error for invalid amounts', () => {
    expect(() => convertFiatAmount(NaN, 'USD', 'EUR')).toThrow('Invalid amount for currency conversion');
    expect(() => convertFiatAmount(Infinity, 'USD', 'EUR')).toThrow('Invalid amount for currency conversion');
  });
});

describe('validateFiatAmount', () => {
  it('should validate valid USD amounts', () => {
    expect(validateFiatAmount(100.00, 'USD')).toBe(true);
    expect(validateFiatAmount(0.01, 'USD')).toBe(true);
    expect(validateFiatAmount(999999.99, 'USD')).toBe(true);
  });

  it('should validate valid JPY amounts', () => {
    expect(validateFiatAmount(100, 'JPY')).toBe(true);
    expect(validateFiatAmount(1, 'JPY')).toBe(true);
    expect(validateFiatAmount(99999999, 'JPY')).toBe(true);
  });

  it('should reject invalid decimal places', () => {
    expect(validateFiatAmount(100.123, 'USD')).toBe(false);
    expect(validateFiatAmount(100.1, 'JPY')).toBe(false);
  });

  it('should reject amounts outside allowed range', () => {
    expect(validateFiatAmount(0, 'USD')).toBe(false);
    expect(validateFiatAmount(1000001, 'USD')).toBe(false);
  });

  it('should reject invalid number values', () => {
    expect(validateFiatAmount(NaN, 'USD')).toBe(false);
    expect(validateFiatAmount(Infinity, 'USD')).toBe(false);
  });
});

describe('validateCryptoAmount', () => {
  it('should validate valid BTC amounts', () => {
    expect(validateCryptoAmount('1.23456789', 'BTC')).toBe(true);
    expect(validateCryptoAmount('0.00000001', 'BTC')).toBe(true);
    expect(validateCryptoAmount('21000000', 'BTC')).toBe(true);
  });

  it('should validate valid ETH amounts', () => {
    expect(validateCryptoAmount('1.234567890123456789', 'ETH')).toBe(true);
    expect(validateCryptoAmount('0.000000000000000001', 'ETH')).toBe(true);
    expect(validateCryptoAmount('115000000', 'ETH')).toBe(true);
  });

  it('should validate valid USDC/USDT amounts', () => {
    expect(validateCryptoAmount('1.234567', 'USDC')).toBe(true);
    expect(validateCryptoAmount('0.000001', 'USDT')).toBe(true);
    expect(validateCryptoAmount('1000000000', 'USDC')).toBe(true);
  });

  it('should reject amounts with too many decimal places', () => {
    expect(validateCryptoAmount('1.123456789', 'BTC')).toBe(false); // > 8 decimals
    expect(validateCryptoAmount('1.1234567890123456789', 'ETH')).toBe(false); // > 18 decimals
    expect(validateCryptoAmount('1.1234567', 'USDC')).toBe(false); // > 6 decimals
  });

  it('should reject amounts outside allowed range', () => {
    expect(validateCryptoAmount('0', 'BTC')).toBe(false);
    expect(validateCryptoAmount('21000001', 'BTC')).toBe(false);
  });

  it('should reject invalid number formats', () => {
    expect(validateCryptoAmount('invalid', 'BTC')).toBe(false);
    expect(validateCryptoAmount('-1.23', 'BTC')).toBe(false);
    expect(validateCryptoAmount('1.2.3', 'BTC')).toBe(false);
  });
});