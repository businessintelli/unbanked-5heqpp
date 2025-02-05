// External imports
import { z } from 'zod'; // v3.22.0
import { createClient } from '@supabase/supabase-js'; // v2.38.0
import sanitizeHtml from 'sanitize-html'; // v2.11.0
import winston from 'winston'; // v3.11.0
import rateLimit from 'express-rate-limit'; // v6.9.0

// Internal imports
import { Profile, ProfileUpdateRequest } from '../../types/profile';
import { validateSchema } from '../../lib/common/validation';
import { ValidationError } from '../../lib/common/errors';
import { ErrorCode } from '../../types/common';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Initialize logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'update-profile' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'profile-updates.log' })
  ]
});

// Rate limiter configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  message: { error: ErrorCode.RATE_LIMIT, message: 'Too many profile update requests' }
});

// Enhanced profile update schema with strict validation
const updateProfileSchema = z.object({
  first_name: z.string().min(2).max(50).regex(/^[a-zA-Z\s-']+$/).optional(),
  last_name: z.string().min(2).max(50).regex(/^[a-zA-Z\s-']+$/).optional(),
  phone_number: z.string().regex(/^\+[1-9]\d{1,14}$/).optional(),
  address: z.object({
    street_address: z.string().max(100),
    city: z.string().max(50),
    state: z.string().max(50),
    postal_code: z.string().max(20),
    country: z.string().length(2)
  }).strict().partial().optional(),
  preferences: z.object({
    language: z.string().length(2),
    currency: z.enum(['USD', 'EUR', 'GBP']),
    notifications_enabled: z.boolean(),
    two_factor_enabled: z.boolean(),
    theme: z.enum(['light', 'dark', 'system'])
  }).strict().partial().optional(),
  gdpr_consent: z.object({
    marketing_emails: z.boolean(),
    data_processing: z.boolean(),
    third_party_sharing: z.boolean(),
    consent_date: z.date()
  }).strict().partial().optional()
}).strict();

/**
 * Sanitizes user input to prevent XSS attacks
 */
function sanitizeInput(data: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeHtml(value, {
        allowedTags: [],
        allowedAttributes: {}
      });
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeInput(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Enhanced edge function handler for updating user profile information
 * with GDPR compliance and security features
 */
export async function updateProfile(req: Request): Promise<Response> {
  try {
    // Apply rate limiting
    await limiter(req);

    // Extract and verify user ID from authenticated request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: ErrorCode.UNAUTHORIZED, message: 'Invalid authorization header' }),
        { status: 401 }
      );
    }

    const { user: { id: userId } } = await supabase.auth.getUser(authHeader.split(' ')[1]);
    if (!userId) {
      return new Response(
        JSON.stringify({ error: ErrorCode.UNAUTHORIZED, message: 'User not authenticated' }),
        { status: 401 }
      );
    }

    // Parse and sanitize request body
    const rawData: ProfileUpdateRequest = await req.json();
    const sanitizedData = sanitizeInput(rawData);

    // Validate update request payload
    const validatedData = await validateSchema(updateProfileSchema, sanitizedData);

    // Retrieve existing profile
    const { data: existingProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError || !existingProfile) {
      return new Response(
        JSON.stringify({ error: ErrorCode.NOT_FOUND, message: 'Profile not found' }),
        { status: 404 }
      );
    }

    // Verify GDPR consent status if updating sensitive data
    if (validatedData.gdpr_consent) {
      const consentDate = new Date(validatedData.gdpr_consent.consent_date);
      if (consentDate > new Date()) {
        throw new ValidationError(new z.ZodError([{
          code: 'invalid_date',
          path: ['gdpr_consent', 'consent_date'],
          message: 'Consent date cannot be in the future'
        }]));
      }
    }

    // Merge existing profile with validated updates
    const updatedProfile: Partial<Profile> = {
      ...existingProfile,
      ...validatedData,
      updated_at: new Date(),
      version: existingProfile.version + 1
    };

    // Update profile in database
    const { error: updateError } = await supabase
      .from('profiles')
      .update(updatedProfile)
      .eq('user_id', userId);

    if (updateError) {
      throw updateError;
    }

    // Log profile update for GDPR compliance
    logger.info('Profile updated', {
      userId,
      updatedFields: Object.keys(validatedData),
      timestamp: new Date().toISOString(),
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
      userAgent: req.headers.get('user-agent')
    });

    return new Response(
      JSON.stringify({
        status: 'success',
        data: updatedProfile,
        message: 'Profile updated successfully'
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff'
        }
      }
    );

  } catch (error) {
    // Handle validation errors
    if (error instanceof ValidationError) {
      return new Response(
        JSON.stringify({
          error: ErrorCode.VALIDATION_ERROR,
          message: 'Validation failed',
          details: error.fieldErrors
        }),
        { status: 400 }
      );
    }

    // Log unexpected errors
    logger.error('Profile update failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });

    return new Response(
      JSON.stringify({
        error: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to update profile'
      }),
      { status: 500 }
    );
  }
}