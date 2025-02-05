// External imports
import speakeasy from 'speakeasy'; // v2.0.0 - TOTP generation and validation
import QRCode from 'qrcode'; // v1.5.0 - QR code generation
import { z } from 'zod'; // v3.22.0 - Runtime type validation

// Internal imports
import { User } from '../../types/auth';
import { UnauthorizedError } from '../common/errors';
import { validateSchema } from '../common/validation';

// Global constants
const MFA_ISSUER = 'Unbanked';
const MFA_WINDOW = 1; // Time window for token validation (±1 step)
const QR_ERROR_LEVEL = 'H'; // High error correction level for QR codes
const SECRET_LENGTH = 32; // Length of TOTP secret in bytes
const TOKEN_LENGTH = 6; // Length of TOTP token

// Interfaces
interface MFASecretResponse {
  secret: string;
  qrCodeUrl: string;
  otpauthUrl: string;
}

// Validation schemas
export const MFASchemas = {
  token: z.string()
    .length(TOKEN_LENGTH)
    .regex(/^\d+$/, 'Token must contain only digits'),
  
  secret: z.string()
    .min(16)
    .regex(/^[A-Z2-7]+=*$/, 'Invalid base32 secret format')
};

/**
 * Generates a cryptographically secure TOTP secret for MFA setup
 * @param userId - User's unique identifier
 * @param email - User's email address
 * @returns Promise<MFASecretResponse> - Generated secret and QR code details
 */
export async function generateMFASecret(
  userId: string,
  email: string
): Promise<MFASecretResponse> {
  try {
    // Generate secure random secret
    const secret = speakeasy.generateSecret({
      length: SECRET_LENGTH,
      name: encodeURIComponent(`${MFA_ISSUER}:${email}`),
      issuer: MFA_ISSUER
    });

    // Create otpauth URL for QR code
    const otpauthUrl = speakeasy.otpauthURL({
      secret: secret.base32,
      label: encodeURIComponent(email),
      issuer: MFA_ISSUER,
      algorithm: 'sha512',
      digits: TOKEN_LENGTH,
      encoding: 'base32'
    });

    // Generate QR code with high error correction
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl, {
      errorCorrectionLevel: QR_ERROR_LEVEL,
      margin: 4,
      width: 256
    });

    // Validate generated secret format
    await validateSchema(MFASchemas.secret, secret.base32);

    return {
      secret: secret.base32,
      qrCodeUrl,
      otpauthUrl
    };
  } catch (error) {
    throw new UnauthorizedError('Failed to generate MFA secret', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Validates a TOTP token against user's MFA secret
 * @param token - TOTP token to validate
 * @param secret - User's MFA secret
 * @returns Promise<boolean> - True if token is valid
 */
export async function validateMFAToken(
  token: string,
  secret: string
): Promise<boolean> {
  try {
    // Validate token format
    await validateSchema(MFASchemas.token, token);
    
    // Validate secret format
    await validateSchema(MFASchemas.secret, secret);

    // Verify TOTP token
    return speakeasy.totp.verify({
      secret,
      token,
      encoding: 'base32',
      algorithm: 'sha512',
      digits: TOKEN_LENGTH,
      window: MFA_WINDOW
    });
  } catch (error) {
    throw new UnauthorizedError('Invalid MFA token', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Enables MFA for a user after validating setup token
 * @param user - User object
 * @param secret - Generated MFA secret
 * @param token - Initial TOTP token for verification
 * @returns Promise<void>
 */
export async function enableMFA(
  user: User,
  secret: string,
  token: string
): Promise<void> {
  try {
    // Validate secret and token formats
    await validateSchema(MFASchemas.secret, secret);
    await validateSchema(MFASchemas.token, token);

    // Verify initial token
    const isValid = await validateMFAToken(token, secret);
    if (!isValid) {
      throw new UnauthorizedError('Invalid MFA setup token');
    }

    // Verify MFA is not already enabled
    if (user.mfa_enabled) {
      throw new UnauthorizedError('MFA is already enabled');
    }

    // Update user MFA settings
    user.mfa_enabled = true;
    user.mfa_secret = secret;

  } catch (error) {
    throw new UnauthorizedError('Failed to enable MFA', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Disables MFA for a user after validation
 * @param user - User object
 * @param token - Current TOTP token for verification
 * @returns Promise<void>
 */
export async function disableMFA(
  user: User,
  token: string
): Promise<void> {
  try {
    // Verify MFA is enabled
    if (!user.mfa_enabled || !user.mfa_secret) {
      throw new UnauthorizedError('MFA is not enabled');
    }

    // Validate token format
    await validateSchema(MFASchemas.token, token);

    // Verify current token
    const isValid = await validateMFAToken(token, user.mfa_secret);
    if (!isValid) {
      throw new UnauthorizedError('Invalid MFA token');
    }

    // Clear user MFA settings
    user.mfa_enabled = false;
    user.mfa_secret = null;

  } catch (error) {
    throw new UnauthorizedError('Failed to disable MFA', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}