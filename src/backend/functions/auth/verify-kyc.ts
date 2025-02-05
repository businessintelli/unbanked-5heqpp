// External imports
import { z } from 'zod'; // v3.22.0
import { createClient } from '@supabase/supabase-js'; // v2.38.0
import { rateLimit } from '@upstash/ratelimit'; // v1.0.0
import winston from 'winston'; // v3.10.0
import crypto from 'crypto'; // v1.0.0

// Internal imports
import { KYCService, validateDocument } from '../../lib/auth/kyc';
import { KYCLevel } from '../../types/auth';
import { ErrorCode } from '../../types/common';
import { ValidationError } from '../../lib/common/errors';

// Constants
const ALLOWED_DOCUMENT_TYPES = ['government_id', 'proof_of_address', 'bank_statement', 'selfie'] as const;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Enhanced document validation schema
const kycDocumentSchema = z.object({
  type: z.enum(ALLOWED_DOCUMENT_TYPES),
  file: z.instanceof(File).refine(
    file => file.size <= MAX_FILE_SIZE,
    `File size must not exceed ${MAX_FILE_SIZE / (1024 * 1024)}MB`
  ),
  expiryDate: z.date().optional(),
  metadata: z.object({
    documentNumber: z.string().optional(),
    country: z.string().length(2),
    issueDate: z.date().optional()
  }).optional()
});

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  uploadLimit: 5,
  verificationLimit: 10,
  statusCheckLimit: 100,
  windowMs: 3600000 // 1 hour
};

// Initialize services
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'kyc-verification' },
  transports: [
    new winston.transports.File({ filename: 'kyc-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'kyc-combined.log' })
  ]
});

const kycService = new KYCService(
  process.env.ONFIDO_API_KEY!,
  { region: 'EU' },
  { host: process.env.REDIS_HOST!, port: 6379 }
);

/**
 * Enhanced KYC document verification handler with security measures
 */
