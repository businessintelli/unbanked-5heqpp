// External imports
import { z } from 'zod'; // v3.22.0
import { RateLimiterMemory } from 'rate-limiter-flexible'; // v2.4.1
import crypto from 'crypto'; // node:crypto

// Internal imports
import { KYCService } from '../../lib/auth/kyc';
import { KYCLevel } from '../../types/auth';
import { validateSchema } from '../../lib/common/validation';

// Constants
const WEBHOOK_SECRET = process.env.ONFIDO_WEBHOOK_SECRET;
const ALLOWED_IPS = process.env.ONFIDO_WEBHOOK_IPS?.split(',');

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  maxRequests: 100,
  windowMs: 60000 // 1 minute
};

// Initialize rate limiter
const rateLimiter = new RateLimiterMemory({
  points: RATE_LIMIT_CONFIG.maxRequests,
  duration: RATE_LIMIT_CONFIG.windowMs / 1000
});

// KYC status mapping to internal levels
const KYC_STATUS_MAP: Record<string, KYCLevel> = {
  clear: KYCLevel.VERIFIED,
  consider: KYCLevel.BASIC,
  rejected: KYCLevel.NONE,
  suspected_fraud: KYCLevel.NONE
};

// Webhook payload validation schema
const WebhookPayloadSchema = z.object({
  payload: z.object({
    resource_type: z.literal('check'),
    action: z.literal('check.completed'),
    object: z.object({
      id: z.string(),
      status: z.enum(['clear', 'consider', 'rejected', 'suspected_fraud']),
      completed_at: z.string(),
      applicant_id: z.string()
    })
  })
});

/**
 * Validates webhook signature using timing-safe comparison
 */
async function validateWebhookSignature(signature: string, rawBody: string): Promise<boolean> {
  if (!WEBHOOK_SECRET) {
    throw new Error('Webhook secret not configured');
  }

  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  // Use timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Validates webhook source IP against whitelist
 */
function validateIPAddress(ipAddress: string): boolean {
  if (!ALLOWED_IPS?.length) {
    throw new Error('Allowed IPs not configured');
  }

  return ALLOWED_IPS.includes(ipAddress);
}

/**
 * Enhanced webhook handler with comprehensive validation and error handling
 */
export async function handleKYCWebhook(req: Request, res: Response): Promise<void> {
  const correlationId = crypto.randomUUID();
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  try {
    // Rate limiting check
    await rateLimiter.consume(clientIp as string);

    // IP validation
    if (!validateIPAddress(clientIp as string)) {
      res.status(403).json({
        status: 'error',
        error: {
          code: 'FORBIDDEN',
          message: 'Invalid source IP address'
        },
        correlationId
      });
      return;
    }

    // Signature validation
    const signature = req.headers['x-sha2-signature'];
    if (!signature || typeof signature !== 'string' || 
        !(await validateWebhookSignature(signature, req.body))) {
      res.status(401).json({
        status: 'error',
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid webhook signature'
        },
        correlationId
      });
      return;
    }

    // Payload validation
    const payload = await validateSchema(WebhookPayloadSchema, req.body);
    const { id: checkId, status, applicant_id: userId } = payload.payload.object;

    // Initialize KYC service
    const kycService = new KYCService(
      process.env.ONFIDO_API_KEY!,
      { region: 'EU' },
      { host: process.env.REDIS_HOST!, port: 6379 }
    );

    // Map external status to internal KYC level
    const kycLevel = KYC_STATUS_MAP[status];

    // Update user KYC level
    await kycService.updateKYCLevel(userId, kycLevel);

    // Log verification status
    await kycService.logVerificationStatus({
      userId,
      checkId,
      status,
      kycLevel,
      timestamp: new Date(payload.payload.object.completed_at),
      correlationId
    });

    // Send success response
    res.status(200).json({
      status: 'success',
      data: {
        message: 'Webhook processed successfully',
        checkId,
        status
      },
      correlationId
    });
  } catch (error) {
    // Handle rate limiting errors
    if (error.name === 'RateLimiterError') {
      res.status(429).json({
        status: 'error',
        error: {
          code: 'RATE_LIMIT',
          message: 'Too many requests'
        },
        correlationId
      });
      return;
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      res.status(400).json({
        status: 'error',
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid webhook payload',
          details: error.fieldErrors
        },
        correlationId
      });
      return;
    }

    // Handle unexpected errors
    console.error('Webhook processing error:', error, { correlationId });
    res.status(500).json({
      status: 'error',
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      },
      correlationId
    });
  }
}