import { describe, it, expect } from 'vitest'; // v0.34.0
import {
  validateEmail,
  validatePassword,
  validatePhoneNumber,
  validateAmount,
  validateKYCLevel
} from '../../src/utils/validation';
import { KYCLevel, User } from '../../src/types/auth';
import type { Currency } from '../../src/types/banking';
import type { CryptoCurrency } from '../../src/types/crypto';

describe('Email Validation Tests', () => {
  it('should validate standard email formats', () => {
    expect(validateEmail('user@domain.com')).toBe(true);
    expect(validateEmail('user.name@domain.com')).toBe(true);
    expect(validateEmail('user+tag@domain.com')).toBe(true);
    expect(validateEmail('user@sub.domain.com')).toBe(true);
  });

  it('should reject invalid email formats', () => {
    expect(validateEmail('')).toBe(false);
    expect(validateEmail('invalid')).toBe(false);
    expect(validateEmail('user@')).toBe(false);
    expect(validateEmail('@domain.com')).toBe(false);
    expect(validateEmail('user@.com')).toBe(false);
  });

  it('should reject SQL injection patterns', () => {
    expect(validateEmail("user@domain.com' OR '1'='1")).toBe(false);
    expect(validateEmail('user@domain.com;DROP TABLE users')).toBe(false);
    expect(validateEmail('admin\'--@domain.com')).toBe(false);
  });

  it('should enforce length constraints', () => {
    const longLocalPart = 'a'.repeat(65);
    const longDomain = 'a'.repeat(256);
    expect(validateEmail(`${longLocalPart}@domain.com`)).toBe(false);
    expect(validateEmail(`user@${longDomain}.com`)).toBe(false);
  });

  it('should validate international domains', () => {
    expect(validateEmail('user@domain.co.uk')).toBe(true);
    expect(validateEmail('user@domain.io')).toBe(true);
    expect(validateEmail('user@domain.tech')).toBe(true);
  });

  it('should reject dangerous patterns', () => {
    expect(validateEmail('user..name@domain.com')).toBe(false);
    expect(validateEmail('user.@domain.com')).toBe(false);
    expect(validateEmail('user@domain..com')).toBe(false);
  });
});

describe('Password Validation Tests', () => {
  it('should validate secure passwords', () => {
    expect(validatePassword('SecureP@ss123')).toBe(true);
    expect(validatePassword('Complex1ty#2023')).toBe(true);
    expect(validatePassword('P@ssw0rd$Strong')).toBe(true);
  });

  it('should enforce minimum requirements', () => {
    expect(validatePassword('short')).toBe(false);
    expect(validatePassword('NoSpecialChar1')).toBe(false);
    expect(validatePassword('nouppercasechar1@')).toBe(false);
    expect(validatePassword('NOLOWERCASECHAR1@')).toBe(false);
    expect(validatePassword('NoNumbers@chars')).toBe(false);
  });

  it('should reject common patterns', () => {
    expect(validatePassword('Password123!')).toBe(false);
    expect(validatePassword('Qwerty123!')).toBe(false);
    expect(validatePassword('Abcd1234!')).toBe(false);
  });

  it('should check character distribution', () => {
    expect(validatePassword('AAA@bbbb123ccc')).toBe(false);
    expect(validatePassword('Pass@@@@word1')).toBe(false);
    expect(validatePassword('11112222@Aa')).toBe(false);
  });

  it('should validate special character requirements', () => {
    expect(validatePassword('SecurePass123')).toBe(false);
    expect(validatePassword('SecurePass@')).toBe(false);
    expect(validatePassword('securepass@123')).toBe(false);
  });

  it('should reject sequential patterns', () => {
    expect(validatePassword('Abcd123!@#$')).toBe(false);
    expect(validatePassword('Qwerty1@2345')).toBe(false);
    expect(validatePassword('Password12345@')).toBe(false);
  });
});

