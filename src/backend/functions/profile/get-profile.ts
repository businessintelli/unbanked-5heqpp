// External imports
import { z } from 'zod'; // v3.22.0
import { createClient } from '@supabase/supabase-js'; // v2.38.0
import Redis from 'ioredis'; // v5.3.0
import i18next from 'i18next'; // v23.5.0
import { RateLimiter } from 'rate-limiter-flexible'; // v2.4.1
import { AuditLogger } from '@company/audit-logger'; // v1.0.0

// Internal imports
import { Profile } from '../../types/profile';
import { UnauthorizedError, NotFoundError } from '../../lib/common/errors';
import { validateSchema } from '../../lib/common/validation';
import { CacheService } from '../../lib/common/cache';

// Initialize services
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const redis = new Redis(process.env.REDIS_URL!);
const cacheService = new CacheService(process.env.REDIS_URL!);
const auditLogger = new AuditLogger();

// Rate limiter configuration
const rateLimiter = new RateLimiter({
  storeClient: redis,
  points: 100, // Number of requests
  duration: 60, // Per minute
  blockDuration: 60 * 15 // 15 minutes block
});

// Request validation schema
const requestSchema = z.object({
  userId: z.string().uuid(),
  includeGdpr: z.boolean().optional().default(false)
});

/**
 * Decorator for rate limiting
 */
function rateLimit(points: number, duration: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const req = args[0];
      const userId = req.auth?.user?.id;

      try {
        await rateLimiter.consume(userId);
        return await originalMethod.apply(this, args);
      } catch (error) {
        throw new UnauthorizedError('Rate limit exceeded', {
          retryAfter: error.msBeforeNext
        });
      }
    };
    return descriptor;
  };
}

/**
 * Decorator for audit logging
 */
function auditLog(action: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const req = args[0];
      const userId = req.auth?.user?.id;
      const result = await originalMethod.apply(this, args);

      await auditLogger.log({
        user_id: userId,
        action: action,
        resource: 'profile',
        details: {
          method: 'GET',
          status: 'success'
        },
        ip_address: req.headers['x-forwarded-for'] || req.ip,
        timestamp: new Date(),
        severity: 'INFO',
        correlation_id: req.headers['x-correlation-id'],
        user_agent: req.headers['user-agent'],
        category: 'AUTH'
      });

      return result;
    };
    return descriptor;
  };
}

/**
 * Decorator for response caching
 */
function cache(namespace: string, ttl: number) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const req = args[0];
      const userId = req.auth?.user?.id;
      const cacheKey = `${namespace}:${userId}`;

      // Try to get from cache
      const cachedResult = await cacheService.get<Profile>(cacheKey);
      if (cachedResult) {
        return cachedResult;
      }

      // Execute original method
      const result = await originalMethod.apply(this, args);

      // Cache the result
      await cacheService.set(cacheKey, result, ttl);

      return result;
    };
    return descriptor;
  };
}

export class ProfileHandler {
  /**
   * Retrieves user profile with enhanced security and GDPR compliance
   */
  @rateLimit(100, '1m')
  @auditLog('profile.access')
  @cache('profile', 300)
  async getProfile(req: any): Promise<Profile> {
    try {
      // Validate JWT token
      if (!req.auth?.user?.id) {
        throw new UnauthorizedError('Authentication required');
      }

      // Validate request
      const { userId, includeGdpr } = await validateSchema(requestSchema, {
        userId: req.auth.user.id,
        includeGdpr: req.query?.includeGdpr
      });

      // Check MFA status if required
      const { data: mfaStatus } = await supabase
        .from('user_security')
        .select('mfa_verified')
        .eq('user_id', userId)
        .single();

      if (mfaStatus?.mfa_verified === false) {
        throw new UnauthorizedError('MFA verification required');
      }

      // Fetch profile with RLS policies applied
      const { data: profile, error } = await supabase
        .from('profiles')
        .select(`
          user_id,
          first_name,
          last_name,
          phone_number,
          address,
          kyc_level,
          preferences,
          gdpr_consent,
          mfa_enabled
        `)
        .eq('user_id', userId)
        .single();

      if (error || !profile) {
        throw new NotFoundError('Profile not found');
      }

      // Remove GDPR sensitive data if not explicitly requested
      if (!includeGdpr) {
        delete profile.gdpr_consent;
      }

      // Translate response based on user preferences
      const language = profile.preferences?.language || 'en';
      await i18next.changeLanguage(language);

      return profile as Profile;

    } catch (error) {
      if (error instanceof UnauthorizedError || error instanceof NotFoundError) {
        throw error;
      }
      throw new Error('Failed to retrieve profile');
    }
  }
}

// Export handler instance
export const profileHandler = new ProfileHandler();
export const getProfile = profileHandler.getProfile.bind(profileHandler);