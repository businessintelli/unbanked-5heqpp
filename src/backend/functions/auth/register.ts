// External imports
import { z } from 'zod'; // v3.22.0
import * as argon2 from 'argon2'; // v0.31.0
import { createClient } from '@supabase/supabase-js'; // v2.38.0
import rateLimit from 'express-rate-limit'; // v7.1.0
import winston from 'winston'; // v3.11.0

// Internal imports
import { User, UserRole, KYCLevel } from '../../types/auth';
import { validateSchema } from '../../lib/common/validation';
import { ErrorCode } from '../../types/common';

// Constants for registration configuration
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const REGISTRATION_RATE_LIMIT = 5;
const REGISTRATION_RATE_WINDOW = 3600; // 1 hour in seconds

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'user-registration' },
  transports: [
    new winston.transports.File({ filename: 'registration-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'registration.log' })
  ]
});

// Registration request validation schema
export const registrationSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .min(5, 'Email too short')
    .max(255, 'Email too long')
    .transform(email => email.toLowerCase()),
  
  password: z.string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(PASSWORD_MAX_LENGTH, `Password cannot exceed ${PASSWORD_MAX_LENGTH} characters`)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/, {
      message: 'Password must contain uppercase, lowercase, number and special character'
    }),
  
  gdpr_consent: z.boolean()
    .refine(val => val === true, {
      message: 'GDPR consent is required'
    })
});

// Rate limiter configuration
const registrationLimiter = rateLimit({
  windowMs: REGISTRATION_RATE_WINDOW * 1000,
  max: REGISTRATION_RATE_LIMIT,
  message: { 
    code: ErrorCode.RATE_LIMIT,
    message: 'Too many registration attempts, please try again later'
  }
});

/**
 * Enhanced user registration handler with security features and GDPR compliance
 */
export const registerUser = async (req: Request, res: Response): Promise<void> => {
  const correlationId = crypto.randomUUID();
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    // Apply rate limiting
    await new Promise((resolve, reject) => {
      registrationLimiter(req, res, (err) => {
        if (err) reject(err);
        resolve(true);
      });
    });

    // Validate request payload
    const validatedData = await validateSchema(registrationSchema, req.body);

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', validatedData.email)
      .single();

    if (existingUser) {
      throw new Error('Email already registered');
    }

    // Hash password with Argon2id
    const passwordHash = await argon2.hash(validatedData.password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
      saltLength: 32
    });

    // Prepare user data
    const newUser: Partial<User> = {
      email: validatedData.email,
      password_hash: passwordHash,
      role: UserRole.USER,
      kyc_level: KYCLevel.NONE,
      gdpr_consent: validatedData.gdpr_consent,
      gdpr_consent_date: new Date(),
      registration_ip: clientIp as string,
      mfa_enabled: false,
      mfa_secret: null,
      failed_login_attempts: 0,
      last_login: null,
      last_failed_login: null,
      account_locked_until: null
    };

    // Create user in database
    const { data: user, error } = await supabase
      .from('users')
      .insert([newUser])
      .select('id, email, role, kyc_level, created_at')
      .single();

    if (error) {
      throw error;
    }

    // Log successful registration
    logger.info('User registration successful', {
      userId: user.id,
      email: user.email,
      correlationId,
      clientIp
    });

    // Return success response
    res.status(201).json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          kyc_level: user.kyc_level,
          created_at: user.created_at
        }
      },
      meta: {
        timestamp: new Date(),
        correlationId
      }
    });

  } catch (error) {
    // Log registration error
    logger.error('User registration failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId,
      clientIp
    });

    // Handle specific error types
    if (error instanceof z.ZodError) {
      res.status(400).json({
        status: 'error',
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid registration data',
          details: error.errors
        },
        meta: {
          timestamp: new Date(),
          correlationId
        }
      });
      return;
    }

    // Handle general errors
    res.status(500).json({
      status: 'error',
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Registration failed',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      meta: {
        timestamp: new Date(),
        correlationId
      }
    });
  }
};