// External imports - v1.0.0
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod'; // v3.22.0

// Internal imports
import { validateSchema, validateRequest, commonSchemas, ValidationType } from '../../lib/common/validation';
import { ValidationError } from '../../lib/common/errors';
import { Currency, CryptoCurrency } from '../../types/common';

// Test utilities
const mockRequest = (data: unknown, type: ValidationType = ValidationType.BODY) => ({
  [type]: data,
  headers: {},
});

const mockResponse = () => {
  const res: any = {};
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
};

const mockNext = vi.fn();

describe('validateSchema', () => {
  // Basic schema validation
  it('should validate correct data successfully', async () => {
    const schema = z.object({
      email: commonSchemas.email,
      password: commonSchemas.password
    });
    
    const validData = {
      email: 'test@example.com',
      password: 'Test123!@#'
    };

    const result = await validateSchema(schema, validData);
    expect(result).toEqual(validData);
  });

  // Invalid data type testing
  it('should reject invalid data types', async () => {
    const schema = z.object({
      amount: commonSchemas.amount
    });

    await expect(validateSchema(schema, { amount: '100' }))
      .rejects
      .toThrow(ValidationError);
  });

  // Nested object validation
  it('should validate nested objects correctly', async () => {
    const nestedSchema = z.object({
      user: z.object({
        id: commonSchemas.uuid,
        wallet: z.object({
          currency: commonSchemas.currency,
          amount: commonSchemas.amount
        })
      })
    });

    const validData = {
      user: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        wallet: {
          currency: Currency.USD,
          amount: 100.50
        }
      }
    };

    const result = await validateSchema(nestedSchema, validData);
    expect(result).toEqual(validData);
  });

  // Performance testing
  it('should handle large payloads efficiently', async () => {
    const arraySchema = z.array(z.object({
      id: commonSchemas.uuid,
      amount: commonSchemas.amount
    }));

    const largePayload = Array.from({ length: 1000 }, (_, i) => ({
      id: '123e4567-e89b-12d3-a456-426614174000',
      amount: i + 1
    }));

    const startTime = performance.now();
    await validateSchema(arraySchema, largePayload);
    const endTime = performance.now();

    expect(endTime - startTime).toBeLessThan(1000); // Should validate within 1 second
  });

  // Timeout testing
  it('should timeout for extremely complex validations', async () => {
    const complexSchema = z.array(z.object({
      nested: z.array(z.object({
        deep: z.array(commonSchemas.uuid)
      }))
    })).length(10000);

    await expect(validateSchema(complexSchema, []))
      .rejects
      .toThrow('Validation timeout');
  });
});

describe('validateRequest', () => {
  // Request body validation
  it('should validate request body successfully', async () => {
    const schema = z.object({
      email: commonSchemas.email,
      password: commonSchemas.password
    });

    const req = mockRequest({
      email: 'test@example.com',
      password: 'Test123!@#'
    });
    const res = mockResponse();

    await validateRequest(schema)(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith();
    expect(req.validatedAt).toBeInstanceOf(Date);
    expect(req.validationType).toBe(ValidationType.BODY);
  });

  // Request size limits
  it('should reject oversized requests', async () => {
    const schema = z.object({
      data: z.string()
    });

    const req = mockRequest({ data: 'x'.repeat(11 * 1024 * 1024) }); // 11MB
    req.headers['content-length'] = (11 * 1024 * 1024).toString();

    const res = mockResponse();

    await validateRequest(schema)(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    expect(mockNext.mock.calls[0][0].message).toBe('Request size exceeds limit');
  });

  // Security headers
  it('should set security headers', async () => {
    const schema = z.object({});
    const req = mockRequest({});
    const res = mockResponse();

    await validateRequest(schema)(req, res, mockNext);

    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Security-Policy', "default-src 'self'");
  });
});

describe('commonSchemas', () => {
  // UUID validation
  it('should validate UUIDs correctly', () => {
    const validUUID = '123e4567-e89b-12d3-a456-426614174000';
    const invalidUUID = 'not-a-uuid';

    expect(() => commonSchemas.uuid.parse(validUUID)).not.toThrow();
    expect(() => commonSchemas.uuid.parse(invalidUUID)).toThrow();
  });

  // Email validation
  it('should validate international email addresses', () => {
    const validEmails = [
      'test@example.com',
      'user@domain.co.uk',
      'test.user+tag@example.com',
      'user@xn--80akhbyknj4f.com' // Punycode domain
    ];

    const invalidEmails = [
      'invalid-email',
      '@domain.com',
      'user@',
      'user@domain'
    ];

    validEmails.forEach(email => {
      expect(() => commonSchemas.email.parse(email)).not.toThrow();
    });

    invalidEmails.forEach(email => {
      expect(() => commonSchemas.email.parse(email)).toThrow();
    });
  });

  // Password validation
  it('should enforce password security requirements', () => {
    const validPasswords = [
      'Test123!@#',
      'SecureP@ss1',
      'Complex1ty!'
    ];

    const invalidPasswords = [
      'short1!',         // Too short
      'nouppercasepass1!', // No uppercase
      'NOLOWERCASE123!',   // No lowercase
      'NoNumbers!!!',      // No numbers
      'NoSpecial123'       // No special chars
    ];

    validPasswords.forEach(password => {
      expect(() => commonSchemas.password.parse(password)).not.toThrow();
    });

    invalidPasswords.forEach(password => {
      expect(() => commonSchemas.password.parse(password)).toThrow();
    });
  });

  // Currency validation
  it('should validate supported currencies', () => {
    Object.values(Currency).forEach(currency => {
      expect(() => commonSchemas.currency.parse(currency)).not.toThrow();
    });

    expect(() => commonSchemas.currency.parse('INVALID')).toThrow();
  });

  // Amount validation
  it('should handle amount precision correctly', () => {
    const testCases = [
      { input: 100.12345678, expected: 100.12345678 },
      { input: 0.00000001, expected: 0.00000001 },
      { input: 999999999.99999999, expected: 999999999.99999999 }
    ];

    testCases.forEach(({ input, expected }) => {
      expect(commonSchemas.amount.parse(input)).toBe(expected);
    });

    expect(() => commonSchemas.amount.parse(-100)).toThrow();
    expect(() => commonSchemas.amount.parse(1_000_000_001)).toThrow();
  });

  // Fuzzing test
  it('should handle random input safely', () => {
    const randomValues = [
      undefined,
      null,
      NaN,
      Infinity,
      -Infinity,
      Symbol(),
      {},
      [],
      new Date(),
      /regex/,
      new Error(),
      () => {},
      Buffer.from('test')
    ];

    randomValues.forEach(value => {
      Object.values(commonSchemas).forEach(schema => {
        expect(() => schema.parse(value)).toThrow();
      });
    });
  });
});