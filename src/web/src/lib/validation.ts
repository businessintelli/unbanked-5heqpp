import { z } from 'zod'; // v3.22.0
import {
  LoginCredentials,
  loginCredentialsSchema,
  KYCDocument,
  kycDocumentSchema,
  KYCLevel
} from '../types/auth';
import {
  Currency,
  TransactionType,
  ComplianceStatus,
  transactionSchema,
  walletSchema
} from '../types/banking';
import {
  CryptoCurrency,
  ExchangeRequest,
  exchangeRequestSchema,
  cryptoTransactionSchema
} from '../types/crypto';
import {
  PersonalInfo,
  Address,
  UserPreferences,
  profileSchema,
  addressSchema,
  userPreferencesSchema
} from '../types/profile';

// Global validation constants
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const PHONE_REGEX = /^\+[1-9]\d{1,14}$/;
const BLOCKED_EMAIL_DOMAINS = ['tempmail.com', 'disposable.com'];
const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'zh'];
const DOCUMENT_EXPIRY_MONTHS = 3;

// Enhanced validation schemas with security and compliance checks
export const validationSchemas = {
  // Authentication schemas
  login: loginCredentialsSchema.extend({
    email: z.string()
      .email()
      .regex(EMAIL_REGEX)
      .refine(email => !BLOCKED_EMAIL_DOMAINS.some(domain => email.endsWith(domain)), {
        message: 'Email domain not allowed'
      }),
    password: z.string()
      .min(PASSWORD_MIN_LENGTH)
      .regex(PASSWORD_REGEX, {
        message: 'Password must contain uppercase, lowercase, number and special character'
      })
  }),

  // KYC document validation
  kyc: kycDocumentSchema.extend({
    expiry_date: z.date()
      .min(new Date(), { message: 'Document expired' })
      .transform(date => {
        const expiryLimit = new Date();
        expiryLimit.setMonth(expiryLimit.getMonth() + DOCUMENT_EXPIRY_MONTHS);
        return date > expiryLimit ? date : new Date('invalid');
      })
  }),

  // Transaction validation with compliance checks
  transaction: transactionSchema.extend({
    amount: z.number()
      .positive()
      .safe()
      .refine(amount => amount <= 1000000, {
        message: 'Amount exceeds maximum limit'
      }),
    compliance_check_result: z.object({
      passed: z.boolean(),
      risk_level: z.enum(['low', 'medium', 'high']),
      checks_performed: z.array(z.string()),
      review_required: z.boolean()
    })
  }),

  // Crypto exchange validation
  exchange: exchangeRequestSchema.extend({
    amount: z.string()
      .regex(/^\d+(\.\d+)?$/)
      .refine(amount => parseFloat(amount) > 0, {
        message: 'Amount must be greater than 0'
      }),
    network_fee: z.string()
      .regex(/^\d+(\.\d+)?$/)
      .optional()
  }),

  // Profile validation with enhanced security
  profile: profileSchema.extend({
    phone_number: z.string()
      .regex(PHONE_REGEX, {
        message: 'Invalid phone number format'
      }),
    security_questions: z.array(
      z.object({
        question: z.string(),
        answer: z.string().min(3)
      })
    ).min(2)
  })
};

// Validation utility functions
export const validationUtils = {
  /**
   * Validates login credentials with enhanced security checks
   */
  validateLoginCredentials: (data: LoginCredentials, deviceInfo: { deviceId: string }) => {
    try {
      const validated = validationSchemas.login.parse({
        ...data,
        device_id: deviceInfo.deviceId
      });
      
      return {
        isValid: true,
        requiresMFA: true, // Always require MFA for security
        data: validated
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          isValid: false,
          errors: error.errors,
          requiresMFA: false
        };
      }
      throw error;
    }
  },

  /**
   * Validates KYC document with expiry and compliance checks
   */
  validateKYCDocument: (document: KYCDocument): boolean => {
    try {
      validationSchemas.kyc.parse(document);
      
      const isExpired = new Date(document.expiry_date!) < new Date();
      const isValidType = ['passport', 'drivers_license', 'national_id'].includes(document.type);
      
      return !isExpired && isValidType;
    } catch {
      return false;
    }
  },

  /**
   * Validates transaction against compliance rules and limits
   */
  validateTransactionCompliance: (
    amount: number,
    currency: Currency,
    userLevel: KYCLevel
  ) => {
    const limits = {
      [KYCLevel.NONE]: 0,
      [KYCLevel.BASIC]: 1000,
      [KYCLevel.VERIFIED]: 10000,
      [KYCLevel.ENHANCED]: 100000
    };

    const dailyLimit = limits[userLevel];
    
    try {
      validationSchemas.transaction.parse({
        amount,
        currency,
        compliance_check_result: {
          passed: amount <= dailyLimit,
          risk_level: amount > dailyLimit * 0.8 ? 'high' : 'low',
          checks_performed: ['limit_check', 'kyc_level_check'],
          review_required: amount > dailyLimit * 0.8
        }
      });

      return {
        allowed: amount <= dailyLimit,
        remainingLimit: dailyLimit - amount,
        requiresReview: amount > dailyLimit * 0.8
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          allowed: false,
          errors: error.errors
        };
      }
      throw error;
    }
  }
};

// Export validation types for external use
export type ValidationResult<T> = {
  isValid: boolean;
  data?: T;
  errors?: z.ZodError['errors'];
};

export type ComplianceValidationResult = {
  allowed: boolean;
  remainingLimit?: number;
  requiresReview?: boolean;
  errors?: z.ZodError['errors'];
};