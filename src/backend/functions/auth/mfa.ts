// External imports
import { createClient } from '@supabase/supabase-js'; // v2.38.0
import { z } from 'zod'; // v3.22.0
import winston from 'winston'; // v3.11.0
import { RateLimit } from 'express-rate-limit'; // v7.1.0
import * as speakeasy from 'speakeasy'; // v2.0.0
import * as qrcode from 'qrcode'; // v1.5.0
import { v4 as uuidv4 } from 'uuid'; // v9.0.0

// Internal imports
import { User } from '../../types/auth';
import { ErrorCode } from '../../types/common';

// Configure Winston logger for security events
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'mfa-service' },
  transports: [
    new winston.transports.File({ filename: 'security-events.log' })
  ]
});

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Rate limiting configuration
const setupRateLimit = new RateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts per hour
  message: { error: ErrorCode.RATE_LIMIT, message: 'Too many MFA setup attempts' }
});

const verifyRateLimit = new RateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  message: { error: ErrorCode.RATE_LIMIT, message: 'Too many MFA verification attempts' }
});

// Request validation schemas
const SetupMFASchema = z.object({
  user_id: z.string().uuid(),
  device_fingerprint: z.string()
});

const VerifyMFASchema = z.object({
  user_id: z.string().uuid(),
  token: z.string().length(6).regex(/^\d+$/),
  device_fingerprint: z.string()
});

/**
 * Generates secure backup codes for MFA recovery
 */
const generateBackupCodes = (): string[] => {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    codes.push(uuidv4().slice(0, 8).toUpperCase());
  }
  return codes;
};

/**
 * Sets up MFA for a user with enhanced security features
 */
export const setupMFA = async (req: Request): Promise<Response> => {
  try {
    // Validate request
    const { user_id, device_fingerprint } = SetupMFASchema.parse(
      await req.json()
    );

    // Apply rate limiting
    await setupRateLimit(req);

    // Get user from database
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user_id)
      .single();

    if (error || !user) {
      return new Response(
        JSON.stringify({
          error: ErrorCode.NOT_FOUND,
          message: 'User not found'
        }),
        { status: 404 }
      );
    }

    // Check if MFA is already enabled
    if (user.mfa_enabled) {
      return new Response(
        JSON.stringify({
          error: ErrorCode.VALIDATION_ERROR,
          message: 'MFA is already enabled'
        }),
        { status: 400 }
      );
    }

    // Generate MFA secret
    const secret = speakeasy.generateSecret({
      name: `Unbanked:${user.email}`
    });

    // Generate QR code
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url!);

    // Generate backup codes
    const backupCodes = generateBackupCodes();

    // Store MFA details
    const { error: updateError } = await supabase
      .from('users')
      .update({
        mfa_secret: secret.base32,
        mfa_backup_codes: backupCodes,
        updated_at: new Date().toISOString()
      })
      .eq('id', user_id);

    if (updateError) {
      throw new Error('Failed to store MFA details');
    }

    // Log security event
    logger.info('MFA setup initiated', {
      user_id,
      device_fingerprint,
      timestamp: new Date().toISOString()
    });

    return new Response(
      JSON.stringify({
        status: 'success',
        data: {
          secret: secret.base32,
          qr_code: qrCodeUrl,
          backup_codes: backupCodes
        }
      }),
      { status: 200 }
    );
  } catch (error) {
    logger.error('MFA setup failed', { error });
    return new Response(
      JSON.stringify({
        error: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to setup MFA'
      }),
      { status: 500 }
    );
  }
};

/**
 * Verifies MFA token with brute force protection
 */
export const verifyMFA = async (req: Request): Promise<Response> => {
  try {
    // Validate request
    const { user_id, token, device_fingerprint } = VerifyMFASchema.parse(
      await req.json()
    );

    // Apply rate limiting
    await verifyRateLimit(req);

    // Get user from database
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user_id)
      .single();

    if (error || !user) {
      return new Response(
        JSON.stringify({
          error: ErrorCode.NOT_FOUND,
          message: 'User not found'
        }),
        { status: 404 }
      );
    }

    // Verify token
    const isValidToken = speakeasy.totp.verify({
      secret: user.mfa_secret!,
      encoding: 'base32',
      token,
      window: 1 // Allow 30 seconds clock skew
    });

    // Check backup codes if token is invalid
    const isValidBackupCode = !isValidToken && 
      user.mfa_backup_codes?.includes(token);

    // Log verification attempt
    logger.info('MFA verification attempt', {
      user_id,
      device_fingerprint,
      success: isValidToken || isValidBackupCode,
      timestamp: new Date().toISOString()
    });

    if (!isValidToken && !isValidBackupCode) {
      return new Response(
        JSON.stringify({
          error: ErrorCode.UNAUTHORIZED,
          message: 'Invalid MFA token'
        }),
        { status: 401 }
      );
    }

    // If backup code was used, remove it
    if (isValidBackupCode) {
      const updatedBackupCodes = user.mfa_backup_codes!.filter(
        code => code !== token
      );
      await supabase
        .from('users')
        .update({
          mfa_backup_codes: updatedBackupCodes,
          updated_at: new Date().toISOString()
        })
        .eq('id', user_id);
    }

    // Enable MFA if this is the first successful verification
    if (!user.mfa_enabled) {
      await supabase
        .from('users')
        .update({
          mfa_enabled: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', user_id);
    }

    return new Response(
      JSON.stringify({
        status: 'success',
        data: {
          verified: true
        }
      }),
      { status: 200 }
    );
  } catch (error) {
    logger.error('MFA verification failed', { error });
    return new Response(
      JSON.stringify({
        error: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to verify MFA token'
      }),
      { status: 500 }
    );
  }
};