// vite/client v4.0.0 - Environment variables and types
import { loadEnv } from 'vite/client';

// Global constants for API configuration
const API_VERSION = 'v1';
const DEFAULT_TIMEOUT = 5000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const PERFORMANCE_THRESHOLD = 500;

/**
 * API endpoints configuration for all platform services
 */
export const ENDPOINTS = {
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    mfa: '/auth/mfa',
    verifyKyc: '/auth/verify-kyc'
  },
  banking: {
    createWallet: '/banking/create-wallet',
    getBalance: '/banking/get-balance',
    transfer: '/banking/transfer',
    transactionHistory: '/banking/transaction-history',
    plaidLink: '/banking/plaid-link'
  },
  crypto: {
    createWallet: '/crypto/create-wallet',
    getBalance: '/crypto/get-balance',
    exchange: '/crypto/exchange',
    priceFeed: '/crypto/price-feed',
    transactionHistory: '/crypto/transaction-history'
  },
  profile: {
    getProfile: '/profile/get-profile',
    updateProfile: '/profile/update-profile',
    kycStatus: '/profile/kyc-status'
  }
} as const;

/**
 * Security headers configuration following OWASP recommendations
 */
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block'
} as const;

/**
 * Retrieves and validates the environment-specific base URL
 */
const getBaseUrl = (): string => {
  const apiUrl = import.meta.env.VITE_API_URL;
  
  if (!apiUrl) {
    throw new Error('API URL environment variable is not configured');
  }

  try {
    new URL(apiUrl);
    return apiUrl;
  } catch (error) {
    throw new Error(`Invalid API URL configuration: ${error.message}`);
  }
};

/**
 * Advanced retry configuration with exponential backoff
 */
export const RETRY_CONFIG = {
  maxRetries: MAX_RETRIES,
  retryDelay: RETRY_DELAY,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  backoffFactor: 2,
  retryCondition: (error: any): boolean => {
    return (
      error.status === undefined ||
      RETRY_CONFIG.retryableStatuses.includes(error.status)
    );
  }
} as const;

/**
 * Monitoring and performance tracking configuration
 */
export const MONITORING_CONFIG = {
  performanceThreshold: PERFORMANCE_THRESHOLD,
  errorTracking: {
    samplingRate: 1.0,
    includeHeaders: false,
    maskSensitiveData: true
  },
  metrics: {
    collectionInterval: 60000,
    tags: {
      version: API_VERSION,
      environment: import.meta.env.MODE
    }
  }
} as const;

/**
 * Validates the complete API configuration
 */
const validateApiConfig = (config: typeof API_CONFIG): boolean => {
  if (!config.baseUrl) return false;
  if (typeof config.timeout !== 'number' || config.timeout <= 0) return false;
  if (!config.headers || Object.keys(config.headers).length === 0) return false;
  if (!config.monitoring || !config.monitoring.performanceThreshold) return false;
  return true;
};

/**
 * Main API configuration object
 */
export const API_CONFIG = {
  baseUrl: getBaseUrl(),
  version: API_VERSION,
  timeout: DEFAULT_TIMEOUT,
  headers: {
    ...SECURITY_HEADERS,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  },
  monitoring: {
    ...MONITORING_CONFIG,
    enabled: import.meta.env.PROD,
    sampleRate: import.meta.env.PROD ? 1.0 : 0.1
  }
} as const;

// Validate configuration on initialization
if (!validateApiConfig(API_CONFIG)) {
  throw new Error('Invalid API configuration');
}

// Type definitions for exported configurations
export type ApiEndpoints = typeof ENDPOINTS;
export type ApiConfig = typeof API_CONFIG;
export type RetryConfig = typeof RETRY_CONFIG;
export type MonitoringConfig = typeof MONITORING_CONFIG;