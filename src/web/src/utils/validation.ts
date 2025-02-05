// @ts-check
import { z } from 'zod'; // v3.22.0 - Runtime type validation
import type { LoginCredentials, KYCLevel, User } from '../types/auth';
import type { Currency, Transaction, Wallet } from '../types/banking';
import type { CryptoCurrency, ExchangeRequest, CryptoWallet } from '../types/crypto';

// Regular expression patterns for validation
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;
const PHONE_REGEX = /^\+[1-9]\d{1,14}$/;
const AMOUNT_REGEX = /^\d+(\.\d{1,8})?$/;

// Currency-specific decimal precision limits
const CURRENCY_PRECISION: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  BTC: 8,
  ETH: 18,
  USDC: 6,
  USDT: 6
};

/**
 * Validates email format with enhanced security checks
 * @param email - Email address to validate
 * @returns boolean indicating if email is valid
 */
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Sanitize email input
  const sanitizedEmail = email.trim().toLowerCase();

  // Basic format validation
  if (!EMAIL_REGEX.test(sanitizedEmail)) {
    return false;
  }

  // Length constraints
  if (sanitizedEmail.length < 5 || sanitizedEmail.length > 254) {
    return false;
  }

  // Additional security checks
  const [localPart, domain] = sanitizedEmail.split('@');
  if (localPart.length > 64 || domain.length > 255) {
    return false;
  }

  // Check for common security patterns
  if (sanitizedEmail.includes('..') || sanitizedEmail.includes('.@')) {
    return false;
  }

  return true;
}

/**
 * Validates password complexity with enhanced security requirements
 * @param password - Password to validate
 * @returns boolean indicating if password meets security requirements
 */
export function validatePassword(password: string): boolean {
  if (!password || typeof password !== 'string') {
    return false;
  }

  // Basic length and pattern check
  if (password.length < 12 || !PASSWORD_REGEX.test(password)) {
    return false;
  }

  // Additional security checks
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[@$!%*?&]/.test(password);
  
  if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
    return false;
  }

  // Check character distribution
  const charDistribution = password.split('').reduce((acc, char) => {
    acc[char] = (acc[char] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Prevent excessive character repetition
  if (Object.values(charDistribution).some(count => count > 4)) {
    return false;
  }

  // Check for common patterns
  if (/(\w)\1{2,}/.test(password) || // Repeated characters
      /^(?=.*123|.*abc|.*qwe).*$/i.test(password)) { // Common sequences
    return false;
  }

  return true;
}

/**
 * Validates currency amount format and precision
 * @param amount - Amount to validate
 * @param currency - Currency code
 * @returns boolean indicating if amount is valid for the currency
 */
export function validateAmount(amount: string, currency: Currency | CryptoCurrency): boolean {
  if (!amount || !currency || typeof amount !== 'string') {
    return false;
  }

  // Basic format validation
  if (!AMOUNT_REGEX.test(amount)) {
    return false;
  }

  // Parse amount for numerical validation
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return false;
  }

  // Check decimal precision
  const [, decimal] = amount.split('.');
  const precision = CURRENCY_PRECISION[currency] || 2;
  if (decimal && decimal.length > precision) {
    return false;
  }

  // Currency-specific validations
  if (currency === 'BTC' && numericAmount > 21_000_000) {
    return false; // Exceeds total BTC supply
  }

  // Check for reasonable maximum amounts
  const maxAmounts: Record<string, number> = {
    USD: 1_000_000_000,
    EUR: 1_000_000_000,
    GBP: 1_000_000_000,
    USDC: 1_000_000_000,
    USDT: 1_000_000_000
  };

  if (maxAmounts[currency] && numericAmount > maxAmounts[currency]) {
    return false;
  }

  return true;
}

/**
 * Validates if user has required KYC level for operation
 * @param user - User object
 * @param requiredLevel - Required KYC level
 * @returns boolean indicating if user meets KYC requirements
 */
export function validateKYCLevel(user: User, requiredLevel: KYCLevel): boolean {
  if (!user || typeof user.kyc_level !== 'number') {
    return false;
  }

  // Basic level comparison
  if (user.kyc_level < requiredLevel) {
    return false;
  }

  // Check if user object is valid
  if (!user.id || !user.email) {
    return false;
  }

  // Validate session expiration
  if (new Date(user.session_expires) < new Date()) {
    return false;
  }

  // Additional KYC validations based on level
  switch (requiredLevel) {
    case KYCLevel.ENHANCED:
      // Require MFA for enhanced KYC level
      if (!user.mfa_enabled) {
        return false;
      }
      break;

    case KYCLevel.VERIFIED:
      // Check security level for verified status
      if (user.security_level < 80) {
        return false;
      }
      break;
  }

  return true;
}

// Export Zod schemas for runtime validation
export const validationSchemas = {
  email: z.string().regex(EMAIL_REGEX),
  password: z.string().regex(PASSWORD_REGEX),
  amount: z.string().regex(AMOUNT_REGEX),
  phone: z.string().regex(PHONE_REGEX)
};