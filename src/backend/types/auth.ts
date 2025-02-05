// External imports
import { z } from 'zod'; // v3.22.0 - Runtime type validation

// Internal imports
import { BaseSchema } from './common';

/**
 * User role enumeration for authorization control
 */
export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPPORT = 'SUPPORT'
}

/**
 * KYC verification levels with progressive access rights
 */
export enum KYCLevel {
  NONE = 0,
  BASIC = 1,
  VERIFIED = 2,
  ENHANCED = 3
}

/**
 * Enhanced user entity with security and compliance features
 * Extends BaseSchema for consistent entity tracking
 */
export interface User extends z.infer<typeof BaseSchema> {
  email: string;
  password_hash: string;
  role: UserRole;
  kyc_level: KYCLevel;
  mfa_enabled: boolean;
  mfa_secret: string | null;
  last_login: Date | null;
  failed_login_attempts: number;
  last_failed_login: Date | null;
  account_locked_until: Date | null;
  gdpr_consent: boolean;
  gdpr_consent_date: Date | null;
}

/**
 * Login request payload structure with MFA support
 */
export interface LoginCredentials {
  email: string;
  password: string;
  mfa_code?: string;
}

/**
 * Enhanced JWT payload with security tracking and session management
 */
export interface JWTPayload {
  user_id: string;
  email: string;
  role: UserRole;
  kyc_level: KYCLevel;
  exp: number;
  iat: number;
  session_id: string;
  device_id: string;
  ip_address: string;
}

/**
 * Enhanced refresh token payload with session tracking
 */
export interface RefreshPayload {
  user_id: string;
  token_id: string;
  exp: number;
  iat: number;
  session_id: string;
  device_id: string;
}

/**
 * Enhanced KYC document metadata with verification tracking
 */
export interface KYCDocument extends z.infer<typeof BaseSchema> {
  type: string;
  status: string;
  file_url: string;
  verified_at: Date | null;
  verification_method: string;
  verified_by: string | null;
  expiry_date: Date | null;
  rejection_reason: string | null;
}

// Zod validation schemas for runtime type checking
export const UserSchema = BaseSchema.extend({
  email: z.string().email(),
  password_hash: z.string(),
  role: z.nativeEnum(UserRole),
  kyc_level: z.nativeEnum(KYCLevel),
  mfa_enabled: z.boolean(),
  mfa_secret: z.string().nullable(),
  last_login: z.date().nullable(),
  failed_login_attempts: z.number().int().min(0),
  last_failed_login: z.date().nullable(),
  account_locked_until: z.date().nullable(),
  gdpr_consent: z.boolean(),
  gdpr_consent_date: z.date().nullable()
});

export const LoginCredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  mfa_code: z.string().length(6).optional()
});

export const JWTPayloadSchema = z.object({
  user_id: z.string().uuid(),
  email: z.string().email(),
  role: z.nativeEnum(UserRole),
  kyc_level: z.nativeEnum(KYCLevel),
  exp: z.number(),
  iat: z.number(),
  session_id: z.string().uuid(),
  device_id: z.string(),
  ip_address: z.string().ip()
});

export const RefreshPayloadSchema = z.object({
  user_id: z.string().uuid(),
  token_id: z.string().uuid(),
  exp: z.number(),
  iat: z.number(),
  session_id: z.string().uuid(),
  device_id: z.string()
});

export const KYCDocumentSchema = BaseSchema.extend({
  type: z.string(),
  status: z.string(),
  file_url: z.string().url(),
  verified_at: z.date().nullable(),
  verification_method: z.string(),
  verified_by: z.string().uuid().nullable(),
  expiry_date: z.date().nullable(),
  rejection_reason: z.string().nullable()
});

// Type helpers for validated schemas
export type ValidatedUser = z.infer<typeof UserSchema>;
export type ValidatedLoginCredentials = z.infer<typeof LoginCredentialsSchema>;
export type ValidatedJWTPayload = z.infer<typeof JWTPayloadSchema>;
export type ValidatedRefreshPayload = z.infer<typeof RefreshPayloadSchema>;
export type ValidatedKYCDocument = z.infer<typeof KYCDocumentSchema>;