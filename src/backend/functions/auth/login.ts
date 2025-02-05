// External imports
import bcrypt from 'bcrypt'; // v5.1.0
import { z } from 'zod'; // v3.22.0
import { rateLimit } from '@supabase/edge-functions'; // v1.0.0
import winston from 'winston'; // v3.8.0

// Internal imports
import { LoginCredentials, User } from '../../types/auth';
import { validateMFAToken } from '../../lib/auth/mfa';
import { JWTService } from '../../lib/auth/jwt';
import { validateSchema } from '../../lib/common/validation';
import { ApplicationError } from '../../lib/common/errors';
import { ErrorCode } from '../../types/common';

// Constants
const LOGIN_RATE_LIMIT = 10;
const LOGIN_RATE_WINDOW = 60000; // 1 minute
const MAX_CONCURRENT_SESSIONS = 3;
const LOGIN_TIMEOUT = 30000; // 30 seconds

// Configure security logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'auth-service' },
  transports: [
    new winston.transports.File({ filename: 'security/auth-events.log' })
  ]
});

// Enhanced login request validation schema
const loginSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .transform(email => email.toLowerCase()),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password exceeds maximum length'),
  mfa_code: z.string()
    .length(6, 'MFA code must be 6 digits')
    .regex(/^\d+$/, 'MFA code must contain only digits')
    .optional(),
  device_id: z.string()
    .uuid('Invalid device ID format')
});

/**
 * Enhanced login request validation with security checks
 */
async function validateLoginCredentials(data: unknown): Promise<LoginCredentials> {
  try {
    const validatedData = await validateSchema(loginSchema, data);
    
    // Additional email sanitization
    validatedData.email = validatedData.email.trim().toLowerCase();
    
    return validatedData;
  } catch (error) {
    logger.warn('Login validation failed', {
      event: 'login_validation_failed',
      error: error.message
    });
    throw error;
  }
}

/**
 * Secure password verification with timing attack protection
 */
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    // Use constant-time comparison
    return await bcrypt.compare(password, hash);
  } catch (error) {
    logger.error('Password verification failed', {
      event: 'password_verify_error',
      error: error.message
    });
    throw new ApplicationError(
      'Authentication failed',
      ErrorCode.UNAUTHORIZED,
      401
    );
  }
}

/**
 * Enhanced login handler with comprehensive security controls
 */
export const loginHandler = rateLimit(
  { limit: LOGIN_RATE_LIMIT, window: LOGIN_RATE_WINDOW, identifier: 'ip' },
  rateLimit(
    { limit: 3, window: 300000, identifier: 'email' }, // 3 attempts per 5 minutes per email
    async (req: Request): Promise<Response> => {
      const startTime = Date.now();
      const requestId = crypto.randomUUID();

      try {
        // Set request timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Login request timeout')), LOGIN_TIMEOUT);
        });

        // Process login with timeout
        const loginPromise = processLogin(req, requestId);
        const response = await Promise.race([loginPromise, timeoutPromise]);

        return response as Response;
      } catch (error) {
        logger.error('Login failed', {
          event: 'login_failed',
          requestId,
          error: error.message,
          duration: Date.now() - startTime
        });

        return new Response(
          JSON.stringify({
            error: {
              code: error instanceof ApplicationError ? error.code : ErrorCode.INTERNAL_ERROR,
              message: 'Authentication failed'
            }
          }),
          {
            status: error instanceof ApplicationError ? error.statusCode : 500,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );
      }
    }
  )
);

/**
 * Process login request with enhanced security measures
 */
async function processLogin(req: Request, requestId: string): Promise<Response> {
  const startTime = Date.now();
  const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  try {
    // Validate request body
    const body = await req.json();
    const credentials = await validateLoginCredentials(body);

    // Query user with timeout protection
    const user = await supabase
      .from('users')
      .select('*')
      .eq('email', credentials.email)
      .single();

    if (!user) {
      throw new ApplicationError(
        'Authentication failed',
        ErrorCode.UNAUTHORIZED,
        401
      );
    }

    // Verify password
    const isValidPassword = await verifyPassword(credentials.password, user.password_hash);
    if (!isValidPassword) {
      // Update failed login attempts
      await updateFailedLoginAttempts(user.id);
      throw new ApplicationError(
        'Authentication failed',
        ErrorCode.UNAUTHORIZED,
        401
      );
    }

    // Check account lock status
    if (user.account_locked_until && user.account_locked_until > new Date()) {
      throw new ApplicationError(
        'Account temporarily locked',
        ErrorCode.UNAUTHORIZED,
        401
      );
    }

    // Validate MFA if enabled
    if (user.mfa_enabled) {
      if (!credentials.mfa_code) {
        return new Response(
          JSON.stringify({
            requiresMFA: true,
            message: 'MFA code required'
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      const isValidMFA = await validateMFAToken(credentials.mfa_code, user.mfa_secret!);
      if (!isValidMFA) {
        throw new ApplicationError(
          'Invalid MFA code',
          ErrorCode.UNAUTHORIZED,
          401
        );
      }
    }

    // Check concurrent sessions
    const activeSessions = await getActiveSessions(user.id);
    if (activeSessions >= MAX_CONCURRENT_SESSIONS) {
      throw new ApplicationError(
        'Maximum concurrent sessions reached',
        ErrorCode.FORBIDDEN,
        403
      );
    }

    // Generate JWT tokens
    const jwtService = new JWTService(process.env.JWT_PRIVATE_KEY!, process.env.JWT_PUBLIC_KEY!, {});
    const tokens = await jwtService.createSecureTokenPair(
      {
        user_id: user.id,
        email: user.email,
        role: user.role,
        kyc_level: user.kyc_level
      },
      {
        deviceId: credentials.device_id,
        ipAddress: clientIp,
        userAgent
      }
    );

    // Update user's last login and reset failed attempts
    await supabase
      .from('users')
      .update({
        last_login: new Date(),
        failed_login_attempts: 0,
        last_failed_login: null,
        account_locked_until: null
      })
      .eq('id', user.id);

    logger.info('Login successful', {
      event: 'login_successful',
      requestId,
      userId: user.id,
      deviceId: credentials.device_id,
      duration: Date.now() - startTime
    });

    return new Response(
      JSON.stringify({
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          kyc_level: user.kyc_level
        }
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId
        }
      }
    );
  } catch (error) {
    throw error;
  }
}

/**
 * Update failed login attempts and implement account lockout
 */
async function updateFailedLoginAttempts(userId: string): Promise<void> {
  const user = await supabase
    .from('users')
    .select('failed_login_attempts')
    .eq('id', userId)
    .single();

  const attempts = (user?.failed_login_attempts || 0) + 1;
  const updates: Partial<User> = {
    failed_login_attempts: attempts,
    last_failed_login: new Date()
  };

  // Implement progressive lockout
  if (attempts >= 5) {
    const lockoutDuration = Math.min(Math.pow(2, attempts - 5), 24) * 3600000; // Progressive lockout up to 24 hours
    updates.account_locked_until = new Date(Date.now() + lockoutDuration);
  }

  await supabase
    .from('users')
    .update(updates)
    .eq('id', userId);
}

/**
 * Get active sessions count for a user
 */
async function getActiveSessions(userId: string): Promise<number> {
  const result = await supabase
    .from('active_sessions')
    .select('count', { count: 'exact' })
    .eq('user_id', userId)
    .eq('active', true);

  return result.count || 0;
}