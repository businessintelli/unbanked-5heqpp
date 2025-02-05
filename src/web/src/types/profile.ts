import { z } from 'zod'; // v3.22.0 - Runtime type validation
import type { ApiResponse } from './api';

/**
 * Profile status enumeration
 */
export enum ProfileStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DEACTIVATED = 'DEACTIVATED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION'
}

/**
 * KYC verification levels
 */
export enum KYCLevel {
  NONE = 0,
  BASIC = 1,
  VERIFIED = 2,
  ENHANCED = 3
}

/**
 * Address type enumeration
 */
export enum AddressType {
  RESIDENTIAL = 'RESIDENTIAL',
  BUSINESS = 'BUSINESS'
}

/**
 * Supported system constants
 */
export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko'] as const;
export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'NZD'] as const;
export const SUPPORTED_THEMES = ['light', 'dark', 'system'] as const;
export const SUPPORTED_TIMEZONES = Intl.supportedValuesOf('timeZone');

/**
 * Address interface with verification support
 */
export interface Address {
  street_address: string;
  unit_number?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  address_type: AddressType;
  is_verified: boolean;
  verification_date?: Date;
}

/**
 * Notification preferences configuration
 */
export interface NotificationPreferences {
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  transaction_alerts: boolean;
  security_alerts: boolean;
  marketing_communications: boolean;
}

/**
 * User preferences with security and notification settings
 */
export interface UserPreferences {
  language: string;
  currency: string;
  theme: string;
  timezone: string;
  notifications: NotificationPreferences;
  two_factor_enabled: boolean;
  login_alerts: boolean;
}

/**
 * Complete user profile data structure
 */
export interface Profile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  date_of_birth: Date;
  address: Address;
  kyc_level: KYCLevel;
  kyc_verified_at?: Date;
  status: ProfileStatus;
  preferences: UserPreferences;
  created_at: Date;
  updated_at: Date;
  last_login: Date;
  last_activity: Date;
}

/**
 * Profile update request payload
 */
export interface ProfileUpdateRequest {
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  address?: Partial<Address>;
  preferences?: Partial<UserPreferences>;
}

/**
 * Profile API response type
 */
export type ProfileResponse = ApiResponse<Profile>;

// Zod validation schemas

export const addressSchema = z.object({
  street_address: z.string().min(1),
  unit_number: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postal_code: z.string().min(1),
  country: z.string().length(2),
  address_type: z.nativeEnum(AddressType),
  is_verified: z.boolean(),
  verification_date: z.date().optional()
});

export const notificationPreferencesSchema = z.object({
  email_enabled: z.boolean(),
  sms_enabled: z.boolean(),
  push_enabled: z.boolean(),
  transaction_alerts: z.boolean(),
  security_alerts: z.boolean(),
  marketing_communications: z.boolean()
});

export const userPreferencesSchema = z.object({
  language: z.enum(SUPPORTED_LANGUAGES),
  currency: z.enum(SUPPORTED_CURRENCIES),
  theme: z.enum(SUPPORTED_THEMES),
  timezone: z.string().refine((tz) => SUPPORTED_TIMEZONES.includes(tz)),
  notifications: notificationPreferencesSchema,
  two_factor_enabled: z.boolean(),
  login_alerts: z.boolean()
});

export const profileSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  phone_number: z.string().regex(/^\+[1-9]\d{1,14}$/),
  date_of_birth: z.date(),
  address: addressSchema,
  kyc_level: z.nativeEnum(KYCLevel),
  kyc_verified_at: z.date().optional(),
  status: z.nativeEnum(ProfileStatus),
  preferences: userPreferencesSchema,
  created_at: z.date(),
  updated_at: z.date(),
  last_login: z.date(),
  last_activity: z.date()
});

export const profileUpdateRequestSchema = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  phone_number: z.string().regex(/^\+[1-9]\d{1,14}$/).optional(),
  address: addressSchema.partial().optional(),
  preferences: userPreferencesSchema.partial().optional()
});