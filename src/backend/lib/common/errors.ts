// External imports
import { z } from 'zod'; // v3.22.0
import i18next from 'i18next'; // v23.0.0

// Internal imports
import { ErrorCode } from '../../types/common';

// Global constants
const DEFAULT_ERROR_MESSAGE = 'An unexpected error occurred';
const MAX_ERROR_DETAIL_LENGTH = 1000;
const ERROR_LOCALE_NAMESPACE = 'errors';

/**
 * Interface for standardized error response format
 */
interface ErrorResponse {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  correlationId?: string;
  stack?: string;
  fieldErrors?: Record<string, string[]>;
}

/**
 * Enhanced base error class with internationalization and detail management
 */
export class ApplicationError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details: Record<string, unknown>;
  public readonly correlationId: string;

  constructor(
    message: string,
    code: ErrorCode,
    statusCode: number,
    details: Record<string, unknown> = {},
    correlationId: string = crypto.randomUUID()
  ) {
    super(message);
    
    // Validate and set error properties
    if (!Object.values(ErrorCode).includes(code)) {
      throw new Error(`Invalid error code: ${code}`);
    }
    if (statusCode < 100 || statusCode > 599) {
      throw new Error(`Invalid HTTP status code: ${statusCode}`);
    }

    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = this.sanitizeDetails(details);
    this.correlationId = correlationId;
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Sanitizes error details to prevent sensitive data exposure
   */
  private sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(details)) {
      // Skip sensitive fields
      if (['password', 'token', 'secret', 'key'].includes(key.toLowerCase())) {
        continue;
      }
      // Truncate long values
      if (typeof value === 'string' && value.length > MAX_ERROR_DETAIL_LENGTH) {
        sanitized[key] = `${value.substring(0, MAX_ERROR_DETAIL_LENGTH)}...`;
        continue;
      }
      sanitized[key] = value;
    }
    return sanitized;
  }
}

/**
 * Enhanced validation error class with detailed field validation
 */
export class ValidationError extends ApplicationError {
  public readonly zodError: z.ZodError;
  public readonly fieldErrors: Record<string, string[]>;

  constructor(zodError: z.ZodError) {
    super(
      'Validation error occurred',
      ErrorCode.VALIDATION_ERROR,
      400,
      { fieldCount: zodError.errors.length }
    );

    this.zodError = zodError;
    this.fieldErrors = this.processFieldErrors(zodError);
  }

  /**
   * Processes Zod validation errors into field-level structure
   */
  private processFieldErrors(error: z.ZodError): Record<string, string[]> {
    const fieldErrors: Record<string, string[]> = {};
    
    error.errors.forEach(err => {
      const field = err.path.join('.');
      if (!fieldErrors[field]) {
        fieldErrors[field] = [];
      }
      fieldErrors[field].push(err.message);
    });

    return fieldErrors;
  }
}

/**
 * Enhanced type guard to check if an error is an ApplicationError instance
 */
export function isApplicationError(error: unknown): error is ApplicationError {
  if (!(error instanceof ApplicationError)) {
    return false;
  }

  // Verify required properties
  return (
    typeof error.code === 'string' &&
    typeof error.message === 'string' &&
    typeof error.statusCode === 'number' &&
    Object.values(ErrorCode).includes(error.code) &&
    error.statusCode >= 100 &&
    error.statusCode <= 599
  );
}

/**
 * Enhanced error formatter with environment-aware detail levels and internationalization
 */
export function formatError(error: Error, locale?: string): ErrorResponse {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (isApplicationError(error)) {
    const response: ErrorResponse = {
      code: error.code,
      message: locale ? 
        i18next.t(`${ERROR_LOCALE_NAMESPACE}:${error.code}`, { defaultValue: error.message, lng: locale }) :
        error.message,
      correlationId: error.correlationId
    };

    // Include details in development or for non-sensitive errors
    if (isDevelopment || ![ErrorCode.UNAUTHORIZED, ErrorCode.FORBIDDEN].includes(error.code)) {
      response.details = error.details;
    }

    // Include stack trace in development
    if (isDevelopment) {
      response.stack = error.stack;
    }

    // Include field errors for validation errors
    if (error instanceof ValidationError) {
      response.fieldErrors = error.fieldErrors;
    }

    return response;
  }

  // Handle unknown errors
  return {
    code: ErrorCode.INTERNAL_ERROR,
    message: locale ?
      i18next.t(`${ERROR_LOCALE_NAMESPACE}:${ErrorCode.INTERNAL_ERROR}`, { defaultValue: DEFAULT_ERROR_MESSAGE, lng: locale }) :
      DEFAULT_ERROR_MESSAGE,
    correlationId: crypto.randomUUID(),
    ...(isDevelopment && { stack: error.stack })
  };
}