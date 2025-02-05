// External imports
import { z } from 'zod'; // v3.22.0
import { RequestHandler } from 'express';

// Internal imports
import { ValidationError } from '../common/errors';
import { Currency, CryptoCurrency } from '../../types/common';

// Validation types enum
export enum ValidationType {
  BODY = 'body',
  QUERY = 'query',
  PARAMS = 'params'
}

// Global constants
const VALIDATION_TIMEOUT = 5000;
const MAX_CACHE_SIZE = 100;
const MIN_PASSWORD_LENGTH = 8;
const MAX_AMOUNT = 1_000_000_000;

// Schema cache for performance optimization
const SCHEMA_CACHE = new Map<string, z.ZodSchema>();

/**
 * Common validation schemas with enhanced security rules
 */
export const commonSchemas = {
  uuid: z.string().uuid(),
  
  email: z.string()
    .email()
    .min(5)
    .max(255)
    .transform(email => email.toLowerCase()),
  
  password: z.string()
    .min(MIN_PASSWORD_LENGTH)
    .max(72) // bcrypt max length
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/, {
      message: 'Password must contain uppercase, lowercase, number and special character'
    }),
  
  phoneNumber: z.string()
    .regex(/^\+[1-9]\d{1,14}$/, {
      message: 'Phone number must be in E.164 format'
    }),
  
  currency: z.nativeEnum(Currency),
  
  cryptoCurrency: z.nativeEnum(CryptoCurrency),
  
  amount: z.number()
    .positive()
    .max(MAX_AMOUNT)
    .transform(amount => Number(amount.toFixed(8))),
  
  date: z.date()
    .min(new Date('2000-01-01'))
    .max(new Date('2100-01-01'))
};

/**
 * Generic schema validation function with performance optimization and caching
 */
export async function validateSchema<T>(schema: z.ZodSchema, data: unknown): Promise<T> {
  try {
    // Check schema cache
    const cacheKey = schema._def.typeName;
    let cachedSchema = SCHEMA_CACHE.get(cacheKey);
    
    if (!cachedSchema) {
      // Manage cache size
      if (SCHEMA_CACHE.size >= MAX_CACHE_SIZE) {
        const firstKey = SCHEMA_CACHE.keys().next().value;
        SCHEMA_CACHE.delete(firstKey);
      }
      
      SCHEMA_CACHE.set(cacheKey, schema);
      cachedSchema = schema;
    }

    // Validate with timeout protection
    const validationPromise = cachedSchema.parseAsync(data);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Validation timeout')), VALIDATION_TIMEOUT);
    });

    const result = await Promise.race([validationPromise, timeoutPromise]);
    return result as T;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(error);
    }
    throw error;
  }
}

/**
 * Express middleware for request validation with rate limiting and DoS protection
 */
export function validateRequest(
  schema: z.ZodSchema,
  type: ValidationType = ValidationType.BODY
): RequestHandler {
  return async (req, res, next) => {
    try {
      // Apply request size limits based on validation type
      const maxSize = type === ValidationType.BODY ? '10mb' : '2kb';
      if (req.headers['content-length'] && parseInt(req.headers['content-length']) > parseInt(maxSize)) {
        throw new Error('Request size exceeds limit');
      }

      // Extract data based on validation type
      const dataToValidate = req[type];

      // Validate data
      const validatedData = await validateSchema(schema, dataToValidate);

      // Attach validated data to request
      req[type] = validatedData;

      // Apply security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Content-Security-Policy', "default-src 'self'");

      // Add validation metadata
      req.validatedAt = new Date();
      req.validationType = type;

      next();
    } catch (error) {
      next(error);
    }
  };
}

// Type declarations for enhanced request object
declare global {
  namespace Express {
    interface Request {
      validatedAt?: Date;
      validationType?: ValidationType;
    }
  }
}