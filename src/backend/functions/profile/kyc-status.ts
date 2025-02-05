// External imports
import { createClient } from '@supabase/supabase-js'; // v2.38.0
import Redis from 'ioredis'; // v5.0.0
import winston from 'winston'; // v3.8.0
import { RateLimiter } from 'rate-limiter-flexible'; // v2.4.1

// Internal imports
import { KYCLevel, KYCDocument } from '../../types/auth';
import { Profile } from '../../types/profile';
import { checkKYCStatus } from '../../lib/auth/kyc';
import { ApplicationError } from '../../lib/common/errors';

// Constants for KYC document requirements and caching
const REQUIRED_DOCUMENTS = {
  [KYCLevel.BASIC]: ['government_id'],
  [KYCLevel.VERIFIED]: ['government_id', 'proof_of_address'],
  [KYCLevel.ENHANCED]: ['government_id', 'proof_of_address', 'bank_statement']
} as const;

const CACHE_CONFIG = {
  ttl: 300, // 5 minutes
  prefix: 'kyc-status:'
};

const RATE_LIMIT_CONFIG = {
  max_requests: 100,
  window_seconds: 60
};

const ERROR_CODES = {
  RATE_LIMITED: 'TOO_MANY_REQUESTS',
  UNAUTHORIZED: 'UNAUTHORIZED_ACCESS',
  NOT_FOUND: 'USER_NOT_FOUND',
  SERVER_ERROR: 'INTERNAL_ERROR'
};

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const redis = new Redis(process.env.REDIS_URL!);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'kyc-status' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'kyc-status-error.log', level: 'error' })
  ]
});

const rateLimiter = new RateLimiter({
  storeClient: redis,
  points: RATE_LIMIT_CONFIG.max_requests,
  duration: RATE_LIMIT_CONFIG.window_seconds
});

interface KYCStatusResponse {
  level: KYCLevel;
  documents: {
    required: string[];
    submitted: KYCDocument[];
    pending: string[];
  };
  progress: {
    percentage: number;
    next_level: KYCLevel | null;
    remaining_requirements: string[];
  };
  metadata: {
    last_updated: Date;
    cache_status: 'hit' | 'miss';
    request_id: string;
  };
}

/**
 * Enhanced edge function handler for retrieving user's KYC verification status
 * with security and compliance features
 */
export async function getKYCStatus(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    // Extract and validate authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new ApplicationError('Unauthorized access', ERROR_CODES.UNAUTHORIZED, 401);
    }

    // Extract user ID from JWT
    const { user: { id: userId } } = await supabase.auth.getUser(authHeader.split(' ')[1]);
    if (!userId) {
      throw new ApplicationError('Invalid authentication token', ERROR_CODES.UNAUTHORIZED, 401);
    }

    // Check rate limiting
    try {
      await rateLimiter.consume(userId);
    } catch (error) {
      throw new ApplicationError('Rate limit exceeded', ERROR_CODES.RATE_LIMITED, 429);
    }

    // Check cache first
    const cacheKey = `${CACHE_CONFIG.prefix}${userId}`;
    const cachedStatus = await redis.get(cacheKey);
    
    if (cachedStatus) {
      logger.info('Cache hit for KYC status', { userId, requestId });
      return new Response(cachedStatus, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId
        }
      });
    }

    // Fetch user profile and KYC documents
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (profileError || !profile) {
      throw new ApplicationError('User profile not found', ERROR_CODES.NOT_FOUND, 404);
    }

    const { data: documents, error: documentsError } = await supabase
      .from('kyc_documents')
      .select('*')
      .eq('user_id', userId);

    if (documentsError) {
      throw new ApplicationError('Error fetching KYC documents', ERROR_CODES.SERVER_ERROR, 500);
    }

    // Calculate KYC status and progress
    const currentLevel = profile.kyc_level as KYCLevel;
    const requiredDocs = REQUIRED_DOCUMENTS[currentLevel] || [];
    const submittedDocs = documents || [];
    const pendingDocs = requiredDocs.filter(
      doc => !submittedDocs.some(submitted => submitted.type === doc)
    );

    // Calculate progress percentage and next level
    const progress = {
      percentage: Math.round(
        ((requiredDocs.length - pendingDocs.length) / requiredDocs.length) * 100
      ),
      next_level: currentLevel < KYCLevel.ENHANCED ? (currentLevel + 1) as KYCLevel : null,
      remaining_requirements: pendingDocs
    };

    const response: KYCStatusResponse = {
      level: currentLevel,
      documents: {
        required: requiredDocs,
        submitted: submittedDocs,
        pending: pendingDocs
      },
      progress,
      metadata: {
        last_updated: new Date(),
        cache_status: 'miss',
        request_id: requestId
      }
    };

    // Cache the response
    await redis.setex(
      cacheKey,
      CACHE_CONFIG.ttl,
      JSON.stringify(response)
    );

    // Log the request
    logger.info('KYC status retrieved', {
      userId,
      requestId,
      level: currentLevel,
      duration: Date.now() - startTime
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
        'Cache-Control': `max-age=${CACHE_CONFIG.ttl}`
      }
    });

  } catch (error) {
    // Log error details
    logger.error('Error retrieving KYC status', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId,
      duration: Date.now() - startTime
    });

    // Format error response
    const statusCode = error instanceof ApplicationError ? error.statusCode : 500;
    const errorResponse = {
      error: {
        code: error instanceof ApplicationError ? error.code : ERROR_CODES.SERVER_ERROR,
        message: error instanceof Error ? error.message : 'Internal server error'
      },
      metadata: {
        request_id: requestId
      }
    };

    return new Response(JSON.stringify(errorResponse), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId
      }
    });
  }
}