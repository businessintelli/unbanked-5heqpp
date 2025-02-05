// @ts-check
import { z } from 'zod'; // v3.22.0 - Runtime type validation

/**
 * Authentication state representing the current status of user authentication
 */
export type AuthState = 'authenticated' | 'unauthenticated' | 'loading' | 'mfa_required' | 'kyc_required';

/**
 * API response status for authentication operations
 */
export type ApiStatus = 'success' | 'error' | 'pending' | 'timeout';

/**
 * Generic API response wrapper with enhanced error handling
 */
export type ApiResponse<T> = {
  status: ApiStatus;
  data: T;
  error?: string;
  timestamp: Date;
};

/**
 * User role enumeration for authorization control
 */
export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPPORT = 'SUPPORT'
}

/**
 * KYC verification levels with compliance tracking
 */
export enum KYCLevel {
  NONE = 0,
  BASIC = 1,
  VERIFIED = 2,
  ENHANCED = 3
}

/**
 * Enhanced user interface with security tracking and session management
 */
export interface User {
  id: string;
  email: string;
  role: UserRole;
  kyc_level: KYCLevel;
  mfa_enabled: boolean;
  last_login: Date | null;
  security_level: number;
  session_expires: Date;
}

/**
 * Login credentials with enhanced security features and device tracking
 */
export interface LoginCredentials {
  email: string;
  password: string;
  mfa_code?: string;
  device_id: string;
}

/**
 * Authentication response with token management
 */
export interface AuthResponse {
  user: User;
  access_token: string;
  refresh_token: string;
  token_expires: Date;
}

/**
 * KYC document metadata with comprehensive verification tracking
 */
export interface KYCDocument {
  type: string;
  status: string;
  file_url: string;
  verified_at: Date | null;
  expiry_date: Date | null;
  verification_method: string;
}

/**
 * Authentication context state with activity tracking
 */
export interface AuthContextState {
  user: User | null;
  state: AuthState;
  error: string | null;
  lastActivity: Date;
}

// Zod schemas for runtime validation

export const userRoleSchema = z.nativeEnum(UserRole);

export const kycLevelSchema = z.nativeEnum(KYCLevel);

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: userRoleSchema,
  kyc_level: kycLevelSchema,
  mfa_enabled: z.boolean(),
  last_login: z.date().nullable(),
  security_level: z.number().min(0).max(100),
  session_expires: z.date()
});

export const loginCredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  mfa_code: z.string().length(6).optional(),
  device_id: z.string().uuid()
});

export const authResponseSchema = z.object({
  user: userSchema,
  access_token: z.string(),
  refresh_token: z.string(),
  token_expires: z.date()
});

export const kycDocumentSchema = z.object({
  type: z.string(),
  status: z.string(),
  file_url: z.string().url(),
  verified_at: z.date().nullable(),
  expiry_date: z.date().nullable(),
  verification_method: z.string()
});

export const authContextStateSchema = z.object({
  user: userSchema.nullable(),
  state: z.enum(['authenticated', 'unauthenticated', 'loading', 'mfa_required', 'kyc_required']),
  error: z.string().nullable(),
  lastActivity: z.date()
});