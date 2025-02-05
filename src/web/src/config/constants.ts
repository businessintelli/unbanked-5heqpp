import { z } from 'zod'; // v3.22.0
import.meta.env from 'vite/client'; // v4.0.0

// Global constants
export const APP_NAME = 'Unbanked';
export const APP_VERSION = '1.0.0';

// Type definitions
interface SecurityConfig {
  rateLimits: Record<string, number>;
  ipBlockingThresholds: Record<string, number>;
  sessionTimeouts: Record<string, number>;
}

interface ComplianceConfig {
  dataRetentionPeriods: Record<string, number>;
  consentRequirements: Record<string, boolean>;
  privacySettings: Record<string, boolean>;
}

// Authentication Constants
export const AUTH_CONSTANTS = {
  tokenKey: 'unbanked_access_token',
  refreshTokenKey: 'unbanked_refresh_token',
  tokenExpiry: 900, // 15 minutes in seconds
  mfaExpiry: 300, // 5 minutes in seconds
  maxLoginAttempts: 5,
  maxMfaAttempts: 3,
  kycLevels: {
    LEVEL_1: 'basic',
    LEVEL_2: 'verified',
    LEVEL_3: 'enhanced'
  },
  passwordPolicy: {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    preventReuse: 5 // Last 5 passwords cannot be reused
  }
} as const;

// Security Constants
export const SECURITY_CONSTANTS: SecurityConfig = {
  rateLimits: {
    api: 1000, // Requests per minute
    login: 5, // Attempts per 15 minutes
    mfa: 3, // Attempts per session
    passwordReset: 3 // Attempts per 24 hours
  },
  ipBlockingThresholds: {
    suspiciousAttempts: 10, // Number of suspicious attempts before blocking
    blockDuration: 3600, // Block duration in seconds (1 hour)
    maxBlockCount: 3 // Maximum number of blocks before permanent ban
  },
  sessionTimeouts: {
    idle: 900, // 15 minutes in seconds
    absolute: 3600, // 1 hour in seconds
    mfa: 300 // 5 minutes in seconds
  }
} as const;

// Compliance Constants
export const COMPLIANCE_CONSTANTS: ComplianceConfig = {
  dataRetentionPeriods: {
    userProfile: 730, // 2 years in days
    transactions: 2555, // 7 years in days
    activityLogs: 365, // 1 year in days
    kycDocuments: 1825 // 5 years in days
  },
  consentRequirements: {
    marketing: true,
    dataSharing: true,
    cookies: true,
    thirdParty: true
  },
  privacySettings: {
    gdprEnabled: true,
    ccpaEnabled: true,
    psd2Enabled: true
  }
} as const;

// Banking Constants
export const BANKING_CONSTANTS = {
  transferLimits: {
    LEVEL_1: 1000, // Daily transfer limit for Level 1 users
    LEVEL_2: 10000, // Daily transfer limit for Level 2 users
    LEVEL_3: 100000 // Daily transfer limit for Level 3 users
  },
  supportedCurrencies: ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD'],
  transactionFees: {
    domestic: 0.001, // 0.1%
    international: 0.005, // 0.5%
    instant: 0.01 // 1%
  },
  minimumBalances: {
    LEVEL_1: 0,
    LEVEL_2: 100,
    LEVEL_3: 1000
  }
} as const;

// Crypto Constants
export const CRYPTO_CONSTANTS = {
  supportedCryptocurrencies: ['BTC', 'ETH', 'USDT', 'USDC'],
  exchangeLimits: {
    LEVEL_1: 5000, // Daily exchange limit for Level 1 users
    LEVEL_2: 50000, // Daily exchange limit for Level 2 users
    LEVEL_3: 500000 // Daily exchange limit for Level 3 users
  },
  networkFees: {
    BTC: 0.0001,
    ETH: 0.005,
    USDT: 1,
    USDC: 1
  },
  priceUpdateInterval: 30000, // 30 seconds in milliseconds
  orderExpiryTime: 300 // 5 minutes in seconds
} as const;

// Validation Schemas
export const ValidationSchemas = {
  email: z.string().email(),
  password: z.string().min(12).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/),
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/),
  amount: z.number().positive(),
  walletAddress: z.string().regex(/^(0x[a-fA-F0-9]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/),
  kycDocument: z.object({
    type: z.enum(['passport', 'nationalId', 'drivingLicense']),
    number: z.string(),
    expiryDate: z.date(),
    issuingCountry: z.string().length(2)
  })
} as const;

// Feature Flags
export const FEATURE_FLAGS = {
  enableNewKyc: import.meta.env.VITE_ENABLE_NEW_KYC === 'true',
  enableCryptoExchange: import.meta.env.VITE_ENABLE_CRYPTO_EXCHANGE === 'true',
  enableInstantTransfers: import.meta.env.VITE_ENABLE_INSTANT_TRANSFERS === 'true',
  enableBiometrics: import.meta.env.VITE_ENABLE_BIOMETRICS === 'true',
  enableNewDashboard: import.meta.env.VITE_ENABLE_NEW_DASHBOARD === 'true'
} as const;

// API Endpoints
export const API_ENDPOINTS = {
  auth: {
    login: '/api/v1/auth/login',
    register: '/api/v1/auth/register',
    mfa: '/api/v1/auth/mfa',
    refresh: '/api/v1/auth/refresh'
  },
  banking: {
    accounts: '/api/v1/banking/accounts',
    transactions: '/api/v1/banking/transactions',
    transfers: '/api/v1/banking/transfers'
  },
  crypto: {
    wallets: '/api/v1/crypto/wallets',
    exchange: '/api/v1/crypto/exchange',
    prices: '/api/v1/crypto/prices'
  },
  user: {
    profile: '/api/v1/user/profile',
    kyc: '/api/v1/user/kyc',
    settings: '/api/v1/user/settings'
  }
} as const;