describe('Amount Validation Tests', () => {
  it('should validate fiat currency amounts', () => {
    expect(validateAmount('100.00', 'USD' as Currency)).toBe(true);
    expect(validateAmount('1000.50', 'EUR' as Currency)).toBe(true);
    expect(validateAmount('50.25', 'GBP' as Currency)).toBe(true);
  });

  it('should validate cryptocurrency amounts', () => {
    expect(validateAmount('0.12345678', 'BTC' as CryptoCurrency)).toBe(true);
    expect(validateAmount('10.123456', 'USDC' as CryptoCurrency)).toBe(true);
    expect(validateAmount('100.123456', 'USDT' as CryptoCurrency)).toBe(true);
  });

  it('should enforce currency-specific decimal places', () => {
    expect(validateAmount('100.123', 'USD' as Currency)).toBe(false);
    expect(validateAmount('0.123456789', 'BTC' as CryptoCurrency)).toBe(false);
    expect(validateAmount('10.1234567', 'USDC' as CryptoCurrency)).toBe(false);
  });

  it('should reject invalid amounts', () => {
    expect(validateAmount('-100.00', 'USD' as Currency)).toBe(false);
    expect(validateAmount('0.00', 'EUR' as Currency)).toBe(false);
    expect(validateAmount('abc', 'GBP' as Currency)).toBe(false);
  });

  it('should enforce maximum limits', () => {
    expect(validateAmount('1000000001', 'USD' as Currency)).toBe(false);
    expect(validateAmount('21000001', 'BTC' as CryptoCurrency)).toBe(false);
    expect(validateAmount('1000000001', 'USDC' as CryptoCurrency)).toBe(false);
  });

  it('should handle edge cases', () => {
    expect(validateAmount('', 'USD' as Currency)).toBe(false);
    expect(validateAmount('1.', 'EUR' as Currency)).toBe(false);
    expect(validateAmount('.5', 'GBP' as Currency)).toBe(false);
  });
});

describe('KYC Level Validation Tests', () => {
  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'user@example.com',
    kyc_level: KYCLevel.VERIFIED,
    mfa_enabled: true,
    security_level: 85,
    session_expires: new Date(Date.now() + 3600000),
    last_login: new Date(),
    role: 'USER'
  };

  it('should validate sufficient KYC levels', () => {
    expect(validateKYCLevel(mockUser, KYCLevel.BASIC)).toBe(true);
    expect(validateKYCLevel(mockUser, KYCLevel.VERIFIED)).toBe(true);
    expect(validateKYCLevel(mockUser, KYCLevel.NONE)).toBe(true);
  });

  it('should reject insufficient KYC levels', () => {
    expect(validateKYCLevel(mockUser, KYCLevel.ENHANCED)).toBe(false);
    
    const basicUser = { ...mockUser, kyc_level: KYCLevel.BASIC };
    expect(validateKYCLevel(basicUser, KYCLevel.VERIFIED)).toBe(false);
  });

  it('should validate session expiration', () => {
    const expiredUser = {
      ...mockUser,
      session_expires: new Date(Date.now() - 3600000)
    };
    expect(validateKYCLevel(expiredUser, KYCLevel.BASIC)).toBe(false);
  });

  it('should validate MFA requirements for enhanced KYC', () => {
    const noMfaUser = { ...mockUser, mfa_enabled: false };
    expect(validateKYCLevel(noMfaUser, KYCLevel.ENHANCED)).toBe(false);
  });

  it('should validate security level requirements', () => {
    const lowSecurityUser = { ...mockUser, security_level: 75 };
    expect(validateKYCLevel(lowSecurityUser, KYCLevel.VERIFIED)).toBe(false);
  });

  it('should handle invalid user objects', () => {
    expect(validateKYCLevel(null as unknown as User, KYCLevel.BASIC)).toBe(false);
    expect(validateKYCLevel({} as User, KYCLevel.BASIC)).toBe(false);
    expect(validateKYCLevel({ ...mockUser, id: null } as User, KYCLevel.BASIC)).toBe(false);
  });
});