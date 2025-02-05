// External imports
import { z } from 'zod'; // v3.22.0 - Runtime type validation

// Internal imports
import { BaseSchema } from './common';
import { KYCLevel } from './auth';

/**
 * Profile status states including GDPR compliance states
 */
export enum ProfileStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DEACTIVATED = 'DEACTIVATED',
  GDPR_DELETED = 'GDPR_DELETED'
}

/**
 * Enhanced user address structure with validation
 */
export interface Address {
  street_address: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

/**
 * Enhanced user preferences with privacy and theme settings
 */
export interface UserPreferences {
  language: string;
  currency: string;
  notifications_enabled: boolean;
  two_factor_enabled: boolean;
  theme: string;
  privacy_mode: boolean;
}

/**
 * GDPR consent tracking structure with enhanced compliance features
 */
export interface GDPRConsent {
  marketing_consent: boolean;
  data_processing_consent: boolean;
  consent_date: Date;
  consent_ip: string;
}

/**
 * Enhanced security settings for user profile
 */
export interface SecuritySettings {
  login_notifications: boolean;
  transaction_notifications: boolean;
  allowed_ips: string[];
  last_security_update: Date;
}

/**
 * Enhanced user profile data structure with GDPR and security features
 * Extends BaseSchema for consistent entity tracking
 */
export interface Profile extends z.infer<typeof BaseSchema> {
  user_id: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  date_of_birth: Date;
  address: Address;
  kyc_level: KYCLevel;
  status: ProfileStatus;
  preferences: UserPreferences;
  gdpr_consent: GDPRConsent;
  security_settings: SecuritySettings;
}

/**
 * Enhanced profile update request with GDPR and security settings
 */
export interface ProfileUpdateRequest {
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  address?: Partial<Address>;
  preferences?: Partial<UserPreferences>;
  gdpr_consent?: Partial<GDPRConsent>;
  security_settings?: Partial<SecuritySettings>;
}

// Zod validation schemas for runtime type checking
export const AddressSchema = z.object({
  street_address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  postal_code: z.string().min(1),
  country: z.string().min(2).max(2)
});

export const UserPreferencesSchema = z.object({
  language: z.string().min(2).max(5),
  currency: z.string().min(3).max(3),
  notifications_enabled: z.boolean(),
  two_factor_enabled: z.boolean(),
  theme: z.enum(['light', 'dark', 'system']),
  privacy_mode: z.boolean()
});

export const GDPRConsentSchema = z.object({
  marketing_consent: z.boolean(),
  data_processing_consent: z.boolean(),
  consent_date: z.date(),
  consent_ip: z.string().ip()
});

export const SecuritySettingsSchema = z.object({
  login_notifications: z.boolean(),
  transaction_notifications: z.boolean(),
  allowed_ips: z.array(z.string().ip()),
  last_security_update: z.date()
});

export const ProfileSchema = BaseSchema.extend({
  user_id: z.string().uuid(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone_number: z.string().regex(/^\+[1-9]\d{1,14}$/),
  date_of_birth: z.date(),
  address: AddressSchema,
  kyc_level: z.nativeEnum(KYCLevel),
  status: z.nativeEnum(ProfileStatus),
  preferences: UserPreferencesSchema,
  gdpr_consent: GDPRConsentSchema,
  security_settings: SecuritySettingsSchema
});

export const ProfileUpdateRequestSchema = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  phone_number: z.string().regex(/^\+[1-9]\d{1,14}$/).optional(),
  address: AddressSchema.partial().optional(),
  preferences: UserPreferencesSchema.partial().optional(),
  gdpr_consent: GDPRConsentSchema.partial().optional(),
  security_settings: SecuritySettingsSchema.partial().optional()
});

// Type helpers for validated schemas
export type ValidatedAddress = z.infer<typeof AddressSchema>;
export type ValidatedUserPreferences = z.infer<typeof UserPreferencesSchema>;
export type ValidatedGDPRConsent = z.infer<typeof GDPRConsentSchema>;
export type ValidatedSecuritySettings = z.infer<typeof SecuritySettingsSchema>;
export type ValidatedProfile = z.infer<typeof ProfileSchema>;
export type ValidatedProfileUpdateRequest = z.infer<typeof ProfileUpdateRequestSchema>;