export async function verifyKYCDocument(req: Request): Promise<Response> {
  const correlationId = crypto.randomUUID();
  const clientIp = req.headers.get('x-forwarded-for') || 'unknown';

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error('Missing or invalid authorization header');
    }

    // Extract user from JWT
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Invalid authentication token');
    }

    // Apply rate limiting
    const rateLimiter = rateLimit({
      requests: RATE_LIMIT_CONFIG.uploadLimit,
      window: RATE_LIMIT_CONFIG.windowMs
    });

    const { success: rateLimitCheck } = await rateLimiter.limit(user.id);
    if (!rateLimitCheck) {
      throw new Error('Rate limit exceeded for document uploads');
    }

    // Validate request body
    const formData = await req.formData();
    const document = {
      type: formData.get('type'),
      file: formData.get('file'),
      expiryDate: formData.get('expiryDate') ? new Date(formData.get('expiryDate') as string) : undefined,
      metadata: formData.get('metadata') ? JSON.parse(formData.get('metadata') as string) : undefined
    };

    const validatedDocument = await kycDocumentSchema.parseAsync(document);

    // Convert file to buffer for processing
    const fileBuffer = await validatedDocument.file.arrayBuffer();
    const buffer = Buffer.from(fileBuffer);

    // Validate document with enhanced security checks
    const validationResult = await validateDocument(
      {
        type: validatedDocument.type,
        ...validatedDocument.metadata
      },
      buffer
    );

    if (!validationResult.isValid) {
      throw new ValidationError(new z.ZodError(
        validationResult.errors.map(error => ({
          code: z.ZodIssueCode.custom,
          path: ['document'],
          message: error
        }))
      ));
    }

    // Submit document for verification
    const verificationResult = await kycService.submitDocument(
      user.id,
      {
        type: validatedDocument.type,
        ...validatedDocument.metadata
      },
      buffer
    );

    // Create verification check
    const check = await kycService.createCheck(user.id, verificationResult.documentId);

    // Update user's KYC status
    const { data: kycData, error: kycError } = await supabase
      .from('kyc_documents')
      .insert({
        user_id: user.id,
        document_type: validatedDocument.type,
        status: 'pending',
        document_id: verificationResult.documentId,
        check_id: check.id,
        metadata: validatedDocument.metadata,
        correlation_id: correlationId
      });

    if (kycError) {
      throw new Error('Failed to update KYC status');
    }

    // Log verification attempt
    logger.info('KYC document verification initiated', {
      userId: user.id,
      documentType: validatedDocument.type,
      correlationId,
      clientIp,
      documentId: verificationResult.documentId,
      checkId: check.id
    });

    return new Response(
      JSON.stringify({
        status: 'success',
        data: {
          documentId: verificationResult.documentId,
          checkId: check.id,
          status: 'pending',
          correlationId
        }
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    logger.error('KYC verification failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId,
      clientIp
    });

    const statusCode = error instanceof ValidationError ? 400 : 500;
    const errorCode = error instanceof ValidationError ? 
      ErrorCode.VALIDATION_ERROR : 
      ErrorCode.INTERNAL_ERROR;

    return new Response(
      JSON.stringify({
        status: 'error',
        error: {
          code: errorCode,
          message: error instanceof Error ? error.message : 'Internal server error',
          correlationId
        }
      }),
      {
        status: statusCode,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}

/**
 * Enhanced webhook handler for KYC provider callbacks
 */
export async function handleKYCWebhook(req: Request): Promise<Response> {
  const correlationId = crypto.randomUUID();
  const signature = req.headers.get('x-webhook-signature');

  try {
    // Verify webhook signature
    if (!signature || !verifyWebhookSignature(signature, await req.text())) {
      throw new Error('Invalid webhook signature');
    }

    const payload = await req.json();

    // Process verification result
    const { user_id, document_id, status, sub_status } = payload;

    // Update document status
    const { error: updateError } = await supabase
      .from('kyc_documents')
      .update({
        status,
        sub_status,
        verified_at: status === 'approved' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .match({ document_id });

    if (updateError) {
      throw new Error('Failed to update document status');
    }

    // Update user KYC level if document is approved
    if (status === 'approved') {
      const { data: documents } = await supabase
        .from('kyc_documents')
        .select('document_type, status')
        .eq('user_id', user_id)
        .eq('status', 'approved');

      const newKycLevel = calculateKYCLevel(documents || []);

      const { error: userUpdateError } = await supabase
        .from('users')
        .update({
          kyc_level: newKycLevel,
          updated_at: new Date().toISOString()
        })
        .eq('id', user_id);

      if (userUpdateError) {
        throw new Error('Failed to update user KYC level');
      }
    }

    // Log webhook processing
    logger.info('KYC webhook processed', {
      userId: user_id,
      documentId: document_id,
      status,
      correlationId
    });

    return new Response(
      JSON.stringify({ received: true, correlationId }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    logger.error('Webhook processing failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId
    });

    return new Response(
      JSON.stringify({
        status: 'error',
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Webhook processing failed',
          correlationId
        }
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}

/**
 * Helper function to verify webhook signatures
 */
function verifyWebhookSignature(signature: string, payload: string): boolean {
  const hmac = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET!);
  const expectedSignature = hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Helper function to calculate KYC level based on approved documents
 */
function calculateKYCLevel(documents: Array<{ document_type: string; status: string }>): KYCLevel {
  const approvedTypes = new Set(
    documents
      .filter(doc => doc.status === 'approved')
      .map(doc => doc.document_type)
  );

  if (approvedTypes.has('bank_statement') && 
      approvedTypes.has('proof_of_address') && 
      approvedTypes.has('government_id')) {
    return KYCLevel.ENHANCED;
  }

  if (approvedTypes.has('proof_of_address') && 
      approvedTypes.has('government_id')) {
    return KYCLevel.VERIFIED;
  }

  if (approvedTypes.has('government_id')) {
    return KYCLevel.BASIC;
  }

  return KYCLevel.NONE;
}